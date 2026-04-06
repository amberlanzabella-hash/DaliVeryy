import json
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_time
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from products.models import Product

from .models import AuditRecord, Cart, CartItem, Order, OrderItem, StoreConfig





# Safely read JSON or form data from an incoming request.
def _read_body(request):
    try:
        if (request.content_type or '').startswith('application/json'):
            return json.loads(request.body or '{}')
        return request.POST
    except Exception:
        return None


# Convert an Order model into the JSON shape expected by the frontend.
def _order_to_dict(order: Order):
    return {
        'id': order.order_id,
        'paymongoLinkId': order.paymongo_link_id,
        'orderedBy': order.ordered_by,
        'items': [
            {
                'product': {
                    'id': item.product_id,
                    'name': item.name,
                    'price': float(item.price),
                    'description': item.description,
                    'category': item.category,
                    'image': item.image,
                    'badge': item.badge,
                },
                'quantity': item.quantity,
            }
            for item in order.items.all()
        ],
        'customerName': order.customer_name,
        'address': order.address,
        'phone': order.phone,
        'notes': order.notes,
        'paymentMethod': order.payment_method,
        'paymentStatus': order.payment_status,
        'deliveryStatus': order.delivery_status,
        'total': float(order.total),
        'subtotal': float(order.subtotal),
        'shippingFee': float(order.shipping_fee),
        'createdAt': order.created_at.isoformat(),
        'estimatedDelivery': order.estimated_delivery,
        'courierName': order.courier_name,
        'courierPhone': order.courier_phone,
        'lastUpdated': order.last_updated.isoformat(),
        'customerMarkedDelivered': order.customer_marked_delivered,
        'customerHidden': order.customer_hidden,
        'audited': order.audited,
        'archived': order.archived,
    }


# Convert an audit record into the JSON shape expected by the frontend.
def _audit_to_dict(audit: AuditRecord):
    return {
        'id': str(audit.id),
        'auditDate': audit.audit_date.isoformat(),
        'label': audit.label,
        'totalRevenue': float(audit.total_revenue),
        'expense': float(audit.expense),
        'netRevenue': float(audit.net_revenue),
        'totalOrders': audit.total_orders,
        'paidOrders': audit.paid_orders,
        'deliveredOrders': audit.delivered_orders,
        'pendingOrders': audit.pending_orders,
        'createdAt': audit.created_at.isoformat(),
        'updatedAt': audit.updated_at.isoformat(),
    }


# Default checkout draft returned when a user has no saved cart form yet.
DEFAULT_CHECKOUT_DRAFT = {
    'customerName': '',
    'address': '',
    'phone': '',
    'notes': '',
    'paymentMethod': 'cash_on_delivery',
}


# Look up a Django user by email and return None when missing.
def _get_user_by_email(email):
    normalized_email = (email or '').strip().lower()
    if not normalized_email:
        return None

    try:
        return User.objects.get(email__iexact=normalized_email)
    except User.DoesNotExist:
        return None


# Get the customer's saved cart or create it on first use.
def _get_or_create_cart(user: User):
    cart, _ = Cart.objects.get_or_create(user=user)
    return cart


# Return an empty cart payload with the default checkout draft.
def _empty_cart_dict():
    return {
        'items': [],
        'checkoutDraft': {**DEFAULT_CHECKOUT_DRAFT},
    }


# Fetch live product records so cart and order checks use current availability.
def _get_product_status_map(product_ids):
    normalized_ids = [str(product_id).strip() for product_id in product_ids if str(product_id).strip()]
    if not normalized_ids:
        return {}

    return {
        product.product_id: product
        for product in Product.objects.filter(product_id__in=normalized_ids)
    }


