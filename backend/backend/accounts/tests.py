import json

from django.contrib.auth.models import User
from django.test import TestCase

from .models import Profile


class ProfileSignalTests(TestCase):
    def test_raw_signal_does_not_create_duplicate_profile_during_fixture_load(self):
        user = User(username='fixtureuser', email='fixture@example.com')
        user.pk = 999

        from .models import create_or_sync_profile

        create_or_sync_profile(User, user, created=True, raw=True)

        self.assertFalse(Profile.objects.filter(user_id=999).exists())


class LoginViewTests(TestCase):
    def test_superuser_login_auto_verifies_profile(self):
        user = User.objects.create_superuser(
            username='adminuser',
            email='admin@example.com',
            password='testpass123',
        )
        profile = Profile.objects.get(user=user)
        profile.is_verified = False
        profile.save(update_fields=['is_verified'])

        response = self.client.post(
            '/api/accounts/login/',
            data=json.dumps({'email': 'admin@example.com', 'password': 'testpass123'}),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload['ok'])
        self.assertEqual(payload['user']['role'], 'admin')

        profile.refresh_from_db()
        self.assertTrue(profile.is_verified)

    def test_unverified_regular_user_is_rejected(self):
        user = User.objects.create_user(
            username='regularuser',
            email='user@example.com',
            password='testpass123',
        )
        profile = Profile.objects.get(user=user)
        profile.is_verified = False
        profile.save(update_fields=['is_verified'])

        response = self.client.post(
            '/api/accounts/login/',
            data=json.dumps({'email': 'user@example.com', 'password': 'testpass123'}),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 403)
        payload = response.json()
        self.assertFalse(payload['ok'])
        self.assertEqual(payload['error'], 'Account not verified.')
