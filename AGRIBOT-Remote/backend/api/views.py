from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import authenticate
from django.contrib.auth.models import User

from .models import FarmUser
from .serializers import SignupSerializer, FarmUserSerializer, LoginSerializer


@api_view(['GET'])
@permission_classes([AllowAny])
def health(request):
    return Response({'status': 'ok', 'service': 'agribot-backend'})


@api_view(['POST'])
@permission_classes([AllowAny])
def signup(request):
    """User signup endpoint."""
    serializer = SignupSerializer(data=request.data)
    if serializer.is_valid():
        farm_user = serializer.save()
        return Response(
            FarmUserSerializer(farm_user).data,
            status=status.HTTP_201_CREATED
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    """User login endpoint."""
    serializer = LoginSerializer(data=request.data)
    if serializer.is_valid():
        email = serializer.validated_data['email']
        password = serializer.validated_data['password']
        
        try:
            farm_user = FarmUser.objects.get(email=email)
            user = farm_user.user
            
            # Authenticate user
            if user.check_password(password):
                return Response(
                    FarmUserSerializer(farm_user).data,
                    status=status.HTTP_200_OK
                )
            else:
                return Response(
                    {'error': 'Invalid credentials'},
                    status=status.HTTP_401_UNAUTHORIZED
                )
        except FarmUser.DoesNotExist:
            return Response(
                {'error': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