# Convert a saved cart into the JSON shape used by the frontend.
def _cart_to_dict(cart: Cart):
    cart_items = list(cart.items.all())
    products_by_id = _get_product_status_map(item.product_id for item in cart_items)

    return {
        'items': [
            {
                'product': {
                    'id': item.product_id,
                    'name': item.name,
                    'price': float(item.price),
                    'description': item.description,
                    'category': item.category,
                    'image': item.image,
                    'badge': item.badge,
                    'soldOut': bool(products_by_id[item.product_id].sold_out) if item.product_id in products_by_id else False,
                },
                'quantity': item.quantity,
            }
            for item in cart_items
        ],
        'checkoutDraft': {
            'customerName': cart.customer_name,
            'address': cart.address,
            'phone': cart.phone,
            'notes': cart.notes,
            'paymentMethod': cart.payment_method,
        },
        'updatedAt': cart.updated_at.isoformat(),
    }


# Validate and clean checkout draft values coming from the frontend.
def _normalize_checkout_draft(payload):
    payload = payload if isinstance(payload, dict) else {}
    payment_method = str(payload.get('paymentMethod') or DEFAULT_CHECKOUT_DRAFT['paymentMethod'])
    valid_payment_methods = {choice[0] for choice in Order.PAYMENT_METHOD_CHOICES}
    if payment_method not in valid_payment_methods:
        payment_method = DEFAULT_CHECKOUT_DRAFT['paymentMethod']

    return {
        'customerName': str(payload.get('customerName') or '').strip(),
        'address': str(payload.get('address') or '').strip(),
        'phone': str(payload.get('phone') or '').strip(),
        'notes': str(payload.get('notes') or '').strip(),
        'paymentMethod': payment_method,
    }


# Replace the saved cart contents with the latest frontend payload.
def _sync_cart_from_payload(cart: Cart, items, checkout_draft):
    normalized_draft = _normalize_checkout_draft(checkout_draft)
    cart.customer_name = normalized_draft['customerName']
    cart.address = normalized_draft['address']
    cart.phone = normalized_draft['phone']
    cart.notes = normalized_draft['notes']
    cart.payment_method = normalized_draft['paymentMethod']
    cart.save()

    cart.items.all().delete()

    for entry in items if isinstance(items, list) else []:
        if not isinstance(entry, dict):
            continue
        product = entry.get('product') or {}
        try:
            quantity = max(int(entry.get('quantity') or 1), 1)
        except (TypeError, ValueError):
            quantity = 1

        CartItem.objects.create(
            cart=cart,
            product_id=str(product.get('id') or ''),
            name=str(product.get('name') or 'Item'),
            price=Decimal(str(product.get('price') or 0)),
            quantity=quantity,
            image=str(product.get('image') or ''),
            category=str(product.get('category') or ''),
            description=str(product.get('description') or ''),
            badge=str(product.get('badge') or ''),
        )

    return cart


# Remove saved cart items and optionally reset the saved checkout draft.
def _clear_user_cart(user: User, clear_draft=True):
    try:
        cart = user.cart
    except Cart.DoesNotExist:
        return None

    cart.items.all().delete()

    if clear_draft:
        cart.customer_name = DEFAULT_CHECKOUT_DRAFT['customerName']
        cart.address = DEFAULT_CHECKOUT_DRAFT['address']
        cart.phone = DEFAULT_CHECKOUT_DRAFT['phone']
        cart.notes = DEFAULT_CHECKOUT_DRAFT['notes']
        cart.payment_method = DEFAULT_CHECKOUT_DRAFT['paymentMethod']
        cart.save()

    return cart


# Check whether the supplied credentials belong to an admin account.
def _admin_ok(email, password, request=None):
    try:
        user_obj = User.objects.get(email__iexact=(email or '').strip().lower())
    except User.DoesNotExist:
        return False
    user = authenticate(request, username=user_obj.username, password=password or '')
    return bool(user and (user.is_staff or user.is_superuser))


# Get the single shared store configuration row used by the app.
def get_store_config():
    config, _ = StoreConfig.objects.get_or_create(id=1)
    return config


# Normalize common truthy or falsy values into a real boolean.
def _coerce_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {'true', '1', 'yes', 'on'}:
            return True
        if normalized in {'false', '0', 'no', 'off'}:
            return False
    return bool(value)


