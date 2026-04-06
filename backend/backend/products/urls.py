from django.urls import path

from . import views


# Product routes used by the admin dashboard and customer catalog sync.
urlpatterns = [
    path('products/', views.list_products),
    path('products/create/', views.create_product),
    path('products/<str:product_id>/update/', views.update_product),
    path('products/<str:product_id>/delete/', views.delete_product),
]
