from django.contrib import admin

from .models import Product


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('product_id', 'name', 'price', 'category', 'updated_at')
    search_fields = ('product_id', 'name', 'category')
    list_filter = ('category',)
