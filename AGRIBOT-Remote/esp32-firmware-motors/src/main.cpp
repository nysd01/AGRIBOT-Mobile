#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <Adafruit_NeoPixel.h>
#include <PubSubClient.h>
#include <ESPmDNS.h>
#include <WiFiUdp.h>
#include <NimBLEDevice.h>

// ══════════════════════════════════════════════════════════════════════════════
//  AGRIBOT-MOTORS  v5.0  — Motor Controller with MQTT
//
//  WiFi Strategy (mutually exclusive, in priority order):
//    1. Router WiFi (saved SSID)  →  Internet  →  MQTT online mode
//       Commands arrive via MQTT from the cloud broker.
//       ALSO starts its own "AGRIBOT-MOTORS" hotspot at 192.168.4.100 so the
//       phone can connect directly for credential transfer (/wifi-config,
//       /wifi-forget) without needing ESP32-Sensors or MQTT.
//    2. AGRIBOT-ESP AP  →  No internet  →  HTTP offline mode
//       Commands arrive via GET /cmd from ESP32-Sensors.
//
//  Online mode:  Phone ──[MQTT wss]──► HiveMQ ──[MQTT tcp]──► this ESP32
//                 or  Phone ──[HTTP, joined "AGRIBOT-MOTORS" @192.168.4.100]──► this ESP32
//  Offline mode: Phone ──► ESP32-Sensors ──[HTTP GET]──► this ESP32
//             or  Phone ──[BLE GATT write]──► this ESP32  (no WiFi needed at all)
//
//  BLE GATT server (NimBLE) is always advertising as "AGRIBOT-MOTORS" — lets
//  the phone send the same command strings (M../S/CU/CD/CX/CY/CS) directly
//  over Bluetooth when WiFi is unavailable or too slow.
//  NeoPixel LEDs (pin 23, 6 LEDs) show current state at a glance.
// ══════════════════════════════════════════════════════════════════════════════

// ── AP to join (ESP32-Sensors) ────────────────────────────────────────────────
const char* AP_SSID = "AGRIBOT-ESP";
const char* AP_PASS = "agribot123";

// Static IP on AP network — ESP32-Sensors hardcodes this for HTTP forwarding
const IPAddress STATIC_IP  (192, 168, 4, 100);  // above DHCP pool (starts at .2)
const IPAddress GATEWAY    (192, 168, 4, 1);
const IPAddress SUBNET     (255, 255, 255, 0);

// ── Own hotspot (only while connected to a router) ───────────────────────────
// Lets the phone reach this device for credential transfer at a known address
// even when it has joined a router and is no longer on the AGRIBOT-ESP subnet.
const char* MOTORS_AP_SSID = "AGRIBOT-MOTORS";
const char* MOTORS_AP_PASS = "agribot123";
const IPAddress MOTORS_AP_IP    (192, 168, 4, 100);
const IPAddress MOTORS_AP_GW    (192, 168, 4, 100);
const IPAddress MOTORS_AP_SUBNET(255, 255, 255, 0);

// ── Command channel (UDP, fire-and-forget) ───────────────────────────────────
// Mirrors ESP32-Sensors' forwardToMotors(): commands arrive as raw UDP
// datagrams, no TCP handshake/teardown, so loop() never blocks on /cmd.
WiFiUDP cmdUdp;
const uint16_t CMD_UDP_PORT = 4210;

// ── Command channel (BLE GATT, fire-and-forget) ──────────────────────────────
// Lets the phone send commands directly over Bluetooth when there's no WiFi
// link to the robot at all (or it's flaky). Same command strings as UDP/HTTP.
#define BLE_DEVICE_NAME       "AGRIBOT-MOTORS"
#define BLE_SERVICE_UUID      "8e3b1a40-7c2e-4a1a-9c3a-1f6e2b9d4c10"
#define BLE_CMD_CHAR_UUID     "8e3b1a41-7c2e-4a1a-9c3a-1f6e2b9d4c10"
NimBLECharacteristic* bleCmdChar = nullptr;

// ── IBT2 Motor Drivers ────────────────────────────────────────────────────────
#define RPWM1  25
#define LPWM1  26
#define REN1    4
#define LEN1    5
#define RPWM2  32
#define LPWM2  33
#define REN2   18
#define LEN2   19

