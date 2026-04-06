from django.contrib import admin
from django.urls import path, include

# Root URL table that connects each app to its API prefix.
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/accounts/", include("accounts.urls")),
    path("api/payments/", include("payments.urls")),
    path("api/orders/", include("orders.urls")),
    path("api/products/", include("products.urls")),
]
