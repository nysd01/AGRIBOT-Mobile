# AGRIBOT System - Quick Setup Guide

Complete integration of ESP32 sensor device with React Native mobile application.

## 📋 What's Included

✅ **ESP32 Firmware** - WiFi AP + HTTP API for sensor data  
✅ **Mobile App** - React Native with real-time sensor display  
✅ **WiFi Integration** - Phone connects to ESP32 directly  
✅ **Live Updates** - 2-second polling from APP  
✅ **Full Documentation** - Integration guides, API reference, troubleshooting  

## ⚡ 5-Minute Quick Start

### Step 1: Upload ESP32 Firmware (2 min)

```bash
cd esp32-firmware

# VS Code → PlatformIO icon → Upload
# OR from terminal:
platformio run -t upload
```

**Look for in serial monitor:**
```
[WiFi AP] SSID: AGRIBOT-ESP
[WiFi AP] Password: agribot123
[WiFi AP] IP: 192.168.4.1
[HTTP] API server started on port 80
```

### Step 2: Connect Phone to WiFi (1 min)

1. Phone Settings → WiFi
2. Find "AGRIBOT-ESP"
3. Connect with password: `agribot123`

### Step 3: Start Mobile App (2 min)

```bash
cd mobile
npm install  # Skip if already done
npm start
```

Then:
- **Android**: `a` (emulator) or scan QR
- **iOS**: `i` (simulator) or scan QR

### Step 4: Verify Connection

1. Open app → **NETWORK** tab
2. Tap "Check ESP32 Connection"
3. Should show ✅ Connected
4. Go to **SENSORS** tab
5. See live sensor values

## 📁 Project Layout

```
AGRIBOT-Remote/
├── esp32-firmware/        ← Upload to ESP32
│   ├── src/main.cpp       ← HTTP API & sensor reading
│   ├── platformio.ini     ← Build config & libraries
│   └── README.md          ← Firmware documentation
│
├── mobile/                ← React Native app
│   ├── app/(tabs)/
│   │   ├── network.tsx    ← WiFi setup screen
│   │   ├── sensors.tsx    ← Sensor data display
│   │   └── _layout.tsx    ← Tab configuration
│   ├── hooks/
│   │   ├── use-esp32-sensors.ts      ← Fetch sensor data
│   │   └── use-network-connection.ts ← WiFi management
│   ├── package.json       ← Dependencies
│   └── README.md          ← App documentation
│
├── INTEGRATION_GUIDE.md   ← Full integration documentation
└── QUICK_SETUP.md         ← This file
```

## 🔧 Configuration

### WiFi Settings

**ESP32 (esp32-firmware/src/main.cpp):**
```cpp
#define WIFI_SSID "AGRIBOT-ESP"
#define WIFI_PASSWORD "agribot123"
```

**Mobile App (mobile/hooks/use-esp32-sensors.ts):**
```typescript
const { sensorData } = useESP32Sensors({
  esp32Ip: '192.168.4.1',    // Default AP IP
  pollInterval: 2000,         // Update interval
  autoStart: true,
});
```

### Sensor Pins (ESP32)

All configurable in `esp32-firmware/src/main.cpp`:
```cpp
GPIO 32 - Temperature
GPIO 33 - Humidity
GPIO 34 - Soil Moisture
GPIO 35 - pH
GPIO 39 - Battery
```

## 🧪 Testing

### Test ESP32 API

```bash
# While connected to AGRIBOT-ESP WiFi:
curl http://192.168.4.1/sensors
curl http://192.168.4.1/health
curl http://192.168.4.1/pins
```

### Postman/Insomnia

Base URL: `http://192.168.4.1`

Endpoints:
- `GET /sensors` - Sensor data
- `GET /health` - Device health
- `GET /pins` - Raw ADC values
- `GET /` - API docs

### Mobile App Testing

1. **Check WiFi Connection**
   - NETWORK tab → "Check ESP32 Connection"

2. **Verify Sensor Data**
   - SENSORS tab → should see live values
   - Check rates: 2-second updates

3. **Monitor Logs**
   - Metro bundler shows app logs
   - Serial monitor shows ESP32 logs

## 🚨 Troubleshooting Quick Reference

| Issue | Solution |
|-------|----------|
| ESP32 won't upload | Check port in platformio.ini, try different USB cable |
| WiFi network not visible | Power cycle ESP32, check serial for errors |
| App can't find ESP32 | Verify WiFi connected to AGRIBOT-ESP, ping 192.168.4.1 |
| Sensors show "Waiting..." | Wait 2-3 sec for first poll, check WiFi signal |
| Wrong sensor values | Check wiring, use `/pins` to debug ADC values |
| HTTP timeout | Firewall blocking port 80, try different WiFi |

See **esp32-firmware/README.md** and **mobile/README.md** for detailed troubleshooting.

## 📊 API Response Example

```bash
curl http://192.168.4.1/sensors | jq
```

