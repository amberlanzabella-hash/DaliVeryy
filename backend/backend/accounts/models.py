from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver


# Extra account information linked to Django's built-in user model.
class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    is_verified = models.BooleanField(default=False)


# Automatically create or sync a profile whenever a user record is saved.
@receiver(post_save, sender=User)
def create_or_sync_profile(sender, instance, created, raw=False, **kwargs):
    if raw:
        return

    if created:
        Profile.objects.create(user=instance, is_verified=bool(instance.is_staff or instance.is_superuser))
        return

    profile, _ = Profile.objects.get_or_create(user=instance)
    if (instance.is_staff or instance.is_superuser) and not profile.is_verified:
        profile.is_verified = True
        profile.save(update_fields=['is_verified'])


# Temporary OTP record used during account registration.
class PendingOTP(models.Model):
    """Stores OTP codes keyed by email — no session needed."""
    email = models.EmailField(unique=True)
    code = models.CharField(max_length=6)
    expires_at = models.IntegerField()  # unix timestamp

    # Show a readable label for this OTP record in Django admin.
    def __str__(self):
        return f"{self.email} — {self.code}"


# Temporary OTP record used during password reset.
class PasswordResetOTP(models.Model):
    email = models.EmailField(unique=True)
    code = models.CharField(max_length=6)
    expires_at = models.IntegerField()

    # Show a readable label for this OTP record in Django admin.
    def __str__(self):
        return f"reset::{self.email} — {self.code}"
