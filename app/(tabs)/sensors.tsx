import React, { useMemo } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { sensorsStyles } from '@/styles/sensors.styles';
import { useESP32Sensors } from '@/hooks/use-esp32-sensors';

type SensorIconName = 'thermometer' | 'water-percent' | 'video' | 'flask' | 'map-marker' | 'water-opacity' | 'lightbulb' | 'sun-wireless-outline' | 'leaf' | 'monitor';

export default function SensorsScreen() {
  const { sensorData, loading, error, isConnected } = useESP32Sensors({
    esp32Ip: '192.168.4.1',
    pollInterval: 2000,
    autoStart: true,
  });

  const sensors = useMemo(() => {
    // Use Domino4 I2C sensors (real-time) if available, fallback to ADC legacy
    const tempC = sensorData?.domino4?.weather?.temperatureC ?? sensorData?.temperatureC ?? 0;
    const humidityPct = sensorData?.domino4?.weather?.humidityPct ?? sensorData?.humidityPct ?? 0;
    const luxLevel = sensorData?.domino4?.light?.luxLevel ?? 0;
    const uvIndex = sensorData?.domino4?.light?.uvIndex ?? 0;
    const soilMoisture = sensorData?.domino4?.soil?.moisturePct ?? sensorData?.soilMoisturePct ?? 0;
    const phValue = sensorData?.adc?.ph ?? sensorData?.ph ?? 0;
    const batteryPct = sensorData?.adc?.batteryPct ?? sensorData?.batteryPct ?? 0;
    const displayActive = sensorData?.systemInfo?.oledReady ?? false;
    const sht3xReady = sensorData?.systemInfo?.sht3xReady ?? false;

    const defaultSensors = [
      {
        id: 1,
        name: 'Temperature',
        icon: 'thermometer' as SensorIconName,
        status: sht3xReady ? 'SHT3x Live' : 'Waiting...',
        value: tempC ? `${tempC.toFixed(1)}°C` : '--',
        subtitle: 'Domino4 IWA@0x44',
        enabled: isConnected && sht3xReady,
        iconColor: '#FF6B6B',
      },
      {
        id: 2,
        name: 'Humidity',
        icon: 'water-percent' as SensorIconName,
        status: sht3xReady ? 'SHT3x Live' : 'Waiting...',
        value: humidityPct ? `${humidityPct.toFixed(0)}%` : '--',
        subtitle: 'Domino4 IWA@0x44',
        enabled: isConnected && sht3xReady,
        iconColor: '#4A9AFF',
      },
      {
        id: 3,
        name: 'Light Level',
        icon: 'lightbulb' as SensorIconName,
        status: 'LTR390 Live',
        value: luxLevel ? `${luxLevel.toFixed(0)} lux` : '--',
        subtitle: 'Domino4 ILB@0x53',
        enabled: isConnected,
        iconColor: '#FFB84D',
      },
      {
        id: 9,
        name: 'UV Index',
        icon: 'sun-wireless-outline' as SensorIconName,
        status: 'LTR390 Live',
        value: uvIndex ? `${uvIndex.toFixed(2)}` : '--',
        subtitle: 'Domino4 ILB@0x53',
        enabled: isConnected,
        iconColor: '#AA44FF',
      },
      {
        id: 6,
        name: 'Soil Moisture',
        icon: 'leaf' as SensorIconName,
        status: 'Capacitive Touch',
        value: soilMoisture >= 0 ? `${soilMoisture.toFixed(0)}%` : '--',
        subtitle: 'Domino4 IWC@GPIO33',
        enabled: isConnected,
        iconColor: '#58C95F',
      },
      {
        id: 7,
        name: 'OLED Display',
        icon: 'monitor' as SensorIconName,
        status: displayActive ? 'Active' : 'Inactive',
        value: displayActive ? 'ON' : 'OFF',
        subtitle: 'Domino4 ODA@0x3C',
        enabled: isConnected && displayActive,
        iconColor: '#00AA00',
      },
      {
        id: 4,
        name: 'pH',
        icon: 'flask' as SensorIconName,
        status: 'Legacy ADC',
        value: phValue >= 0 ? phValue.toFixed(1) : '--',
        subtitle: 'GPIO35 (Optional)',
        enabled: isConnected,
        iconColor: '#FF9500',
      },
      {
        id: 5,
        name: 'GPS',
        icon: 'map-marker' as SensorIconName,
        status: sensorData?.location?.gps ? 'Signal Present' : 'No Fix',
        value: '',
        subtitle: 'Status: Placeholder',
        enabled: isConnected && sensorData?.location?.gps,
        iconColor: '#4A9AFF',
      },
    ];
    return defaultSensors;
  }, [sensorData, isConnected]);

  return (
    <SafeAreaView style={sensorsStyles.safe}>
      <ScrollView
        style={sensorsStyles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={sensorsStyles.headerSection}>
          <Text style={sensorsStyles.diagnosticLabel}>
            DIAGNOSTIC SHELL V4.2
          </Text>
          <Text style={sensorsStyles.pageTitle}>Sensors</Text>
          <View style={sensorsStyles.titleUnderline} />
        </View>

        {/* System Info */}
        {sensorData?.systemInfo && (
          <View
            style={{
              backgroundColor: '#1a1a1a',
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: '#333',
            }}
          >
            <Text style={{ color: '#AAA', fontSize: 12, marginBottom: 8 }}>SYSTEM INFO</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#4A9AFF', fontSize: 11 }}>
                ✓ I2C Bus: {sensorData.systemInfo.i2cReady ? 'Ready' : 'Offline'}
              </Text>
              <Text style={{ color: sensorData.systemInfo.sht3xReady ? '#58C95F' : '#666', fontSize: 11 }}>
                ✓ SHT3x: {sensorData.systemInfo.sht3xReady ? 'Ready' : 'Offline'}
              </Text>
              <Text style={{ color: sensorData.systemInfo.oledReady ? '#00AA00' : '#666', fontSize: 11 }}>
                ✓ OLED: {sensorData.systemInfo.oledReady ? 'Ready' : 'Offline'}
              </Text>
            </View>
            <Text style={{ color: '#666', fontSize: 10, marginTop: 8 }}>
              Uptime: {sensorData.systemInfo.uptimeSeconds}s | Source: Domino4 xChips standard
            </Text>
          </View>
        )}

        {/* Connection Status Bar */}
        {!isConnected && (
          <View
            style={{
              backgroundColor: '#FF453322',
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: '#FF4533',
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <MaterialCommunityIcons name="alert-circle" size={16} color="#FF4533" />
            <Text style={{ color: '#FF4533', marginLeft: 8, fontSize: 13, flex: 1 }}>
              {error || 'Not connected to ESP32. Go to Network tab to connect.'}
            </Text>
          </View>
        )}

        {/* Loading Spinner */}
        {loading && !sensorData && (
          <View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 40,
            }}
          >
            <ActivityIndicator size="large" color="#4A9AFF" />
            <Text style={{ color: '#888', marginTop: 12, fontSize: 14 }}>
              Fetching sensor data...
            </Text>
          </View>
        )}

        {/* Sensors Grid */}
        {!loading && (
          <View style={sensorsStyles.sensorsGrid}>
            {sensors.map(sensor => (
              <View key={sensor.id} style={sensorsStyles.sensorCard}>
                {/* Icon */}
                <View
                  style={[
                    sensorsStyles.sensorIconContainer,
                    { backgroundColor: sensor.iconColor + '20' },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={sensor.icon}
                    size={28}
                    color={sensor.enabled ? sensor.iconColor : '#6C7473'}
                  />
                </View>

                {/* Content */}
                <View style={sensorsStyles.sensorContent}>
                  <Text style={sensorsStyles.sensorName}>{sensor.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text
                      style={[
                        sensorsStyles.sensorStatus,
                        sensor.enabled && sensorsStyles.sensorStatusActive,
                      ]}
                    >
                      {'• ' + sensor.status}
                    </Text>
                    {sensor.value && (
                      <Text style={sensorsStyles.sensorValue}>
                        {sensor.value}
                      </Text>
                    )}
                  </View>
                  {sensor.subtitle && (
                    <Text style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
                      {sensor.subtitle}
                    </Text>
                  )}
                </View>

                {/* Status Indicator */}
                <View
                  style={[
                    sensorsStyles.sensorToggle,
                    {
                      backgroundColor: sensor.enabled ? '#58C95F33' : '#6C747333',
                      borderRadius: 20,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={sensor.enabled ? 'check-circle' : 'circle-outline'}
                    size={20}
                    color={sensor.enabled ? '#58C95F' : '#888'}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Stats Footer */}
        {sensorData && (
          <View style={sensorsStyles.statsSection}>
            <View style={sensorsStyles.statCard}>
              <Text style={sensorsStyles.statLabel}>BATTERY</Text>
              <Text style={sensorsStyles.statValue}>
                {(sensorData.adc?.batteryPct ?? sensorData.batteryPct ?? -1) >= 0 ? `${(sensorData.adc?.batteryPct ?? sensorData.batteryPct ?? 0).toFixed(0)}%` : '--'}
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

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

