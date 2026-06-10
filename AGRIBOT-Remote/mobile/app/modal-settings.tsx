import React, { useCallback, useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  Pressable,
  Switch,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth } from '@/context/AuthContext';
import {
  authenticateWithBiometrics,
  clearBiometricSession,
  isBiometricAvailable,
  saveBiometricSession,
} from '@/utils/biometrics';
import { updateBiometricEnrollment } from '@/db/database';

const settingsStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#070A0A',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  } as any,
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#151718',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  } as any,
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700' as any,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#7A8582',
    fontSize: 12,
    fontWeight: '700' as any,
    letterSpacing: 0.5,
    marginBottom: 12,
    textTransform: 'uppercase' as any,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#151718',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 8,
  } as any,
  settingLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600' as any,
  },
  settingDescription: {
    color: '#7A8582',
    fontSize: 12,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#0C0E0F',
    marginVertical: 16,
  },
  dangerButton: {
    backgroundColor: '#E74C3C',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
  } as any,
  dangerButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700' as any,
    letterSpacing: 0.3,
  },
  userSection: {
    backgroundColor: '#151718',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  userLabel: {
    color: '#7A8582',
    fontSize: 12,
    fontWeight: '700' as any,
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: 'uppercase' as any,
  },
  userName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700' as any,
  },
  signOutButton: {
    backgroundColor: '#58C95F',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  } as any,
  signOutButtonText: {
    color: '#07110A',
    fontSize: 14,
    fontWeight: '700' as any,
    letterSpacing: 0.3,
  },
});

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [notifications, setNotifications] = useState(true);
  const [autoConnect, setAutoConnect] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [fingerprintEnabled, setFingerprintEnabled] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [updatingBiometric, setUpdatingBiometric] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadBiometricState = async () => {
      const supported = await isBiometricAvailable();
      if (mounted) {
        setBiometricSupported(supported);
        setFingerprintEnabled(user?.biometric_enrolled ?? false);
      }
    };

    void loadBiometricState();

    return () => {
      mounted = false;
    };
  }, [user?.biometric_enrolled]);

  const handleBiometricToggle = useCallback(async (newState: boolean) => {
    if (!user) return;

    setUpdatingBiometric(true);

    try {
      if (newState) {
        const authenticated = await authenticateWithBiometrics('enable fingerprint login');
        if (!authenticated) {
          throw new Error('Fingerprint verification was cancelled or failed.');
        }

        await saveBiometricSession(user.id);
      } else {
        await clearBiometricSession();
      }

      await updateBiometricEnrollment(user.id, newState);
      setFingerprintEnabled(newState);

      Alert.alert(
        'Success',
        newState
          ? 'Fingerprint login has been enabled.'
          : 'Fingerprint login has been disabled.'
      );
    } catch (error) {
      Alert.alert(
        'Error',
        `Failed to update fingerprint setting: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    } finally {
      setUpdatingBiometric(false);
    }
  }, [user]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      router.dismiss(); // Close the settings modal
    } catch (error) {
      Alert.alert(
        'Logout failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }, [logout, router]);

  return (
    <SafeAreaView style={settingsStyles.safe}>
      <ScrollView
        style={settingsStyles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={settingsStyles.header}>
          <Text style={settingsStyles.headerTitle}>Settings</Text>
        </View>

        {/* User section */}
        {user ? (
          <View style={settingsStyles.userSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={settingsStyles.userLabel}>Signed in as</Text>
                <Text style={settingsStyles.userName}>{user.username}</Text>
                <Text style={settingsStyles.settingDescription}>{user.email}</Text>
              </View>
              <MaterialCommunityIcons name="account-circle" size={40} color="#58C95F" />
            </View>
            <Pressable 
              style={settingsStyles.signOutButton}
              onPress={() => {
                Alert.alert(
                  'Sign Out',
                  'Are you sure you want to sign out?',
                  [
                    { text: 'Cancel', onPress: () => {}, style: 'cancel' },
                    { text: 'Sign Out', onPress: handleLogout, style: 'destructive' },
                  ]
                );
              }}
            >
              <MaterialCommunityIcons name="logout" size={18} color="#FFFFFF" />
              <Text style={settingsStyles.signOutButtonText}>Sign Out</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Security Settings */}
        {biometricSupported ? (
          <View style={settingsStyles.section}>
            <Text style={settingsStyles.sectionTitle}>Security</Text>

            <View style={settingsStyles.settingItem}>
              <View>
                <Text style={settingsStyles.settingLabel}>Fingerprint Login</Text>
                <Text style={settingsStyles.settingDescription}>
                  Use your device fingerprint to sign in
                </Text>
              </View>
              {updatingBiometric ? (
                <ActivityIndicator color="#58C95F" />
              ) : (
                <Switch
                  value={fingerprintEnabled}
                  onValueChange={handleBiometricToggle}
                  trackColor={{ false: '#6C7473', true: '#58C95F' }}
                  thumbColor={fingerprintEnabled ? '#81F295' : '#FFFFFF'}
                />
              )}
            </View>
          </View>
        ) : null}

        {/* Connection Settings */}
        <View style={settingsStyles.section}>
          <Text style={settingsStyles.sectionTitle}>Connection</Text>

          <View style={settingsStyles.settingItem}>
            <View>
              <Text style={settingsStyles.settingLabel}>Auto-Connect</Text>
              <Text style={settingsStyles.settingDescription}>
                Connect to robot on app launch
              </Text>
            </View>
            <Switch
              value={autoConnect}
              onValueChange={setAutoConnect}
              trackColor={{ false: '#6C7473', true: '#58C95F' }}
              thumbColor={autoConnect ? '#81F295' : '#FFFFFF'}
            />
          </View>
        </View>

        {/* Notification Settings */}
        <View style={settingsStyles.section}>
          <Text style={settingsStyles.sectionTitle}>Notifications</Text>

          <View style={settingsStyles.settingItem}>
            <View>
              <Text style={settingsStyles.settingLabel}>Enable Alerts</Text>
              <Text style={settingsStyles.settingDescription}>
                Receive sensor and system alerts
              </Text>
            </View>
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ false: '#6C7473', true: '#58C95F' }}
              thumbColor={notifications ? '#81F295' : '#FFFFFF'}
            />
          </View>
        </View>

        {/* System Settings */}
        <View style={settingsStyles.section}>
          <Text style={settingsStyles.sectionTitle}>System</Text>

          <Pressable style={settingsStyles.settingItem}>
            <View>
              <Text style={settingsStyles.settingLabel}>App Version</Text>
              <Text style={settingsStyles.settingDescription}>
                Agribot v2.4.1
              </Text>
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color="#6C7473"
            />
          </Pressable>

          <View style={settingsStyles.settingItem}>
            <View>
              <Text style={settingsStyles.settingLabel}>Debug Mode</Text>
              <Text style={settingsStyles.settingDescription}>
                Show debug information
              </Text>
            </View>
            <Switch
              value={debugMode}
              onValueChange={setDebugMode}
              trackColor={{ false: '#6C7473', true: '#58C95F' }}
              thumbColor={debugMode ? '#81F295' : '#FFFFFF'}
            />
          </View>
        </View>

        <View style={settingsStyles.divider} />

        {/* Danger Zone */}
        <View style={settingsStyles.section}>
          <Text style={settingsStyles.sectionTitle}>Danger Zone</Text>

          <Pressable style={settingsStyles.dangerButton}>
            <Text style={settingsStyles.dangerButtonText}>
              Disconnect Robot
            </Text>
          </Pressable>

          <Pressable
            style={[settingsStyles.dangerButton, { marginTop: 8 }]}
            onPress={() => {
              alert('App data will be cleared on next restart');
            }}
          >
            <Text style={settingsStyles.dangerButtonText}>Reset App Data</Text>
          </Pressable>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
