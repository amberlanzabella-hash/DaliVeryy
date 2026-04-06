import json
import logging
import random
import time

import requests
from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .models import Profile, PendingOTP, PasswordResetOTP

logger = logging.getLogger(__name__)

# OTP validity window in seconds.
OTP_TTL_SECONDS = 300


# Safely read JSON or form data from an incoming request.
def _read_body(request):
    try:
        if (request.content_type or '').startswith('application/json'):
            return json.loads(request.body or '{}')
        return request.POST
    except Exception:
        return None


# Send OTP emails using the SMTP settings from environment variables.
def _send_email(subject: str, message: str, email: str):
    if settings.BREVO_API_KEY:
        sender_email = settings.BREVO_SENDER_EMAIL or settings.DEFAULT_FROM_EMAIL
        if not sender_email:
            raise ValueError('BREVO_SENDER_EMAIL or DEFAULT_FROM_EMAIL must be set.')

        response = requests.post(
            'https://api.brevo.com/v3/smtp/email',
            headers={
                'accept': 'application/json',
                'api-key': settings.BREVO_API_KEY,
                'content-type': 'application/json',
            },
            json={
                'sender': {
                    'name': settings.BREVO_SENDER_NAME,
                    'email': sender_email,
                },
                'to': [{'email': email}],
                'subject': subject,
                'textContent': message,
            },
            timeout=30,
        )
        if not response.ok:
            raise RuntimeError(f'Brevo API error {response.status_code}: {response.text[:300]}')
        return

    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=False,
    )


# Create and email an OTP for a new account registration request.
@csrf_exempt
@require_POST
def send_otp_view(request):
    body = _read_body(request)
    if body is None:
        return JsonResponse({'ok': False, 'error': 'Invalid request body.'}, status=400)
    email = (body.get('email') or '').strip().lower()
    if not email:
        return JsonResponse({'ok': False, 'error': 'Email is required.'}, status=400)
    if User.objects.filter(email__iexact=email).exists():
        return JsonResponse({'ok': False, 'error': 'Email already in use.'}, status=400)

    otp = f"{random.randint(100000, 999999)}"
    expires_at = int(time.time()) + OTP_TTL_SECONDS
    try:
        PendingOTP.objects.update_or_create(email=email, defaults={'code': otp, 'expires_at': expires_at})
        _send_email('Your DaliVery Verification Code', f'Your DaliVery verification code is: {otp}', email)
    except Exception as e:
        logger.exception('Failed to send registration OTP for %s', email)
        return JsonResponse({'ok': False, 'error': f'Failed to send OTP: {e}'}, status=500)
    return JsonResponse({'ok': True, 'message': 'OTP sent to your email.'})


# Verify the registration OTP and create the new user account.
@csrf_exempt
@require_POST
def register_view(request):
    body = _read_body(request)
    if body is None:
        return JsonResponse({'ok': False, 'error': 'Invalid request body.'}, status=400)
    username = (body.get('username') or '').strip()
    email = (body.get('email') or '').strip().lower()
    password = body.get('password') or ''
    otp_code = (body.get('otp') or '').strip()

    if not username or not email or not password or not otp_code:
        return JsonResponse({'ok': False, 'error': 'All fields are required.'}, status=400)
    if len(password) < 6:
        return JsonResponse({'ok': False, 'error': 'Password must be at least 6 characters.'}, status=400)
    if User.objects.filter(email__iexact=email).exists():
        return JsonResponse({'ok': False, 'error': 'Email already in use.'}, status=400)
    if User.objects.filter(username__iexact=username).exists():
        return JsonResponse({'ok': False, 'error': 'Username already taken.'}, status=400)
    try:
        pending = PendingOTP.objects.get(email=email)
    except PendingOTP.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'Please request an OTP first.'}, status=400)
    if int(time.time()) > pending.expires_at:
        pending.delete()
        return JsonResponse({'ok': False, 'error': 'OTP has expired. Please request a new one.'}, status=400)
    if otp_code != pending.code:
        return JsonResponse({'ok': False, 'error': 'Invalid OTP. Please try again.'}, status=400)

    user = User.objects.create_user(username=username, email=email, password=password)
    profile, _ = Profile.objects.get_or_create(user=user)
    profile.is_verified = True
    profile.save()
    pending.delete()
    return JsonResponse({'ok': True, 'message': 'Account created successfully. You can now sign in.'})


