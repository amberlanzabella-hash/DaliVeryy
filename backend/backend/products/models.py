import uuid

from django.db import models


# Generate the short product ID shown to the frontend.
def generate_product_id():
    return uuid.uuid4().hex[:8].upper()


# Product record shared between admin management and customer ordering.
class Product(models.Model):
    product_id = models.CharField(max_length=32, unique=True, default=generate_product_id, editable=False)
    name = models.CharField(max_length=255)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    description = models.TextField(blank=True, default='')
    category = models.CharField(max_length=255, blank=True, default='')
    image = models.TextField(blank=True, default='')
    badge = models.CharField(max_length=255, blank=True, default='')
    sold_out = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-created_at']

    # Show the product name in Django admin and debug output.
    def __str__(self):
        return self.name