// ── Camera Pan/Tilt — 2x DC motor via L298N (direction pins only) ────────────
// Pin pairs were swapped vs the original wiring notes after on-robot testing:
// pin13 HIGH actually drives RIGHT (not left), and pin14 HIGH drives DOWN (not
// up), so the LEFT/RIGHT and UP/DOWN pins are assigned to match real motion.
#define CAM_PAN_LEFT   12   // HIGH = pan left
#define CAM_PAN_RIGHT  13   // HIGH = pan right
#define CAM_TILT_UP    2   // HIGH = tilt up
#define CAM_TILT_DOWN  14   // HIGH = tilt down

char camDir = 0;   // 'U'/'D'/'X'(left)/'Y'(right)/0 = stop

// ── NeoPixel status LED ───────────────────────────────────────────────────────
#define PIXEL_PIN   23
#define PIXEL_COUNT  6
Adafruit_NeoPixel pixels(PIXEL_COUNT, PIXEL_PIN, NEO_GRB + NEO_KHZ800);

void setAllPixels(uint32_t col) {
  for (int i = 0; i < PIXEL_COUNT; i++) pixels.setPixelColor(i, col);
  pixels.show();
}
#define COL_OFF     pixels.Color(0,   0,   0)
#define COL_RED     pixels.Color(80,  0,   0)
#define COL_YELLOW  pixels.Color(80,  60,  0)
#define COL_GREEN   pixels.Color(0,   80,  0)
#define COL_BLUE    pixels.Color(0,   0,   80)
#define COL_PURPLE  pixels.Color(40,  0,   80)   // MQTT connected
#define COL_CYAN    pixels.Color(0,   60,  60)   // driving via MQTT

// ── HTTP Server ───────────────────────────────────────────────────────────────
WebServer server(80);

// ── NVS ──────────────────────────────────────────────────────────────────────
Preferences prefs;

// ── Runtime: WiFi ─────────────────────────────────────────────────────────────
String routerSSID      = "";
String routerPass      = "";
bool   onRouterWifi    = false;   // true = using router, false = using AP
bool   wifiConnecting  = false;
unsigned long wifiRetryAt = 0;

// ── Runtime: MQTT ─────────────────────────────────────────────────────────────
String mqttHost        = "broker.hivemq.com";
int    mqttPort        = 1883;
String mqttUser        = "";
String mqttPass        = "";
String mqttTopic       = "agribot/motors/cmd";
bool   mqttEnabled     = false;

WiFiClientSecure wifiClientMqtt;
PubSubClient     mqttClient(wifiClientMqtt);
unsigned long mqttNextRetry = 0;
const unsigned long MQTT_RETRY_MS = 10000;

// ── Runtime: motor watchdog ───────────────────────────────────────────────────
bool          motorsRunning = false;
unsigned long lastMotorCmd  = 0;
const unsigned long WATCHDOG_MS = 2000;

// ── Motor helpers ─────────────────────────────────────────────────────────────

void setMotor(uint8_t rpwm, uint8_t lpwm, int speed) {
  speed = constrain(speed, -255, 255);
  if      (speed > 0) { analogWrite(rpwm, speed);   analogWrite(lpwm, 0); }
  else if (speed < 0) { analogWrite(rpwm, 0);        analogWrite(lpwm, -speed); }
  else                { analogWrite(rpwm, 0);        analogWrite(lpwm, 0); }
}

void stopMotors() {
  setMotor(RPWM1, LPWM1, 0);
  setMotor(RPWM2, LPWM2, 0);
  motorsRunning = false;
}

// Drives the two camera DC motors directly from camDir — HIGH on exactly one
// direction pin per axis, everything else LOW (camDir == 0 -> all LOW -> stop).
void applyCameraDir() {
  digitalWrite(CAM_PAN_LEFT,  camDir == 'X');
  digitalWrite(CAM_PAN_RIGHT, camDir == 'Y');
  digitalWrite(CAM_TILT_UP,   camDir == 'U');
  digitalWrite(CAM_TILT_DOWN, camDir == 'D');
}

