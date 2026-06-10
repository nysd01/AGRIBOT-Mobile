/**
 * Map screen — Google Maps with:
 *  • Robot GPS trail  (live from ESP32 → shown even when fix is briefly lost)
 *  • Phone GPS        (blue dot via expo-location)
 *  • Both markers use emoji images inside styled bubbles
 *  • Cloud-ready: data is logged locally; future push to backend possible
 *
 * Install expo-location if not yet done:
 *   npx expo install expo-location
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useESP32Sensors } from '@/hooks/use-esp32-sensors';
import { useESP32IP, AP_IP } from '@/context/ESP32Context';

// Graceful import — expo-location is optional
let Location: typeof import('expo-location') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Location = require('expo-location');
} catch {}

type Coord = { latitude: number; longitude: number };

const DEFAULT_REGION = {
  latitude:      5.3599517,
  longitude:    -4.0082563,
  latitudeDelta:  0.01,
  longitudeDelta: 0.01,
};

// ─── Robot marker bubble ─────────────────────────────────────────────────────

function RobotMarker({ stale }: { stale: boolean }) {
  return (
    <View style={mk.robotWrap}>
      <View style={[mk.robotBubble, stale && mk.robotBubbleStale]}>
        <Text style={mk.robotEmoji}>🤖</Text>
      </View>
      <View style={[mk.bubbleTail, stale && mk.bubbleTailStale]} />
      <Text style={[mk.markerLabel, stale && { color: '#F8C472' }]}>
        {stale ? 'AGRIBOT (last)' : 'AGRIBOT'}
      </Text>
    </View>
  );
}

// ─── Phone marker bubble ─────────────────────────────────────────────────────

function PhoneMarker() {
  return (
    <View style={mk.phoneWrap}>
      <View style={mk.phoneBubble}>
        <Text style={mk.phoneEmoji}>📱</Text>
      </View>
      <View style={mk.phoneTail} />
      <Text style={mk.markerLabel}>You</Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function MapScreen() {
  const { sensorData, isConnected } = useESP32Sensors();
  const { espIP, resetToAP }        = useESP32IP();
  const mapRef = useRef<MapView>(null);

  // Robot GPS trail
  const [trail,        setTrail]        = useState<Coord[]>([]);
  const [currentCoord, setCurrentCoord] = useState<Coord | null>(null);
  const [lastKnown,    setLastKnown]    = useState<Coord | null>(null); // stale fallback
  const [following,    setFollowing]    = useState(true);
  const [gpsStale,     setGpsStale]     = useState(false);

  // Phone location
  const [userCoord,       setUserCoord]       = useState<Coord | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [showUserMarker,  setShowUserMarker]  = useState(true);

  // ── Parse ESP32 GPS fields ──────────────────────────────────────────────
  const gpsData    = sensorData?.location?.gps;
  const legacyGps  = sensorData?.gps;
  const lat        = gpsData?.lat        ?? legacyGps?.lat;
  const lng        = gpsData?.lng        ?? legacyGps?.lng;
  const gpsValid   = gpsData?.valid      ?? Boolean(lat && lng);
  const satellites = gpsData?.satellites ?? 0;
  const speed      = gpsData?.speed_kmph ?? 0;
  const altitude   = gpsData?.altitude   ?? 0;

  // ── Update robot trail + last-known fallback ────────────────────────────
  useEffect(() => {
    if (gpsValid && lat !== undefined && lng !== undefined) {
      const coord: Coord = { latitude: lat, longitude: lng };
      setCurrentCoord(coord);
      setLastKnown(coord);   // save for stale fallback
      setGpsStale(false);
      setTrail(prev => {
        const last = prev[prev.length - 1];
        if (last?.latitude === coord.latitude && last?.longitude === coord.longitude) return prev;
        return [...prev.slice(-300), coord]; // keep last 300 points
      });
      if (following) {
        mapRef.current?.animateToRegion(
          { ...coord, latitudeDelta: 0.001, longitudeDelta: 0.001 },
          600,
        );
      }
    } else {
      // GPS lost fix — keep last known marker visible but mark it stale
      setCurrentCoord(null);
      if (lastKnown) setGpsStale(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, gpsValid, following]);

  // ── Phone GPS ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!Location) return;
    let sub: { remove: () => void } | null = null;

    const start = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location permission denied',
          'Enable location in phone Settings to see your position on the map.',
        );
        return;
      }
      setLocationGranted(true);
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 2 },
        pos => setUserCoord({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      );
    };

    void start();
    return () => { sub?.remove(); };
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────────
  const clearTrail   = () => { setTrail([]); setLastKnown(null); setGpsStale(false); };
  const centerOnUser = () => {
    if (!userCoord) { Alert.alert('No phone GPS', 'Location not available yet.'); return; }
    mapRef.current?.animateToRegion({ ...userCoord, latitudeDelta: 0.001, longitudeDelta: 0.001 }, 600);
  };
  const centerOnRobot = () => {
    const c = currentCoord ?? lastKnown;
    if (!c) { Alert.alert('No robot GPS', 'Waiting for GPS fix.'); return; }
    mapRef.current?.animateToRegion({ ...c, latitudeDelta: 0.001, longitudeDelta: 0.001 }, 600);
  };

  // Displayed marker position = live || stale last-known
  const displayCoord = currentCoord ?? (gpsStale ? lastKnown : null);

  // ── Router / connection hint ─────────────────────────────────────────────
  const onRouter = espIP !== AP_IP;

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'web' ? undefined : PROVIDER_GOOGLE}
        initialRegion={DEFAULT_REGION}
        showsCompass
        showsScale
        showsMyLocationButton={false}
      >
        {/* ── Robot marker (live or last-known-stale) ── */}
        {displayCoord && (
          <Marker
            coordinate={displayCoord}
            title={gpsStale ? 'AGRIBOT (last known)' : 'AGRIBOT'}
            description={`${displayCoord.latitude.toFixed(6)}, ${displayCoord.longitude.toFixed(6)}`}
            anchor={{ x: 0.5, y: 1.0 }}
          >
            <RobotMarker stale={gpsStale} />
          </Marker>
        )}

        {/* ── GPS trail ── */}
        {trail.length > 1 && (
          <Polyline
            coordinates={trail}
            strokeColor="#72F88A"
            strokeWidth={3}
            lineDashPattern={[6, 3]}
          />
        )}

        {/* ── Phone (user) marker ── */}
        {showUserMarker && userCoord && (
          <Marker
            coordinate={userCoord}
            title="Your phone"
            description={`${userCoord.latitude.toFixed(6)}, ${userCoord.longitude.toFixed(6)}`}
            anchor={{ x: 0.5, y: 1.0 }}
          >
            <PhoneMarker />
          </Marker>
        )}
      </MapView>

      {/* ── Header ── */}
      <SafeAreaView edges={['top']} style={styles.headerWrap} pointerEvents="box-none">
        <View style={styles.headerCard}>
          <MaterialCommunityIcons name="satellite-variant" size={15} color="#72F88A" />
          <Text style={styles.headerTitle}>GPS TRACKING</Text>
          <View style={[styles.dot, { backgroundColor: isConnected ? '#72F88A' : '#F87272' }]} />
          {onRouter && (
            <View style={styles.routerBadge}>
              <MaterialCommunityIcons name="router-wireless" size={11} color="#070A0A" />
              <Text style={styles.routerBadgeText}>Router</Text>
            </View>
          )}
        </View>
      </SafeAreaView>

      {/* ── FAB column ── */}
      <View style={styles.fabCol} pointerEvents="box-none">
        {/* Follow robot */}
        <TouchableOpacity
          style={[styles.fab, following && styles.fabActive]}
          onPress={() => setFollowing(v => !v)}
        >
          <MaterialCommunityIcons
            name={following ? 'crosshairs-gps' : 'crosshairs'}
            size={20}
            color={following ? '#070A0A' : '#72F88A'}
          />
        </TouchableOpacity>

        {/* Centre on robot */}
        <TouchableOpacity style={styles.fab} onPress={centerOnRobot}>
          <MaterialCommunityIcons name="robot" size={20} color="#72F88A" />
        </TouchableOpacity>

        {/* Centre on phone */}
        <TouchableOpacity
          style={[styles.fab, !locationGranted && styles.fabDisabled]}
          onPress={centerOnUser}
        >
          <MaterialCommunityIcons name="cellphone-marker" size={20} color="#4A9AFF" />
        </TouchableOpacity>

        {/* Toggle phone marker */}
        <TouchableOpacity
          style={[styles.fab, !showUserMarker && { opacity: 0.4 }]}
          onPress={() => setShowUserMarker(v => !v)}
        >
          <MaterialCommunityIcons
            name={showUserMarker ? 'map-marker-account' : 'map-marker-account-outline'}
            size={20}
            color="#4A9AFF"
          />
        </TouchableOpacity>

        {/* Clear trail */}
        <TouchableOpacity style={styles.fab} onPress={clearTrail}>
          <MaterialCommunityIcons name="delete-outline" size={20} color="#F87272" />
        </TouchableOpacity>
      </View>

      {/* ── Bottom info panel ── */}
      <View style={styles.infoPanel} pointerEvents="box-none">

        {/* Robot GPS row */}
        {!gpsValid ? (
          <View style={styles.noGpsRow}>
            <MaterialCommunityIcons
              name="satellite-variant"
              size={16}
              color={satellites > 0 ? '#F4A460' : '#888'}
            />
            <Text style={[styles.noGpsText, satellites > 0 && { color: '#F4A460' }]}>
              {satellites > 0
                ? `Robot GPS: acquiring… (${satellites} sats visible)`
                : 'Robot GPS: no signal — needs clear sky view'}
            </Text>
            {gpsStale && lastKnown && (
              <View style={styles.staleBadge}>
                <Text style={styles.staleBadgeText}>LAST KNOWN</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.statsRow}>
            {[
              { label: 'LAT',   value: lat?.toFixed(5) ?? '--' },
              { label: 'LNG',   value: lng?.toFixed(5) ?? '--' },
              { label: 'SATS',  value: String(satellites) },
              { label: 'KM/H',  value: speed.toFixed(1) },
              { label: 'ALT',   value: `${altitude.toFixed(0)}m` },
            ].map((s, i, arr) => (
              <React.Fragment key={s.label}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>{s.label}</Text>
                  <Text style={styles.statValue}>{s.value}</Text>
                </View>
                {i < arr.length - 1 && <View style={styles.statDivider} />}
              </React.Fragment>
            ))}
          </View>
        )}

        {/* Phone GPS row */}
        {userCoord ? (
          <View style={styles.phoneRow}>
            <Text style={styles.phoneEmoji2}>📱</Text>
            <Text style={styles.phoneRowText}>
              You: {userCoord.latitude.toFixed(5)}, {userCoord.longitude.toFixed(5)}
            </Text>
          </View>
        ) : !Location ? (
          <Text style={styles.locationHint}>
            Run: npx expo install expo-location  — for phone GPS
          </Text>
        ) : (
          <View style={styles.phoneRow}>
            <Text style={styles.phoneEmoji2}>📱</Text>
            <Text style={[styles.phoneRowText, { color: '#555' }]}>
              {locationGranted ? 'Getting phone GPS…' : 'Location permission needed'}
            </Text>
          </View>
        )}

        {/* Trail + connection row */}
        <View style={styles.trailRow}>
          <MaterialCommunityIcons name="vector-polyline" size={13} color="#72F88A" />
          <Text style={styles.trailText}>{trail.length} waypoints</Text>
          {!isConnected && <Text style={styles.offlineTag}>OFFLINE</Text>}
          {onRouter && <Text style={styles.routerTag}>📡 ROUTER</Text>}
        </View>
      </View>
    </View>
  );
}

