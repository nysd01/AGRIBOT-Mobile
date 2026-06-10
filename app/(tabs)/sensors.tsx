import { useESP32Sensors } from '@/hooks/use-esp32-sensors';
import { useAppMode }      from '@/context/AppModeContext';
import { sensorsStyles } from '@/styles/sensors.styles';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type SensorIconName =
  | 'thermometer'
  | 'water-percent'
  | 'flask'
  | 'map-marker'
  | 'lightbulb'
  | 'sun-wireless-outline'
  | 'leaf'
  | 'monitor'
  | 'weather-windy'
  | 'molecule-co2'
  | 'fire'
  | 'smoke-detector'
  | 'water'
  | 'speedometer';

type CustomSensor = {
  id: string;
  name: string;
  icon: SensorIconName;
  subtitle: string;
  iconColor: string;
};

/** Extra sensor types the user can add manually (excludes real hardware already built in) */
const ADDABLE_SENSORS: CustomSensor[] = [
  { id: 'co2',      name: 'CO₂',        icon: 'molecule-co2', subtitle: 'Air quality sensor', iconColor: '#00CCFF' },
  { id: 'wind',     name: 'Wind Speed', icon: 'weather-windy', subtitle: 'Anemometer',         iconColor: '#80AAFF' },
  { id: 'rain',     name: 'Rainfall',   icon: 'water',         subtitle: 'Rain gauge',         iconColor: '#4A9AFF' },
  { id: 'pressure', name: 'Pressure',   icon: 'speedometer',   subtitle: 'Barometric sensor',  iconColor: '#BB88FF' },
  // Smoke & Flame are real wired sensors already on AGRIBOT — they appear as built-in cards below
];

