import json
from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase

from products.models import Product

from .models import AuditRecord, Cart, Order, OrderItem, StoreConfig


class CartApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='cartuser',
            email='cart@example.com',
            password='test-pass-123',
        )
        self.product = Product.objects.create(
            product_id='P-1',
            name='Blue Star',
            price=75,
            description='Cold water',
            category='Water',
            image='',
            badge='Best Seller',
        )

    def test_sync_cart_persists_items_and_checkout_draft(self):
        response = self.client.post(
            '/api/orders/cart/sync/',
            data=json.dumps({
                'email': self.user.email,
                'items': [
                    {
                        'product': {
                            'id': 'P-1',
                            'name': 'Blue Star',
                            'price': 75,
                            'description': 'Cold water',
                            'category': 'Water',
                            'image': '',
                            'badge': 'Best Seller',
                            'soldOut': False,
                        },
                        'quantity': 2,
                    }
                ],
                'checkoutDraft': {
                    'customerName': 'Amber',
                    'address': 'Room 101',
                    'phone': '09123456789',
                    'notes': 'Leave at guard',
                    'paymentMethod': 'online_payment',
                },
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        cart = Cart.objects.get(user=self.user)
        self.assertEqual(cart.customer_name, 'Amber')
        self.assertEqual(cart.address, 'Room 101')
        self.assertEqual(cart.phone, '09123456789')
        self.assertEqual(cart.notes, 'Leave at guard')
        self.assertEqual(cart.payment_method, 'online_payment')
        self.assertEqual(cart.items.count(), 1)

        payload = response.json()['cart']
        self.assertEqual(payload['checkoutDraft']['customerName'], 'Amber')
        self.assertEqual(payload['checkoutDraft']['paymentMethod'], 'online_payment')
        self.assertEqual(payload['items'][0]['product']['name'], 'Blue Star')
        self.assertEqual(payload['items'][0]['quantity'], 2)

        get_response = self.client.get('/api/orders/cart/', {'email': self.user.email})
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.json()['cart']['checkoutDraft']['address'], 'Room 101')
        self.assertFalse(get_response.json()['cart']['items'][0]['product']['soldOut'])

    def test_create_order_clears_server_cart_for_ordering_user(self):
        self.client.post(
            '/api/orders/cart/sync/',
            data=json.dumps({
                'email': self.user.email,
                'items': [
                    {
                        'product': {
                            'id': 'P-1',
                            'name': 'Blue Star',
                            'price': 75,
                            'description': 'Cold water',
                            'category': 'Water',
                            'image': '',
                            'badge': 'Best Seller',
                            'soldOut': False,
                        },
                        'quantity': 1,
                    }
                ],
                'checkoutDraft': {
                    'customerName': 'Amber',
                    'address': 'Room 101',
                    'phone': '09123456789',
                    'notes': 'Leave at guard',
                    'paymentMethod': 'cash_on_delivery',
                },
            }),
            content_type='application/json',
        )

        response = self.client.post(
            '/api/orders/orders/create/',
            data=json.dumps({
                'id': 'AQ-CART123',
                'items': [
                    {
                        'product': {
                            'id': 'P-1',
                            'name': 'Blue Star',
                            'price': 75,
                            'description': 'Cold water',
                            'category': 'Water',
                            'image': '',
                            'badge': 'Best Seller',
                            'soldOut': False,
                        },
                        'quantity': 1,
                    }
                ],
                'customerName': 'Amber',
                'address': 'Room 101',
                'phone': '09123456789',
                'notes': 'Leave at guard',
                'paymentMethod': 'cash_on_delivery',
                'paymentStatus': 'pending',
                'deliveryStatus': 'placed',
                'total': 125,
                'subtotal': 75,
                'shippingFee': 50,
                'orderedBy': self.user.email,
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        cart = Cart.objects.get(user=self.user)
        self.assertEqual(cart.items.count(), 0)
        self.assertEqual(cart.customer_name, '')
        self.assertEqual(cart.address, '')
        self.assertEqual(cart.phone, '')
        self.assertEqual(cart.notes, '')
        self.assertEqual(cart.payment_method, 'cash_on_delivery')

    def test_create_order_blocks_sold_out_products(self):
        self.product.sold_out = True
        self.product.save(update_fields=['sold_out'])

        response = self.client.post(
            '/api/orders/orders/create/',
            data=json.dumps({
                'id': 'AQ-SOLDOUT',
                'items': [
                    {
                        'product': {
                            'id': 'P-1',
                            'name': 'Blue Star',
                            'price': 75,
                            'description': 'Cold water',
                            'category': 'Water',
                            'image': '',
                            'badge': 'Best Seller',
                            'soldOut': True,
                        },
                        'quantity': 1,
                    }
                ],
                'customerName': 'Amber',
                'address': 'Room 101',
                'phone': '09123456789',
                'notes': '',
                'paymentMethod': 'cash_on_delivery',
                'paymentStatus': 'pending',
                'deliveryStatus': 'placed',
                'total': 125,
                'subtotal': 75,
                'shippingFee': 50,
                'orderedBy': self.user.email,
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(Order.objects.count(), 0)
        self.assertEqual(
            response.json()['error'],
            'These items are sold out or unavailable: Blue Star',
        )

    def test_create_order_uses_live_product_price_for_totals(self):
        self.product.price = 90
        self.product.save(update_fields=['price'])

        response = self.client.post(
            '/api/orders/orders/create/',
            data=json.dumps({
                'id': 'AQ-LIVEPRICE',
                'items': [
                    {
                        'product': {
                            'id': 'P-1',
                            'name': 'Blue Star',
                            'price': 1,
                            'description': 'Cold water',
                            'category': 'Water',
                            'image': '',
                            'badge': 'Best Seller',
                            'soldOut': False,
                        },
                        'quantity': 2,
                    }
                ],
                'customerName': 'Amber',
                'address': 'Room 101',
                'phone': '09123456789',
                'notes': '',
                'paymentMethod': 'cash_on_delivery',
                'paymentStatus': 'pending',
                'deliveryStatus': 'placed',
                'total': 10,
                'subtotal': 2,
                'shippingFee': 50,
                'orderedBy': self.user.email,
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()['order']
        self.assertEqual(payload['subtotal'], 180.0)
        self.assertEqual(payload['total'], 230.0)
        self.assertEqual(payload['items'][0]['product']['price'], 90.0)

    def test_create_order_rejects_duplicate_order_id(self):
        Order.objects.create(
            order_id='AQ-DUPLICATE',
            ordered_by=self.user.email,
            customer_name='Existing Customer',
            address='Existing Address',
            phone='09123456789',
            payment_method='cash_on_delivery',
            payment_status='pending',
            delivery_status='placed',
            total=125,
            subtotal=75,
            shipping_fee=50,
        )

        response = self.client.post(
            '/api/orders/orders/create/',
            data=json.dumps({
                'id': 'AQ-DUPLICATE',
                'items': [
                    {
                        'product': {
                            'id': 'P-1',
                            'name': 'Blue Star',
                            'price': 75,
                            'description': 'Cold water',
                            'category': 'Water',
                            'image': '',
                            'badge': 'Best Seller',
                            'soldOut': False,
                        },
                        'quantity': 1,
                    }
                ],
                'customerName': 'Amber',
                'address': 'Room 101',
                'phone': '09123456789',
                'notes': '',
                'paymentMethod': 'cash_on_delivery',
                'paymentStatus': 'pending',
                'deliveryStatus': 'placed',
                'total': 125,
                'subtotal': 75,
                'shippingFee': 50,
                'orderedBy': self.user.email,
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['error'], 'Order ID already exists.')


class CustomerOrderVisibilityTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username='owneruser',
            email='owner@example.com',
            password='owner-pass-123',
        )
        self.other_user = User.objects.create_user(
            username='otheruser',
            email='other@example.com',
            password='other-pass-123',
        )
        self.order = Order.objects.create(
            order_id='AQ-HIDE123',
            ordered_by=self.owner.email,
            customer_name='Owner User',
            address='Sample Address',
            phone='09123456789',
            payment_method='cash_on_delivery',
            payment_status='pending',
            delivery_status='placed',
            total=120,
            subtotal=100,
            shipping_fee=20,
        )

    def test_customer_can_hide_own_order_history(self):
        response = self.client.post(
            f'/api/orders/orders/{self.order.order_id}/hide/',
            data=json.dumps({
                'email': self.owner.email,
                'username': self.owner.username,
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertTrue(self.order.customer_hidden)
        self.assertTrue(response.json()['order']['customerHidden'])

    def test_customer_cannot_hide_other_users_order_history(self):
        response = self.client.post(
            f'/api/orders/orders/{self.order.order_id}/hide/',
            data=json.dumps({
                'email': self.other_user.email,
                'username': self.other_user.username,
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 403)
        self.order.refresh_from_db()
        self.assertFalse(self.order.customer_hidden)
        self.assertEqual(
            response.json()['error'],
            'You can only remove your own order history.',
        )


class StoreStatusApiTests(TestCase):
    def test_get_store_status_creates_default_config(self):
        response = self.client.get('/api/orders/store-status/')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['store']['isOpen'])
        self.assertEqual(response.json()['store']['openingTime'], '')
        self.assertEqual(response.json()['store']['closingTime'], '')
        self.assertEqual(response.json()['settings']['businessName'], 'AguasShop')
        self.assertEqual(response.json()['settings']['shippingFee'], 50.0)
        self.assertEqual(response.json()['settings']['currency'], 'PHP')
        self.assertEqual(response.json()['settings']['currencySymbol'], '₱')
        self.assertTrue(StoreConfig.objects.filter(pk=1).exists())

    def test_update_store_status_persists_toggle_and_hours(self):
        response = self.client.post(
            '/api/orders/store-status/update/',
            data=json.dumps({
                'isOpen': False,
                'openingTime': '09:00',
                'closingTime': '17:00',
                'businessName': 'DaliVery Campus',
                'shippingFee': 65.5,
                'currency': 'USD',
                'currencySymbol': '$',
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)

        config = StoreConfig.objects.get(pk=1)
        self.assertFalse(config.is_open)
        self.assertEqual(config.opening_time.strftime('%H:%M'), '09:00')
        self.assertEqual(config.closing_time.strftime('%H:%M'), '17:00')
        self.assertEqual(config.business_name, 'DaliVery Campus')
        self.assertEqual(float(config.shipping_fee), 65.5)
        self.assertEqual(config.currency, 'USD')
        self.assertEqual(config.currency_symbol, '$')

        store = response.json()['store']
        self.assertFalse(store['isOpen'])
        self.assertEqual(store['openingTime'], '09:00')
        self.assertEqual(store['closingTime'], '17:00')
        self.assertFalse(store['isAcceptingOrders'])

        settings = response.json()['settings']
        self.assertEqual(settings['businessName'], 'DaliVery Campus')
        self.assertEqual(settings['shippingFee'], 65.5)
        self.assertEqual(settings['currency'], 'USD')
        self.assertEqual(settings['currencySymbol'], '$')

    def test_closed_store_blocks_order_creation(self):
        StoreConfig.objects.create(id=1, is_open=False)

        response = self.client.post(
            '/api/orders/orders/create/',
            data=json.dumps({
                'id': 'AQ-TEST123',
                'items': [
                    {
                        'product': {
                            'id': 'P-1',
                            'name': 'Water',
                            'price': 10,
                            'description': '',
                            'category': 'Drinks',
                            'image': '',
                            'badge': '',
                        },
                        'quantity': 1,
                    }
                ],
                'customerName': 'Test User',
                'address': 'Sample Address',
                'phone': '09123456789',
                'notes': '',
                'paymentMethod': 'cash_on_delivery',
                'paymentStatus': 'pending',
                'deliveryStatus': 'placed',
                'total': 10,
                'subtotal': 10,
                'shippingFee': 0,
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json()['error'],
            'Store is currently closed. Ordering is unavailable right now.',
        )


class OrderAuditBehaviorTests(TestCase):
    def setUp(self):
        self.admin_email = 'admin@example.com'
        self.admin_password = 'secret-pass-123'
        User.objects.create_user(
            username='admin',
            email=self.admin_email,
            password=self.admin_password,
            is_staff=True,
        )

    def create_order(self, *, order_id='AQ-TEST123', audited=True):
        order = Order.objects.create(
            order_id=order_id,
            ordered_by='customer@example.com',
            customer_name='Customer One',
            address='Sample Address',
            phone='09123456789',
            payment_method='cash_on_delivery',
            payment_status='paid',
            delivery_status='delivered',
            total=120,
            subtotal=100,
            shipping_fee=20,
            audited=audited,
        )
        OrderItem.objects.create(
            order=order,
            product_id='P-1',
            name='Blue Star',
            price=120,
            quantity=1,
        )
        return order

    def test_clear_orders_archives_active_orders_but_keeps_customer_history(self):
        order = self.create_order()

        response = self.client.post(
            '/api/orders/orders/clear/',
            data=json.dumps({
                'email': self.admin_email,
                'password': self.admin_password,
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['clearedOrders'], 1)
        self.assertEqual(payload['clearedOrderIds'], [order.order_id])

        order.refresh_from_db()
        self.assertTrue(order.archived)
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(OrderItem.objects.count(), 1)

        orders_response = self.client.get('/api/orders/orders/')
        self.assertEqual(orders_response.status_code, 200)
        orders = orders_response.json()['orders']
        self.assertEqual(len(orders), 1)
        self.assertTrue(orders[0]['archived'])
        self.assertEqual(orders[0]['id'], order.order_id)

    def test_create_audit_still_blocks_duplicate_dates(self):
        AuditRecord.objects.create(
            audit_date=date(2026, 3, 15),
            label='Mar 15, 2026',
            total_revenue=640,
            expense=40,
            net_revenue=600,
            total_orders=2,
            paid_orders=2,
            delivered_orders=2,
            pending_orders=0,
        )

        response = self.client.post(
            '/api/orders/audits/create/',
            data=json.dumps({
                'auditDate': '2026-03-15',
                'label': 'Mar 15, 2026',
                'totalRevenue': 640,
                'expense': 40,
                'netRevenue': 600,
                'totalOrders': 2,
                'paidOrders': 2,
                'deliveredOrders': 2,
                'pendingOrders': 0,
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()['error'],
            'These orders are already audited. Please check the audit window.',
        )

    def test_update_audit_allows_same_date_edits_even_if_duplicates_already_exist(self):
        first_audit = AuditRecord.objects.create(
            audit_date=date(2026, 3, 15),
            label='Mar 15, 2026',
            total_revenue=640,
            expense=40,
            net_revenue=600,
            total_orders=2,
            paid_orders=2,
            delivered_orders=2,
            pending_orders=0,
        )
        AuditRecord.objects.create(
            audit_date=date(2026, 3, 15),
            label='Mar 15, 2026 copy',
            total_revenue=300,
            expense=25,
            net_revenue=275,
            total_orders=1,
            paid_orders=1,
            delivered_orders=1,
            pending_orders=0,
        )

        response = self.client.post(
            f'/api/orders/audits/{first_audit.id}/update/',
            data=json.dumps({
                'auditDate': '2026-03-15',
                'expense': 55,
                'netRevenue': 585,
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        first_audit.refresh_from_db()
        self.assertEqual(float(first_audit.expense), 55.0)
        self.assertEqual(float(first_audit.net_revenue), 585.0)