void executeCmd(const String& cmd) {
  Serial.printf("[EXEC] %s\n", cmd.c_str());

  if (cmd == "S") {
    stopMotors();
    camDir = 0;
    applyCameraDir();
    setAllPixels(onRouterWifi ? COL_PURPLE : COL_GREEN);

  } else if (cmd.length() > 1 && cmd[0] == 'M') {
    int ci = cmd.indexOf(',');
    if (ci > 1) {
      int left  = constrain(cmd.substring(1, ci).toInt(), -255, 255);
      int right = constrain(cmd.substring(ci + 1).toInt(), -255, 255);
      setMotor(RPWM1, LPWM1, left);
      setMotor(RPWM2, LPWM2, right);
      motorsRunning = true;
      lastMotorCmd  = millis();
      setAllPixels(onRouterWifi ? COL_CYAN : COL_BLUE);
    }

  } else if (cmd == "CU") { camDir = 'U'; applyCameraDir(); }
  else if   (cmd == "CD") { camDir = 'D'; applyCameraDir(); }
  else if   (cmd == "CX") { camDir = 'X'; applyCameraDir(); }
  else if   (cmd == "CY") { camDir = 'Y'; applyCameraDir(); }
  else if   (cmd == "CS") {
    camDir = 0;
    applyCameraDir();
  } else if (cmd == "WIFI_FORGET") {
    // Reachable via MQTT even when Motors is on the router (not AGRIBOT-ESP),
    // which is the only case the HTTP /wifi-forget endpoint can't reach.
    Serial.println(F("[WiFi] Router creds forgotten via MQTT — rebooting"));
    prefs.begin("wifi", false);
    prefs.remove("ssid");
    prefs.remove("pass");
    prefs.end();
    delay(200);
    ESP.restart();
  }
}

// ── BLE GATT server ───────────────────────────────────────────────────────────

class BleCmdCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* chr) {
    String cmd = String(chr->getValue().c_str());
    cmd.trim();
    if (cmd.length() > 0) {
      Serial.printf("[BLE] Received: %s\n", cmd.c_str());
      executeCmd(cmd);
    }
  }
};

class BleServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* srv) {
    Serial.println(F("[BLE] Phone connected"));
  }
  void onDisconnect(NimBLEServer* srv) {
    Serial.println(F("[BLE] Phone disconnected — resume advertising"));
    stopMotors();
    camDir = 0;
    applyCameraDir();
    NimBLEDevice::startAdvertising();
  }
};

void setupBle() {
  NimBLEDevice::init(BLE_DEVICE_NAME);
  NimBLEServer* bleServer = NimBLEDevice::createServer();
  bleServer->setCallbacks(new BleServerCallbacks());

  NimBLEService* svc = bleServer->createService(BLE_SERVICE_UUID);
  bleCmdChar = svc->createCharacteristic(
    BLE_CMD_CHAR_UUID,
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
  );
  bleCmdChar->setCallbacks(new BleCmdCallbacks());
  svc->start();

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(BLE_SERVICE_UUID);
  adv->start();

  Serial.println(F("[BLE] Advertising as \"AGRIBOT-MOTORS\""));
}

// ── CORS ──────────────────────────────────────────────────────────────────────

