/**
 * Map screen — Leaflet map inside a WebView (no Google Maps API key needed):
 *  • Robot GPS trail  (live from ESP32 → shown even when fix is briefly lost)
 *  • Phone GPS        (blue dot via expo-location)
 *  • Both markers are emoji bubbles drawn with Leaflet divIcons
 *
 * Why a WebView instead of react-native-maps?
 *  react-native-maps on Android only renders Google's base tiles, which require
 *  a paid Google Maps API key. UrlTile overlays (OSM/Carto) don't paint under
 *  this project's new architecture. A WebView running Leaflet sidesteps both:
 *  it renders free Carto/OSM raster tiles directly, needs no API key, and works
 *  anywhere there's internet (which Online mode requires anyway).
 *
 * Install expo-location if not yet done:
 *   npx expo install expo-location
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

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
  latitude:   5.3599517,
  longitude: -4.0082563,
};

// ─── Leaflet map document ─────────────────────────────────────────────────────
// Self-contained HTML loaded into the WebView. Leaflet is pulled from a CDN
// (the map needs internet for tiles regardless). RN drives it by injecting calls
// to the window.* functions defined here; it posts 'ready' once the map exists.
const LEAFLET_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { margin:0; padding:0; height:100%; width:100%; background:#0b1110; }
  .bubble {
    display:flex; align-items:center; justify-content:center;
    border-radius:50%; border:2.5px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,0.4);
  }
  .robot { width:42px; height:42px; background:#72F88A; font-size:22px; }
  .robot.stale { background:#F4A460; border-color:#ffd580; }
  .phone { width:36px; height:36px; background:#4A9AFF; font-size:18px; }
  .mlabel {
    text-align:center; color:#fff; font-size:10px; font-weight:800; margin-top:2px;
    text-shadow:0 1px 3px rgba(0,0,0,0.9); font-family:sans-serif; white-space:nowrap;
  }
  .leaflet-control-attribution { font-size:9px; background:rgba(7,10,10,0.6); color:#9bb; }
  .leaflet-control-attribution a { color:#7dc; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl:false, attributionControl:true })
             .setView([${DEFAULT_REGION.latitude}, ${DEFAULT_REGION.longitude}], 16);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
    maxZoom: 20,
    subdomains: 'abcd',
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  }).addTo(map);

  var robotMarker = null, phoneMarker = null, trailLine = null;
  var follow = true, firstFix = true;

  function robotIcon(stale){
    var label = stale ? 'AGRIBOT (last)' : 'AGRIBOT';
    var cls = stale ? 'bubble robot stale' : 'bubble robot';
    return L.divIcon({
      className:'',
      html:'<div style="display:flex;flex-direction:column;align-items:center;">'
        + '<div class="'+cls+'">\u{1F916}</div>'
        + '<div class="mlabel">'+label+'</div></div>',
      iconSize:[46,60], iconAnchor:[23,46]
    });
  }
  function phoneIcon(){
    return L.divIcon({
      className:'',
      html:'<div style="display:flex;flex-direction:column;align-items:center;">'
        + '<div class="bubble phone">\u{1F4F1}</div>'
        + '<div class="mlabel">You</div></div>',
      iconSize:[40,54], iconAnchor:[20,40]
    });
  }

  window.setRobot = function(lat, lng, stale){
    var ll = [lat, lng];
    if (!robotMarker) { robotMarker = L.marker(ll, { icon: robotIcon(stale) }).addTo(map); }
    else { robotMarker.setLatLng(ll); robotMarker.setIcon(robotIcon(stale)); }
    if (follow) {
      if (firstFix) { map.setView(ll, 17, { animate:true }); }
      else { map.panTo(ll, { animate:true }); }
    }
    firstFix = false;
  };
  window.clearRobot = function(){
    if (robotMarker) { map.removeLayer(robotMarker); robotMarker = null; }
  };
  window.setPhone = function(lat, lng){
    var ll = [lat, lng];
    if (!phoneMarker) { phoneMarker = L.marker(ll, { icon: phoneIcon() }).addTo(map); }
    else { phoneMarker.setLatLng(ll); }
  };
  window.removePhone = function(){
    if (phoneMarker) { map.removeLayer(phoneMarker); phoneMarker = null; }
  };
  window.setTrail = function(coordsJson){
    var coords = JSON.parse(coordsJson);
    if (trailLine) { map.removeLayer(trailLine); trailLine = null; }
    if (coords.length > 1) {
      trailLine = L.polyline(coords, { color:'#72F88A', weight:3, dashArray:'6,3' }).addTo(map);
    }
  };
  window.centerOn = function(lat, lng){ map.setView([lat, lng], 17, { animate:true }); };
  window.setFollow = function(f){
    follow = f;
    if (f && robotMarker) { map.panTo(robotMarker.getLatLng(), { animate:true }); }
  };

  function notifyReady(){
    if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage('ready'); }
  }
  notifyReady();
</script>
</body>
</html>`;

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function MapScreen() {
  const { sensorData, isConnected } = useESP32Sensors();
  const { espIP }                   = useESP32IP();
  const webRef = useRef<WebView>(null);

  const [mapReady, setMapReady] = useState(false);

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

  // Inject a JS call into the Leaflet WebView (no-op until the map is ready).
  const inject = useCallback((js: string) => {
    webRef.current?.injectJavaScript(js + ' true;');
  }, []);

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
    } else {
      // GPS lost fix — keep last known marker visible but mark it stale
      setCurrentCoord(null);
      if (lastKnown) setGpsStale(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, gpsValid]);

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

  // Displayed marker position = live || stale last-known
  const displayCoord = currentCoord ?? (gpsStale ? lastKnown : null);

  // ── Push state into the Leaflet map (re-runs on mapReady so the initial
  //    state is flushed once the WebView signals it's ready) ───────────────
  useEffect(() => {
    if (!mapReady) return;
    if (displayCoord) inject(`window.setRobot(${displayCoord.latitude}, ${displayCoord.longitude}, ${gpsStale});`);
    else inject('window.clearRobot();');
  }, [mapReady, displayCoord, gpsStale, inject]);

  useEffect(() => {
    if (!mapReady) return;
    if (showUserMarker && userCoord) inject(`window.setPhone(${userCoord.latitude}, ${userCoord.longitude});`);
    else inject('window.removePhone();');
  }, [mapReady, showUserMarker, userCoord, inject]);

  useEffect(() => {
    if (!mapReady) return;
    const coords = trail.map(c => [c.latitude, c.longitude]);
    inject(`window.setTrail('${JSON.stringify(coords)}');`);
  }, [mapReady, trail, inject]);

  useEffect(() => {
    if (!mapReady) return;
    inject(`window.setFollow(${following});`);
  }, [mapReady, following, inject]);

  // ── Helpers ─────────────────────────────────────────────────────────────
  const clearTrail   = () => { setTrail([]); setLastKnown(null); setGpsStale(false); };
  const centerOnUser = () => {
    if (!userCoord) { Alert.alert('No phone GPS', 'Location not available yet.'); return; }
    inject(`window.centerOn(${userCoord.latitude}, ${userCoord.longitude});`);
  };
  const centerOnRobot = () => {
    const c = currentCoord ?? lastKnown;
    if (!c) { Alert.alert('No robot GPS', 'Waiting for GPS fix.'); return; }
    inject(`window.centerOn(${c.latitude}, ${c.longitude});`);
  };

  // ── Router / connection hint ─────────────────────────────────────────────
  const onRouter = espIP !== AP_IP;

  return (
    <View style={styles.root}>
      <WebView
        ref={webRef}
        style={StyleSheet.absoluteFill}
        originWhitelist={['*']}
        source={{ html: LEAFLET_HTML }}
        javaScriptEnabled
        domStorageEnabled
        androidLayerType="hardware"
        onMessage={e => { if (e.nativeEvent.data === 'ready') setMapReady(true); }}
      />

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
