from rest_framework import serializers
from django.contrib.auth.models import User
from .models import FarmUser


class FarmUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = FarmUser
        fields = ('id', 'username', 'email', 'biometric_enrolled', 'created_at')
        read_only_fields = ('id', 'created_at')


class SignupSerializer(serializers.Serializer):
    """Serializer for user signup."""
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    
    def validate_username(self, value):
        if FarmUser.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already exists.")
        return value
    
    def validate_email(self, value):
        if FarmUser.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already registered.")
        return value
    
    def create(self, validated_data):
        # Create Django User
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password']
        )
        
        # Create FarmUser profile
        farm_user = FarmUser.objects.create(
            user=user,
            username=validated_data['username'],
            email=validated_data['email']
        )
        
        return farm_user


class LoginSerializer(serializers.Serializer):
    """Serializer for user login."""
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