void addCORS() {
  server.sendHeader("Access-Control-Allow-Origin",  "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.sendHeader("Cache-Control",                "no-cache");
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────

void handleOptions() { addCORS(); server.send(204); }

void handleRoot() {
  addCORS();
  server.send(200, "application/json",
    "{\"device\":\"AGRIBOT-MOTORS\",\"version\":\"5.0\","
    "\"routes\":[\"/\",\"/cmd\",\"/health\",\"/wifi-config\",\"/wifi-forget\",\"/mqtt-config\"]}");
}

void handleHealth() {
  JsonDocument doc;
  doc["status"]       = "ok";
  doc["name"]         = "AGRIBOT-MOTORS";
  doc["ip"]           = WiFi.localIP().toString();
  doc["uptimeMs"]     = millis();
  doc["wifiMode"]     = onRouterWifi ? "router" : "ap";
  doc["mqttEnabled"]  = mqttEnabled;
  doc["mqttConnected"]= mqttClient.connected();
  doc["ble"]          = "AGRIBOT-MOTORS";

  if (WiFi.status() == WL_CONNECTED) {
    doc["ssid"] = WiFi.SSID();
    doc["rssi"] = WiFi.RSSI();
  }

  if (onRouterWifi) {
    doc["hotspotSSID"] = MOTORS_AP_SSID;
    doc["hotspotIP"]   = MOTORS_AP_IP.toString();
  }

  String body;
  serializeJson(doc, body);
  addCORS();
  server.send(200, "application/json", body);
}

void handleCmd() {
  addCORS();
  if (!server.hasArg("c") || server.arg("c").length() == 0) {
    server.send(400, "application/json", "{\"error\":\"missing ?c=\"}");
    return;
  }
  String cmd = server.arg("c");
  cmd.trim();
  executeCmd(cmd);
  server.send(200, "application/json", "{\"ok\":true,\"cmd\":\"" + cmd + "\"}");
}

void handleWifiConfig() {
  addCORS();
  if (server.method() != HTTP_POST) {
    server.send(405, "application/json", "{\"error\":\"method not allowed\"}"); return;
  }
  if (!server.hasArg("plain") || server.arg("plain").length() == 0) {
    server.send(400, "application/json", "{\"error\":\"empty body\"}"); return;
  }
  JsonDocument req;
  if (deserializeJson(req, server.arg("plain"))) {
    server.send(400, "application/json", "{\"error\":\"invalid JSON\"}"); return;
  }
  const char* ssid = req["ssid"] | "";
  const char* pass = req["password"] | "";
  if (strlen(ssid) == 0) {
    server.send(400, "application/json", "{\"error\":\"ssid required\"}"); return;
  }

  prefs.begin("wifi", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();

  routerSSID = ssid;
  routerPass = pass;

  server.send(200, "application/json",
    "{\"ok\":true,\"message\":\"WiFi saved. Reboot or reconnect to activate.\"}");
  Serial.printf("[WiFi] Router creds saved: %s\n", ssid);
}

// POST /wifi-forget
// Clears the saved router SSID/password so the next boot/reconnect always
// joins AGRIBOT-ESP (offline mode), regardless of router availability.
void handleWifiForget() {
  addCORS();
  if (server.method() != HTTP_POST) {
    server.send(405, "application/json", "{\"error\":\"method not allowed\"}"); return;
  }

  prefs.begin("wifi", false);
  prefs.remove("ssid");
  prefs.remove("pass");
  prefs.end();

  routerSSID = "";
  routerPass = "";

  server.send(200, "application/json",
    "{\"ok\":true,\"message\":\"Router WiFi forgotten. Reboot to join AGRIBOT-ESP.\"}");
  Serial.println(F("[WiFi] Router creds forgotten"));
}

// POST /mqtt-config
// Body: { "host":"broker.hivemq.com", "port":1883, "user":"", "pass":"", "topic":"agribot/motors/cmd" }
void handleMqttConfig() {
  addCORS();
  if (server.method() != HTTP_POST) {
    server.send(405, "application/json", "{\"error\":\"method not allowed\"}"); return;
  }
  if (!server.hasArg("plain") || server.arg("plain").length() == 0) {
    server.send(400, "application/json", "{\"error\":\"empty body\"}"); return;
  }
  JsonDocument req;
  if (deserializeJson(req, server.arg("plain"))) {
    server.send(400, "application/json", "{\"error\":\"invalid JSON\"}"); return;
  }

  const char* host  = req["host"]  | "broker.hivemq.com";
  int         port  = req["port"]  | 1883;
  const char* user  = req["user"]  | "";
  const char* pass  = req["pass"]  | "";
  const char* topic = req["topic"] | "agribot/motors/cmd";

  prefs.begin("mqtt", false);
  prefs.putString("host",  host);
  prefs.putInt   ("port",  port);
  prefs.putString("user",  user);
  prefs.putString("pass",  pass);
  prefs.putString("topic", topic);
  prefs.end();

  mqttHost  = host;
  mqttPort  = port;
  mqttUser  = user;
  mqttPass  = pass;
  mqttTopic = topic;
  mqttEnabled = true;

  // Force reconnect
  if (mqttClient.connected()) mqttClient.disconnect();
  mqttNextRetry = 0;

  JsonDocument res;
  res["ok"]    = true;
  res["host"]  = mqttHost;
  res["port"]  = mqttPort;
  res["topic"] = mqttTopic;
  String body;
  serializeJson(res, body);
  server.send(200, "application/json", body);
  Serial.printf("[MQTT] Config updated: %s:%d  topic=%s\n",
    mqttHost.c_str(), mqttPort, mqttTopic.c_str());
}

// ── MQTT callbacks ─────────────────────────────────────────────────────────────

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String cmd = "";
  for (unsigned int i = 0; i < length; i++) cmd += (char)payload[i];
  cmd.trim();
  if (cmd.length() > 0) {
    Serial.printf("[MQTT] Received: %s\n", cmd.c_str());
    executeCmd(cmd);
  }
}

void mqttReconnect() {
  if (!mqttEnabled || !onRouterWifi) return;
  if (millis() < mqttNextRetry) return;
  mqttNextRetry = millis() + MQTT_RETRY_MS;

  mqttClient.setServer(mqttHost.c_str(), mqttPort);
  mqttClient.setCallback(onMqttMessage);

  String clientId = "AGRIBOT-MOTORS-";
  clientId += String(random(0xFFFF), HEX);

  Serial.printf("[MQTT] Connecting to %s:%d  id=%s\n",
    mqttHost.c_str(), mqttPort, clientId.c_str());
  setAllPixels(COL_YELLOW);

  bool ok;
  if (mqttUser.length() > 0) {
    ok = mqttClient.connect(clientId.c_str(), mqttUser.c_str(), mqttPass.c_str());
  } else {
    ok = mqttClient.connect(clientId.c_str());
  }

  if (ok) {
    mqttClient.subscribe(mqttTopic.c_str());
    setAllPixels(COL_PURPLE);
    Serial.printf("[MQTT] Connected — subscribed to %s\n", mqttTopic.c_str());
  } else {
    setAllPixels(COL_RED);
    Serial.printf("[MQTT] Failed (state=%d) — retry in %lu s\n",
      mqttClient.state(), MQTT_RETRY_MS / 1000);
  }
}

// ── Credential hotspot ────────────────────────────────────────────────────────

// Starts "AGRIBOT-MOTORS" hotspot at 192.168.4.100. Only used while connected
// to a router (separate subnet from the router's STA IP, so no conflict).
void startCredentialHotspot() {
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(MOTORS_AP_SSID, MOTORS_AP_PASS);
  WiFi.softAPConfig(MOTORS_AP_IP, MOTORS_AP_GW, MOTORS_AP_SUBNET);
  Serial.printf("[WiFi] Hotspot \"%s\" → http://%s  (credential transfer)\n",
    MOTORS_AP_SSID, MOTORS_AP_IP.toString().c_str());
}

// Stops the credential hotspot — used when joining AGRIBOT-ESP, where its own
// AP would collide with the AGRIBOT-ESP subnet.
void stopCredentialHotspot() {
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
}

// ── mDNS ──────────────────────────────────────────────────────────────────────

// Re-(re)register "agribot-motors.local" on whichever network is currently
// active. Lets ESP32-Sensors find this device when both join the same router
// (its DHCP IP differs from the AGRIBOT-ESP AP static IP).
void startMdns() {
  MDNS.end();
  if (MDNS.begin("agribot-motors")) {
    MDNS.addService("http", "tcp", 80);
    Serial.println(F("[mDNS] agribot-motors.local"));
  } else {
    Serial.println(F("[mDNS] start failed"));
  }
}

// ── WiFi helpers ──────────────────────────────────────────────────────────────

bool connectToRouter() {
  if (routerSSID.length() == 0) return false;
  Serial.printf("[WiFi] Trying router: %s\n", routerSSID.c_str());
  setAllPixels(COL_YELLOW);

  // Keep the STA interface alive (don't pass true) so TCPIP adapter stays init'd.
  WiFi.disconnect();
  delay(300);
  WiFi.begin(routerSSID.c_str(), routerPass.c_str());

  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 12000) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    onRouterWifi = true;
    Serial.printf("[WiFi] Router connected — IP: %s\n",
      WiFi.localIP().toString().c_str());
    setAllPixels(COL_GREEN);
    startMdns();
    startCredentialHotspot();
    return true;
  }
  Serial.println(F("[WiFi] Router failed"));
  return false;
}