# Validate opening and closing time strings from the admin settings form.
def _parse_store_time(value, label):
    if value in (None, ''):
        return None, None

    parsed = parse_time(str(value))
    if parsed is None:
        return None, f'Invalid {label}. Use HH:MM format.'

    return parsed, None


# Validate audit dates coming from the admin dashboard.
def _parse_audit_date(value):
    raw_value = (value or date.today().isoformat())[:10]
    parsed = parse_date(raw_value)
    if parsed is None:
        return None, 'Invalid audit date. Use YYYY-MM-DD format.'
    return parsed, None


# Build the timezone-aware start and end datetimes for one local day.
def _local_day_bounds(target_date):
    current_tz = timezone.get_current_timezone()
    day_start = timezone.make_aware(datetime.combine(target_date, time.min), current_tz)
    day_end = day_start + timedelta(days=1)
    return day_start, day_end


# Limit orders to one audit day based on the local timezone.
def _filter_orders_by_audit_date(queryset, target_date):
    day_start, day_end = _local_day_bounds(target_date)
    return queryset.filter(created_at__gte=day_start, created_at__lt=day_end)


# Get the order date using the project's local timezone.
def _get_local_order_date(order: Order):
    created_at = order.created_at
    if timezone.is_naive(created_at):
        return created_at.date()
    return timezone.localtime(created_at).date()


# Mark orders as audited or unaudited for one specific date.
def _sync_orders_for_audit_date(target_date):
    has_audit = AuditRecord.objects.filter(audit_date=target_date).exists()
    _filter_orders_by_audit_date(Order.objects.all(), target_date).update(audited=has_audit)


# Refresh the audited flag of every order based on saved audit records.
def _sync_all_order_audit_flags():
    audited_dates = set(AuditRecord.objects.values_list('audit_date', flat=True))
    orders_to_true = []
    orders_to_false = []

    for order in Order.objects.only('id', 'created_at', 'audited'):
        should_be_audited = _get_local_order_date(order) in audited_dates
        if should_be_audited and not order.audited:
            orders_to_true.append(order.id)
        elif not should_be_audited and order.audited:
            orders_to_false.append(order.id)

    if orders_to_true:
        Order.objects.filter(id__in=orders_to_true).update(audited=True)
    if orders_to_false:
        Order.objects.filter(id__in=orders_to_false).update(audited=False)


# Check whether the store is currently accepting orders.
def store_is_available(config=None):
    config = config or get_store_config()

    if not config.is_open:
        return False

    if config.opening_time and config.closing_time:
        now_time = timezone.localtime().time()

        if config.opening_time <= config.closing_time:
            if not (config.opening_time <= now_time <= config.closing_time):
                return False
        else:
            # supports overnight range like 22:00 to 02:00
            if not (now_time >= config.opening_time or now_time <= config.closing_time):
                return False

    return True


# Convert store open-close settings into frontend JSON.
def _store_to_dict(config: StoreConfig):
    return {
        'isOpen': config.is_open,
        'openingTime': config.opening_time.strftime('%H:%M') if config.opening_time else '',
        'closingTime': config.closing_time.strftime('%H:%M') if config.closing_time else '',
        'isAcceptingOrders': store_is_available(config),
    }


# Convert shared business settings into frontend JSON.
def _settings_to_dict(config: StoreConfig):
    return {
        'businessName': config.business_name,
        'shippingFee': float(config.shipping_fee),
        'currency': config.currency,
        'currencySymbol': config.currency_symbol,
    }


# Validate the shipping fee coming from the admin settings form.
def _parse_shipping_fee(value):
    try:
        fee = Decimal(str(value if value is not None else 0))
    except Exception:
        return None, 'Invalid shipping fee.'

    if fee < 0:
        return None, 'Shipping fee must be zero or greater.'

    return fee, None


