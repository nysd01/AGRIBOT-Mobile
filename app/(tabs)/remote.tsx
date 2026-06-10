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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Accelerometer } from 'expo-sensors';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { remoteStyles } from '@/styles/remote.styles';
import { useESP32Sensors } from '@/hooks/use-esp32-sensors';
import { useESP32IP } from '@/context/ESP32Context';
import { useAppMode } from '@/context/AppModeContext';
import { useMqtt } from '@/hooks/use-mqtt';

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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RemoteScreen() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { espIP } = useESP32IP();
  const { isOnline, isOnlineMode, cloudConfig } = useAppMode();
  const { mqttConnected, publishCmd } = useMqtt();
  const { sensorData, isConnected } = useESP32Sensors({ pollInterval: 1000 });

  // ── State ──────────────────────────────────────────────────────────────────
  const [isAutonomous,   setIsAutonomous]   = useState(true);
  const [direction,      setDirection]      = useState<string | null>(null);
  const [stickPos,       setStickPos]       = useState({ x: 0, y: 0 });
  const [gyroEnabled,    setGyroEnabled]    = useState(false);
  const [cameraActive,   setCameraActive]   = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [tiltX,          setTiltX]          = useState(0);
  const [tiltY,          setTiltY]          = useState(0);
  const [drawMode,       setDrawMode]       = useState(false);
  const [userWaypoints,  setUserWaypoints]  = useState<NormPoint[]>([]);
  const [gpsTrail,       setGpsTrail]       = useState<Coord[]>([]);
  const [lastCmd,        setLastCmd]        = useState<string>('');   // visual feedback
  const joystickRef = useRef(null);

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

  // Same cadence for camera pan — see cameraPanResponder below.
  const CAM_THROTTLE_MS = 50;

  // Refs for the static camera pan-responder closure (can't capture changing state directly)
  const isOnlineRef    = useRef(isOnlineMode);
  const espIPRef       = useRef(espIP);
  const publishCmdRef  = useRef<(cmd: string) => boolean>(() => false);
  useEffect(() => { isOnlineRef.current   = isOnlineMode; }, [isOnlineMode]);
  useEffect(() => { espIPRef.current      = espIP; },       [espIP]);
  useEffect(() => { publishCmdRef.current = publishCmd; },  [publishCmd]);

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
    } else {
      void postDirectCmd(cmd);
    }
  }, [isOnlineMode, publishCmd, postCloudCmd, postDirectCmd]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  JOYSTICK → MOTOR COMMANDS
  //  Runs whenever stick position or direction changes.
  //  Uses tank/differential drive: M<left>,<right>
  // ═══════════════════════════════════════════════════════════════════════════

  const prevDirRef = useRef<string | null>(null);

  useEffect(() => {
    if (isAutonomous) return;

    if (!direction) {
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

    void sendMotorCmd(`M${left},${right}`);
  }, [direction, stickPos, isAutonomous, sendMotorCmd]);

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
  //  CAMERA SWIPE PAN RESPONDER
  //  Overlaid on the camera view — swipe gestures pan/tilt the robot camera.
  //  Re-sends CU / CD / CX / CY continuously while held (same ~20/sec cadence
  //  as the wheel's sendMotorCmd) instead of once on direction-change — a
  //  single dropped packet (UDP/HTTP) used to leave camDir stuck and the
  //  camera not moving at all. CS fires once when the swipe returns to the
  //  dead zone or on release, mirroring the wheel's "S on direction null".
  // ═══════════════════════════════════════════════════════════════════════════

  const camDirRef      = useRef<string>('');
  const camThrottleRef = useRef(0);

  // Use refs so this static closure always reads current values
  const sendCamDir = (cmd: string) => {
    setLastCmd(cmd);
    if (isOnlineRef.current) {
      publishCmdRef.current(cmd);
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
  };

  const cameraPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => { camDirRef.current = ''; camThrottleRef.current = 0; },
      onPanResponderMove: (_, { dx, dy }) => {
        const THRESHOLD = 15;
        let newDir = '';
        if      (Math.abs(dy) > Math.abs(dx) && dy < -THRESHOLD) newDir = 'CU';
        else if (Math.abs(dy) > Math.abs(dx) && dy >  THRESHOLD) newDir = 'CD';
        else if (Math.abs(dx) > Math.abs(dy) && dx < -THRESHOLD) newDir = 'CX';
        else if (Math.abs(dx) > Math.abs(dy) && dx >  THRESHOLD) newDir = 'CY';

        if (!newDir) {
          // Swipe back inside the dead zone — stop, like releasing the wheel stick.
          if (camDirRef.current) {
            camDirRef.current = '';
            sendCamDir('CS');
          }
          return;
        }

        camDirRef.current = newDir;

        // Time-based throttle (not "skip if same dir") so the held direction
        // keeps re-sending every ~50 ms — same pattern as sendMotorCmd.
        const now = Date.now();
        if (now - camThrottleRef.current < CAM_THROTTLE_MS) return;
        camThrottleRef.current = now;
        sendCamDir(newDir);
      },
      onPanResponderRelease: () => {
        if (camDirRef.current) sendCamDir('CS');
        camDirRef.current = '';
      },
    })
  ).current;

  // ═══════════════════════════════════════════════════════════════════════════
  //  GYROSCOPE → MOTOR COMMANDS  (tilt phone to steer)
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!gyroEnabled || isAutonomous) return;
    Accelerometer.setUpdateInterval(100);
    const sub = Accelerometer.addListener(({ x, y }) => {
      const magnitude = Math.sqrt(x * x + y * y);
      if (magnitude < 0.2) {
        setDirection(null);
        setStickPos({ x: 0, y: 0 });
        return;
      }
      const scaleFactor = 60 / 10;
      const sx = ( x / 10) * scaleFactor;
      const sy = (-y / 10) * scaleFactor;
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
  }, [gyroEnabled, isAutonomous]);

  // Landscape tilt overlay
  useEffect(() => {
    if (isAutonomous || !isLandscape) return;
    Accelerometer.setUpdateInterval(50);
    const sub = Accelerometer.addListener(({ x, y }) => {
      setTiltX(Math.max(-1, Math.min(1, x)));
      setTiltY(Math.max(-1, Math.min(1, y)));
    });
    return () => sub.remove();
  }, [isAutonomous, isLandscape]);

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
        {/* Camera or dark background */}
        {cameraActive ? (
          <CameraView
            style={[StyleSheet.absoluteFill, {
              transform: [
                { perspective: 800 },
                { rotateX: `${tiltY * 20}deg` },
                { rotateY: `${-tiltX * 20}deg` },
              ],
            }]}
            facing="back"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, lsStyles.offBg]}>
            <MaterialCommunityIcons name="robot-industrial" size={180} color="#58C95F" style={{ opacity: 0.12 }} />
          </View>
        )}

        {/* ── Camera swipe overlay (right half) — pan/tilt robot camera ── */}
        <View
          style={lsStyles.camSwipeOverlay}
          {...cameraPanResponder.panHandlers}
        >
          <View style={lsStyles.camSwipeHint}>
            <MaterialCommunityIcons name="gesture-swipe" size={14} color="rgba(255,255,255,0.4)" />
            <Text style={lsStyles.camSwipeHintText}>Swipe to pan camera</Text>
          </View>
        </View>

        {/* Top-left */}
        <View style={lsStyles.topLeft}>
          <View style={lsStyles.modeBadge}>
            <View style={lsStyles.modeDot} />
            <Text style={lsStyles.modeText}>LIVE TELEMETRY</Text>
          </View>
          <Pressable onPress={() => setIsAutonomous(true)} style={lsStyles.autoBtn}>
            <Text style={lsStyles.autoBtnText}>AUTO</Text>
          </Pressable>
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

        {/* Joystick (left side) */}
        <View style={lsStyles.joystickWrap}>
          <Text style={lsStyles.dirText}>{dirLabel}</Text>
          <View ref={joystickRef} style={lsStyles.joystickRing} {...panResponder.panHandlers}>
            <Text style={[lsStyles.ringLabel, lsStyles.ringTop,    direction === 'up'    && lsStyles.ringActive]}>▲</Text>
            <Text style={[lsStyles.ringLabel, lsStyles.ringBottom, direction === 'down'  && lsStyles.ringActive]}>▼</Text>
            <Text style={[lsStyles.ringLabel, lsStyles.ringLeft,   direction === 'left'  && lsStyles.ringActive]}>◄</Text>
            <Text style={[lsStyles.ringLabel, lsStyles.ringRight,  direction === 'right' && lsStyles.ringActive]}>►</Text>
            <View style={[lsStyles.stick, { transform: [{ translateX: stickPos.x }, { translateY: stickPos.y }] }]}>
              <View style={lsStyles.stickInner}>
                <MaterialCommunityIcons name={stickIcon} size={24} color="#070A0A" />
              </View>
            </View>
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
            {/* ── Live video with camera swipe overlay ── */}
            <View style={remoteStyles.liveVideoContainer}>
              <View style={remoteStyles.liveVideoBox}>
                {cameraActive ? (
                  <CameraView style={StyleSheet.absoluteFill} facing="back" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="robot-industrial" size={120} color="#58C95F" style={{ opacity: 0.5 }} />
                    <Text style={remoteStyles.liveVideoLabel}>Rotate to landscape for full-screen camera</Text>
                  </>
                )}

                {/* Camera swipe overlay — transparent, sits on top of camera feed */}
                <View
                  style={camOverlay.swipeZone}
                  {...cameraPanResponder.panHandlers}
                >
                  {cameraActive && (
                    <View style={camOverlay.swipeHint}>
                      <MaterialCommunityIcons name="gesture-swipe" size={12} color="rgba(255,255,255,0.35)" />
                      <Text style={camOverlay.swipeHintText}>Swipe to pan camera</Text>
                    </View>
                  )}
                </View>

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

            {/* ── JOYSTICK ── */}
            <View style={remoteStyles.joystickSection}>
              <Text style={remoteStyles.joystickDirectionLabel}>{dirLabel}</Text>
              <View ref={joystickRef} style={remoteStyles.joystickRing} {...panResponder.panHandlers}>
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
  // Camera swipe zone — right 60% of the screen
  camSwipeOverlay: { position: 'absolute', top: 60, bottom: 0, left: '40%', right: 0 },
  camSwipeHint:    { position: 'absolute', bottom: 60, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  camSwipeHintText:{ color: 'rgba(255,255,255,0.4)', fontSize: 10 },
  cmdBadge:       { position: 'absolute', bottom: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(114,248,138,0.3)' },
  cmdBadgeText:   { color: '#72F88A', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
});

const cameraOverlayStyles = StyleSheet.create({
  toggleBtn:     { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(125,251,140,0.3)' },
  toggleBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

const camOverlay = StyleSheet.create({
  // Full overlay on the video box, captures swipe gestures
  swipeZone:     { ...StyleSheet.absoluteFillObject, zIndex: 2 },
  swipeHint:     { position: 'absolute', bottom: 36, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  swipeHintText: { color: 'rgba(255,255,255,0.35)', fontSize: 10 },
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
