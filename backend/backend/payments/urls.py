from django.urls import path
from . import views

# Payment routes used during online checkout and payment verification.
urlpatterns = [
    path("create-link/", views.create_payment_link, name="create_payment_link"),
    path("verify/", views.verify_payment, name="verify_payment"),
]
