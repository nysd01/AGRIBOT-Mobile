# 🤖 AGRIBOT-Remote: Smart Agricultural Robot Control System

A complete IoT solution for remote agricultural monitoring and control. Connect your ESP32-based agricultural robot to a modern React Native mobile app with real-time sensor data, WiFi connectivity, and Django backend support.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#-features)
- [System Architecture](#-system-architecture)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Quick Start](#-quick-start)
- [Configuration](#-configuration)
- [API Documentation](#-api-documentation)
- [Mobile App Features](#-mobile-app-features)
- [Backend Setup](#-backend-setup)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)

---

## Overview

AGRIBOT-Remote is a complete agricultural robotics platform that enables remote monitoring and control of smart agricultural devices. The system consists of three main components:

1. **ESP32 Firmware** - Sensor data collection and WiFi connectivity
2. **React Native Mobile App** - Cross-platform UI for iOS, Android, and Web
3. **Django Backend** - REST API and data management (optional)

### Key Capabilities

- Real-time sensor monitoring (temperature, humidity, soil moisture, pH, battery, GPS)
- Direct WiFi connectivity between phone and ESP32 device
- Biometric authentication support
- Remote control and diagnostics
- Live dashboard with historical data

---

## ✨ Features

### ESP32 Firmware
- ✅ WiFi Access Point (AP) mode for direct phone connection
- ✅ HTTP REST API for sensor data collection
- ✅ Real-time sensor data with calibration
- ✅ JSON-based communication
- ✅ CORS support for cross-origin requests
- ✅ Automatic device health monitoring
- ✅ Battery voltage tracking
- ✅ GPS position monitoring
- ✅ Camera streaming capability (status indicator)
- ✅ Raw diagnostics and ADC readings

### Mobile App (React Native)
- ✅ Real-time sensor display with live updates
- ✅ WiFi connection management and diagnostics
- ✅ Biometric authentication (fingerprint/face recognition)
- ✅ Responsive UI for mobile, tablet, and web
- ✅ Connection status indicators
- ✅ Offline capability with SQLite database
- ✅ TypeScript for type safety
- ✅ Dark/Light theme support
- ✅ Haptic feedback
- ✅ Cross-platform deployment (iOS, Android, Web)

### Sensors Supported
- 🌡️ Temperature (ADC pin 32)
- 💧 Humidity (ADC pin 33)
- 🌱 Soil Moisture (ADC pin 34)
- 🧪 pH Level (ADC pin 35)
- 🔋 Battery Voltage (ADC pin 39)
- 📍 GPS Coordinates
- 📹 Camera Status
- 🔧 System Diagnostics

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────┐
│        AGRIBOT-Remote System         │
└─────────────────────────────────────┘
                   │
        ┌──────────┴──────────┬─────────────┐
        │                     │             │
   ┌────▼────┐          ┌─────▼─────┐   ┌──▼──────┐
   │  ESP32   │          │  Mobile   │   │ Backend │
   │ Firmware │◄─────────►│   App     │   │ (Django)│
   └──────────┘  WiFi    └───────────┘   └─────────┘
   (Sensor Data)  Direct  (React Native)  (Optional)
   (AP Mode)    Connection (iOS/Android/Web)
```

### Components

#### 1. ESP32 Firmware (`esp32-firmware/`)
- **Board**: ESP32 Dev Module
- **Framework**: Arduino with PlatformIO
- **WiFi Mode**: Access Point (AP)
- **SSID**: `AGRIBOT-ESP`
- **Password**: `agribot123`
- **IP Address**: `192.168.4.1`
- **HTTP Port**: 80

#### 2. Mobile App (`mobile/`)
- **Framework**: React Native (Expo 54)
- **Language**: TypeScript
- **Navigation**: Expo Router v6
- **Database**: SQLite (expo-sqlite)
- **State Management**: Context API
- **Authentication**: Biometric + Password
- **UI Library**: React Native with custom theming

#### 3. Django Backend (`backend/`)
- **Framework**: Django 5.1
- **API**: Django REST Framework
- **Database**: SQLite
- **Authentication**: Token-based + CORS
- **Optional**: Can be used for cloud storage, analytics, or multi-device management

---

## 📁 Project Structure

```
AGRIBOT-Remote/
│
├── 📱 mobile/                              # React Native Mobile App
│   ├── app/                                # Screens and layouts
│   │   ├── (tabs)/                         # Tab-based navigation
│   │   │   ├── _layout.tsx                 # Tab configuration
│   │   │   ├── index.tsx                   # Home/Dashboard screen
│   │   │   ├── explore.tsx                 # Exploration features
│   │   │   ├── sensors.tsx                 # Real-time sensor display ⭐
│   │   │   ├── network.tsx                 # WiFi connection setup ⭐
│   │   │   ├── remote.tsx                  # Remote control
│   │   │   └── intelligence.tsx            # AI/ML features
│   │   ├── (auth)/                         # Authentication flows
│   │   │   ├── login.tsx                   # Login screen
│   │   │   ├── signup.tsx                  # Registration screen
│   │   │   └── _layout.tsx                 # Auth navigation
│   │   ├── modal.tsx                       # Modal dialogs
│   │   ├── modal-settings.tsx              # Settings modal
│   │   └── index.tsx                       # Root layout
│   │
│   ├── components/                         # Reusable components
│   │   ├── ui/                             # UI components
│   │   │   ├── collapsible.tsx             # Collapsible panel
│   │   │   └── icon-symbol.tsx             # Icon components
│   │   ├── parallax-scroll-view.tsx        # Scroll animations
│   │   ├── themed-text.tsx                 # Text with theming
│   │   ├── themed-view.tsx                 # View with theming
│   │   ├── haptic-tab.tsx                  # Tab with haptics
│   │   └── external-link.tsx               # External link handler
│   │
│   ├── hooks/                              # Custom React hooks ⭐
│   │   ├── use-esp32-sensors.ts            # Fetch ESP32 sensor data
│   │   ├── use-network-connection.ts       # WiFi connection info
│   │   ├── use-color-scheme.ts             # Dark/light theme
│   │   ├── use-theme-color.ts              # Color theming
│   │   └── use-esp32-sensors.ts            # Sensor data fetching
│   │
│   ├── screens/                            # Screen components
│   │   ├── HomeScreen.tsx                  # Main dashboard
│   │   ├── LoginScreen.tsx                 # Login UI
│   │   ├── SignupScreen.tsx                # Registration UI
│   │   └── BiometricLoginScreen.tsx        # Biometric auth
│   │
│   ├── styles/                             # Style definitions
│   │   ├── auth.styles.ts                  # Auth screen styles
│   │   ├── dashboard.styles.ts             # Dashboard styles
│   │   ├── remote.styles.ts                # Remote control styles
│   │   └── sensors.styles.ts               # Sensor display styles
│   │
│   ├── utils/                              # Utility functions
│   │   ├── auth.ts                         # Authentication logic
│   │   └── biometrics.ts                   # Biometric handling
│   │
│   ├── context/                            # Context providers
│   │   └── AuthContext.tsx                 # Authentication context
│   │
│   ├── types/                              # TypeScript types
│   │   ├── index.ts                        # Common types
│   │   └── navigation.ts                   # Navigation types
│   │
│   ├── db/                                 # Database setup
│   │   ├── database.ts                     # Native SQLite setup
│   │   ├── database.web.ts                 # Web SQLite setup
│   │   ├── initDB.native.ts                # Native DB initialization
│   │   └── initDB.web.ts                   # Web DB initialization
│   │
│   ├── constants/                          # Application constants
│   │   └── theme.ts                        # Theme definitions
│   │
│   ├── assets/                             # Static assets
│   │   └── images/                         # Image files
│   │
│   ├── package.json                        # Dependencies
│   ├── tsconfig.json                       # TypeScript config
│   ├── eslint.config.js                    # ESLint rules
│   ├── app.json                            # Expo config
│   ├── App.tsx                             # Main app (native/web hybrid)
│   ├── App.native.tsx                      # Native-specific entry
│   └── App.web.tsx                         # Web-specific entry
│
├── 🔧 esp32-firmware/                      # ESP32 Firmware
│   ├── src/
│   │   └── main.cpp                        # Main firmware code ⭐
│   │       ├── WiFi AP configuration
│   │       ├── HTTP server setup
│   │       ├── Sensor reading functions
│   │       ├── API endpoints (/sensors, /health, /pins)
│   │       └── JSON response formatting
│   │
│   ├── include/                            # Header files
│   │   ├── secrets.h                       # WiFi credentials
│   │   └── secrets.example.h               # Example secrets
│   │
│   ├── platformio.ini                      # Build configuration ⭐
│   │   ├── Board: esp32doit-devkit1
│   │   ├── Framework: Arduino
│   │   ├── Upload speed: 460800 baud
│   │   └── Libraries: ArduinoJson, WebServer, WiFi
│   │
│   ├── compile_commands.json               # Compilation database
│   ├── DOMINO4_SENSORS.md                  # Sensor specifications
│   └── README.md                           # Firmware documentation
│
├── 🌐 backend/                             # Django Backend (Optional)
│   ├── api/                                # Django REST API
│   │   ├── models.py                       # Database models
│   │   ├── views.py                        # API views
│   │   ├── serializers.py                  # Data serializers
│   │   ├── urls.py                         # URL routing
│   │   ├── admin.py                        # Admin interface
│   │   ├── apps.py                         # App configuration
│   │   ├── tests.py                        # Unit tests
│   │   └── migrations/                     # Database migrations
│   │
│   ├── config/                             # Django configuration
│   │   ├── settings.py                     # Settings ⭐
│   │   ├── urls.py                         # URL configuration
│   │   ├── wsgi.py                         # WSGI entry point
│   │   └── asgi.py                         # ASGI entry point
│   │
│   ├── manage.py                           # Django management
│   ├── db.sqlite3                          # SQLite database
│   └── README.md                           # Backend documentation
│
├── 📖 Documentation Files
│   ├── README_COMPLETE.md                  # This file
│   ├── QUICK_SETUP.md                      # 5-minute quick start
│   ├── INTEGRATION_GUIDE.md                # Detailed integration docs
│   ├── FIX_SUMMARY.md                      # Bug fixes and solutions
│   ├── CHANGES.md                          # Version history
│   └── START_PROJECT.sh                    # Project startup script
│
└── ⚙️ Configuration Files
    ├── .env                                # Environment variables (not included)
    ├── .gitignore                          # Git ignore rules
    ├── read_serial.py                      # Serial debugging utility
    └── web_output.txt                      # Web build output logs

⭐ = Key files for integration
```

---

## 🔧 Prerequisites

### System Requirements
- **Windows 10/11**, **macOS 10.15+**, or **Linux** with USB support
- **8GB RAM minimum** (16GB recommended for development)
- **2GB free disk space**

### Required Software

#### For ESP32 Firmware Development
- **VS Code** (free) - https://code.visualstudio.com/
- **PlatformIO** extension for VS Code
- **Python 3.8+** (required by PlatformIO)
- **USB drivers** for ESP32 board
  - CP210x drivers (most common) or
  - CH340 drivers (some clones)

#### For Mobile App Development
- **Node.js 18.0+** - https://nodejs.org/
- **npm 9.0+** (comes with Node.js)
- **Expo CLI**: `npm install -g expo-cli`
- **VS Code** or **Android Studio/Xcode** (optional, for emulators)

#### For Django Backend
- **Python 3.9+**
- **pip** (comes with Python)
- **virtualenv** or **venv**

### Hardware

- **ESP32 Dev Board** (e.g., ESP32 DOIT DevKit 1)
- **USB Cable** (A to Micro-B, or appropriate for your board)
- **Sensors** (connected to ESP32):
  - Temperature/Humidity sensor
  - Soil moisture sensor
  - pH sensor
  - Battery voltage monitor
  - GPS module
  - Camera module (optional)
- **WiFi-capable smartphone** (for mobile app testing)

---

## ⚡ Quick Start

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/AGRIBOT-Remote.git
cd AGRIBOT-Remote
```

### Step 2: Setup ESP32 Firmware (5 minutes)

```bash
cd esp32-firmware

# Option A: Using PlatformIO CLI
platformio run -t upload
platformio device monitor

# Option B: Using VS Code
# 1. Open PlatformIO Home (click PlatformIO icon on left)
# 2. Click "Upload and Monitor"
```

**Expected Output:**
```
[WiFi AP] SSID: AGRIBOT-ESP
[WiFi AP] Password: agribot123
[WiFi AP] IP: 192.168.4.1
[HTTP] API server started on port 80
✅ Ready for connection
```

### Step 3: Connect Phone to ESP32 WiFi (1 minute)

1. Open phone **Settings** → **WiFi**
2. Find and select `AGRIBOT-ESP`
3. Enter password: `agribot123`
4. Wait for ✅ Connected

### Step 4: Install Mobile App Dependencies (2 minutes)

```bash
cd mobile
npm install
```

### Step 5: Start Mobile App (2 minutes)

```bash
npm start
```

**Choose your platform:**

**Android:**
```bash
a  # Opens Android Emulator
# OR scan QR code with Expo Go app
```

**iOS:**
```bash
i  # Opens iOS Simulator
# OR scan QR code with Expo Go app
```

**Web:**
```bash
w  # Opens in browser
```

### Step 6: Verify Connection

1. Open app → **NETWORK** tab
2. Tap "Check ESP32 Connection"
3. Verify ✅ Connected status
4. Go to **SENSORS** tab
5. See live sensor values updating every 2 seconds

✅ **Success! You're now receiving real-time data from your ESP32.**

---

## ⚙️ Configuration

### ESP32 WiFi Settings

**Edit `esp32-firmware/include/secrets.h`:**

```cpp
#define WIFI_SSID "AGRIBOT-ESP"
#define WIFI_PASSWORD "agribot123"
#define WIFI_AP_IP "192.168.4.1"
#define WIFI_AP_GATEWAY "192.168.4.1"
#define WIFI_AP_SUBNET "255.255.255.0"
```

**Or edit `esp32-firmware/src/main.cpp`:**

```cpp
#define WIFI_SSID "AGRIBOT-ESP"
#define WIFI_PASSWORD "agribot123"
```

### Mobile App ESP32 Connection Settings

**Edit `mobile/hooks/use-esp32-sensors.ts`:**

```typescript
const DEFAULT_CONFIG = {
  esp32Ip: '192.168.4.1',    // ESP32 IP address
  pollInterval: 2000,         // Update frequency (ms)
  timeout: 5000,              // Connection timeout (ms)
  autoStart: true,            // Auto-connect on app start
};
```

### Django Backend Configuration

**Edit `backend/config/settings.py`:**

```python
# Database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# CORS settings
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://192.168.4.1",
]

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
    ],
}
```

### Environment Variables

Create a `.env` file in the project root:

```bash
# Django settings
DJANGO_SECRET_KEY=your-secret-key-here
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost,192.168.4.1

# ESP32 settings
ESP32_IP=192.168.4.1
ESP32_POLL_INTERVAL=2000

# API settings
API_PORT=8000
API_HOST=0.0.0.0
```

---

## 📡 API Documentation

### ESP32 HTTP API Endpoints

#### 1. GET `/sensors`
Returns real-time calibrated sensor data.

**Request:**
```bash
curl http://192.168.4.1/sensors
```

**Response:**
```json
{
  "timestamp": 1682500000,
  "sensors": {
    "temperatureC": 25.3,
    "humidityPct": 65.2,
    "soilMoisturePct": 45.8,
    "batteryPct": 92.5,
    "ph": 6.8,
    "gps": {
      "latitude": 40.7128,
      "longitude": -74.0060
    },
    "camera": "active"
  },
  "raw": {
    "adc32": 1500,
    "adc33": 2000,
    "adc34": 1800,
    "adc35": 1200,
    "adc39": 3000
  },
  "status": "ok"
}
```

#### 2. GET `/health`
Device health and status information.

**Request:**
```bash
curl http://192.168.4.1/health
```

**Response:**
```json
{
  "device": "AGRIBOT-ESP",
  "version": "1.0.0",
  "uptime": 3600,
  "memory": {
    "free": 150000,
    "total": 400000
  },
  "wifi": {
    "ssid": "AGRIBOT-ESP",
    "clients": 1
  },
  "status": "healthy"
}
```

#### 3. GET `/pins`
Raw ADC readings and diagnostics.

**Request:**
```bash
curl http://192.168.4.1/pins
```

**Response:**
```json
{
  "adc": {
    "pin32": 1500,
    "pin33": 2000,
    "pin34": 1800,
    "pin35": 1200,
    "pin39": 3000
  },
  "gpio": {
    "led": "low",
    "relay": "off"
  },
  "diagnostics": "all_ok"
}
```

#### 4. GET `/`
API documentation and available routes.

**Request:**
```bash
curl http://192.168.4.1/
```

---

## 📱 Mobile App Features

### Tab Navigation

#### 1. **Home Tab** (`index.tsx`)
- Dashboard overview
- Quick status indicators
- Recent sensor readings
- Device status summary

#### 2. **Sensors Tab** (`sensors.tsx`) ⭐
- Real-time sensor display
- Temperature, humidity, soil moisture
- pH and battery level
- Live GPS coordinates
- Camera status
- Graphical representations
- Historical data (if backend enabled)

#### 3. **Network Tab** (`network.tsx`) ⭐
- WiFi connection status
- Available networks list
- ESP32 connection verification
- WiFi signal strength
- Connection diagnostics
- Manual network refresh

#### 4. **Remote Tab** (`remote.tsx`)
- Remote control interface
- Device commands
- Actuator controls
- Command history

#### 5. **Intelligence Tab** (`intelligence.tsx`)
- AI/ML features
- Data analysis
- Predictive insights
- Alerts and notifications

#### 6. **Explore Tab** (`explore.tsx`)
- Feature discovery
- Tutorials
- Help documentation
- Getting started guides

### Authentication

- **Biometric Login** - Fingerprint or face recognition
- **Password Authentication** - Secure login
- **Session Management** - Token-based auth
- **Auto-logout** - Security timeout

### Database Features

- **Offline Support** - SQLite for offline data storage
- **Data Sync** - Sync with backend when available
- **Local Caching** - Fast data retrieval
- **Backup** - Automatic data backup

### UI/UX Features

- **Dark/Light Mode** - Theme switching
- **Responsive Design** - Works on phones, tablets, web
- **Haptic Feedback** - Tactile user feedback
- **Loading States** - Progress indicators
- **Error Handling** - User-friendly error messages

---

## 🌐 Backend Setup

### Initial Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install django djangorestframework django-cors-headers python-dotenv

# Run migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Start development server
python manage.py runserver
```

### API Endpoints

```
POST   /api/auth/login/         # User login
POST   /api/auth/logout/        # User logout
GET    /api/sensors/            # List sensor data
POST   /api/sensors/            # Record new sensor reading
GET    /api/devices/            # List connected devices
POST   /api/devices/            # Register new device
GET    /api/alerts/             # List alerts
POST   /api/commands/           # Send device command
```

### Django Admin

Access admin interface:

```
http://localhost:8000/admin/
```

Login with superuser credentials created above.

---

## 🐛 Troubleshooting

### ESP32 Issues

#### Problem: "Port not found" when uploading
**Solution:**
1. Check USB connection
2. Install CP210x drivers: https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers
3. Update `platformio.ini` with correct port:
   ```ini
   upload_port = COM3  # Change to your port
   monitor_port = COM3
   ```
4. Restart VS Code

#### Problem: "HTTP request timeout" on mobile app
**Solution:**
1. Verify phone is connected to `AGRIBOT-ESP` WiFi
2. Check ESP32 serial monitor for errors
3. Ensure ESP32 IP is `192.168.4.1`
4. Try restarting ESP32 (power cycle)
5. Check firewall settings

#### Problem: Sensor readings are all zeros
**Solution:**
1. Verify sensor connections to ADC pins
2. Check `main.cpp` for correct pin definitions
3. Review sensor calibration values
4. Use `/pins` endpoint to check raw ADC values

### Mobile App Issues

#### Problem: "npm install fails"
**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

#### Problem: "app won't start" or "Metro bundler error"
**Solution:**
```bash
# Clear Expo cache
expo start --clear

# Or manually:
cd mobile
rm -rf node_modules .expo
npm install
npm start
```

#### Problem: "Biometric not working"
**Solution:**
1. Ensure device has biometric hardware
2. Enroll fingerprint/face on device
3. Check app permissions in device settings
4. Try password login instead

### Connection Issues

#### Problem: "Connected but no sensor data"
**Solution:**
1. Check CORS settings on backend
2. Verify API endpoints are correct
3. Check browser console for errors
4. Ensure ESP32 is serving data

#### Problem: "Network tab shows disconnected"
**Solution:**
1. Verify WiFi connection (check Settings)
2. Restart mobile app
3. Restart ESP32
4. Check if ESP32 HTTP server is running
5. Try manual connection with IP: `192.168.4.1`

### Database Issues

#### Problem: "Database connection error"
**Solution:**
```bash
# Reset database
python manage.py flush

# Recreate migrations
python manage.py migrate
```

---

## 🔐 Security Considerations

### For Production Deployment

1. **Change default credentials**
   - WiFi password
   - Django secret key
   - Admin credentials

2. **Enable HTTPS**
   - Use SSL certificates
   - Update CORS settings
   - Use secure WebSocket connections

3. **API Security**
   - Implement rate limiting
   - Add API key authentication
   - Use HTTPS only
   - Validate all inputs

4. **Device Security**
   - Secure OTA (Over-The-Air) updates
   - Firmware signing
   - Encrypted configuration

5. **Mobile App**
   - Use secure storage for credentials
   - Implement certificate pinning
   - Enable biometric authentication
   - Regular security audits

---

## 📊 Performance Optimization

### Mobile App
- Lazy loading of components
- Memoization of expensive computations
- Efficient re-renders with React hooks
- Image optimization
- Code splitting with Expo Router

### ESP32 Firmware
- Efficient sensor polling
- JSON response compression
- Memory optimization
- ADC averaging for stable readings
- Connection pooling

### Backend
- Database indexing
- API response caching
- Pagination for large datasets
- Async task processing
- CDN for static files

---

## 📝 Development Workflow

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/new-feature

# Make changes and commit
git add .
git commit -m "Add new feature"

# Push to remote
git push origin feature/new-feature

# Create pull request on GitHub
```

### Testing

```bash
# ESP32 - Using PlatformIO
platformio test

# Mobile App - Using Jest/Expo
npm test

# Backend - Using Django test runner
python manage.py test
```

### Code Quality

```bash
# Mobile App - ESLint
npm run lint

# Python - Black & Flake8
black backend/
flake8 backend/
```

---

## 📚 Additional Resources

### Documentation
- [Expo Documentation](https://docs.expo.dev/)
- [React Native Docs](https://reactnative.dev/)
- [Django Documentation](https://docs.djangoproject.com/)
- [PlatformIO Docs](https://docs.platformio.org/)
- [ESP32 Arduino Reference](https://arduino-esp32.readthedocs.io/)

### Tutorials & Guides
- [QUICK_SETUP.md](./QUICK_SETUP.md) - 5-minute quick start
- [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) - Detailed integration
- [esp32-firmware/README.md](./esp32-firmware/README.md) - Firmware guide
- [mobile/README.md](./mobile/README.md) - App guide
- [backend/README.md](./backend/README.md) - Backend guide

### Community & Support
- GitHub Issues - Report bugs and request features
- Discussions - Q&A and community support
- Stack Overflow - Tag: `agribot`, `esp32`, `react-native`

---

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
   ```bash
   git clone https://github.com/yourusername/AGRIBOT-Remote.git
   cd AGRIBOT-Remote
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```

3. **Make your changes**
   - Follow code style guidelines
   - Write meaningful commit messages
   - Add comments for complex logic

4. **Test your changes**
   ```bash
   # Run tests
   npm test
   pytest backend/
   ```

5. **Submit a Pull Request**
   - Describe changes clearly
   - Reference any related issues
   - Include screenshots if UI changes

### Code Style
- **JavaScript/TypeScript**: ESLint + Prettier
- **Python**: Black + Flake8
- **C++**: Clang-format

---

## 📄 License

This project is licensed under the **MIT License** - see the LICENSE file for details.

---

## 🙋 Support

Need help? Try these resources:

1. **Check Troubleshooting Section** - Common issues and solutions
2. **Read Documentation** - Detailed guides and API docs
3. **Search GitHub Issues** - Find existing solutions
4. **Ask Community** - Post in Discussions
5. **Contact Maintainers** - Email or GitHub discussions

---

## 🎯 Roadmap

### Upcoming Features
- [ ] Cloud synchronization
- [ ] Machine learning predictions
- [ ] Advanced analytics dashboard
- [ ] Multi-device management
- [ ] OTA firmware updates
- [ ] Hardware abstraction layer
- [ ] Plugin architecture
- [ ] REST API v2

### In Progress
- [ ] Improved sensor calibration
- [ ] Enhanced error handling
- [ ] Performance optimizations
- [ ] Mobile app refinements

### Recently Completed
- ✅ WiFi direct connection
- ✅ Real-time sensor display
- ✅ Biometric authentication
- ✅ Cross-platform support (iOS, Android, Web)
- ✅ SQLite offline storage
- ✅ HTTP REST API

---

## 👨‍💻 Authors & Acknowledgments

**Core Contributors:**
- AGRIBOT Development Team

**Special Thanks To:**
- Expo team for amazing React Native tooling
- Arduino community for ESP32 support
- Django REST Framework developers
- All contributors and testers

---

## 📊 Project Statistics

- **Languages**: TypeScript, Python, C++
- **Lines of Code**: ~5,000+
- **Dependencies**: 50+ (carefully curated)
- **Platforms Supported**: iOS, Android, Web
- **API Endpoints**: 4+ main endpoints
- **Database**: SQLite + Django ORM
- **Test Coverage**: Growing

---

**Last Updated**: April 2026  
**Version**: 1.0.0  
**Status**: Production Ready ✅

---

## 📞 Get In Touch

- 🐛 **Bug Reports**: GitHub Issues
- 💡 **Feature Requests**: GitHub Discussions
- 📧 **Email**: support@agribot.dev
- 💬 **Chat**: GitHub Discussions

---

**Happy farming with AGRIBOT-Remote! 🚜🤖**
