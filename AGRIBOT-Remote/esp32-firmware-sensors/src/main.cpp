#include <Arduino.h>
#include <TinyGPS++.h>
#include <DHT.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WiFiClient.h>
#include <ESPmDNS.h>
#include <WiFiUdp.h>

// ══════════════════════════════════════════════════════════════════════════════
//  AGRIBOT-ESP  v4.0  — Sensors + Cloud + Command Router
//
//  Role: AP master, sensor hub, cloud bridge, command router.
//        Forwards ALL motor/camera commands to ESP32-Motors via local HTTP.
//
//  Network topology:
//    192.168.4.1  ← this device (AP + optional STA to router)
//    192.168.4.100← ESP32-Motors  (static IP, above DHCP pool — avoids phone conflict)
//    192.168.4.3  ← Raspberry Pi  (future: camera / mic streaming)
// ══════════════════════════════════════════════════════════════════════════════

// ── WiFi AP ──────────────────────────────────────────────────────────────────
const char* AP_SSID = "AGRIBOT-ESP";
const char* AP_PASS = "agribot123";

// ── Known device IPs (static — configured in each device's firmware) ─────────
const char* MOTORS_AP_IP = "192.168.4.100";  // static, above DHCP pool (AGRIBOT-ESP AP)
const char* CAMERA_IP     = "192.168.4.3";   // future Raspberry Pi

// Resolved Motors address — defaults to the AP static IP. When this device
// joins a router (STA), Motors may have joined the SAME router and gotten a
// different DHCP IP, so it's discovered via mDNS ("agribot-motors.local").
String motorsIP = MOTORS_AP_IP;

// ── Command channel (UDP, fire-and-forget) ───────────────────────────────────
// Motor/camera commands go over UDP — no TCP handshake/teardown per command,
// so joystick input reaches Motors instantly instead of queuing behind a
// blocking HTTP request in loop().
WiFiUDP cmdUdp;
const uint16_t MOTORS_CMD_UDP_PORT = 4210;

// ── GPS (UART2) ───────────────────────────────────────────────────────────────
TinyGPSPlus gps;
HardwareSerial GPS_Serial(2);
#define GPS_RX 16
#define GPS_TX 17

// ── DHT11 ────────────────────────────────────────────────────────────────────
#define DHTPIN  4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// ── Analog Sensors (ADC1 only — ADC2 conflicts with WiFi) ───────────────────
#define MQ_PIN    34   // MQ Smoke/Gas
#define FLAME_PIN 35   // HW-484 Flame
#define SOIL_PIN  33   // HW-080 Soil Moisture

#define FLAME_THRESHOLD 1000   // lower = darker/closer flame needed to trigger

// ── HTTP Server ───────────────────────────────────────────────────────────────
WebServer server(80);

// ── NVS ──────────────────────────────────────────────────────────────────────
Preferences prefs;

// ── Live sensor state ─────────────────────────────────────────────────────────
float  g_temp     = NAN;
float  g_humidity = NAN;
int    g_mq       = 0;
int    g_flame    = 4095;
bool   g_flameDetected = false;
int    g_flameLowCount = 0;   // consecutive low-flame-reading readings, for debounce
int    g_soil     = 4095;
bool   g_gpsValid = false;
double g_lat      = 0.0;
double g_lng      = 0.0;
int    g_sats     = 0;
double g_alt      = 0.0;
double g_speed    = 0.0;

unsigned long lastRead       = 0;
unsigned long staRetryAt     = 0;
bool          staConnecting  = false;
unsigned long lastCloudPost  = 0;
unsigned long lastCmdPoll    = 0;
unsigned long lastMotorsKA   = 0;         // keepalive — probes motors every 30 s
const unsigned long CMD_POLL_MS    = 5000;  // TLS teardown needs time; 500ms exhausts fds
const unsigned long MOTORS_KA_MS   = 30000;

bool motorsOnline = false;   // updated after each forward attempt

// Persisted credentials
String routerSSID = "";
String routerPass = "";
String cloudUrl   = "";
String cloudKey   = "";

// ── Helpers ───────────────────────────────────────────────────────────────────

float soilPct(int raw) {
  return (float)constrain(map(raw, 3700, 1200, 0, 100), 0, 100);
}

