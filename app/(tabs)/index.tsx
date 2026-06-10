import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useESP32Sensors } from '@/hooks/use-esp32-sensors';
import { useAppMode }      from '@/context/AppModeContext';
import { styles } from '@/styles/dashboard.styles';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function soilProfile(pct: number | string): { label: string; sub: string; color: string; bg: string } {
  if (pct === '--') return { label: 'NO SIGNAL', sub: 'Awaiting ESP32', color: '#6B7B7F', bg: '#141A18' };
  const v = typeof pct === 'number' ? pct : parseFloat(String(pct));
  if (v < 20)  return { label: 'CRITICAL',  sub: 'Irrigation needed',  color: '#FF6B6B', bg: '#1F0F0F' };
  if (v < 40)  return { label: 'LOW',       sub: 'Monitor closely',    color: '#FFD93D', bg: '#1C1804' };
  if (v <= 70) return { label: 'OPTIMAL',   sub: 'Ideal conditions',   color: '#72F88A', bg: '#0D1F12' };
  return             { label: 'SATURATED',  sub: 'Reduce irrigation',  color: '#4ECDC4', bg: '#071A1A' };
}

function climateProfile(
  temp: number | string,
  hum: number | string,
): { label: string; sub: string; color: string; bg: string } {
  if (temp === '--') return { label: 'NO SIGNAL', sub: 'Awaiting ESP32', color: '#6B7B7F', bg: '#141A18' };
  const t = parseFloat(String(temp));
  const h = parseFloat(String(hum));
  const goodTemp = t >= 15 && t <= 30;
  const goodHum  = h >= 40 && h <= 75;
  if (goodTemp && goodHum) return { label: 'IDEAL',    sub: `${t.toFixed(1)}°C · ${h.toFixed(0)}% RH`, color: '#72F88A', bg: '#0D1F12' };
  if (!goodTemp && t > 30) return { label: 'HOT',      sub: `${t.toFixed(1)}°C · Monitor crop`,        color: '#FFD93D', bg: '#1C1804' };
  if (!goodTemp && t < 15) return { label: 'COLD',     sub: `${t.toFixed(1)}°C · Risk of stress`,      color: '#4ECDC4', bg: '#071A1A' };
  if (!goodHum  && h > 75) return { label: 'HUMID',    sub: `${h.toFixed(0)}% · Fungal risk`,           color: '#C084FC', bg: '#16091F' };
  return                          { label: 'DRY',       sub: `${h.toFixed(0)}% · Increase irrigation`,  color: '#FF8C42', bg: '#1A0E06' };
}

