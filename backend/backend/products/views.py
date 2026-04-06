import json
from decimal import Decimal, InvalidOperation

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .models import Product


# Safely read JSON or form data from an incoming request.
def _read_body(request):
    try:
        if (request.content_type or '').startswith('application/json'):
            return json.loads(request.body or '{}')
        return request.POST
    except Exception:
        return None


# Convert a Product model into the JSON shape used by the frontend.
def _product_to_dict(product: Product):
    return {
        'id': product.product_id,
        'name': product.name,
        'price': float(product.price),
        'description': product.description,
        'category': product.category,
        'image': product.image,
        'badge': product.badge or None,
        'soldOut': product.sold_out,
    }


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


# Validate and clean incoming product fields before saving them.
def _normalize_product_payload(body, *, partial=False):
    name = (body.get('name') or '').strip()
    description = (body.get('description') or '').strip()
    category = (body.get('category') or '').strip()
    image = (body.get('image') or '').strip()
    badge = (body.get('badge') or '').strip()
    sold_out_value = body.get('soldOut')

    price_value = body.get('price')
    if price_value in (None, ''):
        if partial:
            price = None
        else:
            return None, 'Price is required.'
    else:
        try:
            price = Decimal(str(price_value))
        except (ArithmeticError, InvalidOperation, ValueError):
            return None, 'Invalid price.'
        if price < 0:
            return None, 'Price cannot be negative.'

    if not partial or 'name' in body:
        if not name:
            return None, 'Name is required.'

    if not partial or 'description' in body:
        if not description:
            return None, 'Description is required.'

    if not partial or 'category' in body:
        if not category:
            return None, 'Category is required.'

    cleaned = {}
    if not partial or 'name' in body:
        cleaned['name'] = name
    if price is not None:
        cleaned['price'] = price
    if not partial or 'description' in body:
        cleaned['description'] = description
    if not partial or 'category' in body:
        cleaned['category'] = category
    if not partial or 'image' in body:
        cleaned['image'] = image
    if not partial or 'badge' in body:
        cleaned['badge'] = badge
    if not partial or 'soldOut' in body:
        cleaned['sold_out'] = _coerce_bool(sold_out_value)

    return cleaned, None


# Return the shared product list for admin and customer screens.
@csrf_exempt
@require_GET
def list_products(request):
    products = Product.objects.all()
    return JsonResponse({'ok': True, 'products': [_product_to_dict(product) for product in products]})


# Create a new product from the admin form submission.
@csrf_exempt
@require_POST
def create_product(request):
    body = _read_body(request)
    if body is None:
        return JsonResponse({'ok': False, 'error': 'Invalid request body.'}, status=400)

    payload, error = _normalize_product_payload(body)
    if error:
        return JsonResponse({'ok': False, 'error': error}, status=400)

    product = Product.objects.create(**payload)
    return JsonResponse({'ok': True, 'product': _product_to_dict(product)}, status=201)


# Update an existing product, including sold-out status changes.
@csrf_exempt
@require_POST
def update_product(request, product_id):
    body = _read_body(request)
    if body is None:
        return JsonResponse({'ok': False, 'error': 'Invalid request body.'}, status=400)

    try:
        product = Product.objects.get(product_id=product_id)
    except Product.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'Product not found.'}, status=404)

    payload, error = _normalize_product_payload(body, partial=True)
    if error:
        return JsonResponse({'ok': False, 'error': error}, status=400)

    if not payload:
        return JsonResponse({'ok': False, 'error': 'No product fields were provided.'}, status=400)

    for field, value in payload.items():
        setattr(product, field, value)
    product.save()

    return JsonResponse({'ok': True, 'product': _product_to_dict(product)})


# Delete a product from the shared catalog.
@csrf_exempt
@require_POST
def delete_product(request, product_id):
    try:
        product = Product.objects.get(product_id=product_id)
    except Product.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'Product not found.'}, status=404)

    product.delete()
    return JsonResponse({'ok': True, 'deletedId': product_id})
