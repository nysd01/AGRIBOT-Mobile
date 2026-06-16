import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  PanResponder,
  useWindowDimensions,
  StyleSheet,
  TouchableOpacity,
  Alert,
  GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Accelerometer } from 'expo-sensors';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { remoteStyles } from '@/styles/remote.styles';
import { useESP32Sensors } from '@/hooks/use-esp32-sensors';
import { useESP32IP } from '@/context/ESP32Context';
import { useAppMode } from '@/context/AppModeContext';
import { useMqtt } from '@/hooks/use-mqtt';
import { useBleRemote } from '@/hooks/use-ble-remote';

// ─── Types ────────────────────────────────────────────────────────────────────

type Coord     = { lat: number; lng: number };
type NormPoint = { x: number; y: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function normalizeTrail(trail: Coord[], w: number, h: number): NormPoint[] {
  if (trail.length < 1) return [];
  const lats = trail.map(p => p.lat);
  const lngs = trail.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const rangeLat = maxLat - minLat || 0.0001;
  const rangeLng = maxLng - minLng || 0.0001;
  const pad = 20;
  return trail.map(p => ({
    x: pad + ((p.lng - minLng) / rangeLng) * (w - pad * 2),
    y: (h - pad) - ((p.lat - minLat) / rangeLat) * (h - pad * 2),
  }));
}

function LineSegment({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  const dx = x2 - x1, dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 1) return null;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <View style={{
      position: 'absolute', width: length, height: 2, backgroundColor: color,
      left: (x1 + x2) / 2 - length / 2, top: (y1 + y2) / 2 - 1,
      transform: [{ rotate: `${angle}deg` }],
    }} />
  );
}

function PathChart({ trail, waypoints, onTap, drawMode }: {
  trail: Coord[]; waypoints: NormPoint[]; onTap: (pt: NormPoint) => void; drawMode: boolean;
}) {
  const CHART_W = 280, CHART_H = 180;
  const normTrail = useMemo(() => normalizeTrail(trail, CHART_W, CHART_H), [trail]);
  const handlePress = (e: GestureResponderEvent) => {
    if (!drawMode) return;
    const { locationX, locationY } = e.nativeEvent;
    onTap({ x: locationX, y: locationY });
  };
  return (
    <TouchableOpacity activeOpacity={1} onPress={handlePress}>
      <View style={{ width: CHART_W, height: CHART_H, backgroundColor: '#0C0E0F', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#222' }}>
        {[0.25, 0.5, 0.75].map(f => (
          <React.Fragment key={f}>
            <View style={{ position: 'absolute', left: 0, right: 0, top: f * CHART_H, height: 1, backgroundColor: '#1a1a1a' }} />
            <View style={{ position: 'absolute', top: 0, bottom: 0, left: f * CHART_W, width: 1, backgroundColor: '#1a1a1a' }} />
          </React.Fragment>
        ))}
        {normTrail.length > 1 && normTrail.map((pt, i) => {
          if (i === 0) return null;
          const prev = normTrail[i - 1];
          return <LineSegment key={i} x1={prev.x} y1={prev.y} x2={pt.x} y2={pt.y} color="#72F88A" />;
        })}
        {normTrail.map((pt, i) => (
          <View key={'d' + i} style={{
            position: 'absolute',
            width: i === normTrail.length - 1 ? 10 : 5, height: i === normTrail.length - 1 ? 10 : 5,
            borderRadius: i === normTrail.length - 1 ? 5 : 2.5,
            backgroundColor: i === normTrail.length - 1 ? '#58C95F' : '#72F88A88',
            left: pt.x - (i === normTrail.length - 1 ? 5 : 2.5), top: pt.y - (i === normTrail.length - 1 ? 5 : 2.5),
          }} />
        ))}
        {waypoints.length > 1 && waypoints.map((pt, i) => {
          if (i === 0) return null;
          const prev = waypoints[i - 1];
          return <LineSegment key={'w' + i} x1={prev.x} y1={prev.y} x2={pt.x} y2={pt.y} color="#F4A460" />;
        })}
        {waypoints.map((pt, i) => (
          <View key={'wd' + i} style={{
            position: 'absolute', width: 8, height: 8, borderRadius: 4,
            backgroundColor: '#F4A460', borderWidth: 1.5, borderColor: '#fff',
            left: pt.x - 4, top: pt.y - 4,
          }} />
        ))}
        {normTrail.length === 0 && waypoints.length === 0 && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="map-marker-path" size={28} color="#333" />
            <Text style={{ color: '#444', fontSize: 11, marginTop: 6, textAlign: 'center' }}>
              {drawMode ? 'Tap to place waypoints' : 'No GPS trail yet'}
            </Text>
          </View>
        )}
        {drawMode && (
          <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: '#F4A46088', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>DRAW MODE</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Camera feed ──────────────────────────────────────────────────────────────
// Memoized so the joystick loop (stickPos/direction/lastCmd updating at ~20 Hz)
// never re-renders the native camera surface — that re-render churn was the
// source of the camera lag. The feed itself stays fixed (no tilt transform).

const LandscapeCameraFeed = React.memo(function LandscapeCameraFeed({ active }: { active: boolean }) {
  return active ? (
    <CameraView style={StyleSheet.absoluteFill} facing="back" />
  ) : (
    <View style={[StyleSheet.absoluteFill, lsStyles.offBg]}>
      <MaterialCommunityIcons name="robot-industrial" size={180} color="#58C95F" style={{ opacity: 0.12 }} />
    </View>
  );
});

const PortraitCameraFeed = React.memo(function PortraitCameraFeed({ active }: { active: boolean }) {
  return active ? (
    <CameraView style={StyleSheet.absoluteFill} facing="back" />
  ) : (
    <>
      <MaterialCommunityIcons name="robot-industrial" size={120} color="#58C95F" style={{ opacity: 0.5 }} />
      <Text style={remoteStyles.liveVideoLabel}>Rotate to landscape for full-screen camera</Text>
    </>
  );
});

// ─── Camera pan control ───────────────────────────────────────────────────────
// The camera feed itself is the control: drag anywhere on it to pan, pivoting
// around the center of the feed. While the drag stays in a direction, the
// CU/CD/CX/CY command repeats every CAM_THROTTLE_MS; on release CS is sent once.
// Independent of the wheel joystick/gyro — gyro never feeds these commands.

const CAM_THROTTLE_MS = 50;
const CAM_MAX_D = 70;

function CameraPanControl({ sendCamDir, ringSize }: { sendCamDir: (cmd: string) => void; ringSize: number }) {
  const [layout, setLayout] = useState({ w: 0, h: 0 });
  const [stick,  setStick]  = useState({ x: 0, y: 0 });
  const [dir,    setDir]    = useState<string | null>(null);
  const layoutRef    = useRef({ w: 0, h: 0 });
  const dirRef       = useRef<string | null>(null);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const setActiveDir = useCallback((newDir: string | null) => {
    if (dirRef.current === newDir) return;
    dirRef.current = newDir;
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (newDir) {
      const cmd = newDir === 'up' ? 'CU' : newDir === 'down' ? 'CD' : newDir === 'left' ? 'CX' : 'CY';
      sendCamDir(cmd);
      intervalRef.current = setInterval(() => sendCamDir(cmd), CAM_THROTTLE_MS);
    } else {
      sendCamDir('CS');
    }
    setDir(newDir);
  }, [sendCamDir]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderMove: (_, { dx, dy }) => {
        const dist  = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const fx = dist > CAM_MAX_D ? Math.cos(angle) * CAM_MAX_D : dx;
        const fy = dist > CAM_MAX_D ? Math.sin(angle) * CAM_MAX_D : dy;
        setStick({ x: fx, y: fy });
        const deg = (angle * 180) / Math.PI;
        if      (dist < 20)                 setActiveDir(null);
        else if (deg > -45  && deg <= 45)   setActiveDir('right');
        else if (deg > 45   && deg <= 135)  setActiveDir('down');
        else if (deg > 135  || deg <= -135) setActiveDir('left');
        else                                 setActiveDir('up');
      },
      onPanResponderRelease: () => {
        setStick({ x: 0, y: 0 });
        setActiveDir(null);
      },
    })
  ).current;

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        layoutRef.current = { w: width, h: height };
        setLayout({ w: width, h: height });
      }}
      {...panResponder.panHandlers}
    >
      {/* Pivot reticle — invisible but still occupies the touch area above */}
      <View
        pointerEvents="none"
        style={[
          camPanStyles.ring,
          { width: ringSize, height: ringSize, borderRadius: ringSize / 2, left: layout.w / 2 - ringSize / 2, top: layout.h / 2 - ringSize / 2, opacity: 0 },
        ]}
      >
        <Text style={[camPanStyles.arrow, camPanStyles.arrowUp,    dir === 'up'    && camPanStyles.arrowActive]}>▲</Text>
        <Text style={[camPanStyles.arrow, camPanStyles.arrowDown,  dir === 'down'  && camPanStyles.arrowActive]}>▼</Text>
        <Text style={[camPanStyles.arrow, camPanStyles.arrowLeft,  dir === 'left'  && camPanStyles.arrowActive]}>◄</Text>
        <Text style={[camPanStyles.arrow, camPanStyles.arrowRight, dir === 'right' && camPanStyles.arrowActive]}>►</Text>
        <View style={[camPanStyles.dot, { transform: [{ translateX: stick.x }, { translateY: stick.y }] }]} />
      </View>
    </View>
  );
}