void connectToAP() {
  Serial.printf("[WiFi] Joining AP %s  static:%s\n",
    AP_SSID, STATIC_IP.toString().c_str());
  setAllPixels(COL_YELLOW);

  // Own hotspot (192.168.4.100) would collide with AGRIBOT-ESP's subnet
  stopCredentialHotspot();

  // Keep interface alive (no true) so tcpip_adapter_dhcpc_stop() works in
  // WiFi.config().  WiFi.disconnect(true) destroys the STA netif, causing
  // WiFi.config() to run before the interface is re-initialised → DHCP wins.
  WiFi.disconnect();
  delay(300);
  WiFi.config(STATIC_IP, GATEWAY, SUBNET);
  WiFi.begin(AP_SSID, AP_PASS);

  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 10000) {
    delay(200);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    onRouterWifi = false;
    Serial.printf("[WiFi] AP connected — IP: %s\n",
      WiFi.localIP().toString().c_str());
    setAllPixels(COL_GREEN);
    startMdns();
  } else {
    Serial.println(F("[WiFi] AP not found — will retry"));
    setAllPixels(COL_RED);
    wifiConnecting = true;
    wifiRetryAt    = millis() + 15000;
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println(F("\n========================================"));
  Serial.println(F("  AGRIBOT-MOTORS  v5.0"));
  Serial.println(F("  IBT2 + Camera + WiFi + MQTT + BT"));
  Serial.println(F("========================================"));

  pixels.begin();
  setAllPixels(COL_RED);

  // IBT2 enable pins
  pinMode(REN1, OUTPUT); digitalWrite(REN1, HIGH);
  pinMode(LEN1, OUTPUT); digitalWrite(LEN1, HIGH);
  pinMode(REN2, OUTPUT); digitalWrite(REN2, HIGH);
  pinMode(LEN2, OUTPUT); digitalWrite(LEN2, HIGH);
  stopMotors();
  Serial.println(F("[Motors] IBT2 ready"));

  // Camera pan/tilt — 2x DC motor via L298N, direction pins only
  pinMode(CAM_PAN_LEFT,  OUTPUT); digitalWrite(CAM_PAN_LEFT,  LOW);
  pinMode(CAM_PAN_RIGHT, OUTPUT); digitalWrite(CAM_PAN_RIGHT, LOW);
  pinMode(CAM_TILT_UP,   OUTPUT); digitalWrite(CAM_TILT_UP,   LOW);
  pinMode(CAM_TILT_DOWN, OUTPUT); digitalWrite(CAM_TILT_DOWN, LOW);
  Serial.println(F("[Camera] Pan/tilt ready"));

  // Load saved router WiFi
  prefs.begin("wifi", true);
  routerSSID = prefs.getString("ssid", "");
  routerPass = prefs.getString("pass", "");
  prefs.end();
  if (routerSSID.length() > 0)
    Serial.printf("[WiFi] Saved router: %s\n", routerSSID.c_str());

  // Load saved MQTT config
  prefs.begin("mqtt", true);
  mqttHost  = prefs.getString("host",  "broker.hivemq.com");
  mqttPort  = prefs.getInt   ("port",  1883);
  mqttUser  = prefs.getString("user",  "");
  mqttPass  = prefs.getString("pass",  "");
  mqttTopic = prefs.getString("topic", "agribot/motors/cmd");
  prefs.end();
  Serial.printf("[MQTT] Config: %s:%d  topic=%s\n",
    mqttHost.c_str(), mqttPort, mqttTopic.c_str());

  // BLE must come up BEFORE WiFi — esp_bt_controller_enable() aborts in
  // coex_core_enable() if the WiFi controller has already been started
  // (the coexistence subsystem expects BT init first).
  setupBle();

  // Init WiFi driver with STA interface up BEFORE any config/connect calls.
  // persistent(false) stops NVS-cached credentials from overriding WiFi.config().
  // Having the interface alive when WiFi.config() is called ensures
  // tcpip_adapter_dhcpc_stop() succeeds → static IP sticks.
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  // NOTE: WiFi.setSleep(false) is NOT used here (unlike ESP32-Sensors) —
  // with BLE active, the ESP-IDF WiFi/BT coexistence layer requires modem
  // sleep to stay enabled (aborts with "Should enable WiFi modem sleep
  // when both WiFi and Bluetooth are enabled" otherwise). The BLE command
  // channel bypasses WiFi entirely and isn't affected by this.
  delay(100);

  // Skip TLS certificate verification — avoids shipping a CA bundle on the device.
  // The connection is still encrypted; we just trust the server's cert unconditionally.
  wifiClientMqtt.setInsecure();

  // WiFi: prefer router (for MQTT) → fall back to AP (for offline HTTP)
  bool routerOk = connectToRouter();
  if (!routerOk) {
    connectToAP();
  } else {
    // Router connected — MQTT will be enabled if config exists
    mqttEnabled = true;
    mqttClient.setBufferSize(512);
    mqttReconnect();
  }

  // HTTP routes
  server.on("/",            HTTP_GET,     handleRoot);
  server.on("/cmd",         HTTP_GET,     handleCmd);
  server.on("/health",      HTTP_GET,     handleHealth);
  server.on("/wifi-config", HTTP_POST,    handleWifiConfig);
  server.on("/wifi-forget", HTTP_POST,    handleWifiForget);
  server.on("/mqtt-config", HTTP_POST,    handleMqttConfig);
  server.on("/reboot",      HTTP_POST,    []() {
    addCORS();
    server.send(200, "application/json", "{\"ok\":true,\"message\":\"rebooting\"}");
    delay(200);
    ESP.restart();
  });
  server.on("/cmd",         HTTP_OPTIONS, handleOptions);
  server.on("/health",      HTTP_OPTIONS, handleOptions);
  server.on("/wifi-config", HTTP_OPTIONS, handleOptions);
  server.on("/wifi-forget", HTTP_OPTIONS, handleOptions);
  server.on("/mqtt-config", HTTP_OPTIONS, handleOptions);
  server.on("/reboot",      HTTP_OPTIONS, handleOptions);
  server.onNotFound([]() { addCORS(); server.send(404, "application/json", "{\"error\":\"not found\"}"); });
  server.begin();
  cmdUdp.begin(CMD_UDP_PORT);

  Serial.printf("[HTTP] Ready → http://%s\n", WiFi.localIP().toString().c_str());
  Serial.printf("[UDP]  Cmd channel listening on :%d\n", CMD_UDP_PORT);
  Serial.println(F("[BLE]  Advertising as 'AGRIBOT-MOTORS' for direct phone control"));
  Serial.println(F("========================================\n"));
}

