from django.contrib import admin

from .models import FarmUser


@admin.register(FarmUser)
class FarmUserAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'biometric_enrolled', 'created_at')
    list_filter = ('biometric_enrolled', 'created_at')
    search_fields = ('username', 'email')
    readonly_fields = ('created_at', 'updated_at')
    fieldsets = (
        ('Basic Info', {'fields': ('username', 'email')}),
        ('Security', {'fields': ('biometric_enrolled',)}),
        ('Timestamps', {'fields': ('created_at', 'updated_at')}),
    )
