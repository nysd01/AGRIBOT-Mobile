# AGRIBOT Mobile App

React Native (Expo) mobile application for AGRIBOT ESP32 sensor monitoring and remote control.

## Features

✅ Real-time sensor data from ESP32  
✅ WiFi connectivity management  
✅ Live sensor value display  
✅ Battery and connection status  
✅ GPS location tracking  
✅ Camera streaming status  
✅ Responsive tab-based interface  

## Getting Started

### Prerequisites

- Node.js 16+ and npm/yarn
- Expo CLI: `npm install -g expo-cli`
- Android Studio or Xcode (for native builds)
- Your phone (or emulator)

### Installation

```bash
cd mobile

# Install dependencies
npm install
```

### Start Development Server

```bash
npm start
```

You'll see output like:
```
┌─────────────────────────────────────┐
│  ✔ Expo is running on: 192.168.1.X │
│  Android app: Scan QR code          │
│  iOS app: Scan QR code              │
│  Web: Open in browser               │
└─────────────────────────────────────┘
```

### Run on Device/Emulator

```bash
# Android emulator
npm run android

# iOS simulator
npm run ios

# Web browser
npm run web
```

Or scan the QR code from the output above using:
- **Android**: Expo Go app (from Google Play)
- **iOS**: Expo Go app (from App Store)

## Project Structure

```
mobile/
├── app/
│   ├── (tabs)/              # Tab navigator screens
│   │   ├── _layout.tsx      # Tab configuration
│   │   ├── index.tsx        # Mission tab
│   │   ├── remote.tsx       # Remote control tab
│   │   ├── intelligence.tsx # Intelligence tab
│   │   ├── sensors.tsx      # Sensors tab (displays ESP32 data)
│   │   └── network.tsx      # Network/WiFi setup tab
│   ├── _layout.tsx          # Root navigation layout
│   └── modal.tsx            # Modal screens
├── hooks/
│   ├── use-color-scheme.ts
│   ├── use-esp32-sensors.ts    # NEW: Fetch sensor data from ESP32
│   ├── use-network-connection.ts # NEW: WiFi management hooks
│   └── use-theme-color.ts
├── components/              # Reusable UI components
├── constants/               # App constants & theme
├── styles/                  # Component styles
└── package.json             # Dependencies
```

## ESP32 Integration

### Connecting to ESP32

1. **Ensure ESP32 is Running**
   - Power on the ESP32 device
   - It should create WiFi AP: `AGRIBOT-ESP`

2. **Connect Phone to WiFi**
   - Go to phone WiFi settings
   - Find "AGRIBOT-ESP" network
   - Password: `agribot123`
   - Connect

3. **Verify in App**
   - Open AGRIBOT app
   - Go to **NETWORK** tab
   - Tap "Check ESP32 Connection"
   - Status should show ✅ Connected

4. **View Sensor Data**
   - Go to **SENSORS** tab
   - Live data should appear with 2-second updates
   - Each sensor shows icon, status, and current value

### Sensor Hook Usage

```typescript
import { useESP32Sensors } from '@/hooks/use-esp32-sensors';

export default function MyComponent() {
  const { sensorData, loading, error, isConnected } = useESP32Sensors({
    esp32Ip: '192.168.4.1',      // ESP32 IP address
    pollInterval: 2000,           // Update every 2 seconds
    autoStart: true,              // Start polling on mount
  });

  if (loading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error}</Text>;
  
  return (
    <Text>
      Temperature: {sensorData?.temperatureC}°C
      Humidity: {sensorData?.humidityPct}%
    </Text>
  );
}
```

### Network Connection Hook Usage

```typescript
import { useNetworkInfo, useESP32Connection } from '@/hooks/use-network-connection';

export default function NetworkScreen() {
  const { networkInfo } = useNetworkInfo();
  const { isConnectedToESP, espIP, checkConnection } = useESP32Connection();

  return (
    <View>
      <Text>Connected WiFi: {networkInfo?.ssid}</Text>
      <Text>Phone IP: {networkInfo?.ip}</Text>
      <Text>ESP32: {isConnectedToESP ? '✅ Connected' : '❌ Offline'}</Text>
      <Button title="Check ESP32" onPress={checkConnection} />
    </View>
  );
}
```

## Tabs

### 📋 MISSION
Dashboard view with mission overview and status

### 🎮 REMOTE
Remote control interface for device commands

### 🧠 INTELLIGENCE
AI/ML insights and analytics

### 📊 SENSORS
**Real-time sensor data display from ESP32**
- Temperature gauge
- Humidity percentage
- Soil moisture level
- pH reading
- Battery status
- GPS coordinates
- Camera streaming indicator
- Connection status

Polling interval: 2 seconds (customizable)

### 🌐 NETWORK
**WiFi setup and diagnostics**
- Current WiFi connection status
- Check ESP32 connectivity
- Connection instructions
- Debug information
- Manual connection check button

## Customization

### Change ESP32 IP Address

**If using different WiFi network:**

Edit `hooks/use-esp32-sensors.ts`:
```typescript
const { sensorData } = useESP32Sensors({
  esp32Ip: '192.168.X.X',  // Your ESP32 local IP
  pollInterval: 2000,
  autoStart: true,
});
```

