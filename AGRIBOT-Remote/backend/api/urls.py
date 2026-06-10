from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import health, signup, login

urlpatterns = [
    path('health/', health, name='health'),
    path('auth/signup/', signup, name='signup'),
    path('auth/login/', login, name='login'),
    path('auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]
