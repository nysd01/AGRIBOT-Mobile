from django.db import models
from django.contrib.auth.models import User


class FarmUser(models.Model):
    """Extended user model for farm management."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='farm_profile')
    username = models.CharField(max_length=150, unique=True)
    email = models.EmailField(unique=True)
    biometric_enrolled = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Farm User"
        verbose_name_plural = "Farm Users"

    def __str__(self):
        return self.username