// True while a phone is on the AGRIBOT-ESP AP (offline mode in use). Cloud
// TLS calls (postToCloud/pollCloudCommands) block loop() for 1-3 s each, which
// would starve server.handleClient() and make /cmd feel laggy — so they're
// skipped while someone is actively driving offline.
bool phoneOnAP() {
  return WiFi.softAPgetStationNum() > 0;
}

void addCORS() {
  server.sendHeader("Access-Control-Allow-Origin",  "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.sendHeader("Cache-Control",                "no-cache");
}

void connectToRouter(const String& ssid, const String& pass) {
  if (ssid.length() == 0) return;
  Serial.printf("[WiFi] Connecting to router: %s\n", ssid.c_str());
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(AP_SSID, AP_PASS);
  WiFi.begin(ssid.c_str(), pass.c_str());
  staConnecting = true;
  staRetryAt    = millis() + 30000;
}

// ── Motors discovery ──────────────────────────────────────────────────────────

/**
 * Re-resolve the Motors IP address.
 *
 * - If this device is on the AGRIBOT-ESP AP only, Motors is always at the
 *   static AP IP (192.168.4.100).
 * - If this device has joined a router, Motors may have joined the SAME
 *   router (online mode) and received a different DHCP IP — look it up via
 *   mDNS ("agribot-motors.local"). Falls back to the AP IP if not found
 *   (e.g. Motors is still on the AP, not the router).
 */
void resolveMotorsIP() {
  if (WiFi.status() == WL_CONNECTED) {
    IPAddress ip = MDNS.queryHost("agribot-motors", 2000);
    if (ip != IPAddress(0, 0, 0, 0)) {
      String found = ip.toString();
      if (found != motorsIP) {
        motorsIP = found;
        Serial.printf("[mDNS] Motors found on router at %s\n", motorsIP.c_str());
      }
      return;
    }
  }
  if (motorsIP != MOTORS_AP_IP) {
    motorsIP = MOTORS_AP_IP;
    Serial.printf("[mDNS] Motors not found on router — using AP IP %s\n", MOTORS_AP_IP);
  }
}

// ── Command forwarding to ESP32-Motors ───────────────────────────────────────

void forwardToMotors(const String& cmd) {
  // Fire-and-forget UDP datagram — no TCP handshake/teardown, so this never
  // blocks loop()/server.handleClient(). motorsOnline is tracked separately
  // by the periodic /health keepalive probe.
  cmdUdp.beginPacket(motorsIP.c_str(), MOTORS_CMD_UDP_PORT);
  cmdUdp.write((const uint8_t*)cmd.c_str(), cmd.length());
  cmdUdp.endPacket();
  Serial.printf("[FWD] → Motors (UDP): %s\n", cmd.c_str());
}

// Generic proxy helpers — phone can't reach 192.168.4.2 directly (AP client
// isolation), so all motors management goes through Sensors as a bridge.

String proxyGetMotors(const String& path) {
  WiFiClient wc;
  HTTPClient h;
  h.setTimeout(1500);
  String url = String("http://") + motorsIP + path;
  if (!h.begin(wc, url)) {
    Serial.printf("[Proxy] begin() failed for %s\n", url.c_str());
    return "";
  }
  int code = h.GET();
  Serial.printf("[Proxy] GET %s → HTTP %d\n", url.c_str(), code);
  String resp = (code > 0) ? h.getString() : "";
  h.end();
  return resp;
}

String proxyPostMotors(const String& path, const String& body) {
  WiFiClient wc;
  HTTPClient h;
  h.setTimeout(1500);
  if (!h.begin(wc, String("http://") + motorsIP + path)) return "";
  h.addHeader("Content-Type", "application/json");
  int code = h.POST(body);
  String resp = (code > 0) ? h.getString() : "";
  h.end();
  return resp;
}

void handleMotorsHealth() {
  Serial.printf("[Proxy] → GET /health on %s\n", motorsIP.c_str());
  addCORS();
  String resp = proxyGetMotors("/health");
  if (resp.length() > 0) {
    Serial.println(F("[Proxy] ✓ motors health OK"));
    motorsOnline = true;
    server.send(200, "application/json", resp);
  } else {
    Serial.println(F("[Proxy] ✗ motors health FAILED (no response)"));
    motorsOnline = false;
    server.send(502, "application/json",
      String("{\"error\":\"motors offline\",\"ip\":\"") + motorsIP + "\"}");
  }
}

void handleMotorsWifiConfig() {
  addCORS();
  if (server.method() != HTTP_POST) { server.send(405); return; }
  String body = server.hasArg("plain") ? server.arg("plain") : "{}";
  String resp = proxyPostMotors("/wifi-config", body);
  server.send(resp.length() > 0 ? 200 : 502, "application/json",
    resp.length() > 0 ? resp : "{\"error\":\"motors offline\"}");
}

void handleMotorsMqttConfig() {
  addCORS();
  if (server.method() != HTTP_POST) { server.send(405); return; }
  String body = server.hasArg("plain") ? server.arg("plain") : "{}";
  String resp = proxyPostMotors("/mqtt-config", body);
  server.send(resp.length() > 0 ? 200 : 502, "application/json",
    resp.length() > 0 ? resp : "{\"error\":\"motors offline\"}");
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────

void handleOptions() {
  addCORS();
  server.send(204);
}

void handleRoot() {
  addCORS();
  server.send(200, "application/json",
    "{\"device\":\"AGRIBOT-SENSORS\",\"version\":\"4.0\","
    "\"routes\":[\"/\",\"/sensors\",\"/health\",\"/devices\","
    "\"/cmd\",\"/wifi-config\",\"/cloud-config\",\"/trajectory\"]}");
}

void handleHealth() {
  JsonDocument doc;
  doc["status"]        = "ok";
  doc["name"]          = "AGRIBOT-SENSORS";
  doc["ip"]            = WiFi.softAPIP().toString();
  doc["uptimeMs"]      = millis();
  doc["clients"]       = WiFi.softAPgetStationNum();
  doc["service"]       = "agribot-sensor-api";
  doc["motorsOnline"]  = motorsOnline;

  if (WiFi.status() == WL_CONNECTED) {
    doc["staIP"]   = WiFi.localIP().toString();
    doc["staSSID"] = WiFi.SSID();
    doc["staRSSI"] = WiFi.RSSI();
  }

  String body;
  serializeJson(doc, body);
  addCORS();
  server.send(200, "application/json", body);
}

/**
 * GET /devices
 * Returns IPs of all known peripheral devices on the AP network.
 * The app / RPi can call this to discover stream URLs without hardcoding.
 */
void handleDevices() {
  JsonDocument doc;

  JsonObject motors = doc["motors"].to<JsonObject>();
  motors["ip"]          = motorsIP;
  motors["online"]      = motorsOnline;
  motors["description"] = "ESP32 motor controller (IBT2 + camera stepper)";

  JsonObject camera = doc["camera"].to<JsonObject>();
  camera["ip"]          = CAMERA_IP;
  camera["streamPort"]  = 8080;
  camera["streamUrl"]   = String("http://") + CAMERA_IP + ":8080/stream";
  camera["description"] = "Raspberry Pi camera (future)";

  String body;
  serializeJson(doc, body);
  addCORS();
  server.send(200, "application/json", body);
}

void handleSensors() {
  JsonDocument doc;

  // Location / GPS
  JsonObject location = doc["location"].to<JsonObject>();
  JsonObject gpsObj   = location["gps"].to<JsonObject>();
  gpsObj["valid"]      = g_gpsValid;
  gpsObj["satellites"] = g_sats;
  if (g_gpsValid) {
    gpsObj["lat"]        = g_lat;
    gpsObj["lng"]        = g_lng;
    gpsObj["altitude"]   = g_alt;
    gpsObj["speed_kmph"] = g_speed;
    JsonObject legacyGps = doc["gps"].to<JsonObject>();
    legacyGps["lat"] = g_lat;
    legacyGps["lng"] = g_lng;
  }

  // Weather (DHT11)
  if (!isnan(g_temp)) {
    doc["temperatureC"] = g_temp;
    doc["humidityPct"]  = g_humidity;
    JsonObject d4      = doc["domino4"].to<JsonObject>();
    JsonObject weather = d4["weather"].to<JsonObject>();
    weather["temperatureC"] = g_temp;
    weather["humidityPct"]  = g_humidity;
    weather["source"]       = "DHT11";
  }

  // Soil
  float soil = soilPct(g_soil);
  doc["soilMoisturePct"] = soil;
  JsonObject d4s   = doc["domino4"].to<JsonObject>();
  JsonObject soilJ = d4s["soil"].to<JsonObject>();
  soilJ["moisturePct"] = soil;
  soilJ["rawTouch"]    = g_soil;
  soilJ["source"]      = "HW-080";

  // Smoke/Gas
  JsonObject smoke = doc["smoke"].to<JsonObject>();
  smoke["raw"]      = g_mq;
  smoke["detected"] = (g_mq > 2500);
  smoke["status"]   = (g_mq > 2500) ? "DETECTED" : "Normal";

  // Flame
  JsonObject flame = doc["flame"].to<JsonObject>();
  flame["raw"]      = g_flame;
  flame["detected"] = g_flameDetected;
  flame["status"]   = g_flameDetected ? "DETECTED" : "None";

  // System
  JsonObject sys = doc["systemInfo"].to<JsonObject>();
  sys["uptimeSeconds"] = millis() / 1000;
  sys["gpsReady"]      = g_gpsValid;
  sys["i2cReady"]      = false;
  sys["sht3xReady"]    = false;
  sys["oledReady"]     = false;
  sys["wifiMode"]      = (WiFi.getMode() == WIFI_AP_STA) ? "AP+STA" : "AP";
  sys["motorsOnline"]  = motorsOnline;
  if (WiFi.status() == WL_CONNECTED) {
    sys["staIP"] = WiFi.localIP().toString();
  }

  String body;
  serializeJson(doc, body);
  addCORS();
  server.send(200, "application/json", body);
}

/**
 * GET /cmd?c=<command>
 *
 * Receives a motor or camera command from the app and forwards it to
 * ESP32-Motors over the AP local network (192.168.4.2).
 *
 *   M<left>,<right>   differential drive (-255…+255 each)
 *   S                 stop all motors
 *   CU/CD/CX/CY       camera pan/tilt
 *   CS                camera stop
 */
void handleCmd() {
  addCORS();

  if (!server.hasArg("c") || server.arg("c").length() == 0) {
    server.send(400, "application/json", "{\"error\":\"missing ?c= parameter\"}");
    return;
  }

  String cmd = server.arg("c");
  cmd.trim();

  // Respond to app immediately so it doesn't time out waiting
  server.send(200, "application/json",
    "{\"ok\":true,\"cmd\":\"" + cmd + "\",\"forwarded\":true}");

  // Forward to motors (after response flush — keeps app latency low)
  forwardToMotors(cmd);
}

/**
 * POST /wifi-config
 * Body: { "ssid": "MyRouter", "password": "secret" }
 */
void handleWifiConfig() {
  addCORS();
  if (server.method() != HTTP_POST) {
    server.send(405, "application/json", "{\"error\":\"method not allowed\"}");
    return;
  }
  if (!server.hasArg("plain") || server.arg("plain").length() == 0) {
    server.send(400, "application/json", "{\"error\":\"empty body\"}");
    return;
  }

  JsonDocument req;
  if (deserializeJson(req, server.arg("plain"))) {
    server.send(400, "application/json", "{\"error\":\"invalid JSON\"}");
    return;
  }

  const char* ssid = req["ssid"] | "";
  const char* pass = req["password"] | "";

  if (strlen(ssid) == 0) {
    server.send(400, "application/json", "{\"error\":\"ssid required\"}");
    return;
  }

  prefs.begin("wifi", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();

  routerSSID = ssid;
  routerPass = pass;

  JsonDocument res;
  res["ok"]      = true;
  res["message"] = "Connecting to router. Check /health for staIP.";
  res["ssid"]    = ssid;
  String body;
  serializeJson(res, body);
  server.send(200, "application/json", body);

  delay(100);
  connectToRouter(routerSSID, routerPass);
}

/**
 * POST /trajectory
 * Body: { "waypoints": [{ "x": 10.5, "y": 32.1 }, ...] }
 */
void handleTrajectory() {
  addCORS();
  if (server.method() != HTTP_POST) {
    server.send(405, "application/json", "{\"error\":\"method not allowed\"}");
    return;
  }
  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"error\":\"empty body\"}");
    return;
  }

  JsonDocument req;
  if (deserializeJson(req, server.arg("plain"))) {
    server.send(400, "application/json", "{\"error\":\"invalid JSON\"}");
    return;
  }

  JsonArray waypoints = req["waypoints"].as<JsonArray>();
  int count = waypoints.size();
  Serial.printf("[Trajectory] %d waypoints received\n", count);
  for (int i = 0; i < count; i++) {
    Serial.printf("  [%d] x=%.1f  y=%.1f\n", i,
      (float)(waypoints[i]["x"] | 0.0f),
      (float)(waypoints[i]["y"] | 0.0f));
  }

  JsonDocument res;
  res["ok"]       = true;
  res["received"] = count;
  String body;
  serializeJson(res, body);
  server.send(200, "application/json", body);
}

// ── Cloud push ────────────────────────────────────────────────────────────────

String buildCloudPostUrl() {
  String base = cloudUrl;
  if (base.endsWith("/")) base.remove(base.length() - 1);
  return base.indexOf("supabase.co") >= 0
    ? base + "/rest/v1/sensor_readings"
    : base + "/api/readings";
}

// Self-hosted VPS API — each reading is ALSO posted here, IN ADDITION to Supabase
// (dual-write). This lets the project's own backend + Grafana receive live hardware
// data while the mobile app keeps reading from Supabase. Set to "" to disable.
const char* SECONDARY_API_URL = "https://38.242.246.126:8443/api/readings";

void postToSecondary(const String& body) {
  if (strlen(SECONDARY_API_URL) == 0) return;
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();               // accept the VPS self-signed certificate
  HTTPClient http;
  http.setTimeout(4000);
  if (!http.begin(client, SECONDARY_API_URL)) {
    Serial.println(F("[Cloud2] begin() failed"));
    return;
  }
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  Serial.printf("[Cloud2] VPS API POST HTTP %d\n", code);
  http.end();
  client.stop();                      // free TLS fd immediately
}

void postToCloud() {
  if (cloudUrl.length() == 0) return;
  if (WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastCloudPost < 10000) return;

  JsonDocument doc;
  doc["device_id"]      = "AGRIBOT-SENSORS";
  if (!isnan(g_temp))    { doc["temperature"] = g_temp; }
  if (!isnan(g_humidity)){ doc["humidity"]    = g_humidity; }
  doc["soil_moisture"]  = soilPct(g_soil);
  doc["smoke_raw"]      = g_mq;
  doc["smoke_detected"] = (g_mq > 2500);
  doc["flame_raw"]      = g_flame;
  doc["flame_detected"] = g_flameDetected;
  doc["gps_valid"]      = g_gpsValid;
  doc["satellites"]     = g_sats;
  if (g_gpsValid) {
    doc["latitude"]   = g_lat;
    doc["longitude"]  = g_lng;
    doc["altitude"]   = g_alt;
    doc["speed_kmph"] = g_speed;
  }
  doc["uptime_ms"] = (uint64_t)millis();

  String body;
  serializeJson(doc, body);

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.setTimeout(4000);

  if (!http.begin(client, buildCloudPostUrl())) {
    Serial.println(F("[Cloud] http.begin() failed"));
    return;
  }
  http.addHeader("Content-Type", "application/json");
  if (cloudKey.length() > 0) {
    http.addHeader("apikey",        cloudKey);
    http.addHeader("Authorization", "Bearer " + cloudKey);
  }
  http.addHeader("Prefer", "return=minimal");

  int code = http.POST(body);
  lastCloudPost = millis();
  Serial.printf("[Cloud] POST HTTP %d\n", code);
  http.end();
  client.stop();  // free TLS fd immediately

  // Dual-write: also send the same reading to the self-hosted VPS API.
  postToSecondary(body);
}

/**
 * POST /cloud-config
 * Body: { "url": "https://xxxx.supabase.co", "key": "eyJhb..." }
 */
void handleCloudConfig() {
  addCORS();
  if (server.method() != HTTP_POST) {
    server.send(405, "application/json", "{\"error\":\"method not allowed\"}");
    return;
  }
  if (!server.hasArg("plain") || server.arg("plain").length() == 0) {
    server.send(400, "application/json", "{\"error\":\"empty body\"}");
    return;
  }

  JsonDocument req;
  if (deserializeJson(req, server.arg("plain"))) {
    server.send(400, "application/json", "{\"error\":\"invalid JSON\"}");
    return;
  }

  const char* url = req["url"] | "";
  const char* key = req["key"] | "";
  if (strlen(url) == 0) {
    server.send(400, "application/json", "{\"error\":\"url required\"}");
    return;
  }

  prefs.begin("cloud", false);
  prefs.putString("url", url);
  prefs.putString("key", key);
  prefs.end();

  cloudUrl = url;
  cloudKey = key;
  lastCloudPost = 0;

  Serial.printf("[Cloud] Config saved — %s\n", url);

  JsonDocument res;
  res["ok"]  = true;
  res["url"] = url;
  String body;
  serializeJson(res, body);
  server.send(200, "application/json", body);
}

// ── Cloud command polling ─────────────────────────────────────────────────────

void pollCloudCommands() {
  if (cloudUrl.length() == 0 || cloudKey.length() == 0) {
    static unsigned long t = 0;
    if (millis() - t > 10000) { t = millis(); Serial.println(F("[CMD] No cloud config")); }
    return;
  }
  if (WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastCmdPoll < CMD_POLL_MS) return;
  lastCmdPoll = millis();

  String base = cloudUrl;
  if (base.endsWith("/")) base.remove(base.length() - 1);
  if (base.indexOf("supabase.co") < 0) return;

  String getUrl = base + "/rest/v1/robot_commands"
                         "?status=eq.pending"
                         "&order=created_at.asc"
                         "&limit=5"
                         "&select=id,command";

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.setTimeout(3000);

  if (!http.begin(client, getUrl)) return;
  http.addHeader("apikey",        cloudKey);
  http.addHeader("Authorization", "Bearer " + cloudKey);
  http.addHeader("Accept",        "application/json");

  int code = http.GET();
  if (code != 200) {
    Serial.printf("[CMD] Poll HTTP %d\n", code);
    http.end();
    client.stop();  // free TLS fd immediately
    return;
  }

  String payload = http.getString();
  http.end();
  client.stop();  // free TLS fd immediately

  JsonDocument doc;
  if (deserializeJson(doc, payload) != DeserializationError::Ok) return;
  JsonArray rows = doc.as<JsonArray>();
  if (rows.size() == 0) return;

  Serial.printf("[CMD] %d pending\n", (int)rows.size());

  for (JsonObject row : rows) {
    long long   id  = row["id"] | (long long)0;
    const char* cmd = row["command"] | "";
    if (id == 0 || strlen(cmd) == 0) continue;

    // Forward to ESP32-Motors
    forwardToMotors(String(cmd));
    Serial.printf("[CMD] forwarded: %s  (id=%lld)\n", cmd, id);

    // Mark done in Supabase
    String patchUrl = base + "/rest/v1/robot_commands?id=eq." + String((long)id);
    WiFiClientSecure pClient;
    pClient.setInsecure();
    HTTPClient pHttp;
    pHttp.setTimeout(2000);
    if (pHttp.begin(pClient, patchUrl)) {
      pHttp.addHeader("apikey",        cloudKey);
      pHttp.addHeader("Authorization", "Bearer " + cloudKey);
      pHttp.addHeader("Content-Type",  "application/json");
      pHttp.addHeader("Prefer",        "return=minimal");
      int pCode = pHttp.PATCH("{\"status\":\"done\"}");
      Serial.printf("[CMD] PATCH id=%lld HTTP %d\n", id, pCode);
      pHttp.end();
      pClient.stop();  // free TLS fd immediately
    }
  }
}

// ── Setup & Loop ──────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println(F("\n========================================"));
  Serial.println(F("  AGRIBOT-SENSORS  v4.0"));
  Serial.println(F("  Sensors + GPS + WiFi AP + Cloud"));
  Serial.println(F("  Commands forwarded to ESP32-Motors"));
  Serial.println(F("========================================"));

  GPS_Serial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  dht.begin();
  pinMode(MQ_PIN,    INPUT);
  pinMode(FLAME_PIN, INPUT);
  pinMode(SOIL_PIN,  INPUT);

  // Load saved credentials
  prefs.begin("wifi", true);
  routerSSID = prefs.getString("ssid", "");
  routerPass = prefs.getString("pass", "");
  prefs.end();

  prefs.begin("cloud", true);
  cloudUrl = prefs.getString("url", "");
  cloudKey = prefs.getString("key", "");
  prefs.end();

  if (cloudUrl.length() > 0) Serial.printf("[Cloud] %s\n", cloudUrl.c_str());
  else Serial.println(F("[Cloud] Not configured"));

  // Start AP
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(AP_SSID, AP_PASS);
  // Disable WiFi modem sleep — default power-save delays the radio's
  // response to incoming packets by 100-300ms, which makes every /cmd
  // request from the phone feel laggy. Joystick commands need to land
  // as fast as the radio can manage.
  WiFi.setSleep(false);
  delay(200);
  Serial.printf("[WiFi] AP  SSID: %s  IP: %s\n",
    AP_SSID, WiFi.softAPIP().toString().c_str());

  // mDNS — lets ESP32-Motors find this device, and lets us discover Motors
  // ("agribot-motors.local") when both join the same router.
  if (MDNS.begin("agribot-sensors")) {
    MDNS.addService("http", "tcp", 80);
    Serial.println(F("[mDNS] agribot-sensors.local"));
  }

  if (routerSSID.length() > 0) {
    Serial.printf("[WiFi] Router: %s — connecting...\n", routerSSID.c_str());
    WiFi.begin(routerSSID.c_str(), routerPass.c_str());
    staConnecting = true;
    staRetryAt    = millis() + 30000;
  }

  // HTTP routes
  server.on("/",                    HTTP_GET,     handleRoot);
  server.on("/sensors",             HTTP_GET,     handleSensors);
  server.on("/health",              HTTP_GET,     handleHealth);
  server.on("/devices",             HTTP_GET,     handleDevices);
  server.on("/cmd",                 HTTP_GET,     handleCmd);
  server.on("/wifi-config",         HTTP_POST,    handleWifiConfig);
  server.on("/trajectory",          HTTP_POST,    handleTrajectory);
  server.on("/cloud-config",        HTTP_POST,    handleCloudConfig);
  // Motors proxy — phone can't reach 192.168.4.2 directly (AP client isolation)
  server.on("/motors/health",       HTTP_GET,     handleMotorsHealth);
  server.on("/motors/wifi-config",  HTTP_POST,    handleMotorsWifiConfig);
  server.on("/motors/mqtt-config",  HTTP_POST,    handleMotorsMqttConfig);
  server.on("/motors/reboot",       HTTP_POST,    []() {
    addCORS();
    String resp = proxyPostMotors("/reboot", "{}");
    server.send(resp.length() > 0 ? 200 : 502, "application/json",
      resp.length() > 0 ? resp : "{\"error\":\"motors offline\"}");
  });
  server.on("/motors/reboot",       HTTP_OPTIONS, handleOptions);

  server.on("/sensors",             HTTP_OPTIONS, handleOptions);
  server.on("/health",              HTTP_OPTIONS, handleOptions);
  server.on("/devices",             HTTP_OPTIONS, handleOptions);
  server.on("/cmd",                 HTTP_OPTIONS, handleOptions);
  server.on("/wifi-config",         HTTP_OPTIONS, handleOptions);
  server.on("/trajectory",          HTTP_OPTIONS, handleOptions);
  server.on("/cloud-config",        HTTP_OPTIONS, handleOptions);
  server.on("/motors/health",       HTTP_OPTIONS, handleOptions);
  server.on("/motors/wifi-config",  HTTP_OPTIONS, handleOptions);
  server.on("/motors/mqtt-config",  HTTP_OPTIONS, handleOptions);

  server.onNotFound([]() {
    addCORS();
    server.send(404, "application/json", "{\"error\":\"not found\"}");
  });

  server.begin();
  cmdUdp.begin(0); // ephemeral local port — used for sending only
  Serial.println(F("[HTTP] Ready → http://192.168.4.1"));
  Serial.printf("[FWD]  Motors → udp://%s:%d/cmd\n", motorsIP.c_str(), MOTORS_CMD_UDP_PORT);
  Serial.printf("[FWD]  Camera → http://%s:8080/stream (future RPi)\n", CAMERA_IP);
  Serial.println(F("========================================\n"));
}

