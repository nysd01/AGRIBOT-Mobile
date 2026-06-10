import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetworkInfo, useESP32Connection } from '@/hooks/use-network-connection';

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0e1a',
  },
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
  },
  section: {
    marginBottom: 24,
    backgroundColor: '#1a1f2e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a3a4a',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#aaa',
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    color: '#4A9AFF',
    fontWeight: '600',
    textAlign: 'right',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginLeft: 8,
  },
  statusBadgeConnected: {
    backgroundColor: '#58C95F33',
  },
  statusBadgeDisconnected: {
    backgroundColor: '#FF453333',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  button: {
    backgroundColor: '#4A9AFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    backgroundColor: '#666',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  instructions: {
    backgroundColor: '#1a2332',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4A9AFF',
  },
  instructionText: {
    fontSize: 13,
    color: '#ccc',
    lineHeight: 20,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorContainer: {
    backgroundColor: '#FF453322',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#FF4533',
  },
  errorText: {
    color: '#FF4533',
    fontSize: 13,
  },
});

export default function WifiConnectionScreen() {
  const { networkInfo, loading: networkLoading } = useNetworkInfo();
  const { espIP, isConnectedToESP, espName, error, checkConnection } = useESP32Connection();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // Auto-check ESP32 connection when screen loads
    checkConnection();
  }, [checkConnection]);

  const handleManualCheck = async () => {
    setChecking(true);
    await checkConnection();
    setChecking(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>WiFi Setup</Text>
          <Text style={styles.subtitle}>Connect to AGRIBOT-ESP sensor network</Text>
        </View>

        {/* Current Network Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Connection</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>WiFi Connected</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {networkLoading ? (
                <ActivityIndicator size="small" color="#4A9AFF" />
              ) : (
                <>
                  <Text style={styles.infoValue}>{networkInfo?.ssid || 'Not connected'}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      networkInfo?.ssid
                        ? styles.statusBadgeConnected
                        : styles.statusBadgeDisconnected,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={networkInfo?.ssid ? 'wifi' : 'wifi-off'}
                      size={12}
                      color={networkInfo?.ssid ? '#58C95F' : '#FF4533'}
                    />
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color: networkInfo?.ssid ? '#58C95F' : '#FF4533',
                        },
                      ]}
                    >
                      {networkInfo?.ssid ? 'Connected' : 'Offline'}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
          {networkInfo?.ip && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>IP Address</Text>
              <Text style={styles.infoValue}>{networkInfo.ip}</Text>
            </View>
          )}
        </View>

        {/* ESP32 Connection Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ESP32 Device</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Device Status</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {checking ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#4A9AFF" style={{ marginRight: 8 }} />
                  <Text style={styles.infoValue}>Checking...</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.infoValue}>{espName || 'AGRIBOT-ESP'}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      isConnectedToESP
                        ? styles.statusBadgeConnected
                        : styles.statusBadgeDisconnected,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={isConnectedToESP ? 'check-circle' : 'alert-circle'}
                      size={12}
                      color={isConnectedToESP ? '#58C95F' : '#FF4533'}
                    />
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color: isConnectedToESP ? '#58C95F' : '#FF4533',
                        },
                      ]}
                    >
                      {isConnectedToESP ? 'Connected' : 'Not Found'}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>ESP32 IP</Text>
            <Text style={styles.infoValue}>{espIP}</Text>
          </View>

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            style={[styles.button, checking && styles.buttonDisabled]}
            onPress={handleManualCheck}
            disabled={checking}
          >
            {checking ? (
              <>
                <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.buttonText}>Checking Connection...</Text>
              </>
            ) : (
              <Text style={styles.buttonText}>Check ESP32 Connection</Text>
            )}
          </Pressable>

          <View style={styles.instructions}>
            <Text style={styles.instructionText}>
              <MaterialCommunityIcons name="lightbulb-on" size={14} color="#4A9AFF" /> Make sure
              your phone is connected to the &quot;AGRIBOT-ESP&quot; WiFi network before checking
              the connection.
            </Text>
          </View>
        </View>

        {/* Setup Instructions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connection Steps</Text>
          <View style={styles.instructionText}>
            <Text style={[styles.instructionText, { marginBottom: 8 }]}>
              1. Power on the AGRIBOT-ESP device
            </Text>
            <Text style={[styles.instructionText, { marginBottom: 8 }]}>
              2. Go to your phone&apos;s WiFi settings
            </Text>
            <Text style={[styles.instructionText, { marginBottom: 8 }]}>
              3. Find and connect to &quot;AGRIBOT-ESP&quot; network
            </Text>
            <Text style={[styles.instructionText, { marginBottom: 8 }]}>
              4. Use password: <Text style={{ color: '#4A9AFF', fontWeight: '600' }}>agribot123</Text>
            </Text>
            <Text style={[styles.instructionText, { marginBottom: 8 }]}>
              5. Return to this app and tap &quot;Check ESP32 Connection&quot;
            </Text>
            <Text style={[styles.instructionText, { marginBottom: 8 }]}>
              6. Once connected, you&apos;ll see sensor data on the Sensors tab
            </Text>
          </View>
        </View>

        {/* Debug Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Debug Info</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone IP:</Text>
            <Text style={styles.infoValue}>{networkInfo?.ip || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Default ESP32 IP:</Text>
            <Text style={styles.infoValue}>{espIP}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
