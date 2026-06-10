# ESP32 ↔ MEGA 2560 Connection Test Guide

## Overview
This guide helps you test the serial communication between the ESP32 and Arduino Mega 2560 in the AGRIBOT system.

---

## Hardware Wiring Checklist

### Critical Connections
```
ESP32 (GPIO23)    → Mega RX2 (pin 16)     [ESP32 sends commands]
ESP32 (GPIO25)    ← Mega TX2 (pin 17)     [Mega sends responses]
ESP32 GND         ↔ Mega GND               [COMMON GROUND - ESSENTIAL]
```

### Verification Steps
- [ ] Verify all three wires are soldered/connected securely
- [ ] Check for loose connections with a gentle tug
- [ ] Ensure no cold solder joints or corrosion
- [ ] Confirm common ground is connected (most common issue!)

---

## Test Setup

### Option 1: Quick Test (Recommended for First-Time)

#### Step 1: Prepare Mega
1. Connect Mega to your computer via USB
2. Open Arduino IDE
3. Select **Tools → Board → Arduino Mega 2560**
4. Open file: `Mega_motor_control/Mega_diagnostic_test.ino`
5. Click **Upload** (Ctrl+U)
6. Open **Tools → Serial Monitor** (Ctrl+Shift+M)
7. Set baud rate to **115200** in bottom right
8. You should see initialization messages from Mega

#### Step 2: Prepare ESP32
1. Open PlatformIO
2. Navigate to `esp32-firmware/src/test_mega_connection.cpp`
3. In `platformio.ini`, find the `[env:esp32]` section
4. Make sure it's selected as the active environment
5. Click **PlatformIO: Upload** (or run `pio run -e esp32 -t upload`)
6. Open the Serial Monitor for ESP32 (set to **115200 baud**)

#### Step 3: Run Test
- Both devices should start automatically
- Watch for commands sent from ESP32 → received by Mega
- Watch for ACK responses from Mega → received by ESP32
- Test runs for ~40 seconds with detailed reporting

---

## Test Phases

### Phase 1: Basic Motor Commands (0-10s)
Tests simple motor control:
- **F100** → Forward at speed 100
- **S** → Stop
- **B100** → Backward at speed 100
- **S** → Stop

**Expected on Mega Monitor:**
```
[CMD 1] FORWARD speed=100
[MOTOR] L=100, R=100
  → Sending ACK: ACK:F
```

### Phase 2: Steering Commands (10-20s)
Tests pivot/turning:
- **L50** → Pivot left at speed 50
- **S** → Stop
- **R50** → Pivot right at speed 50
- **S** → Stop

**Expected on Mega Monitor:**
```
[CMD 2] TURN LEFT speed=50
[MOTOR] L=-25, R=50
  → Sending ACK: ACK:L
```

### Phase 3: Differential Drive (20-30s)
Tests smooth proportional steering:
- **M150,-100** → Curved forward (left faster than right)
- **S** → Stop
- **M-150,100** → Curved backward

**Expected on Mega Monitor:**
```
[CMD 3] DIFFERENTIAL LEFT=150 RIGHT=-100
[MOTOR] L=150, R=-100
  → Sending ACK: ACK:M
```

### Phase 4: Camera Gimbal (30-40s)
Tests gimbal commands:
- **CU** → Camera up
- **CS** → Camera stop
- **CL** → Camera left
- **CS** → Camera stop

**Expected on Mega Monitor:**
```
[CMD 4] CAMERA command: CU
  → Sending ACK: ACK:C
```

---

## Expected Output

### ESP32 Serial Monitor Output (should see):
```
╔════════════════════════════════════════════════════════════════╗
║         ESP32 ↔ MEGA 2560 CONNECTION TEST                     ║
╠════════════════════════════════════════════════════════════════╣
│  RX pin: 25 (GPIO25), TX pin: 23 (GPIO23)
│  Baud Rate: 115200
[INIT] Mega Serial initialized...
[INIT] Waiting 2 seconds for Mega to be ready...

═══════════════════════════════════════════════════════════════════
PHASE 1: Motor Commands Test
═══════════════════════════════════════════════════════════════════

[TEST 1] → SENT: F100
[TEST 1] ← RECEIVED ACK: ACK:F
[TEST 2] → SENT: S
[TEST 2] ← RECEIVED ACK: ACK:S
...

╔════════════════════════════════════════════════════════════════╗
║                    TEST RESULTS                               ║
╠════════════════════════════════════════════════════════════════╣
│  Commands Sent:  16
│  ACKs Received:  16
│  Success Rate:   100%
│  ✓ CONNECTION SUCCESSFUL - All commands ACK'd!
╚════════════════════════════════════════════════════════════════╝
```

### Mega Serial Monitor Output (should see):
```
[INIT] Mega ready. Waiting for commands on Serial2...

[CMD 1] FORWARD speed=100
[MOTOR] L=100, R=100
  → Sending ACK: ACK:F

[CMD 2] STOP
[MOTOR] STOPPED
  → Sending ACK: ACK:S

┌─ STATUS UPDATE ──────────────────────────┐
│ Uptime: 5 seconds
│ Commands Received: 2
│ Motor Actions: 3
│ Last Command: 2341 ms ago
└──────────────────────────────────────────┘
```