// Mirrors the tabBarStyle set in app/(tabs)/_layout.tsx screenOptions —
// used to restore it when leaving landscape (setOptions overrides screenOptions).
const TAB_BAR_STYLE = {
  backgroundColor: '#1B1F1C',
  borderTopWidth:  0,
  marginHorizontal: 12,
  marginBottom:    10,
  borderRadius:    22,
  height:          74,
  position:        'absolute' as const,
  paddingTop:      8,
  paddingBottom:   10,
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RemoteScreen() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const navigation = useNavigation();

  // Hide the bottom tab bar in landscape so the camera/joystick HUD has the
  // full screen — restore it when back in portrait or leaving the screen.
  // (tabBarStyle must be set via this screen's own navigation object — it
  // propagates up to the parent Tabs navigator's tab bar.)
  useEffect(() => {
    navigation.setOptions({ tabBarStyle: isLandscape ? { display: 'none' } : TAB_BAR_STYLE });
    return () => navigation.setOptions({ tabBarStyle: TAB_BAR_STYLE });
  }, [isLandscape, navigation]);

  const { espIP } = useESP32IP();
  const { isOnline, isOnlineMode, cloudConfig } = useAppMode();
  const { mqttConnected, publishCmd } = useMqtt();
  const { sensorData, isConnected } = useESP32Sensors({ pollInterval: 1000 });
  const { bleStatus, bleConnected, bleDeviceName, scanAndConnect, disconnectBle, sendBleCmd } = useBleRemote();

  // ── State ──────────────────────────────────────────────────────────────────
  const [isAutonomous,   setIsAutonomous]   = useState(true);
  const [direction,      setDirection]      = useState<string | null>(null);
  const [stickPos,       setStickPos]       = useState({ x: 0, y: 0 });
  const [gyroEnabled,    setGyroEnabled]    = useState(false);
  const [cameraActive,   setCameraActive]   = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [drawMode,       setDrawMode]       = useState(false);
  const [userWaypoints,  setUserWaypoints]  = useState<NormPoint[]>([]);
  const [gpsTrail,       setGpsTrail]       = useState<Coord[]>([]);
  const [lastCmd,        setLastCmd]        = useState<string>('');   // visual feedback
  // Offline-mode command channel: WiFi (HTTP to ESP32) or direct Bluetooth (BLE to ESP32-Motors)
  const [controlChannel, setControlChannel] = useState<'wifi' | 'bluetooth'>('wifi');
  const joystickRef = useRef(null);

  const handleSelectBluetooth = useCallback(() => {
    setControlChannel('bluetooth');
    if (!bleConnected) void scanAndConnect();
  }, [bleConnected, scanAndConnect]);

  const handleSelectWifi = useCallback(() => {
    setControlChannel('wifi');
    if (bleConnected) void disconnectBle();
  }, [bleConnected, disconnectBle]);

  // ── Live sensor values ─────────────────────────────────────────────────────
  const tempC    = sensorData?.domino4?.weather?.temperatureC ?? sensorData?.temperatureC;
  const humidity = sensorData?.domino4?.weather?.humidityPct  ?? sensorData?.humidityPct;
  const soil     = sensorData?.domino4?.soil?.moisturePct     ?? sensorData?.soilMoisturePct;
  const phValue  = sensorData?.adc?.ph          ?? sensorData?.ph;
  const battPct  = sensorData?.adc?.batteryPct  ?? sensorData?.batteryPct;
  const uptimeSec = sensorData?.systemInfo?.uptimeSeconds ?? 0;
  const gpsData  = sensorData?.location?.gps;

  useEffect(() => {
    if (!gpsData?.lat || !gpsData?.lng) return;
    setGpsTrail(prev => {
      const last = prev[prev.length - 1];
      if (last && last.lat === gpsData.lat && last.lng === gpsData.lng) return prev;
      return [...prev.slice(-200), { lat: gpsData.lat, lng: gpsData.lng }];
    });
  }, [gpsData]);

  // ── Camera toggle ──────────────────────────────────────────────────────────
  const handleCameraToggle = async () => {
    if (!cameraActive) {
      if (!cameraPermission?.granted) {
        const result = await requestCameraPermission();
        if (!result.granted) return;
      }
      setCameraActive(true);
    } else {
      setCameraActive(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  COMMAND SENDER — dual mode
  //
  //  OFFLINE: GET http://{espIP}/cmd?c=<cmd>   → ESP32 → Serial2 → Mega
  //           Latency ~80 ms.  Requires phone on same WiFi as ESP32.
  //
  //  ONLINE:  POST to Supabase robot_commands table
  //           ESP32 polls the table every 500 ms and executes commands.
  //           Latency ~500 ms.  Works from anywhere over the internet.
  // ═══════════════════════════════════════════════════════════════════════════

  // Max motor-command rate. A joystick drag fires onPanResponderMove at up to
  // 60 Hz with a slightly different "M<left>,<right>" string every time, so
  // throttling must be time-based (not "skip if same cmd") or every pixel of
  // movement becomes its own publish/request — flooding MQTT/HTTP and leaving
  // the robot draining a stale backlog (perceived as lag in both modes).
  const MOTOR_THROTTLE_MS = 50; // ~20 cmds/sec
  const throttleRef = useRef({ time: 0, cmd: '' });

  // Refs for the camera-pan command sender (can't capture changing state directly)
  const isOnlineRef       = useRef(isOnlineMode);
  const espIPRef          = useRef(espIP);
  const publishCmdRef     = useRef<(cmd: string) => boolean>(() => false);
  const controlChannelRef = useRef(controlChannel);
  const sendBleCmdRef     = useRef<(cmd: string) => boolean>(() => false);
  useEffect(() => { isOnlineRef.current       = isOnlineMode; },    [isOnlineMode]);
  useEffect(() => { espIPRef.current          = espIP; },           [espIP]);
  useEffect(() => { publishCmdRef.current     = publishCmd; },      [publishCmd]);
  useEffect(() => { controlChannelRef.current = controlChannel; },  [controlChannel]);
  useEffect(() => { sendBleCmdRef.current     = sendBleCmd; },       [sendBleCmd]);

  /** Insert one command row into Supabase (online mode fallback). */
  const postCloudCmd = useCallback(async (cmd: string) => {
    if (!cloudConfig?.serverUrl || !cloudConfig?.apiKey) return;
    const base = cloudConfig.serverUrl.replace(/\/$/, '');
    const url  = `${base}/rest/v1/robot_commands`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        cloudConfig.apiKey,
          'Authorization': `Bearer ${cloudConfig.apiKey}`,
          'Prefer':        'return=minimal',
        },
        body:   JSON.stringify({ command: cmd }),
        signal: ctrl.signal,
      });
    } catch { /* silent */ }
    finally { clearTimeout(timer); }
  }, [cloudConfig]);

  /** Direct GET to ESP32 (offline mode). */
  const postDirectCmd = useCallback(async (cmd: string) => {
    if (!espIP) return;
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 300);
    try {
      await fetch(`http://${espIP}/cmd?c=${encodeURIComponent(cmd)}`, {
        signal: ctrl.signal,
      });
    } catch { /* silent */ }
    finally { clearTimeout(timer); }
  }, [espIP]);

  const sendMotorCmd = useCallback(async (cmd: string) => {
    const now = Date.now();
    // 'S' (stop) always goes through immediately — safety-critical and the
    // only command guaranteed not to repeat every frame. Everything else is
    // throttled by time regardless of content.
    if (cmd !== 'S' && now - throttleRef.current.time < MOTOR_THROTTLE_MS) return;
    throttleRef.current = { time: now, cmd };
    setLastCmd(cmd);
    if (isOnlineMode) {
      // Primary: MQTT (~40 ms). Fallback: Supabase (~500 ms) if MQTT not connected.
      const ok = publishCmd(cmd);
      if (!ok) void postCloudCmd(cmd);
    } else if (controlChannel === 'bluetooth') {
      // Direct BLE to ESP32-Motors — no WiFi link needed at all.
      sendBleCmd(cmd);
    } else {
      void postDirectCmd(cmd);
    }
  }, [isOnlineMode, controlChannel, publishCmd, postCloudCmd, postDirectCmd, sendBleCmd]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  JOYSTICK → MOTOR COMMANDS
  //  Runs whenever stick position or direction changes.
  //  Uses tank/differential drive: M<left>,<right>
  // ═══════════════════════════════════════════════════════════════════════════

  const prevDirRef     = useRef<string | null>(null);
  const lastMotorCmdRef = useRef<string>('S');

  useEffect(() => {
    if (isAutonomous) return;

    if (!direction) {
      lastMotorCmdRef.current = 'S';
      // Only fire stop once per release (not every render while stopped)
      if (prevDirRef.current !== null) {
        void sendMotorCmd('S');
        prevDirRef.current = null;
      }
      return;
    }

    prevDirRef.current = direction;

    // Normalised joystick position: -1 … +1 on each axis
    const nx =  stickPos.x / 60;          // right = positive
    const ny = -stickPos.y / 60;          // up    = positive (forward)

    // Differential (tank) drive mixing
    const rawL = (ny + nx) * 255;
    const rawR = (ny - nx) * 255;
    const left  = Math.round(clamp(rawL, -255, 255));
    const right = Math.round(clamp(rawR, -255, 255));

    const cmd = `M${left},${right}`;
    lastMotorCmdRef.current = cmd;
    void sendMotorCmd(cmd);
  }, [direction, stickPos, isAutonomous, sendMotorCmd]);

  // Holding a steady tilt (gyro) or a steady stick position produces no new
  // direction/stickPos state, so the effect above only fires once. But the
  // ESP32 watchdog (WATCHDOG_MS = 2000ms) stops the motors if it doesn't see
  // a command for 2s — resend the last motor command periodically while a
  // direction is held so the robot keeps moving without needing to "shake".
  useEffect(() => {
    const id = setInterval(() => {
      if (prevDirRef.current) void sendMotorCmd(lastMotorCmdRef.current);
    }, 500);
    return () => clearInterval(id);
  }, [sendMotorCmd]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  JOYSTICK PAN RESPONDER  (controls stick visuals + sets direction/stickPos)
  // ═══════════════════════════════════════════════════════════════════════════

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {},
      onPanResponderMove: (_, { dx, dy }) => {
        const dist  = Math.sqrt(dx * dx + dy * dy);
        const maxD  = 60;
        const angle = Math.atan2(dy, dx);
        const fx = dist > maxD ? Math.cos(angle) * maxD : dx;
        const fy = dist > maxD ? Math.sin(angle) * maxD : dy;
        setStickPos({ x: fx, y: fy });
        const deg = (angle * 180) / Math.PI;
        if      (dist < 20)                    setDirection(null);
        else if (deg > -45  && deg <= 45)      setDirection('right');
        else if (deg > 45   && deg <= 135)     setDirection('down');
        else if (deg > 135  || deg <= -135)    setDirection('left');
        else                                   setDirection('up');
      },
      onPanResponderRelease: () => {
        setStickPos({ x: 0, y: 0 });
        setDirection(null);
      },
    })
  ).current;

  // ═══════════════════════════════════════════════════════════════════════════
  //  CAMERA PAN COMMAND SENDER
  //  Used by CameraPanControl: while dragging in a direction, CU/CD/CX/CY
  //  repeats every CAM_THROTTLE_MS; release → CS once. Entirely separate
  //  from the wheel/gyro path below — gyro tilt never reaches this function.
  // ═══════════════════════════════════════════════════════════════════════════

  const sendCamDir = useCallback((cmd: string) => {
    setLastCmd(cmd);
    if (isOnlineRef.current) {
      publishCmdRef.current(cmd);
    } else if (controlChannelRef.current === 'bluetooth') {
      sendBleCmdRef.current(cmd);
    } else {
      const ip = espIPRef.current;
      if (ip) {
        const ctrl  = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 300);
        fetch(`http://${ip}/cmd?c=${encodeURIComponent(cmd)}`, { signal: ctrl.signal })
          .catch(() => {})
          .finally(() => clearTimeout(timer));
      }
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  //  GYROSCOPE → MOTOR COMMANDS  (tilt phone to steer — wheels only, never camera)
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!gyroEnabled || isAutonomous) return;
    Accelerometer.setUpdateInterval(100);
    const sub = Accelerometer.addListener(({ x, y }) => {
      // Raw accelerometer axes are relative to the device's physical frame,
      // not the screen. Remap them to "tilt left/right" / "tilt forward/back"
      // based on how the phone is currently being held.
      const tiltX = isLandscape ? -y : x;   // left/right tilt → turn
      const tiltY = isLandscape ? -x : -y;  // forward/back tilt → drive
      const magnitude = Math.sqrt(tiltX * tiltX + tiltY * tiltY);
      if (magnitude < 0.2) {
        setDirection(null);
        setStickPos({ x: 0, y: 0 });
        return;
      }
      const scaleFactor = 60 / 10;
      const sx = (tiltX / 10) * scaleFactor;
      const sy = (tiltY / 10) * scaleFactor;
      const dist  = Math.sqrt(sx * sx + sy * sy);
      const maxD  = 60;
      const angle = Math.atan2(sy, sx);
      const fx = dist > maxD ? Math.cos(angle) * maxD : sx;
      const fy = dist > maxD ? Math.sin(angle) * maxD : sy;
      setStickPos({ x: fx, y: fy });
      const deg = (angle * 180) / Math.PI;
      if      (dist < 20)                 setDirection(null);
      else if (deg > -45  && deg <= 45)   setDirection('right');
      else if (deg > 45   && deg <= 135)  setDirection('down');
      else if (deg > 135  || deg <= -135) setDirection('left');
      else                                setDirection('up');
    });
    return () => sub.remove();
  }, [gyroEnabled, isAutonomous, isLandscape]);

  // ── Display labels ──────────────────────────────────────────────────────────
  const dirLabel = direction === 'up' ? 'FORWARD' : direction === 'down' ? 'BACKWARD' :
                   direction === 'left' ? 'LEFT' : direction === 'right' ? 'RIGHT' : 'READY';
  const stickIcon = direction === 'up' ? 'chevron-up' : direction === 'down' ? 'chevron-down' :
                    direction === 'left' ? 'chevron-left' : direction === 'right' ? 'chevron-right' : 'circle';

  const fmt = (v: number | undefined, unit: string, decimals = 1) =>
    v !== undefined ? `${v.toFixed(decimals)}${unit}` : '--';

  // ═══════════════════════════════════════════════════════════════════════════
  //  LANDSCAPE MANUAL + CAMERA VIEW
  // ═══════════════════════════════════════════════════════════════════════════

  if (!isAutonomous && isLandscape) {
    return (
      <View style={StyleSheet.absoluteFill}>
        {/* Camera or dark background — memoized, fixed (no tilt transform) */}
        <LandscapeCameraFeed active={cameraActive} />

        {/* ── Drag anywhere on the camera to pan, pivoting from its center ── */}
        {cameraActive && <CameraPanControl sendCamDir={sendCamDir} ringSize={150} />}

        {/* Top-left */}
        <View style={lsStyles.topLeft}>
          <View style={lsStyles.modeBadge}>
            <View style={lsStyles.modeDot} />
            <Text style={lsStyles.modeText}>LIVE TELEMETRY</Text>
          </View>
          <Pressable onPress={() => setIsAutonomous(true)} style={lsStyles.autoBtn}>
            <Text style={lsStyles.autoBtnText}>AUTO</Text>
          </Pressable>
          {/* Gyro toggle — controls the wheels only, never the camera */}
          <Pressable
            onPress={() => setGyroEnabled(v => !v)}
            style={[lsStyles.gyroBtn, gyroEnabled && lsStyles.gyroBtnActive]}
          >
            <MaterialCommunityIcons name={gyroEnabled ? 'motion-sensor' : 'motion'} size={13} color={gyroEnabled ? '#070A0A' : '#58C95F'} />
            <Text style={[lsStyles.gyroBtnText, gyroEnabled && lsStyles.gyroBtnTextActive]}>
              {gyroEnabled ? 'Gyro ON' : 'Gyro OFF'}
            </Text>
          </Pressable>
          {!isOnlineMode && (
            <Pressable
              onPress={() => (controlChannel === 'wifi' ? handleSelectBluetooth() : handleSelectWifi())}
              style={[lsStyles.channelBtn, controlChannel === 'bluetooth' && lsStyles.channelBtnBle]}
            >
              <MaterialCommunityIcons
                name={controlChannel === 'bluetooth' ? 'bluetooth' : 'wifi'}
                size={13}
                color={controlChannel === 'bluetooth' ? (bleConnected ? '#4A9AFF' : '#F59E0B') : '#58C95F'}
              />
              <Text style={lsStyles.channelBtnText}>
                {controlChannel === 'bluetooth'
                  ? (bleConnected ? 'BLE' : bleStatus === 'scanning' || bleStatus === 'connecting' ? 'BLE…' : 'BLE ✕')
                  : 'WiFi'}
              </Text>
            </Pressable>
          )}
        </View>

        {/* HUD */}
        <View style={lsStyles.hud}>
          {gpsData && (
            <View style={lsStyles.hudItem}>
              <Text style={lsStyles.hudLabel}>LAT / LNG</Text>
              <Text style={[lsStyles.hudValue, { color: '#72F88A', fontSize: 10 }]}>
                {gpsData.lat.toFixed(4)}, {gpsData.lng.toFixed(4)}
              </Text>
            </View>
          )}
          <View style={lsStyles.hudItem}>
            <Text style={lsStyles.hudLabel}>SOIL pH</Text>
            <Text style={[lsStyles.hudValue, { color: '#58C95F' }]}>{fmt(phValue, '')}</Text>
          </View>
          <View style={lsStyles.hudItem}>
            <Text style={lsStyles.hudLabel}>MOISTURE</Text>
            <Text style={[lsStyles.hudValue, { color: '#58C95F' }]}>{fmt(soil, '%', 0)}</Text>
          </View>
          <View style={lsStyles.hudItem}>
            <Text style={lsStyles.hudLabel}>TEMP</Text>
            <Text style={[lsStyles.hudValue, { color: '#FF6B6B' }]}>{fmt(tempC, '°C')}</Text>
          </View>
          <View style={lsStyles.hudItem}>
            <Text style={lsStyles.hudLabel}>BATTERY</Text>
            <Text style={[lsStyles.hudValue, { color: battPct !== undefined && battPct < 20 ? '#FF4533' : '#58C95F' }]}>
              {fmt(battPct, '%', 0)}
            </Text>
          </View>
        </View>

        {/* Camera toggle */}
        <Pressable onPress={() => void handleCameraToggle()} style={lsStyles.camToggle}>
          <MaterialCommunityIcons name={cameraActive ? 'camera-off' : 'camera'} size={16} color="#fff" />
          <Text style={lsStyles.camToggleText}>{cameraActive ? 'Stop' : 'Camera'}</Text>
        </Pressable>

        {/* Last command sent */}
        {lastCmd !== '' && (
          <View style={lsStyles.cmdBadge}>
            <Text style={lsStyles.cmdBadgeText}>CMD: {lastCmd}</Text>
          </View>
        )}

        {/* Joystick (left side) — always visible. While gyro is on, touch is
            disabled (so it can't fight the tilt input) but the ring and stick
            stay on screen, driven by gyro tilt, with a GYRO badge overlay. */}
        <View style={lsStyles.joystickWrap}>
          <Text style={lsStyles.dirText}>{dirLabel}</Text>
          <View
            ref={joystickRef}
            style={lsStyles.joystickRing}
            {...(gyroEnabled ? {} : panResponder.panHandlers)}
          >
            <Text style={[lsStyles.ringLabel, lsStyles.ringTop,    direction === 'up'    && lsStyles.ringActive]}>▲</Text>
            <Text style={[lsStyles.ringLabel, lsStyles.ringBottom, direction === 'down'  && lsStyles.ringActive]}>▼</Text>
            <Text style={[lsStyles.ringLabel, lsStyles.ringLeft,   direction === 'left'  && lsStyles.ringActive]}>◄</Text>
            <Text style={[lsStyles.ringLabel, lsStyles.ringRight,  direction === 'right' && lsStyles.ringActive]}>►</Text>
            <View style={[lsStyles.stick, { transform: [{ translateX: stickPos.x }, { translateY: stickPos.y }] }]}>
              <View style={lsStyles.stickInner}>
                <MaterialCommunityIcons name={stickIcon} size={24} color="#070A0A" />
              </View>
            </View>
            {gyroEnabled && (
              <View style={lsStyles.gyroBadge}>
                <Text style={lsStyles.gyroBadgeText}>GYRO</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PORTRAIT LAYOUT
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <SafeAreaView style={remoteStyles.safe}>
      <ScrollView style={remoteStyles.container} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={remoteStyles.headerSection}>
          <Text style={remoteStyles.statusLabel}>
            {isConnected ? 'SYSTEM STATUS: ACTIVE' : 'ESP32 OFFLINE'}
          </Text>
          <Text style={remoteStyles.mainTitle}>
            {isAutonomous ? 'Autonomous\nCommand' : 'Manual\nControl'}
          </Text>
          <View style={remoteStyles.toggleContainer}>
            {['ON', 'OFF'].map((label, i) => {
              const active = i === 0 ? isAutonomous : !isAutonomous;
              return (
                <Pressable
                  key={label}
                  style={[remoteStyles.toggleButton, active ? remoteStyles.toggleActive : remoteStyles.toggleInactive]}
                  onPress={() => setIsAutonomous(i === 0)}
                >
                  <Text style={[remoteStyles.toggleText, active ? remoteStyles.toggleTextActive : remoteStyles.toggleTextInactive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={[remoteStyles.liveOperationBadge, !isAutonomous && remoteStyles.liveTelemetryBadge]}>
            <View style={[remoteStyles.liveOperationDot, !isAutonomous && remoteStyles.liveTelemetryDot]} />
            <Text style={remoteStyles.liveOperationText}>
              {isAutonomous ? 'LIVE OPERATION' : 'LIVE TELEMETRY'}
            </Text>
          </View>
          {isOnlineMode && (
            <View style={mqttBadgeStyle.wrap}>
              <View style={[mqttBadgeStyle.dot, { backgroundColor: mqttConnected ? '#58C95F' : '#F59E0B' }]} />
              <Text style={mqttBadgeStyle.text}>{mqttConnected ? 'MQTT ACTIVE' : 'MQTT…'}</Text>
            </View>
          )}
          {!isOnlineMode && !isAutonomous && (
            <View style={channelStyle.wrap}>
              <Pressable
                style={[channelStyle.btn, controlChannel === 'wifi' && channelStyle.btnActive]}
                onPress={handleSelectWifi}
              >
                <MaterialCommunityIcons name="wifi" size={13} color={controlChannel === 'wifi' ? '#070A0A' : '#58C95F'} />
                <Text style={[channelStyle.btnText, controlChannel === 'wifi' && channelStyle.btnTextActive]}>WiFi</Text>
              </Pressable>
              <Pressable
                style={[channelStyle.btn, controlChannel === 'bluetooth' && channelStyle.btnActive]}
                onPress={handleSelectBluetooth}
              >
                <MaterialCommunityIcons name="bluetooth" size={13} color={controlChannel === 'bluetooth' ? '#070A0A' : '#4A9AFF'} />
                <Text style={[channelStyle.btnText, controlChannel === 'bluetooth' && channelStyle.btnTextActive]}>Bluetooth</Text>
              </Pressable>
              {controlChannel === 'bluetooth' && (
                <View style={channelStyle.statusWrap}>
                  <View style={[channelStyle.statusDot, { backgroundColor:
                    bleStatus === 'connected' ? '#58C95F' :
                    bleStatus === 'error' || bleStatus === 'unsupported' ? '#FF4533' : '#F59E0B'
                  }]} />
                  <Text style={channelStyle.statusText}>
                    {bleStatus === 'connected' ? (bleDeviceName ?? 'Connected') :
                     bleStatus === 'scanning'    ? 'Scanning…' :
                     bleStatus === 'connecting'  ? 'Connecting…' :
                     bleStatus === 'error'       ? 'Not found — tap retry' :
                     bleStatus === 'unsupported' ? 'Unsupported on this build' : 'Idle'}
                  </Text>
                  {(bleStatus === 'error' || bleStatus === 'idle') && (
                    <Pressable onPress={() => void scanAndConnect()} style={channelStyle.retryBtn}>
                      <MaterialCommunityIcons name="refresh" size={12} color="#4A9AFF" />
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          )}
        </View>

        {isAutonomous ? (
          /* ── AUTONOMOUS MODE ──────────────────────────────────────────── */
          <>
            <View style={remoteStyles.currentActionSection}>
              <Text style={remoteStyles.currentActionLabel}>Current Action</Text>
              <Text style={remoteStyles.currentActionText}>
                {isConnected
                  ? (gpsData ? 'Navigating field…' : 'Scanning environment…')
                  : 'Waiting for ESP32 connection…'}
              </Text>
              <View style={remoteStyles.telemetryGrid}>
                <View style={remoteStyles.telemetryCard}>
                  <Text style={remoteStyles.telemetryLabel}>MOISTURE</Text>
                  <Text style={remoteStyles.telemetryValue}>{fmt(soil, '%', 0)}</Text>
                </View>
                <View style={remoteStyles.telemetryCard}>
                  <Text style={remoteStyles.telemetryLabel}>pH LEVEL</Text>
                  <Text style={remoteStyles.telemetryValue}>{fmt(phValue, '')}</Text>
                </View>
                <View style={remoteStyles.telemetryCard}>
                  <Text style={remoteStyles.telemetryLabel}>HUMIDITY</Text>
                  <Text style={remoteStyles.telemetryValue}>{fmt(humidity, '%', 0)}</Text>
                </View>
                <View style={remoteStyles.telemetryCard}>
                  <Text style={remoteStyles.telemetryLabel}>TEMP</Text>
                  <Text style={remoteStyles.telemetryValue}>{fmt(tempC, '°C')}</Text>
                </View>
              </View>
            </View>

            {/* Event Log */}
            <View style={remoteStyles.neuralEngineSection}>
              <View style={remoteStyles.sectionHeader}>
                <Text style={remoteStyles.sectionTitle}>Event Log</Text>
                <View style={remoteStyles.infoIcon}><Text style={remoteStyles.infoIconText}>i</Text></View>
              </View>
              {isConnected ? (
                <View style={autoStyles.logLive}>
                  {sensorData?.smoke?.detected && (
                    <View style={autoStyles.logRow}>
                      <MaterialCommunityIcons name="smoke-detector" size={14} color="#FF4533" />
                      <Text style={[autoStyles.logText, { color: '#FF4533' }]}>Smoke/Gas detected</Text>
                    </View>
                  )}
                  {sensorData?.flame?.detected && (
                    <View style={autoStyles.logRow}>
                      <MaterialCommunityIcons name="fire" size={14} color="#FF8C42" />
                      <Text style={[autoStyles.logText, { color: '#FF8C42' }]}>Flame detected</Text>
                    </View>
                  )}
                  {gpsData && (
                    <View style={autoStyles.logRow}>
                      <MaterialCommunityIcons name="crosshairs-gps" size={14} color="#58C95F" />
                      <Text style={autoStyles.logText}>
                        GPS fix: {gpsData.lat.toFixed(5)}, {gpsData.lng.toFixed(5)}
                        {gpsData.speed_kmph !== undefined ? ` • ${gpsData.speed_kmph.toFixed(1)} km/h` : ''}
                      </Text>
                    </View>
                  )}
                  {uptimeSec > 0 && (
                    <View style={autoStyles.logRow}>
                      <MaterialCommunityIcons name="timer-outline" size={14} color="#4A9AFF" />
                      <Text style={autoStyles.logText}>Uptime: {uptimeSec}s</Text>
                    </View>
                  )}
                  {!sensorData?.smoke?.detected && !sensorData?.flame?.detected && !gpsData && (
                    <Text style={autoStyles.logEmpty}>All systems nominal.</Text>
                  )}
                </View>
              ) : (
                <View style={autoStyles.offlineBox}>
                  <MaterialCommunityIcons name="wifi-off" size={24} color="#444" />
                  <Text style={autoStyles.offlineText}>Connect to ESP32 to see live events.</Text>
                </View>
              )}
            </View>

            {/* Path Trajectory */}
            <View style={remoteStyles.pathTrajectorySection}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={remoteStyles.sectionTitle}>Path Trajectory</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[autoStyles.chartBtn, drawMode && autoStyles.chartBtnActive]}
                    onPress={() => setDrawMode(v => !v)}
                  >
                    <MaterialCommunityIcons name={drawMode ? 'pencil-off' : 'pencil'} size={14} color={drawMode ? '#070A0A' : '#F4A460'} />
                    <Text style={[autoStyles.chartBtnText, drawMode && { color: '#070A0A' }]}>
                      {drawMode ? 'Stop Draw' : 'Draw Path'}
                    </Text>
                  </TouchableOpacity>
                  {userWaypoints.length > 0 && (
                    <TouchableOpacity
                      style={autoStyles.chartBtn}
                      onPress={() => Alert.alert('Clear waypoints', 'Remove all drawn waypoints?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Clear', style: 'destructive', onPress: () => setUserWaypoints([]) },
                      ])}
                    >
                      <MaterialCommunityIcons name="delete-outline" size={14} color="#F87272" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <Text style={[remoteStyles.currentActionLabel, { marginBottom: 8 }]}>
                {gpsData
                  ? `GPS: ${gpsData.lat.toFixed(5)}, ${gpsData.lng.toFixed(5)} • ${gpsTrail.length} pts`
                  : 'Waiting for GPS fix…'}
              </Text>
              <View style={{ alignItems: 'center' }}>
                <PathChart trail={gpsTrail} waypoints={userWaypoints} drawMode={drawMode} onTap={pt => setUserWaypoints(prev => [...prev, pt])} />
              </View>
              {userWaypoints.length > 1 && (
                <TouchableOpacity
                  style={autoStyles.sendBtn}
                  onPress={() => Alert.alert('Send trajectory', `Send ${userWaypoints.length} waypoints to the robot?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Send', onPress: () => {
                      fetch(`http://${espIP}/trajectory`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ waypoints: userWaypoints }),
                      }).catch(() => Alert.alert('Send failed', 'Could not reach ESP32.'));
                    }},
                  ])}
                >
                  <MaterialCommunityIcons name="send" size={16} color="#070A0A" />
                  <Text style={autoStyles.sendBtnText}>Send {userWaypoints.length} Waypoints</Text>
                </TouchableOpacity>
              )}
              <View style={remoteStyles.chartLegend}>
                <View style={remoteStyles.legendItem}>
                  <View style={[remoteStyles.legendDot, { backgroundColor: '#72F88A' }]} />
                  <Text style={remoteStyles.legendText}>COMPLETED (GPS)</Text>
                </View>
                <View style={remoteStyles.legendItem}>
                  <View style={[remoteStyles.legendDot, { backgroundColor: '#F4A460' }]} />
                  <Text style={remoteStyles.legendText}>PLANNED (DRAWN)</Text>
                </View>
              </View>
            </View>

            {/* Battery */}
            <View style={remoteStyles.energySection}>
              <View style={remoteStyles.energyIcon}>
                <MaterialCommunityIcons
                  name={battPct !== undefined && battPct < 20 ? 'battery-low' : 'battery-high'}
                  size={40}
                  color={battPct !== undefined && battPct < 20 ? '#FF4533' : '#58C95F'}
                />
              </View>
              <Text style={remoteStyles.energyTitle}>Battery Status</Text>
              <Text style={remoteStyles.energyDescription}>
                {battPct !== undefined ? `${battPct.toFixed(0)}% remaining` : 'Connect to ESP32 for battery data.'}
              </Text>
              <View style={remoteStyles.energyBar}>
                <View style={[remoteStyles.energyBarFill, {
                  width: battPct !== undefined ? `${Math.min(100, battPct)}%` as any : '0%',
                  backgroundColor: battPct !== undefined && battPct < 20 ? '#FF4533' : '#58C95F',
                }]} />
              </View>
            </View>
          </>
        ) : (
          /* ── MANUAL CONTROL MODE — PORTRAIT ──────────────────────────── */
          <>
            {/* ── Live video — drag to pan, pivoting from its center ── */}
            <View style={remoteStyles.liveVideoContainer}>
              <View style={remoteStyles.liveVideoBox}>
                <PortraitCameraFeed active={cameraActive} />

                {cameraActive && <CameraPanControl sendCamDir={sendCamDir} ringSize={90} />}

                <Pressable onPress={() => void handleCameraToggle()} style={cameraOverlayStyles.toggleBtn}>
                  <MaterialCommunityIcons name={cameraActive ? 'camera-off' : 'camera'} size={18} color="#fff" />
                  <Text style={cameraOverlayStyles.toggleBtnText}>{cameraActive ? 'Stop' : 'Start Camera'}</Text>
                </Pressable>
              </View>
            </View>

            {/* Command feedback + gyro toggle */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 8 }}>
              {/* Last command indicator */}
              <View style={cmdStyles.badge}>
                <View style={[cmdStyles.dot, { backgroundColor: lastCmd ? '#72F88A' : '#333' }]} />
                <Text style={cmdStyles.text}>{lastCmd || 'STANDBY'}</Text>
              </View>

              {/* Gyro toggle */}
              <Pressable
                style={[remoteStyles.gyroButton, gyroEnabled ? remoteStyles.gyroButtonActive : remoteStyles.gyroButtonInactive]}
                onPress={() => setGyroEnabled(!gyroEnabled)}
              >
                <MaterialCommunityIcons name={gyroEnabled ? 'motion-sensor' : 'motion'} size={20} color={gyroEnabled ? '#070A0A' : '#58C95F'} />
                <Text style={[remoteStyles.gyroButtonText, gyroEnabled && remoteStyles.gyroButtonTextActive]}>
                  {gyroEnabled ? 'Gyro ON' : 'Gyro OFF'}
                </Text>
              </Pressable>
            </View>
            {gyroEnabled && (
              <Text style={[remoteStyles.gyroStatusText, { textAlign: 'center', marginTop: 4 }]}>Tilt phone to steer robot</Text>
            )}

            {/* Telemetry 2×2 */}
            <View style={remoteStyles.manualTelemetryGrid}>
              <View style={remoteStyles.manualTelemetryCard}>
                <Text style={remoteStyles.manualTelemetryLabel}>ENV. TEMP</Text>
                <Text style={[remoteStyles.manualTelemetryValue, { color: '#FF6B6B' }]}>{fmt(tempC, '°C')}</Text>
              </View>
              <View style={remoteStyles.manualTelemetryCard}>
                <Text style={remoteStyles.manualTelemetryLabel}>SOIL pH</Text>
                <Text style={[remoteStyles.manualTelemetryValue, { color: '#58C95F' }]}>{fmt(phValue, '')}</Text>
              </View>
              <View style={remoteStyles.manualTelemetryCard}>
                <Text style={remoteStyles.manualTelemetryLabel}>MOISTURE</Text>
                <Text style={[remoteStyles.manualTelemetryValue, { color: '#58C95F' }]}>{fmt(soil, '%', 0)}</Text>
              </View>
              <View style={remoteStyles.manualTelemetryCard}>
                <Text style={remoteStyles.manualTelemetryLabel}>BATTERY</Text>
                <Text style={[remoteStyles.manualTelemetryValue, { color: battPct !== undefined && battPct < 20 ? '#FF4533' : '#4A9AFF' }]}>
                  {fmt(battPct, '%', 0)}
                </Text>
              </View>
            </View>

            {/* ── JOYSTICK ──
                Always rendered, even with gyro on — when gyro is active, touch
                is disabled (so it can't fight the tilt input) and a GYRO badge
                overlays the ring, but the ring/stick itself never disappears. */}
            <View style={remoteStyles.joystickSection}>
              <Text style={remoteStyles.joystickDirectionLabel}>{dirLabel}</Text>
              <View
                ref={joystickRef}
                style={remoteStyles.joystickRing}
                {...(gyroEnabled ? {} : panResponder.panHandlers)}
              >
                {(['up', 'down', 'left', 'right'] as const).map(d => (
                  <Text
                    key={d}
                    style={[
                      remoteStyles.joystickRingLabel,
                      d === 'up'    && remoteStyles.joystickRingLabelTop,
                      d === 'down'  && remoteStyles.joystickRingLabelBottom,
                      d === 'left'  && remoteStyles.joystickRingLabelLeft,
                      d === 'right' && remoteStyles.joystickRingLabelRight,
                      direction === d && remoteStyles.joystickRingLabelActive,
                    ]}
                  >
                    {d === 'up' ? '▲' : d === 'down' ? '▼' : d === 'left' ? '◄' : '►'}
                  </Text>
                ))}
                <View style={[remoteStyles.joystickStick, { transform: [{ translateX: stickPos.x }, { translateY: stickPos.y }] }]}>
                  <View style={remoteStyles.joystickStickInner}>
                    <MaterialCommunityIcons name={stickIcon} size={32} color="#070A0A" />
                  </View>
                </View>
                {gyroEnabled && (
                  <View style={joyStyles.gyroBadge}>
                    <Text style={joyStyles.gyroBadgeText}>GYRO</Text>
                  </View>
                )}
              </View>
              <View style={remoteStyles.joystickLabelsRow}>
                <Text style={remoteStyles.joystickSideLabel}>LEFT</Text>
                <Text style={remoteStyles.joystickSideLabel}>RIGHT</Text>
              </View>
            </View>
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const autoStyles = StyleSheet.create({
  logLive:        { gap: 10 },
  logRow:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logText:        { color: '#B6C4C8', fontSize: 13, flex: 1 },
  logEmpty:       { color: '#555', fontSize: 13, fontStyle: 'italic' },
  offlineBox:     { alignItems: 'center', paddingVertical: 24, gap: 8 },
  offlineText:    { color: '#444', fontSize: 13 },
  chartBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, borderColor: '#F4A460', backgroundColor: 'transparent',
  },
  chartBtnActive: { backgroundColor: '#F4A460' },
  chartBtnText:   { color: '#F4A460', fontSize: 11, fontWeight: '700' },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 12, backgroundColor: '#F4A460', borderRadius: 12, paddingVertical: 10,
  },
  sendBtnText: { color: '#070A0A', fontSize: 14, fontWeight: '800' },
});

const lsStyles = StyleSheet.create({
  offBg:          { backgroundColor: '#070A0A', alignItems: 'center', justifyContent: 'center' },
  topLeft:        { position: 'absolute', top: 16, left: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  modeBadge:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(88,201,95,0.25)' },
  modeDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: '#58C95F' },
  modeText:       { color: '#58C95F', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  autoBtn:        { backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(125,251,140,0.3)' },
  autoBtnText:    { color: '#7DFB8C', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  channelBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(88,201,95,0.3)' },
  channelBtnBle:  { borderColor: 'rgba(74,154,255,0.35)' },
  channelBtnText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  hud:            { position: 'absolute', top: 16, right: 16, flexDirection: 'row', gap: 8 },
  hudItem:        { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(125,251,140,0.15)', alignItems: 'center' },
  hudLabel:       { color: '#6C7473', fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  hudValue:       { fontSize: 13, fontWeight: '800', marginTop: 2 },
  camToggle:      { position: 'absolute', top: 16, alignSelf: 'center', left: '35%', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(125,251,140,0.3)' },
  camToggleText:  { color: '#fff', fontSize: 12, fontWeight: '700' },
  joystickWrap:   { position: 'absolute', bottom: 20, left: 20, alignItems: 'center', gap: 6 },
  dirText:        { color: '#7DFB8C', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  joystickRing:   { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 2, borderColor: 'rgba(125,251,140,0.35)', alignItems: 'center', justifyContent: 'center' },
  ringLabel:      { position: 'absolute', color: 'rgba(125,251,140,0.5)', fontSize: 10, fontWeight: '700' },
  ringTop:        { top: 6 },
  ringBottom:     { bottom: 6 },
  ringLeft:       { left: 6 },
  ringRight:      { right: 6 },
  ringActive:     { color: '#7DFB8C' },
  stick:          { width: 44, height: 44, borderRadius: 22, backgroundColor: '#58C95F', alignItems: 'center', justifyContent: 'center' },
  stickInner:     { alignItems: 'center', justifyContent: 'center' },
  cmdBadge:       { position: 'absolute', bottom: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(114,248,138,0.3)' },
  cmdBadgeText:   { color: '#72F88A', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  gyroBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(88,201,95,0.3)' },
  gyroBtnActive:  { backgroundColor: '#58C95F', borderColor: '#58C95F' },
  gyroBtnText:    { color: '#58C95F', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  gyroBtnTextActive: { color: '#070A0A' },
  gyroBadge:      { position: 'absolute', top: -10, alignSelf: 'center', backgroundColor: '#58C95F', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  gyroBadgeText:  { color: '#070A0A', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
});

const cameraOverlayStyles = StyleSheet.create({
  toggleBtn:     { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(125,251,140,0.3)' },
  toggleBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

// Camera pan control — faint reticle centered on the feed showing the pivot
// point, drag direction arrows, and the current drag offset.
const camPanStyles = StyleSheet.create({
  ring: {
    position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 999, alignItems: 'center', justifyContent: 'center',
  },
  arrow:       { position: 'absolute', color: 'rgba(255,255,255,0.35)', fontSize: 14, fontWeight: '700' },
  arrowUp:     { top: 4 },
  arrowDown:   { bottom: 4 },
  arrowLeft:   { left: 4 },
  arrowRight:  { right: 4 },
  arrowActive: { color: '#58C95F' },
  dot: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: 'rgba(88,201,95,0.85)',
  },
});

const joyStyles = StyleSheet.create({
  gyroBadge:     { position: 'absolute', top: -10, alignSelf: 'center', backgroundColor: '#58C95F', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  gyroBadgeText: { color: '#070A0A', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
});

const cmdStyles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0D1410', borderWidth: 1, borderColor: '#1E2A1E', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  dot:   { width: 6, height: 6, borderRadius: 3 },
  text:  { color: '#72F88A', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
});

const mqttBadgeStyle = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', alignSelf: 'flex-start', marginTop: 6 },
  dot:  { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 9, fontWeight: '800', color: '#F59E0B', letterSpacing: 0.8 },
});

const channelStyle = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    borderWidth: 1, borderColor: '#1E2A1E', backgroundColor: '#0D1410',
  },
  btnActive:    { backgroundColor: '#58C95F', borderColor: '#58C95F' },
  btnText:      { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: '#7C8A86' },
  btnTextActive:{ color: '#070A0A' },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(74,154,255,0.1)', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(74,154,255,0.25)' },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 9, fontWeight: '700', color: '#4A9AFF', letterSpacing: 0.4 },
  retryBtn:   { marginLeft: 2 },
});