// ─── Marker styles ────────────────────────────────────────────────────────────

const mk = StyleSheet.create({
  // Robot
  robotWrap:   { alignItems: 'center' },
  robotBubble: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#72F88A',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
  },
  robotBubbleStale: { backgroundColor: '#F4A460', borderColor: '#ffd580' },
  robotEmoji: { fontSize: 24 },
  bubbleTail: {
    width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 10,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: '#72F88A',
  },
  bubbleTailStale: { borderTopColor: '#F4A460' },
  markerLabel: {
    color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },

  // Phone
  phoneWrap:   { alignItems: 'center' },
  phoneBubble: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#4A9AFF',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, elevation: 4,
  },
  phoneEmoji: { fontSize: 20 },
  phoneTail:  {
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: '#4A9AFF',
  },
});

// ─── Screen styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070A0A' },

  // Header
  headerWrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  headerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
    backgroundColor: 'rgba(7,10,10,0.90)', borderRadius: 22,
    paddingHorizontal: 18, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(114,248,138,0.25)',
  },
  headerTitle:   { color: '#E6F4EA', fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  dot:           { width: 8, height: 8, borderRadius: 4 },
  routerBadge:   { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#72F88A', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  routerBadgeText: { color: '#070A0A', fontSize: 10, fontWeight: '800' },

  // FABs
  fabCol:     { position: 'absolute', right: 14, bottom: 250, gap: 10, zIndex: 10 },
  fab:        { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(7,10,10,0.90)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(114,248,138,0.2)' },
  fabActive:  { backgroundColor: '#72F88A' },
  fabDisabled:{ opacity: 0.4 },

  // Info panel
  infoPanel: {
    position: 'absolute', bottom: 90, left: 14, right: 14,
    backgroundColor: 'rgba(7,10,10,0.93)', borderRadius: 20, padding: 14, gap: 10,
    borderWidth: 1, borderColor: 'rgba(114,248,138,0.18)',
  },

  // GPS rows
  noGpsRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  noGpsText: { color: '#888', fontSize: 12, fontWeight: '600', flex: 1 },
  staleBadge: { backgroundColor: '#F4A46033', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  staleBadgeText: { color: '#F4A460', fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },

  statsRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stat:       { alignItems: 'center', flex: 1 },
  statLabel:  { color: '#6C7473', fontSize: 9,  fontWeight: '700', letterSpacing: 1 },
  statValue:  { color: '#E6F4EA', fontSize: 11, fontWeight: '700', marginTop: 2 },
  statDivider:{ width: 1, height: 26, backgroundColor: 'rgba(114,248,138,0.12)' },

  phoneRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  phoneEmoji2:  { fontSize: 14 },
  phoneRowText: { color: '#4A9AFF', fontSize: 11, fontWeight: '600' },
  locationHint: { color: '#444', fontSize: 10, fontStyle: 'italic' },

  trailRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trailText:  { color: '#72F88A', fontSize: 11, fontWeight: '600', flex: 1 },
  offlineTag: { color: '#F87272', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  routerTag:  { color: '#72F88A', fontSize: 10, fontWeight: '700' },
});