# Return the saved cart for the requested customer email.
@require_GET
def get_cart(request):
    email = request.GET.get('email')
    if not (email or '').strip():
        return JsonResponse({'ok': False, 'error': 'Email is required.'}, status=400)

    user = _get_user_by_email(email)
    if user is None:
        return JsonResponse({'ok': False, 'error': 'User not found.'}, status=404)

    cart = _get_or_create_cart(user)
    return JsonResponse({'ok': True, 'cart': _cart_to_dict(cart)})


# Save the latest customer cart and checkout draft to the backend.
@csrf_exempt
@require_POST
def sync_cart(request):
    body = _read_body(request)
    if body is None:
        return JsonResponse({'ok': False, 'error': 'Invalid request body.'}, status=400)

    email = body.get('email')
    if not (email or '').strip():
        return JsonResponse({'ok': False, 'error': 'Email is required.'}, status=400)

    user = _get_user_by_email(email)
    if user is None:
        return JsonResponse({'ok': False, 'error': 'User not found.'}, status=404)

    items = body.get('items') or []
    if not isinstance(items, list):
        return JsonResponse({'ok': False, 'error': 'Cart items must be a list.'}, status=400)

    checkout_draft = body.get('checkoutDraft') or {}
    if not isinstance(checkout_draft, dict):
        return JsonResponse({'ok': False, 'error': 'Checkout draft must be an object.'}, status=400)

    cart = _get_or_create_cart(user)
    _sync_cart_from_payload(cart, items, checkout_draft)
    return JsonResponse({'ok': True, 'cart': _cart_to_dict(cart)})


# Clear a customer's saved cart after checkout or manual reset.
@csrf_exempt
@require_POST
def clear_cart(request):
    body = _read_body(request)
    if body is None:
        return JsonResponse({'ok': False, 'error': 'Invalid request body.'}, status=400)

    email = body.get('email')
    if not (email or '').strip():
        return JsonResponse({'ok': False, 'error': 'Email is required.'}, status=400)

    user = _get_user_by_email(email)
    if user is None:
        return JsonResponse({'ok': False, 'error': 'User not found.'}, status=404)

    clear_draft = _coerce_bool(body.get('clearDraft', True))
    cart = _get_or_create_cart(user)
    _clear_user_cart(user, clear_draft=clear_draft)
    cart.refresh_from_db()
    return JsonResponse({'ok': True, 'cart': _cart_to_dict(cart)})


# Return orders for admin dashboards or filtered customer history views.
@csrf_exempt
@require_GET
def list_orders(request):
    _sync_all_order_audit_flags()
    qs = Order.objects.prefetch_related('items').all()
    q_date = request.GET.get('date')
    if q_date:
        audit_date, audit_date_error = _parse_audit_date(q_date)
        if audit_date_error:
            return JsonResponse({'ok': False, 'error': audit_date_error}, status=400)
        qs = _filter_orders_by_audit_date(qs, audit_date)
    q_user = request.GET.get('ordered_by')
    if q_user:
        qs = qs.filter(ordered_by__iexact=q_user)
    return JsonResponse({'ok': True, 'orders': [_order_to_dict(o) for o in qs]})