```json
{
  "temperatureC": 24.5,
  "humidityPct": 62.3,
  "soilMoisturePct": 45.2,
  "batteryPct": 85.0,
  "ph": 6.8,
  "gps": {
    "lat": 5.6037,
    "lng": -0.1870
  },
  "camera": {
    "streaming": true
  },
  "raw": {
    "temperatureAdc": 1500,
    "humidityAdc": 2100,
    "soilAdc": 1800,
    "phAdc": 2500,
    "batteryAdc": 2800
  },
  "voltage": {
    "temperatureV": 1.22,
    "humidityV": 1.71,
    "soilV": 1.47,
    "phV": 2.04,
    "batteryPinV": 2.29,
    "batteryPackV": 4.58
  }
}
```

## 📱 Mobile App Tabs

| Tab | Purpose |
|-----|---------|
| **MISSION** | Dashboard overview |
| **REMOTE** | Control & commands |
| **INTELLIGENCE** | Analytics & insights |
| **SENSORS** | 📊 Real-time sensor data from ESP32 |
| **NETWORK** | 🌐 WiFi setup & diagnostics |

## 🔌 Hardware Wiring

### ESP32 Pin Layout (ADC1)
```
ESP32-WROOM-32
┌─────────────────┐
│ GPIO32 (ADC)─◄───── Temperature Sensor
│ GPIO33 (ADC)─◄───── Humidity Sensor
│ GPIO34 (ADC)─◄───── Soil Moisture Sensor
│ GPIO35 (ADC)─◄───── pH Sensor
│ GPIO39 (ADC)─◄───── Battery Voltage
│ GND───────────┬───── Common Ground
│ 3V3───────────┼───── Sensor Power
│ USB────────────────  Programming/Power
└─────────────────┘
```

**⚠️ Important**: Connect sensors to 3.3V, not 5V!

## 🔄 Data Flow

```
┌──────────────┐
│ESP32 Sensors │ (5 analog inputs)
└──────┬───────┘
       │ ADC reads
       ▼
┌──────────────┐
│ Calibration& │ (Convert to real units)
│Sensor Math   │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│   JSON Response  │ (HTTP /sensors)
└──────┬───────────┘
       │ 192.168.4.1:80
       ▼ WiFi
┌──────────────────┐
│  Mobile Device   │ (Connected to AGRIBOT-ESP)
│  fetch() every   │ (2 seconds)
│  2 seconds       │
└──────┬───────────┘
       │ Update State
       ▼
┌──────────────────┐
│ Display Values   │ (Sensors Tab)
└──────────────────┘
```

## 💡 Tips & Best Practices

1. **Power Management**
   - Ensure stable 3.3V supply for sensors
   - Use quality USB cable for ESP32
   - WiFi uses ~80mA (consider power budget)

2. **Sensor Accuracy**
   - Calibrate each sensor before deployment
   - Test raw ADC values using `/pins` endpoint
   - Adjust formulas in main.cpp for your specific sensors

3. **WiFi Performance**
   - Keep phone < 5 meters from ESP32 for best signal
   - Avoid obstacles between phone and ESP32
   - 2-second polling is average balance (can adjust)

4. **Debugging**
   - Monitor serial output while testing
   - Use `/pins` endpoint to diagnose ADC issues
   - Check HTTP logs in mobile app console

5. **Production Deployment**
   - Update calibration constants for accuracy
   - Consider authentication for HTTP API
   - Implement data logging to storage
   - Set HTTPS/TLS for security

## 📚 Documentation Files

- **INTEGRATION_GUIDE.md** - Complete architecture & integration details
- **esp32-firmware/README.md** - Firmware compilation & setup
- **mobile/README.md** - Mobile app development & customization
- **QUICK_SETUP.md** - This file (quick reference)

## 🎯 Next Steps

1. ✅ Upload ESP32 firmware
2. ✅ Connect phone to WiFi
3. ✅ Run mobile app
4. ✅ Verify sensors display data
5. 🔧 **Then calibrate** sensors for accuracy
6. 📦 **Add more sensors** as needed
7. 🚀 **Deploy to production**

## 🆘 Get Help

If stuck:
1. Check serial monitor (ESP32 status)
2. Check network connection (phone on AGRIBOT-ESP)
3. Test API directly: `curl http://192.168.4.1/sensors`
4. Review detailed docs in specific README files
5. Check troubleshooting sections

## 📞 Support Resources

- **ESP32**: https://docs.espressif.com/
- **Arduino ESP32**: https://github.com/espressif/arduino-esp32
- **React Native**: https://reactnative.dev/
- **Expo**: https://docs.expo.dev/
- **PlatformIO**: https://docs.platformio.org/

---

**System Status**: ✅ **READY FOR TESTING**

**Version**: 1.0.0  
**Last Updated**: April 16, 2026

---

## Quick Commands Reference

```bash
# ESP32 Firmware
cd esp32-firmware
platformio run -t upload              # Upload to ESP32
platformio device monitor             # View serial output
curl http://192.168.4.1/sensors       # Test API

# Mobile App
cd mobile
npm install                           # Install dependencies
npm start                             # Start dev server
npm run android                       # Run on Android
npm run ios                           # Run on iOS
npm run web                           # Run in browser
npm run lint                          # Check code quality
```

**Happy Coding! 🚀**
