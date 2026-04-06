from django import forms
from django.contrib.auth.models import User
from django.contrib.auth.forms import UserCreationForm

class RegisterForm(UserCreationForm):
    email = forms.EmailField(required=True)
    otp = forms.CharField(
        required=True,
        max_length=6,
        label="OTP Code",
        help_text="Click 'Send OTP' then enter the 6-digit code."
    )

    class Meta:
        model = User
        fields = ("username", "email", "password1", "password2", "otp")

    def clean_email(self):
        email = self.cleaned_data["email"].lower().strip()
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("Email already in use.")
        return email

    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data["email"]
        if commit:
            user.save()
        return user