# Create a new order after validating cart contents and store availability.
@csrf_exempt
@require_POST
def create_order(request):
    body = _read_body(request)
    if body is None:
        return JsonResponse({'ok': False, 'error': 'Invalid request body.'}, status=400)

    order_id = str(body.get('id') or '').strip()
    if not order_id:
        return JsonResponse({'ok': False, 'error': 'Order ID is required.'}, status=400)

    items = body.get('items') or []
    if not items:
        return JsonResponse({'ok': False, 'error': 'Cart items are required.'}, status=400)
    if not isinstance(items, list):
        return JsonResponse({'ok': False, 'error': 'Cart items must be a list.'}, status=400)

    customer_name = str(body.get('customerName') or '').strip()
    address = str(body.get('address') or '').strip()
    phone = str(body.get('phone') or '').strip()
    if not customer_name:
        return JsonResponse({'ok': False, 'error': 'Customer name is required.'}, status=400)
    if not address:
        return JsonResponse({'ok': False, 'error': 'Address is required.'}, status=400)
    if not phone:
        return JsonResponse({'ok': False, 'error': 'Phone number is required.'}, status=400)

    if not store_is_available():
        return JsonResponse({
            'ok': False,
            'error': 'Store is currently closed. Ordering is unavailable right now.'
        }, status=403)

    products_by_id = _get_product_status_map(
        (entry.get('product') or {}).get('id')
        for entry in items
        if isinstance(entry, dict)
    )
    unavailable_names = []
    normalized_items = []
    subtotal = Decimal('0')

    for entry in items:
        if not isinstance(entry, dict):
            return JsonResponse({'ok': False, 'error': 'Each cart item must be an object.'}, status=400)

        product = entry.get('product') or {}
        if not isinstance(product, dict):
            return JsonResponse({'ok': False, 'error': 'Each cart item must include a product object.'}, status=400)

        product_id = str(product.get('id') or '').strip()
        product_name = str(product.get('name') or 'This item').strip() or 'This item'
        live_product = products_by_id.get(product_id)

        if not product_id or live_product is None or live_product.sold_out:
            if product_name not in unavailable_names:
                unavailable_names.append(product_name)
            continue

        try:
            quantity = int(entry.get('quantity') or 1)
        except (TypeError, ValueError):
            return JsonResponse({'ok': False, 'error': f'Invalid quantity for {product_name}.'}, status=400)

        if quantity <= 0:
            return JsonResponse({'ok': False, 'error': f'Quantity must be at least 1 for {product_name}.'}, status=400)

        line_price = live_product.price
        subtotal += line_price * quantity
        normalized_items.append({
            'product_id': live_product.product_id,
            'name': live_product.name,
            'price': line_price,
            'quantity': quantity,
            'image': live_product.image,
            'category': live_product.category,
            'description': live_product.description,
            'badge': live_product.badge,
        })

    if unavailable_names:
        return JsonResponse({
            'ok': False,
            'error': 'These items are sold out or unavailable: ' + ', '.join(unavailable_names),
        }, status=409)

    shipping_fee, shipping_error = _parse_shipping_fee(body.get('shippingFee'))
    if shipping_error:
        return JsonResponse({'ok': False, 'error': shipping_error}, status=400)

    valid_payment_methods = {choice[0] for choice in Order.PAYMENT_METHOD_CHOICES}
    payment_method = str(body.get('paymentMethod') or 'cash_on_delivery')
    if payment_method not in valid_payment_methods:
        payment_method = 'cash_on_delivery'

    valid_payment_statuses = {choice[0] for choice in Order.PAYMENT_STATUS_CHOICES}
    payment_status = str(body.get('paymentStatus') or 'pending')
    if payment_status not in valid_payment_statuses:
        payment_status = 'pending'

    valid_delivery_statuses = {choice[0] for choice in Order.ORDER_STATUS_CHOICES}
    delivery_status = str(body.get('deliveryStatus') or 'placed')
    if delivery_status not in valid_delivery_statuses:
        delivery_status = 'placed'

    total = subtotal + shipping_fee

    try:
        with transaction.atomic():
            order = Order.objects.create(
                order_id=order_id,
                paymongo_link_id=body.get('paymongoLinkId') or '',
                ordered_by=body.get('orderedBy') or '',
                customer_name=customer_name,
                address=address,
                phone=phone,
                notes=body.get('notes') or '',
                payment_method=payment_method,
                payment_status=payment_status,
                delivery_status=delivery_status,
                total=total,
                subtotal=subtotal,
                shipping_fee=shipping_fee,
                estimated_delivery=body.get('estimatedDelivery') or '2-4 hours',
                courier_name=body.get('courierName') or 'Assignment Pending',
                courier_phone=body.get('courierPhone') or 'TBD',
                customer_marked_delivered=bool(body.get('customerMarkedDelivered') or False),
                audited=bool(body.get('audited') or False),
                archived=bool(body.get('archived') or False),
            )

            for item in normalized_items:
                OrderItem.objects.create(
                    order=order,
                    product_id=item['product_id'],
                    name=item['name'],
                    price=item['price'],
                    quantity=item['quantity'],
                    image=item['image'],
                    category=item['category'],
                    description=item['description'],
                    badge=item['badge'],
                )
    except IntegrityError:
        return JsonResponse({'ok': False, 'error': 'Order ID already exists.'}, status=409)

    user = _get_user_by_email(order.ordered_by)
    if user is not None:
        _clear_user_cart(user, clear_draft=True)

    return JsonResponse({'ok': True, 'order': _order_to_dict(order)})