function threatProfile(
  smoke: boolean | null | undefined,
  flame: boolean | null | undefined,
): { label: string; sub: string; color: string; bg: string; icon: string } {
  if (flame) return { label: 'FIRE ALERT',    sub: 'Flame sensor triggered',  color: '#FF4444', bg: '#200808', icon: 'fire-alert'        };
  if (smoke) return { label: 'SMOKE WARNING', sub: 'Gas/smoke detected',      color: '#FF8C42', bg: '#1A0E06', icon: 'smoke-detector-alert' };
  return           { label: 'ALL CLEAR',      sub: 'No threats detected',     color: '#72F88A', bg: '#0D1F12', icon: 'shield-check-outline'  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Intel Card sub-component
// ─────────────────────────────────────────────────────────────────────────────

interface IntelCardProps {
  icon:  string;
  eye:   string;
  label: string;
  sub:   string;
  color: string;
  bg:    string;
}
function IntelCard({ icon, eye, label, sub, color, bg }: IntelCardProps) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={[ds.intelCard, { backgroundColor: bg, transform: [{ scale }] }]}>
      <View style={[ds.intelIconWrap, { backgroundColor: `${color}18` }]}>
        <MaterialCommunityIcons name={icon as any} size={20} color={color} />
      </View>
      <Text style={ds.intelEye}>{eye}</Text>
      <Text style={[ds.intelLabel, { color }]}>{label}</Text>
      <Text style={ds.intelSub}>{sub}</Text>
      <View style={[ds.intelBar, { backgroundColor: color }]} />
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick Access tile
// ─────────────────────────────────────────────────────────────────────────────

interface AccessTileProps {
  icon:    string;
  label:   string;
  color:   string;
  gradient: readonly [string, string];
  onPress: () => void;
}
function AccessTile({ icon, label, color, gradient, onPress }: AccessTileProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const press   = () => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true }).start();
  const release = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, friction: 3 }).start(onPress);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable onPressIn={press} onPressOut={release}>
        <LinearGradient
          colors={gradient}
          style={ds.accessTile}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <MaterialCommunityIcons name={icon as any} size={26} color={color} />
          <Text style={[ds.accessLabel, { color }]}>{label}</Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const router            = useRouter();
  const { width }         = useWindowDimensions();
  const compact           = width < 390;
  const { mode }          = useAppMode();
  const { sensorData, isConnected } = useESP32Sensors();

  // ── Live sensor values ──────────────────────────────────────────────────────
  const temp     = sensorData?.domino4?.weather?.temperatureC ?? sensorData?.temperatureC    ?? 0;
  const humidity = sensorData?.domino4?.weather?.humidityPct  ?? sensorData?.humidityPct     ?? 0;
  const soil     = sensorData?.domino4?.soil?.moisturePct     ?? sensorData?.soilMoisturePct ?? 0;
  const uptime   = sensorData?.systemInfo?.uptimeSeconds
    ? formatUptime(sensorData.systemInfo.uptimeSeconds)
    : '--';
  const smokeOn = sensorData?.smoke?.detected ?? false;
  const flameOn = sensorData?.flame?.detected ?? false;
  const alertCount = (smokeOn ? 1 : 0) + (flameOn ? 1 : 0);

  const tempDisplay = isConnected ? temp     : '--';
  const humDisplay  = isConnected ? humidity : '--';
  const soilDisplay = isConnected ? Math.round(soil) : '--';

  // ── Derived intelligence ────────────────────────────────────────────────────
  const soil3    = soilProfile(soilDisplay);
  const climate3 = climateProfile(tempDisplay, humDisplay);
  const threat3  = threatProfile(smokeOn, flameOn);

  // ── Pulsing dot ─────────────────────────────────────────────────────────────
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 800, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  // ── Fade on mount ───────────────────────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <ScrollView contentContainerStyle={[styles.container, compact && styles.containerCompact]}>

        {/* ── TOP BAR ──────────────────────────────────────────────────────── */}
        <View style={styles.topRow}>
          <View style={styles.brandRow}>
            <MaterialCommunityIcons name="sprout" size={18} color="#70F57D" />
            <Text style={styles.brandText}>Agribot</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Mode chip — LOCAL or CLOUD */}
            <View style={[ds.modeChip, mode === 'online' ? ds.modeChipCloud : ds.modeChipLocal]}>
              <MaterialCommunityIcons
                name={mode === 'online' ? 'cloud-outline' : 'wifi'}
                size={11}
                color={mode === 'online' ? '#4A9AFF' : '#72F88A'}
              />
              <Text style={[ds.modeChipText, { color: mode === 'online' ? '#4A9AFF' : '#72F88A' }]}>
                {mode === 'online' ? 'CLOUD' : 'LOCAL'}
              </Text>
            </View>
            {/* Live/Offline connection dot */}
            <View style={ds.connectionChip}>
              <Animated.View style={[ds.connDot, { opacity: pulse,
                backgroundColor: isConnected ? '#72F88A' : '#FF6B6B' }]} />
              <Text style={[ds.connText, { color: isConnected ? '#72F88A' : '#FF6B6B' }]}>
                {isConnected ? 'LIVE' : 'OFFLINE'}
              </Text>
            </View>
            <Pressable
              style={ds.cogBtn}
              onPress={() => router.push('/modal-settings')}
            >
              <MaterialCommunityIcons name="cog" size={18} color="#58C95F" />
            </Pressable>
          </View>
        </View>

        {/* ── HEADING ──────────────────────────────────────────────────────── */}
        <Text style={styles.systemOnline}>MISSION CONTROL · AG-01-DELTA</Text>
        <Text style={[styles.title, compact && styles.titleCompact]}>Mission{'\n'}Dashboard</Text>

        <View style={styles.nodePill}>
          <View style={styles.dot} />
          <Text style={styles.nodePillText}>
            {isConnected ? `Uptime  ${uptime}` : 'Awaiting robot connection'}
          </Text>
        </View>

        {/* ── HERO CARD ────────────────────────────────────────────────────── */}
        <View style={styles.heroCard}>
          <ImageBackground
            source={{ uri: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?q=80&w=1200&auto=format&fit=crop' }}
            imageStyle={styles.heroImage}
            style={styles.heroImageWrap}
          >
            <View style={styles.heroShade} />
            <View style={styles.heroContent}>
              <View>
                <Text style={styles.heroSector}>
                  {alertCount > 0 ? '⚠ ALERT' : 'ACTIVE FIELD'}
                </Text>
                <Text style={styles.heroLocation}>
                  {alertCount > 0 ? 'Check Threats' : 'All Systems Go'}
                </Text>
                <Text style={styles.heroBody}>
                  {alertCount > 0
                    ? `${alertCount} active alert${alertCount > 1 ? 's' : ''} detected. Review the Sensors tab immediately.`
                    : 'Robot is monitoring field conditions. Soil, climate, and threat levels are being tracked in real time.'}
                </Text>
              </View>
              <Pressable
                style={styles.liveFeedButton}
                onPress={() => Alert.alert('Live Feed', 'Connecting to robot camera…')}
              >
                <MaterialCommunityIcons name="video-wireless" size={16} color="#EAF7EE" />
                <Text style={styles.liveFeedText}>Live Feed</Text>
              </Pressable>
            </View>
          </ImageBackground>
        </View>

        {/* ── CONTROL BUTTONS ──────────────────────────────────────────────── */}
        <Pressable style={styles.manualButton} onPress={() => router.push('/remote')}>
          <View>
            <Text style={styles.buttonLabel}>MANUAL OVERRIDE</Text>
            <Text style={styles.buttonTitle}>Start Manual Control</Text>
          </View>
          <MaterialCommunityIcons name="controller-classic-outline" size={26} color="#2A7F39" />
        </Pressable>

        <Pressable style={styles.autoButton} onPress={() => router.push('/intelligence' as any)}>
          <View>
            <Text style={[styles.buttonLabel, styles.buttonLabelAuto]}>AI PROTOCOL</Text>
            <Text style={styles.buttonTitleDark}>Start Autonomous Mode</Text>
          </View>
          <MaterialCommunityIcons name="crosshairs-gps" size={26} color="#59D96D" />
        </Pressable>

        {/* ── SYSTEM STATUS ────────────────────────────────────────────────── */}
        <View style={styles.panel}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>Robot Status</Text>
            <View style={[styles.onlineBadge, !isConnected && { backgroundColor: '#2A1515' }]}>
              <Text style={[styles.onlineText, !isConnected && { color: '#FF6B6B' }]}>
                {isConnected ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>
          </View>

          {/* Uptime + Signal row */}
          <View style={styles.metaRow}>
            <View>
              <Text style={styles.metaLabel}>UPTIME</Text>
              <Text style={styles.metaValue}>{uptime}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.metaLabel}>LINK QUALITY</Text>
              <Text style={[styles.metaValue, styles.signalValue]}>
                {isConnected ? 'Excellent' : 'Offline'}
              </Text>
            </View>
          </View>

          {/* Active alerts pill */}
          {alertCount > 0 && (
            <View style={ds.alertPill}>
              <MaterialCommunityIcons name="alert-circle" size={14} color="#FF6B6B" />
              <Text style={ds.alertPillText}>
                {alertCount} active alert{alertCount > 1 ? 's' : ''} — check Threat Assessment below
              </Text>
            </View>
          )}
        </View>

        {/* ── TELEMETRY SUMMARY ────────────────────────────────────────────── */}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Live Telemetry</Text>

          <View style={styles.telemetryItem}>
            <View style={styles.telemetryLeft}>
              <MaterialCommunityIcons name="thermometer-lines" size={16} color="#FF6B6B" />
              <Text style={styles.telemetryLabel}>Temperature</Text>
            </View>
            <Text style={styles.telemetryValue}>
              {tempDisplay === '--' ? '--' : `${(tempDisplay as number).toFixed(1)}°C`}
            </Text>
          </View>

          <View style={styles.telemetryItem}>
            <View style={styles.telemetryLeft}>
              <MaterialCommunityIcons name="water-percent" size={16} color="#4ECDC4" />
              <Text style={styles.telemetryLabel}>Humidity</Text>
            </View>
            <Text style={styles.telemetryValue}>
              {humDisplay === '--' ? '--' : `${(humDisplay as number).toFixed(0)}%`}
            </Text>
          </View>

          <View style={styles.telemetryItem}>
            <View style={styles.telemetryLeft}>
              <MaterialCommunityIcons name="sprout-outline" size={16} color="#72F88A" />
              <Text style={styles.telemetryLabel}>Soil Moisture</Text>
            </View>
            <Text style={styles.telemetryValue}>
              {soilDisplay === '--' ? '--' : `${soilDisplay}%`}
            </Text>
          </View>

          {smokeOn && (
            <View style={[styles.telemetryItem, { backgroundColor: '#1F0E08' }]}>
              <View style={styles.telemetryLeft}>
                <MaterialCommunityIcons name="smoke-detector-variant-alert" size={16} color="#FF8C42" />
                <Text style={[styles.telemetryLabel, { color: '#FF8C42' }]}>Smoke / Gas</Text>
              </View>
              <Text style={[styles.telemetryValue, { color: '#FF8C42' }]}>DETECTED</Text>
            </View>
          )}

          {flameOn && (
            <View style={[styles.telemetryItem, { backgroundColor: '#200808' }]}>
              <View style={styles.telemetryLeft}>
                <MaterialCommunityIcons name="fire-alert" size={16} color="#FF4444" />
                <Text style={[styles.telemetryLabel, { color: '#FF4444' }]}>Flame</Text>
              </View>
              <Text style={[styles.telemetryValue, { color: '#FF4444' }]}>DETECTED</Text>
            </View>
          )}
        </View>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/*  FIELD INTELLIGENCE — derived from real sensor data               */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        <View style={ds.sectionHead}>
          <View style={ds.sectionLine} />
          <Text style={ds.sectionEye}>FIELD INTELLIGENCE</Text>
          <View style={ds.sectionLine} />
        </View>

        <View style={ds.intelGrid}>
          {/* Soil Health */}
          <IntelCard
            icon="seed-outline"
            eye="SOIL HEALTH"
            label={soil3.label}
            sub={`${soilDisplay === '--' ? '–' : soilDisplay + '%'}  ·  ${soil3.sub}`}
            color={soil3.color}
            bg={soil3.bg}
          />

          {/* Climate Index */}
          <IntelCard
            icon="weather-partly-cloudy"
            eye="CLIMATE INDEX"
            label={climate3.label}
            sub={climate3.sub}
            color={climate3.color}
            bg={climate3.bg}
          />

          {/* Threat Assessment */}
          <IntelCard
            icon={threat3.icon}
            eye="THREAT LEVEL"
            label={threat3.label}
            sub={threat3.sub}
            color={threat3.color}
            bg={threat3.bg}
          />

          {/* Robot Link */}
          <IntelCard
            icon={isConnected ? 'access-point' : 'access-point-off'}
            eye="ROBOT LINK"
            label={isConnected ? 'CONNECTED' : 'OFFLINE'}
            sub={isConnected ? `Active  ·  Up ${uptime}` : 'Check Wi-Fi or ESP32 power'}
            color={isConnected ? '#72F88A' : '#FF6B6B'}
            bg={isConnected ? '#0D1F12' : '#1F0808'}
          />
        </View>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/*  QUICK ACCESS — navigate to any module instantly                  */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        <View style={ds.sectionHead}>
          <View style={ds.sectionLine} />
          <Text style={ds.sectionEye}>QUICK ACCESS</Text>
          <View style={ds.sectionLine} />
        </View>

        <View style={ds.accessRow}>
          <AccessTile
            icon="controller-classic-outline"
            label="REMOTE"
            color="#72F88A"
            gradient={['#0E2015', '#060D09']}
            onPress={() => router.push('/remote')}
          />
          <AccessTile
            icon="access-point"
            label="SENSORS"
            color="#4ECDC4"
            gradient={['#071A1A', '#04100F']}
            onPress={() => router.push('/sensors')}
          />
          <AccessTile
            icon="map-marker-path"
            label="MAP"
            color="#C084FC"
            gradient={['#160920', '#0A0511']}
            onPress={() => router.push('/map')}
          />
          <AccessTile
            icon="chart-line"
            label="ANALYTICS"
            color="#FFD93D"
            gradient={['#1C1804', '#0C0D04']}
            onPress={() => router.push('/analytics')}
          />
        </View>

        {/* Tab bar clearance */}
        <View style={{ height: 30 }} />
      </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// New bottom-section styles (top section stays in dashboard.styles.ts)
// ─────────────────────────────────────────────────────────────────────────────

const ds = StyleSheet.create({

  // ── Top bar ────────────────────────────────────────────────────────────────
  modeChip: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius:    20,
    borderWidth:     1,
  },
  modeChipLocal: {
    backgroundColor: '#0D1F12',
    borderColor:     '#1E2820',
  },
  modeChipCloud: {
    backgroundColor: '#071428',
    borderColor:     '#1a2e4a',
  },
  modeChipText: {
    fontSize: 9, fontWeight: '800', letterSpacing: 1.4,
  },
  connectionChip: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius:    20,
    backgroundColor: '#111614',
    borderWidth:     1,
    borderColor:     '#1E2820',
  },
  connDot: {
    width: 7, height: 7, borderRadius: 4,
  },
  connText: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.5,
  },
  cogBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#151718',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Alert pill ─────────────────────────────────────────────────────────────
  alertPill: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             8,
    backgroundColor: '#1F0F0F',
    borderRadius:    12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth:     1,
    borderColor:     'rgba(255,107,107,0.3)',
  },
  alertPillText: {
    color: '#FF6B6B', fontSize: 12, fontWeight: '600', flex: 1,
  },

  // ── Section divider ────────────────────────────────────────────────────────
  sectionHead: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
    marginVertical: 4,
  },
  sectionLine: {
    flex: 1, height: 1, backgroundColor: '#1D2522',
  },
  sectionEye: {
    fontSize:     9,
    fontWeight:   '800',
    color:        '#3A4C3E',
    letterSpacing: 2.5,
  },

  // ── Intel 2×2 grid ─────────────────────────────────────────────────────────
  intelGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           10,
  },
  intelCard: {
    width:         '47.5%',
    borderRadius:  18,
    padding:       16,
    gap:           5,
    overflow:      'hidden',
    borderWidth:   1,
    borderColor:   'rgba(255,255,255,0.05)',
    position:      'relative',
  },
  intelIconWrap: {
    width:         36,
    height:        36,
    borderRadius:  10,
    alignItems:    'center',
    justifyContent: 'center',
    marginBottom:  4,
  },
  intelEye: {
    fontSize:     8,
    fontWeight:   '800',
    color:        '#3A4C3E',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  intelLabel: {
    fontSize:     14,
    fontWeight:   '900',
    letterSpacing: 0.5,
  },
  intelSub: {
    fontSize:   10,
    color:      '#5A7060',
    fontWeight: '500',
    lineHeight: 14,
  },
  intelBar: {
    position: 'absolute',
    bottom:   0,
    left:     0,
    right:    0,
    height:   2.5,
    borderRadius: 2,
    opacity:  0.6,
  },

  // ── Quick access row ────────────────────────────────────────────────────────
  accessRow: {
    flexDirection: 'row',
    gap:           10,
  },
  accessTile: {
    flex:          1,
    borderRadius:  16,
    paddingVertical: 16,
    alignItems:    'center',
    gap:           8,
    borderWidth:   1,
    borderColor:   'rgba(255,255,255,0.05)',
  },
  accessLabel: {
    fontSize:     9,
    fontWeight:   '800',
    letterSpacing: 1.5,
  },
});
