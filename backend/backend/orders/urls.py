from django.urls import path
from . import views

# Order, cart, audit, and store configuration routes used by the frontend.
urlpatterns = [
    path('cart/', views.get_cart),
    path('cart/sync/', views.sync_cart),
    path('cart/clear/', views.clear_cart),
    path('orders/', views.list_orders),
    path('orders/create/', views.create_order),
    path('orders/<str:order_id>/update/', views.update_order),
    path('orders/<str:order_id>/customer-delivered/', views.mark_delivered_by_customer),
    path('orders/<str:order_id>/hide/', views.hide_order_for_customer),
    path('orders/clear/', views.clear_orders),
    path('sales-summary/', views.sales_summary),
    path('audits/', views.list_audits),
    path('audits/create/', views.create_audit),
    path('audits/<str:audit_id>/update/', views.update_audit),
    path('audits/<str:audit_id>/delete/', views.delete_audit),
    path('store-status/', views.get_store_status),
    path('store-status/update/', views.update_store_status),
]