void loop() {
  server.handleClient();

  // Feed GPS parser
  while (GPS_Serial.available()) {
    gps.encode(GPS_Serial.read());
  }

  // Monitor STA connection
  if (staConnecting) {
    if (WiFi.status() == WL_CONNECTED) {
      staConnecting = false;
      Serial.printf("[WiFi] Router connected — STA IP: %s\n",
                    WiFi.localIP().toString().c_str());
      resolveMotorsIP();
    } else if (millis() > staRetryAt) {
      Serial.printf("[WiFi] Retry: %s\n", routerSSID.c_str());
      WiFi.disconnect();
      delay(500);
      WiFi.begin(routerSSID.c_str(), routerPass.c_str());
      staRetryAt = millis() + 30000;
    }
  }

  // Sensor read every 2 s
  if (millis() - lastRead >= 2000) {
    lastRead = millis();

    g_temp     = dht.readTemperature();
    g_humidity = dht.readHumidity();
    g_mq       = analogRead(MQ_PIN);
    g_soil     = analogRead(SOIL_PIN);

    // Flame sensor (HW-484): the ESP32 ADC on this pin is noisy enough that a
    // single sample can momentarily dip below the threshold with no flame
    // present, causing false "FLAME DETECTED" alerts. Average several samples
    // and require the average to stay low for a few consecutive reads (~6s)
    // before reporting it as detected.
    {
      long sum = 0;
      for (int i = 0; i < 8; i++) { sum += analogRead(FLAME_PIN); delayMicroseconds(200); }
      g_flame = sum / 8;
    }
    if (g_flame < FLAME_THRESHOLD) g_flameLowCount++;
    else                           g_flameLowCount = 0;
    g_flameDetected = g_flameLowCount >= 3;

    if (gps.satellites.isValid()) g_sats = gps.satellites.value();
    if (gps.location.isValid()) {
      g_gpsValid = true;
      g_lat  = gps.location.lat();
      g_lng  = gps.location.lng();
      g_sats = gps.satellites.value();
      g_alt  = gps.altitude.meters();
      g_speed = gps.speed.kmph();
    }

    Serial.println(F("─── SENSORS ─────────────────────────────"));
    if (!isnan(g_temp))
      Serial.printf("  Temp: %.1f°C  Hum: %.1f%%\n", g_temp, g_humidity);
    else
      Serial.println(F("  DHT11: read error"));
    Serial.printf("  Soil: %.0f%%  MQ: %d %s  Flame: %d %s\n",
      soilPct(g_soil),
      g_mq,   g_mq > 2500    ? "SMOKE!" : "ok",
      g_flame, g_flameDetected ? "FLAME!" : "ok");
    if (g_gpsValid)
      Serial.printf("  GPS: %.6f, %.6f  Sats:%d  Speed:%.1fkm/h\n",
        g_lat, g_lng, g_sats, g_speed);
    else
      Serial.printf("  GPS: no fix  visible:%d\n", g_sats);
    Serial.printf("  AP clients:%d  Motors:%s  Router:%s\n",
      WiFi.softAPgetStationNum(),
      motorsOnline ? "online" : "offline",
      WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "none");
    Serial.println(F("─────────────────────────────────────────"));

    if (!phoneOnAP()) postToCloud();
  }

  if (!phoneOnAP()) pollCloudCommands();

  // Motors keepalive — probe every 30 s so motorsOnline stays accurate.
  // Also re-resolve via mDNS in case Motors' router DHCP IP changed.
  if (millis() - lastMotorsKA > MOTORS_KA_MS) {
    lastMotorsKA = millis();
    resolveMotorsIP();
    Serial.printf("[KA] Probing motors at %s ...\n", motorsIP.c_str());
    String resp = proxyGetMotors("/health");
    if (resp.length() > 0) {
      motorsOnline = true;
      Serial.println(F("[KA] ✓ motors reachable"));
    } else {
      motorsOnline = false;
      Serial.println(F("[KA] ✗ motors unreachable"));
    }
  }
}
