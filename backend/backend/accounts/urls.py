from django.urls import path
from . import views

# Account routes used by the frontend login, register, and reset pages.
urlpatterns = [
    path('send-otp/', views.send_otp_view, name='send_otp'),
    path('register/', views.register_view, name='register'),
    path('login/', views.login_view, name='login'),
    path('users/', views.get_users_view, name='get_users'),
    path('forgot-password/send-otp/', views.send_reset_otp_view, name='send_reset_otp'),
    path('forgot-password/reset/', views.reset_password_view, name='reset_password'),
]