# Authenticate the user and return the role data expected by the frontend.
@csrf_exempt
@require_POST
def login_view(request):
    body = _read_body(request)
    if body is None:
        return JsonResponse({'ok': False, 'error': 'Invalid request body.'}, status=400)
    email = (body.get('email') or '').strip().lower()
    password = body.get('password') or ''
    if not email or not password:
        return JsonResponse({'ok': False, 'error': 'Email and password are required.'}, status=400)
    try:
        user_obj = User.objects.get(email__iexact=email)
    except User.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'Invalid email or password.'}, status=401)
    user = authenticate(request, username=user_obj.username, password=password)
    if user is None:
        return JsonResponse({'ok': False, 'error': 'Invalid email or password.'}, status=401)
    profile, _ = Profile.objects.get_or_create(user=user)
    if user.is_staff or user.is_superuser:
        if not profile.is_verified:
            profile.is_verified = True
            profile.save(update_fields=['is_verified'])
    elif not profile.is_verified:
        return JsonResponse({'ok': False, 'error': 'Account not verified.'}, status=403)
    role = 'admin' if user.is_staff or user.is_superuser else 'user'
    return JsonResponse({'ok': True, 'user': {'username': user.username, 'email': user.email, 'role': role}})


# Admin-only endpoint for listing registered users.
@csrf_exempt
@require_POST
def get_users_view(request):
    body = _read_body(request)
    if body is None:
        return JsonResponse({'ok': False, 'error': 'Invalid request body.'}, status=400)
    email = (body.get('email') or '').strip().lower()
    password = body.get('password') or ''
    try:
        user_obj = User.objects.get(email__iexact=email)
    except User.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'Invalid credentials.'}, status=401)
    user = authenticate(request, username=user_obj.username, password=password)
    if user is None or not (user.is_staff or user.is_superuser):
        return JsonResponse({'ok': False, 'error': 'Invalid credentials.'}, status=401)

    users = []
    for u in User.objects.all().order_by('date_joined'):
        profile, _ = Profile.objects.get_or_create(user=u)
        users.append({
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'is_staff': u.is_staff,
            'is_verified': profile.is_verified,
            'date_joined': u.date_joined.strftime('%b %d, %Y %I:%M %p'),
        })
    return JsonResponse({'ok': True, 'users': users})


# Create and email an OTP for password reset.
@csrf_exempt
@require_POST
def send_reset_otp_view(request):
    body = _read_body(request)
    if body is None:
        return JsonResponse({'ok': False, 'error': 'Invalid request body.'}, status=400)
    email = (body.get('email') or '').strip().lower()
    if not email:
        return JsonResponse({'ok': False, 'error': 'Email is required.'}, status=400)
    if not User.objects.filter(email__iexact=email).exists():
        return JsonResponse({'ok': False, 'error': 'No account found with that email.'}, status=404)
    otp = f"{random.randint(100000, 999999)}"
    expires_at = int(time.time()) + OTP_TTL_SECONDS
    try:
        PasswordResetOTP.objects.update_or_create(email=email, defaults={'code': otp, 'expires_at': expires_at})
        _send_email('Your DaliVery Password Reset Code', f'Your password reset code is: {otp}', email)
    except Exception as e:
        logger.exception('Failed to send reset OTP for %s', email)
        return JsonResponse({'ok': False, 'error': f'Failed to send reset OTP: {e}'}, status=500)
    return JsonResponse({'ok': True, 'message': 'Reset OTP sent.'})


# Verify the reset OTP and save the user's new password.
@csrf_exempt
@require_POST
def reset_password_view(request):
    body = _read_body(request)
    if body is None:
        return JsonResponse({'ok': False, 'error': 'Invalid request body.'}, status=400)
    email = (body.get('email') or '').strip().lower()
    otp = (body.get('otp') or '').strip()
    password = body.get('password') or ''
    confirm_password = body.get('confirm_password') or ''
    if not email or not otp or not password or not confirm_password:
        return JsonResponse({'ok': False, 'error': 'All fields are required.'}, status=400)
    if password != confirm_password:
        return JsonResponse({'ok': False, 'error': 'Passwords do not match.'}, status=400)
    if len(password) < 6:
        return JsonResponse({'ok': False, 'error': 'Password must be at least 6 characters.'}, status=400)
    try:
        pending = PasswordResetOTP.objects.get(email=email)
    except PasswordResetOTP.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'Please request an OTP first.'}, status=400)
    if int(time.time()) > pending.expires_at:
        pending.delete()
        return JsonResponse({'ok': False, 'error': 'OTP has expired. Please request a new one.'}, status=400)
    if otp != pending.code:
        return JsonResponse({'ok': False, 'error': 'Invalid OTP.'}, status=400)
    try:
        user = User.objects.get(email__iexact=email)
    except User.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'No account found with that email.'}, status=404)
    user.set_password(password)
    user.save()
    pending.delete()
    return JsonResponse({'ok': True, 'message': 'Password reset successful.'})