# Update payment, delivery, or courier fields for one order.
@csrf_exempt
@require_POST
def update_order(request, order_id):
    body = _read_body(request)
    if body is None:
        return JsonResponse({'ok': False, 'error': 'Invalid request body.'}, status=400)

    try:
        order = Order.objects.get(order_id=order_id)
    except Order.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'Order not found.'}, status=404)

    for attr, key in [
        ('payment_status', 'paymentStatus'),
        ('delivery_status', 'deliveryStatus'),
        ('courier_name', 'courierName'),
        ('courier_phone', 'courierPhone'),
        ('paymongo_link_id', 'paymongoLinkId'),
    ]:
        if key in body:
            setattr(order, attr, body.get(key) or '')

    if 'customerMarkedDelivered' in body:
        order.customer_marked_delivered = bool(body.get('customerMarkedDelivered'))

    if 'audited' in body:
        order.audited = bool(body.get('audited'))

    if 'archived' in body:
        order.archived = bool(body.get('archived'))

    order.save()
    return JsonResponse({'ok': True, 'order': _order_to_dict(order)})


# Let the customer confirm that the order has been delivered.
@csrf_exempt
@require_POST
def mark_delivered_by_customer(request, order_id):
    try:
        order = Order.objects.get(order_id=order_id)
    except Order.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'Order not found.'}, status=404)

    order.customer_marked_delivered = True
    order.delivery_status = 'delivered'

    if order.payment_method == 'cash_on_delivery' and order.payment_status != 'paid':
        order.payment_status = 'paid'

    order.save()
    return JsonResponse({'ok': True, 'order': _order_to_dict(order)})


# Hide one order from the customer's order history without deleting it.
@csrf_exempt
@require_POST
def hide_order_for_customer(request, order_id):
    body = _read_body(request)
    if body is None:
        return JsonResponse({'ok': False, 'error': 'Invalid request body.'}, status=400)

    try:
        order = Order.objects.get(order_id=order_id)
    except Order.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'Order not found.'}, status=404)

    current_email = str(body.get('email') or '').strip().lower()
    current_username = str(body.get('username') or '').strip().lower()
    owner = (order.ordered_by or '').strip().lower()
    customer_name = (order.customer_name or '').strip().lower()

    if owner:
        authorized = owner == current_email or owner == current_username
    else:
        authorized = bool(current_username) and customer_name == current_username

    if not authorized:
        return JsonResponse({'ok': False, 'error': 'You can only remove your own order history.'}, status=403)

    order.customer_hidden = True
    order.save(update_fields=['customer_hidden', 'last_updated'])
    return JsonResponse({'ok': True, 'order': _order_to_dict(order)})


# Archive active orders after the admin confirms the action.
@csrf_exempt
@require_POST
def clear_orders(request):
    body = _read_body(request)
    if body is None:
        return JsonResponse({'ok': False, 'error': 'Invalid request body.'}, status=400)

    email = body.get('email')
    password = body.get('password')

    if not _admin_ok(email, password, request):
        return JsonResponse({'ok': False, 'error': 'Invalid admin credentials.'}, status=401)

    active_orders = Order.objects.filter(archived=False)
    has_unaudited = active_orders.filter(audited=False).exists()
    if has_unaudited and not body.get('force'):
        return JsonResponse({
            'ok': False,
            'needsConfirmation': True,
            'warning': 'These sales are not audited yet. Are you sure you want to clear the active order queue?'
        }, status=400)

    cleared_order_ids = list(active_orders.values_list('order_id', flat=True))
    cleared_orders = active_orders.update(archived=True)
    return JsonResponse({
        'ok': True,
        'clearedOrders': cleared_orders,
        'clearedOrderIds': cleared_order_ids,
    })