### Adjust Polling Interval

```typescript
// Update every 1 second instead of 2
autoStart: true,
pollInterval: 1000,  // milliseconds
```

### Add Custom Sensors

1. Update `SensorData` interface in `hooks/use-esp32-sensors.ts`
2. Add new sensor field to response
3. Create new component in `app/(tabs)/sensors.tsx`
4. Add card to sensors grid

### Customize Theme

Edit `constants/theme.ts`:
```typescript
const primaryColor = '#4A9AFF';  // Button/accent color
const successColor = '#58C95F';  // Success state
const errorColor = '#FF4533';    // Error state
const backgroundColor = '#0a0e1a'; // App background
```

### Change Tab Icons

Edit `app/(tabs)/_layout.tsx`:
```typescript
<Tabs.Screen
  name="sensors"
  options={{
    title: 'SENSORS',
    tabBarIcon: ({ color, size }) => (
      <MaterialCommunityIcons name="gauge" color={color} size={size} />
    ),
  }}
/>
```

## Dependencies

### Core
- **expo**: React Native framework (~54.0.33)
- **react-native**: Mobile framework (0.81.5)
- **typescript**: Type safety (~5.9.2)

### Navigation & UI
- **@react-navigation/bottom-tabs**: Tab navigation
- **expo-router**: File-based routing (~6.0.23)
- **@expo/vector-icons**: Material Design icons

### Device Features
- **expo-network**: WiFi info access
- **expo-sensors**: Sensor data (accelerometer, etc.)
- **expo-haptics**: Haptic feedback
- **expo-status-bar**: Status bar control

### Development
- **eslint**: Code quality
- **react-native-reanimated**: Animations
- **react-native-gesture-handler**: Gestures

## Building for Production

### Android

```bash
# Generate APK
eas build --platform android --profile preview

# Generate AAB for Play Store
eas build --platform android --profile production
```

### iOS

```bash
# Generate IPA for TestFlight
eas build --platform ios --profile preview

# Generate IPA for App Store
eas build --platform ios --profile production
```

Requirements:
- Apple Developer Account
- EAS CLI: `npm install -g eas-cli`

## Debugging

### Enable Debug Logging

Check console output:
```bash
npm start
# Then press 'j' for logs
```

### Monitor Network Requests

```bash
# Use React Native Debugger
npm install -g react-native-debugger

# Open HTTP monitoring
# See all network requests to ESP32
```

### Test ESP32 API

```bash
# While connected to AGRIBOT-ESP WiFi
curl http://192.168.4.1/sensors | jq

# Or use Postman/Insomnia with:
# Base URL: http://192.168.4.1
# Endpoints: /sensors, /health, /pins
```

## Troubleshooting

### App Won't Connect to ESP32

1. **Check WiFi Connection**
   - Go to NETWORK tab
   - Verify you're on "AGRIBOT-ESP" network
   - Tap "Check ESP32 Connection"

2. **Verify ESP32 is Running**
   - Check serial monitor output
   - Should see "AP started" message
   - Power cycle if needed

3. **Check Network Permissions**
   - Android: Go to Settings → Permissions → Location (required for WiFi)
   - iOS: Go to Settings → WiFi → AGRIBOT-ESP

4. **Firewall Issues**
   - Try on different WiFi (mobile hotspot)
   - Disable device firewall temporarily

### Sensors Show "Waiting..."

1. Wait 2-3 seconds for first poll
2. Check WiFi signal strength
3. Verify ESP32 sensors are wired correctly
4. Use `/pins` endpoint to check raw ADC values

### App Crashes on Startup

1. Clear app cache (Settings → Apps → AGRIBOT → Clear Cache)
2. Reinstall app
3. Check device storage (need ~100MB free)
4. Update Expo: `expo upgrade`

### Network Tab Shows "ESP32 Not Found"

1. Verify phone connected to AGRIBOT-ESP WiFi
2. Ping ESP32: `ping 192.168.4.1`
3. Check that port 80 is open on ESP32
4. Try different USB cable for ESP32 power
5. Check ESP32 serial output for errors

## Scripts

```bash
npm start          # Start development server
npm run android   # Run on Android emulator
npm run ios       # Run on iOS simulator
npm run web       # Run in web browser
npm run lint      # Run ESLint
npm run reset-project  # Reset to blank project
```

## Performance Tips

- Polling interval: 2 seconds is good balance
- Decrease interval for faster updates (higher battery drain)
- Increase interval for slower updates (better battery life)
- Sensor data is cached locally during polls
- Tab screens unmount when not visible (saves memory)

## API Integration

Mobile app communicates with ESP32 via:
- **URL**: `http://192.168.4.1/sensors`
- **Method**: GET
- **Response Format**: JSON
- **Update Frequency**: 2 seconds (configurable)
- **Timeout**: 5 seconds per request

See `INTEGRATION_GUIDE.md` for detailed API reference.

## Support

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Docs](https://reactnative.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Material Community Icons](https://materialdesignicons.com/)

---

**Version**: 1.0.0  
**Status**: ✅ Production Ready  
**Last Updated**: April 16, 2026