// ── Loop ──────────────────────────────────────────────────────────────────────

void loop() {
  server.handleClient();

  // UDP command channel — instant, no TCP handshake/teardown per command.
  int udpLen = cmdUdp.parsePacket();
  if (udpLen > 0) {
    char buf[32];
    int n = cmdUdp.read(buf, sizeof(buf) - 1);
    if (n > 0) {
      buf[n] = '\0';
      String cmd = String(buf);
      cmd.trim();
      if (cmd.length() > 0) executeCmd(cmd);
    }
  }

  // Motor watchdog
  if (motorsRunning && millis() - lastMotorCmd > WATCHDOG_MS) {
    stopMotors();
    setAllPixels(onRouterWifi ? COL_PURPLE : COL_GREEN);
    Serial.println(F("[Watchdog] Motors stopped"));
  }

  // WiFi reconnect logic
  if (WiFi.status() != WL_CONNECTED && !wifiConnecting) {
    Serial.println(F("[WiFi] Lost — reconnecting..."));
    setAllPixels(COL_YELLOW);
    wifiConnecting = true;
    wifiRetryAt    = millis() + 3000;
  }
  if (wifiConnecting && millis() > wifiRetryAt) {
    wifiConnecting = false;
    bool ok = connectToRouter();
    if (!ok) connectToAP();
    else { mqttEnabled = true; mqttNextRetry = 0; }
  }

  // MQTT keep-alive and reconnect
  if (onRouterWifi && WiFi.status() == WL_CONNECTED) {
    if (mqttClient.connected()) {
      mqttClient.loop();
    } else if (mqttEnabled) {
      mqttReconnect();
    }
  }
}
