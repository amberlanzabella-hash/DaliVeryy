from django.contrib.auth.models import User
from django.db import models


# Main order record saved after a customer places checkout.
class Order(models.Model):
    ORDER_STATUS_CHOICES = [
        ('placed', 'Placed'),
        ('processing', 'Processing'),
        ('out_for_delivery', 'Out for Delivery'),
        ('delivered', 'Delivered'),
    ]
    PAYMENT_METHOD_CHOICES = [
        ('cash_on_delivery', 'Cash on Delivery'),
        ('online_payment', 'Online Payment'),
    ]
    PAYMENT_STATUS_CHOICES = [
        ('paid', 'Paid'),
        ('unpaid', 'Unpaid'),
        ('pending', 'Pending'),
    ]

    order_id = models.CharField(max_length=32, unique=True)
    paymongo_link_id = models.CharField(max_length=128, blank=True, default='')
    ordered_by = models.EmailField(blank=True, default='')
    customer_name = models.CharField(max_length=255)
    address = models.TextField()
    phone = models.CharField(max_length=64)
    notes = models.TextField(blank=True, default='')
    payment_method = models.CharField(max_length=32, choices=PAYMENT_METHOD_CHOICES)
    payment_status = models.CharField(max_length=32, choices=PAYMENT_STATUS_CHOICES, default='pending')
    delivery_status = models.CharField(max_length=32, choices=ORDER_STATUS_CHOICES, default='placed')
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    shipping_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    estimated_delivery = models.CharField(max_length=64, default='2-4 hours')
    courier_name = models.CharField(max_length=255, blank=True, default='Assignment Pending')
    courier_phone = models.CharField(max_length=64, blank=True, default='TBD')
    customer_marked_delivered = models.BooleanField(default=False)
    customer_hidden = models.BooleanField(default=False)
    audited = models.BooleanField(default=False)
    archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    last_updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    # Show the order ID in Django admin and debug output.
    def __str__(self):
        return self.order_id


# Single product line stored under an order.
class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product_id = models.CharField(max_length=64, blank=True, default='')
    name = models.CharField(max_length=255)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    quantity = models.PositiveIntegerField(default=1)
    image = models.TextField(blank=True, default='')
    category = models.CharField(max_length=255, blank=True, default='')
    description = models.TextField(blank=True, default='')
    badge = models.CharField(max_length=255, blank=True, default='')


# Server-side saved cart for a logged-in customer.
class Cart(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='cart')
    customer_name = models.CharField(max_length=255, blank=True, default='')
    address = models.TextField(blank=True, default='')
    phone = models.CharField(max_length=64, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    payment_method = models.CharField(max_length=32, choices=Order.PAYMENT_METHOD_CHOICES, default='cash_on_delivery')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-created_at']


# Single product line stored inside the saved customer cart.
class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name='items')
    product_id = models.CharField(max_length=64, blank=True, default='')
    name = models.CharField(max_length=255)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    quantity = models.PositiveIntegerField(default=1)
    image = models.TextField(blank=True, default='')
    category = models.CharField(max_length=255, blank=True, default='')
    description = models.TextField(blank=True, default='')
    badge = models.CharField(max_length=255, blank=True, default='')


# Daily sales audit snapshot created by admins.
class AuditRecord(models.Model):
    audit_date = models.DateField(db_index=True)
    label = models.CharField(max_length=255)
    total_revenue = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    expense = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_revenue = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_orders = models.PositiveIntegerField(default=0)
    paid_orders = models.PositiveIntegerField(default=0)
    delivered_orders = models.PositiveIntegerField(default=0)
    pending_orders = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-audit_date', '-created_at']

# Shared store status and shop settings used across devices.
class StoreConfig(models.Model):
    is_open = models.BooleanField(default=True)
    opening_time = models.TimeField(null=True, blank=True)
    closing_time = models.TimeField(null=True, blank=True)
    business_name = models.CharField(max_length=255, default='AguasShop')
    shipping_fee = models.DecimalField(max_digits=10, decimal_places=2, default=50)
    currency = models.CharField(max_length=16, default='PHP')
    currency_symbol = models.CharField(max_length=8, default=chr(0x20B1))
    updated_at = models.DateTimeField(auto_now=True)

    # Show whether the store is open or closed in Django admin.
    def __str__(self):
        return f"Store {'Open' if self.is_open else 'Closed'}"