# Return daily sales totals for the admin dashboard.
@csrf_exempt
@require_GET
def sales_summary(request):
    _sync_all_order_audit_flags()
    q_date = request.GET.get('date') or date.today().isoformat()
    audit_date, audit_date_error = _parse_audit_date(q_date)
    if audit_date_error:
        return JsonResponse({'ok': False, 'error': audit_date_error}, status=400)

    qs = _filter_orders_by_audit_date(Order.objects.all(), audit_date)
    revenue = float(sum([float(o.total) for o in qs if o.payment_status == 'paid']))
    total_orders = qs.count()
    paid_orders = qs.filter(payment_status='paid').count()
    delivered_orders = qs.filter(delivery_status='delivered').count()
    pending_orders = qs.exclude(delivery_status='delivered').count()

    return JsonResponse({'ok': True, 'summary': {
        'auditDate': audit_date.isoformat(),
        'label': audit_date.isoformat(),
        'revenue': revenue,
        'totalOrders': total_orders,
        'paidOrders': paid_orders,
        'deliveredOrders': delivered_orders,
        'pendingOrders': pending_orders,
    }})


# Return saved audit records to the admin dashboard.
@csrf_exempt
@require_GET
def list_audits(request):
    qs = AuditRecord.objects.all()
    q_date = request.GET.get('date')
    if q_date:
        qs = qs.filter(audit_date=q_date)
    return JsonResponse({'ok': True, 'audits': [_audit_to_dict(a) for a in qs]})


# Create a new audit snapshot for one selected day.
@csrf_exempt
@require_POST
def create_audit(request):
    body = _read_body(request)
    if body is None:
        return JsonResponse({'ok': False, 'error': 'Invalid request body.'}, status=400)

    audit_date, audit_date_error = _parse_audit_date(body.get('auditDate'))
    if audit_date_error:
        return JsonResponse({'ok': False, 'error': audit_date_error}, status=400)

    if AuditRecord.objects.filter(audit_date=audit_date).exists():
        return JsonResponse({
            'ok': False,
            'error': 'These orders are already audited. Please check the audit window.'
        }, status=400)

    audit = AuditRecord.objects.create(
        audit_date=audit_date,
        label=body.get('label') or audit_date.isoformat(),
        total_revenue=Decimal(str(body.get('totalRevenue') or 0)),
        expense=Decimal(str(body.get('expense') or 0)),
        net_revenue=Decimal(str(body.get('netRevenue') or 0)),
        total_orders=int(body.get('totalOrders') or 0),
        paid_orders=int(body.get('paidOrders') or 0),
        delivered_orders=int(body.get('deliveredOrders') or 0),
        pending_orders=int(body.get('pendingOrders') or 0),
    )

    _sync_orders_for_audit_date(audit_date)
    return JsonResponse({'ok': True, 'audit': _audit_to_dict(audit)})