---

## Troubleshooting

### Problem: ESP32 shows "CONNECTION FAILED - No ACKs received!"

**Likely Causes (in order of probability):**

1. **Missing Common Ground**
   - This is the #1 cause!
   - Verify ESP32 GND is wired to Mega GND
   - Try adding a second GND wire for redundancy

2. **Wired to Wrong Pins**
   - ESP32 TX should go to Mega **RX2 (pin 16)**
   - ESP32 RX should be from Mega **TX2 (pin 17)**
   - NOT to Serial/RX0/TX0 pins (these are USB only)

3. **Mega Firmware Not Uploaded**
   - Did you upload `Mega_diagnostic_test.ino` to Mega?
   - Check for compile errors in Arduino IDE
   - Verify board selection: Arduino Mega 2560

4. **Baud Rate Mismatch**
   - Both must use 115200
   - Check `Serial2.begin(115200)` in Mega code
   - Check `Mega_Serial.begin(115200...)` in ESP32 code

5. **Wrong Serial Port Selected**
   - ESP32 should use `Serial2` (UART1)
   - Mega should use `Serial2` (not Serial/Serial1)
   - Check pin definitions match wiring

---

### Problem: Partial ACKs (Some commands missing responses)

**Likely Causes:**

1. **Loose Wiring**
   - Re-solder or tighten all connections
   - Try wiggling wires to find intermittent connection
   - Listen for clicking sounds when wiggling

2. **Baud Rate Drift**
   - Add `delay(50)` in loop to prevent buffer overflow
   - Check for voltage issues (use multimeter to verify)

3. **USB Power Noise**
   - Try powering Mega from separate power supply
   - USB power from different computer/port

4. **Defective UART Pins**
   - Try different pin combinations if available
   - Test with logic analyzer to see signal quality

---

### Problem: Mega shows commands but ESP32 doesn't see ACK

**Likely Causes:**

1. **One-way Communication**
   - Check Mega TX2 → ESP32 RX wiring
   - Verify no broken wire

2. **Mega Not Sending ACK**
   - Check Mega code has `Serial2.println(ack);`
   - Look for compile errors preventing ACK code from running

3. **ESP32 Loop Not Reading Serial**
   - Check `while (Mega_Serial.available())` loop exists
   - Verify buffer size isn't full

---

## Advanced Debugging

### Using Logic Analyzer (if available)
1. Connect logic analyzer to ESP32 TX (pin 23)
2. Capture transmission at 115200 baud
3. Decode UART to see exact bytes sent
4. Compare timing on Mega RX2 side

### Manual Serial Test
Upload this to Mega to echo back everything it receives:
```cpp
void setup() {
  Serial.begin(115200);
  Serial2.begin(115200);
  Serial.println("Echo mode - anything received on Serial2 will be echoed back");
}

void loop() {
  if (Serial2.available()) {
    char c = Serial2.read();
    Serial.write(c);  // Show on USB
    Serial2.write(c); // Echo back
  }
}
```

Then send test data from ESP32 serial terminal and verify it echoes back.

---

## What Each Wire Should Do

### Wire 1: ESP32 TX (GPIO23) → Mega RX2 (pin 16)
- **Test:** Send F100 from ESP32, Mega should receive "F100"
- **Signal:** Should see pulses at 115200 baud (~87 µs per bit)

### Wire 2: ESP32 RX (GPIO25) ← Mega TX2 (pin 17)
- **Test:** Mega sends ACK, ESP32 should display it
- **Signal:** Should see pulses only when Mega is responding

### Wire 3: Common Ground
- **Test:** Measure voltage between ESP32 GND and Mega GND with multimeter
- **Expected:** 0V (or very close, <100mV)
- **If different:** This indicates a ground loop or floating ground

---

## Success Indicators

✓ **All ACKs Received** = Connection is working!
- Proceed to integration testing with actual app
- Both devices can now communicate reliably

⚠ **Partial ACKs** = Connection works but unstable
- Check for EMI (electromagnetic interference)
- Add shielding or ferrite chokes to wires
- Ensure proper power supply (not just USB)

✗ **No ACKs** = Connection broken
- Recheck all wiring before proceeding
- Test with multimeter for continuity
- Consider replacing USB cables or ports

---

## Next Steps After Successful Test

1. **Compile Production Firmware**
   - The test uses special code; production uses `src/main.cpp`
   - Replace `test_mega_connection.cpp` with `main.cpp` for real operation

2. **Perform Motor Verification**
   - Send actual F/B/L/R commands and watch motors respond
   - Verify all four motors spin in correct direction
   - Adjust speed mapping if needed

3. **Test Camera Gimbal**
   - Send CU/CD/CL/CR commands
   - Verify gimbal moves in expected directions

4. **Integrate with Mobile App**
   - Run app on phone and connect to ESP32 AP (AGRIBOT-ESP)
   - Send joystick commands and verify motors respond
   - Test emergency stop button (S command)

---

## Questions or Issues?

1. Collect both Serial Monitor logs (copy entire output)
2. Take photos of your wiring
3. Note: Do motors spin at all? Does Mega LED blink?
4. Document exactly what you see vs. what you expected