export default function SensorsScreen() {
  const { mode } = useAppMode();
  // esp32Ip omitted → auto-uses the global IP from ESP32Context
  // (switches to STA IP automatically after Network tab configures it)
  // 2 s matches the ESP32 firmware sensor-read cycle — no point polling faster
  const { sensorData, loading, error, isConnected } = useESP32Sensors({
    pollInterval: 2000,
  });

  const [extraSensorIds, setExtraIds] = useState<string[]>([]);
  const [showAddModal, setShowAddModal]   = useState(false);

  const handleAddSensor = (sensor: CustomSensor) => {
    if (extraSensorIds.includes(sensor.id)) {
      Alert.alert('Already added', `${sensor.name} is already in the list.`);
      return;
    }
    setExtraIds(prev => [...prev, sensor.id]);
    setShowAddModal(false);
  };

  const handleRemoveSensor = (id: string) => {
    Alert.alert('Remove sensor', 'Remove this sensor card?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setExtraIds(p => p.filter(x => x !== id)) },
    ]);
  };

  const sensors = useMemo(() => {
    const tempC         = sensorData?.domino4?.weather?.temperatureC ?? sensorData?.temperatureC ?? 0;
    const humidityPct   = sensorData?.domino4?.weather?.humidityPct  ?? sensorData?.humidityPct  ?? 0;
    const luxLevel      = sensorData?.domino4?.light?.luxLevel  ?? 0;
    const uvIndex       = sensorData?.domino4?.light?.uvIndex   ?? 0;
    const soilMoisture  = sensorData?.domino4?.soil?.moisturePct ?? sensorData?.soilMoisturePct ?? 0;
    const phValue       = sensorData?.adc?.ph      ?? sensorData?.ph ?? 0;
    const displayActive = sensorData?.systemInfo?.oledReady  ?? false;
    const sht3xReady    = sensorData?.systemInfo?.sht3xReady ?? false;

    // ── MQ Gas / Smoke sensor (GPIO34) ──────────────────────────────────────
    const smokeRaw      = sensorData?.smoke?.raw      ?? 0;
    const smokeDetected = sensorData?.smoke?.detected ?? false;

    // ── HW-484 Flame sensor (GPIO35) ────────────────────────────────────────
    const flameRaw      = sensorData?.flame?.raw      ?? 0;
    const flameDetected = sensorData?.flame?.detected ?? false;

    // ── GT-U7 GPS ────────────────────────────────────────────────────────────
    const gpsObj     = sensorData?.location?.gps;
    const gpsFix     = gpsObj?.valid ?? false;
    const gpsSats    = gpsObj?.satellites ?? 0;

    return [
      {
        id: 1,
        name: 'Env. Temperature',
        icon: 'thermometer' as SensorIconName,
        status: sht3xReady ? 'DHT11 • Live' : 'Waiting…',
        value: tempC ? `${tempC.toFixed(1)}°C` : '--',
        subtitle: 'DHT11 Temp/Humidity GPIO4',
        enabled: isConnected && sht3xReady,
        iconColor: '#FF6B6B',
        alert: false,
      },
      {
        id: 2,
        name: 'Humidity',
        icon: 'water-percent' as SensorIconName,
        status: sht3xReady ? 'DHT11 • Live' : 'Waiting…',
        value: humidityPct ? `${humidityPct.toFixed(0)}%` : '--',
        subtitle: 'DHT11 Temp/Humidity GPIO4',
        enabled: isConnected && sht3xReady,
        iconColor: '#4A9AFF',
        alert: false,
      },
      {
        id: 3,
        name: 'Light Level',
        icon: 'lightbulb' as SensorIconName,
        status: 'LTR390 • Live',
        value: luxLevel ? `${luxLevel.toFixed(0)} lux` : '--',
        subtitle: 'I2C LTR390 @ 0x53',
        enabled: isConnected,
        iconColor: '#FFB84D',
        alert: false,
      },
      {
        id: 9,
        name: 'UV Index',
        icon: 'sun-wireless-outline' as SensorIconName,
        status: 'LTR390 • Live',
        value: uvIndex ? `${uvIndex.toFixed(2)}` : '--',
        subtitle: 'I2C LTR390 @ 0x53',
        enabled: isConnected,
        iconColor: '#AA44FF',
        alert: false,
      },
      {
        id: 6,
        name: 'Soil Moisture',
        icon: 'leaf' as SensorIconName,
        status: 'HW-080 • Live',
        value: soilMoisture >= 0 ? `${soilMoisture.toFixed(0)}%` : '--',
        subtitle: 'HW-080 Capacitive GPIO33',
        enabled: isConnected,
        iconColor: '#58C95F',
        alert: false,
      },
      // ── Real wired sensors ───────────────────────────────────────────────
      {
        id: 11,
        name: 'Smoke / Gas',
        icon: 'smoke-detector' as SensorIconName,
        status: !isConnected ? 'Offline' : smokeDetected ? '⚠  SMOKE DETECTED' : `Normal (${smokeRaw})`,
        value: isConnected ? (smokeDetected ? 'ALERT' : 'Clear') : '--',
        subtitle: 'MQ Gas Sensor GPIO34',
        enabled: isConnected,
        iconColor: smokeDetected ? '#FF4533' : '#CC7700',
        alert: smokeDetected,
      },
      {
        id: 12,
        name: 'Flame',
        icon: 'fire' as SensorIconName,
        status: !isConnected ? 'Offline' : flameDetected ? '⚠  FLAME DETECTED' : `No flame (${flameRaw})`,
        value: isConnected ? (flameDetected ? 'ALERT' : 'None') : '--',
        subtitle: 'HW-484 Flame Sensor GPIO35',
        enabled: isConnected,
        iconColor: flameDetected ? '#FF2200' : '#FF7733',
        alert: flameDetected,
      },
      // ─────────────────────────────────────────────────────────────────────
      {
        id: 7,
        name: 'OLED Display',
        icon: 'monitor' as SensorIconName,
        status: displayActive ? 'Active' : 'Inactive',
        value: displayActive ? 'ON' : 'OFF',
        subtitle: 'I2C OLED @ 0x3C',
        enabled: isConnected && displayActive,
        iconColor: '#00AA00',
        alert: false,
      },
      {
        id: 4,
        name: 'pH',
        icon: 'flask' as SensorIconName,
        status: 'ADC • Optional',
        value: phValue >= 0 ? phValue.toFixed(1) : '--',
        subtitle: 'Analog pH probe (optional)',
        enabled: isConnected,
        iconColor: '#FF9500',
        alert: false,
      },
      {
        id: 5,
        name: 'GPS (GT-U7)',
        icon: 'map-marker' as SensorIconName,
        status: !isConnected ? 'Offline' : gpsFix ? `Fix OK • ${gpsSats} sats` : `No fix • ${gpsSats} sats visible`,
        value: gpsFix
          ? `${gpsObj?.lat?.toFixed(5)}, ${gpsObj?.lng?.toFixed(5)}`
          : gpsSats > 0 ? 'Acquiring…' : 'No signal',
        subtitle: 'UART2 GT-U7 GPS  RX16 TX17',
        enabled: isConnected && gpsFix,
        iconColor: gpsFix ? '#4A9AFF' : gpsSats > 0 ? '#F4A460' : '#555',
        alert: false,
      },
    ];
  }, [sensorData, isConnected]);

  // Extra sensors added by user
  const extraSensors = useMemo(
    () => ADDABLE_SENSORS.filter(s => extraSensorIds.includes(s.id)),
    [extraSensorIds]
  );

  return (
    <SafeAreaView style={sensorsStyles.safe}>
      <ScrollView style={sensorsStyles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={sensorsStyles.headerSection}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={sensorsStyles.diagnosticLabel}>DIAGNOSTIC SHELL V4.2</Text>
            <View style={[addStyles.sourceBadge, mode === 'online' ? addStyles.sourceBadgeCloud : addStyles.sourceBadgeLocal]}>
              <MaterialCommunityIcons
                name={mode === 'online' ? 'cloud-outline' : 'wifi'}
                size={11}
                color={mode === 'online' ? '#4A9AFF' : '#72F88A'}
              />
              <Text style={[addStyles.sourceBadgeText, { color: mode === 'online' ? '#4A9AFF' : '#72F88A' }]}>
                {mode === 'online' ? 'CLOUD DATA' : 'ESP32 DIRECT'}
              </Text>
            </View>
          </View>
          <Text style={sensorsStyles.pageTitle}>Sensors</Text>
          <View style={sensorsStyles.titleUnderline} />
        </View>

        {/* Connection error banner */}
        {!isConnected && (
          <View style={addStyles.alertBanner}>
            <MaterialCommunityIcons name="alert-circle" size={16} color="#FF4533" />
            <Text style={addStyles.alertText}>
              {error || 'Not connected to ESP32. Go to Network tab to connect.'}
            </Text>
          </View>
        )}

        {/* Initial loading */}
        {loading && !sensorData && (
          <View style={addStyles.loadingWrap}>
            <ActivityIndicator size="large" color="#4A9AFF" />
            <Text style={addStyles.loadingText}>Fetching sensor data…</Text>
          </View>
        )}

        {/* System status row */}
        {sensorData?.systemInfo && (
          <View style={addStyles.statusRow}>
            <View style={addStyles.statusChip}>
              <View style={[addStyles.statusDot, { backgroundColor: sensorData.systemInfo.i2cReady ? '#58C95F' : '#555' }]} />
              <Text style={addStyles.statusChipText}>I2C Bus</Text>
            </View>
            <View style={addStyles.statusChip}>
              <View style={[addStyles.statusDot, { backgroundColor: sensorData.systemInfo.sht3xReady ? '#58C95F' : '#555' }]} />
              <Text style={addStyles.statusChipText}>SHT3x</Text>
            </View>
            <View style={addStyles.statusChip}>
              <View style={[addStyles.statusDot, { backgroundColor: sensorData.systemInfo.oledReady ? '#00AA00' : '#555' }]} />
              <Text style={addStyles.statusChipText}>OLED</Text>
            </View>
            {sensorData.systemInfo.uptimeSeconds > 0 && (
              <Text style={addStyles.uptime}>
                Uptime {sensorData.systemInfo.uptimeSeconds}s
              </Text>
            )}
          </View>
        )}

        {/* Built-in sensors grid */}
        <View style={sensorsStyles.sensorsGrid}>
          {sensors.map(sensor => (
            <View
              key={sensor.id}
              style={[
                sensorsStyles.sensorCard,
                sensor.alert && addStyles.sensorCardAlert,
              ]}
            >
              <View style={[sensorsStyles.sensorIconContainer, { backgroundColor: sensor.iconColor + '25' }]}>
                <MaterialCommunityIcons
                  name={sensor.icon}
                  size={28}
                  color={sensor.alert ? sensor.iconColor : sensor.enabled ? sensor.iconColor : '#6C7473'}
                />
              </View>
              <View style={sensorsStyles.sensorContent}>
                <Text style={[sensorsStyles.sensorName, sensor.alert && { color: '#FF4533' }]}>
                  {sensor.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[
                    sensorsStyles.sensorStatus,
                    sensor.alert ? { color: '#FF4533', fontWeight: '700' } : sensor.enabled && sensorsStyles.sensorStatusActive,
                  ]}>
                    {'• ' + sensor.status}
                  </Text>
                  {sensor.value ? (
                    <Text style={[sensorsStyles.sensorValue, sensor.alert && { color: '#FF4533' }]}>
                      {sensor.value}
                    </Text>
                  ) : null}
                </View>
                {sensor.subtitle ? (
                  <Text style={addStyles.subText}>{sensor.subtitle}</Text>
                ) : null}
              </View>
              <View style={[sensorsStyles.sensorToggle, {
                backgroundColor: sensor.alert ? '#FF453322' : sensor.enabled ? '#58C95F33' : '#6C747333',
                borderRadius: 20,
              }]}>
                <MaterialCommunityIcons
                  name={sensor.alert ? 'alert-circle' : sensor.enabled ? 'check-circle' : 'circle-outline'}
                  size={20}
                  color={sensor.alert ? '#FF4533' : sensor.enabled ? '#58C95F' : '#888'}
                />
              </View>
            </View>
          ))}
        </View>

        {/* Extra user-added sensors */}
        {extraSensors.length > 0 && (
          <View style={sensorsStyles.sensorsGrid}>
            {extraSensors.map(s => (
              <Pressable
                key={s.id}
                style={sensorsStyles.sensorCard}
                onLongPress={() => handleRemoveSensor(s.id)}
              >
                <View style={[sensorsStyles.sensorIconContainer, { backgroundColor: s.iconColor + '20' }]}>
                  <MaterialCommunityIcons name={s.icon} size={28} color={s.iconColor} />
                </View>
                <View style={sensorsStyles.sensorContent}>
                  <Text style={sensorsStyles.sensorName}>{s.name}</Text>
                  <Text style={[sensorsStyles.sensorStatus, { color: '#666' }]}>• Not connected</Text>
                  <Text style={addStyles.subText}>{s.subtitle}</Text>
                </View>
                <View style={[sensorsStyles.sensorToggle, { backgroundColor: '#6C747333', borderRadius: 20 }]}>
                  <MaterialCommunityIcons name="circle-outline" size={20} color="#888" />
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Stats footer */}
        {sensorData && (
          <View style={sensorsStyles.statsSection}>
            <View style={sensorsStyles.statCard}>
              <Text style={sensorsStyles.statLabel}>BATTERY</Text>
              <Text style={sensorsStyles.statValue}>
                {(sensorData.adc?.batteryPct ?? sensorData.batteryPct ?? -1) >= 0
                  ? `${(sensorData.adc?.batteryPct ?? sensorData.batteryPct ?? 0).toFixed(0)}%`
                  : '--'}
              </Text>
            </View>
            <View style={sensorsStyles.statCard}>
              <Text style={sensorsStyles.statLabel}>CONNECTION</Text>
              <Text style={sensorsStyles.statValue}>{isConnected ? 'Active' : 'Offline'}</Text>
            </View>
            <View style={sensorsStyles.statCard}>
              <Text style={sensorsStyles.statLabel}>I2C BUS</Text>
              <Text style={sensorsStyles.statValue}>{sensorData.systemInfo?.i2cReady ? 'Ready' : 'Offline'}</Text>
            </View>
          </View>
        )}

        {/* ── Add Sensor button ── */}
        <TouchableOpacity style={addStyles.addBtn} onPress={() => setShowAddModal(true)} activeOpacity={0.8}>
          <MaterialCommunityIcons name="plus-circle-outline" size={22} color="#58C95F" />
          <Text style={addStyles.addBtnText}>Add Sensor</Text>
        </TouchableOpacity>
        <Text style={addStyles.addHint}>Long-press a custom sensor card to remove it.</Text>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── Add Sensor Modal ── */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <Pressable style={addStyles.modalOverlay} onPress={() => setShowAddModal(false)}>
          <Pressable style={addStyles.modalSheet} onPress={e => e.stopPropagation()}>
            <View style={addStyles.modalHandle} />
            <Text style={addStyles.modalTitle}>Add a Sensor</Text>
            <Text style={addStyles.modalSubtitle}>Select a sensor type to add to your dashboard.</Text>
            {ADDABLE_SENSORS.map(s => {
              const alreadyAdded = extraSensorIds.includes(s.id);
              return (
                <Pressable
                  key={s.id}
                  style={[addStyles.modalItem, alreadyAdded && addStyles.modalItemAdded]}
                  onPress={() => !alreadyAdded && handleAddSensor(s)}
                >
                  <View style={[addStyles.modalItemIcon, { backgroundColor: s.iconColor + '22' }]}>
                    <MaterialCommunityIcons name={s.icon} size={22} color={alreadyAdded ? '#555' : s.iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[addStyles.modalItemName, alreadyAdded && { color: '#555' }]}>{s.name}</Text>
                    <Text style={addStyles.modalItemSub}>{s.subtitle}</Text>
                  </View>
                  {alreadyAdded
                    ? <MaterialCommunityIcons name="check" size={18} color="#555" />
                    : <MaterialCommunityIcons name="plus" size={18} color="#58C95F" />}
                </Pressable>
              );
            })}
            <TouchableOpacity style={addStyles.modalCancel} onPress={() => setShowAddModal(false)}>
              <Text style={addStyles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const addStyles = StyleSheet.create({
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF453322',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FF4533',
    gap: 8,
  },
  alertText: { color: '#FF4533', fontSize: 13, flex: 1 },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  loadingText: { color: '#888', marginTop: 12, fontSize: 14 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#333',
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusChipText: { color: '#aaa', fontSize: 11, fontWeight: '600' },
  uptime: { color: '#555', fontSize: 11, marginLeft: 4 },
  subText: { fontSize: 10, color: '#888', marginTop: 4 },
  /* Add button */
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#58C95F55',
    backgroundColor: '#58C95F11',
  },
  addBtnText: { color: '#58C95F', fontSize: 15, fontWeight: '700' },
  addHint: { textAlign: 'center', color: '#444', fontSize: 11, marginTop: 8 },
  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#111617',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: 'rgba(88,201,95,0.12)',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: { color: '#F3F7F6', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  modalSubtitle: { color: '#7A8582', fontSize: 13, marginBottom: 16 },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e2526',
  },
  modalItemAdded: { opacity: 0.5 },
  modalItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalItemName: { color: '#F3F7F6', fontSize: 15, fontWeight: '700' },
  modalItemSub: { color: '#7A8582', fontSize: 12, marginTop: 2 },
  modalCancel: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1e2526',
  },
  modalCancelText: { color: '#7A8582', fontSize: 15, fontWeight: '600' },

  // Alert state — red border flash on smoke/flame detected cards
  sensorCardAlert: {
    borderWidth: 1.5,
    borderColor: '#FF453388',
    backgroundColor: '#FF453308',
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  sourceBadgeLocal: {
    backgroundColor: '#0D1F12',
    borderColor: '#1E2820',
  },
  sourceBadgeCloud: {
    backgroundColor: '#071428',
    borderColor: '#1a2e4a',
  },
  sourceBadgeText: {
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 1.2,
  },
});