# Update an existing audit record and resync related orders.
@csrf_exempt
@require_POST
def update_audit(request, audit_id):
    body = _read_body(request)
    if body is None:
        return JsonResponse({'ok': False, 'error': 'Invalid request body.'}, status=400)

    try:
        audit = AuditRecord.objects.get(id=audit_id)
    except AuditRecord.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'Audit not found.'}, status=404)

    previous_audit_date = audit.audit_date

    if 'auditDate' in body:
        parsed_audit_date, audit_date_error = _parse_audit_date(body.get('auditDate'))
        if audit_date_error:
            return JsonResponse({'ok': False, 'error': audit_date_error}, status=400)
        if parsed_audit_date != previous_audit_date and AuditRecord.objects.filter(audit_date=parsed_audit_date).exclude(id=audit.id).exists():
            return JsonResponse({
                'ok': False,
                'error': 'These orders are already audited. Please check the audit window.'
            }, status=400)
        audit.audit_date = parsed_audit_date

    for field, key in [
        ('label', 'label'),
        ('total_revenue', 'totalRevenue'),
        ('expense', 'expense'),
        ('net_revenue', 'netRevenue'),
        ('total_orders', 'totalOrders'),
        ('paid_orders', 'paidOrders'),
        ('delivered_orders', 'deliveredOrders'),
        ('pending_orders', 'pendingOrders')
    ]:
        if key in body:
            value = body.get(key)
            if field in ['total_revenue', 'expense', 'net_revenue']:
                value = Decimal(str(value or 0))
            elif field in ['total_orders', 'paid_orders', 'delivered_orders', 'pending_orders']:
                value = int(value or 0)
            setattr(audit, field, value)

    audit.save()
    if previous_audit_date != audit.audit_date:
        _sync_orders_for_audit_date(previous_audit_date)
    _sync_orders_for_audit_date(audit.audit_date)
    return JsonResponse({'ok': True, 'audit': _audit_to_dict(audit)})


# Delete an audit record after the admin confirms credentials.
@csrf_exempt
@require_POST
def delete_audit(request, audit_id):
    body = _read_body(request)
    if body is None:
        return JsonResponse({'ok': False, 'error': 'Invalid request body.'}, status=400)

    email = body.get('email')
    password = body.get('password')

    if not _admin_ok(email, password, request):
        return JsonResponse({'ok': False, 'error': 'Invalid admin credentials.'}, status=401)

    try:
        audit = AuditRecord.objects.get(id=audit_id)
    except AuditRecord.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'Audit not found.'}, status=404)

    audit_date = audit.audit_date
    audit.delete()
    _sync_orders_for_audit_date(audit_date)
    return JsonResponse({'ok': True})



# Return shared store status and shared business settings.
@require_GET
def get_store_status(request):
    config = get_store_config()
    return JsonResponse({'ok': True, 'store': _store_to_dict(config), 'settings': _settings_to_dict(config)})





# Update store open-close state, hours, and shared shop settings.
@csrf_exempt
@require_POST
def update_store_status(request):
    body = _read_body(request)
    if body is None:
        return JsonResponse({'ok': False, 'error': 'Invalid request body.'}, status=400)

    config = get_store_config()

    if 'isOpen' in body:
        config.is_open = _coerce_bool(body.get('isOpen'))

    if 'openingTime' in body:
        opening_time, error = _parse_store_time(body.get('openingTime'), 'opening time')
        if error:
            return JsonResponse({'ok': False, 'error': error}, status=400)
        config.opening_time = opening_time

    if 'closingTime' in body:
        closing_time, error = _parse_store_time(body.get('closingTime'), 'closing time')
        if error:
            return JsonResponse({'ok': False, 'error': error}, status=400)
        config.closing_time = closing_time

    if 'businessName' in body:
        business_name = str(body.get('businessName') or '').strip()
        if not business_name:
            return JsonResponse({'ok': False, 'error': 'Business name is required.'}, status=400)
        config.business_name = business_name

    if 'shippingFee' in body:
        shipping_fee, error = _parse_shipping_fee(body.get('shippingFee'))
        if error:
            return JsonResponse({'ok': False, 'error': error}, status=400)
        config.shipping_fee = shipping_fee

    if 'currency' in body:
        currency = str(body.get('currency') or '').strip().upper()
        if not currency:
            return JsonResponse({'ok': False, 'error': 'Currency is required.'}, status=400)
        config.currency = currency[:16]

    if 'currencySymbol' in body:
        currency_symbol = str(body.get('currencySymbol') or '').strip()
        if not currency_symbol:
            return JsonResponse({'ok': False, 'error': 'Currency symbol is required.'}, status=400)
        config.currency_symbol = currency_symbol[:8]

    config.save()

    return JsonResponse({'ok': True, 'store': _store_to_dict(config), 'settings': _settings_to_dict(config)})
