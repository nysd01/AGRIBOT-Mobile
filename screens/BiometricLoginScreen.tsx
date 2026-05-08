import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth } from '@/context/AuthContext';
import { authenticateWithBiometrics } from '@/utils/biometrics';
import type { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'BiometricLogin'>;

export default function BiometricLoginScreen({ navigation, route }: Props) {
  const { biometricLogin } = useAuth();
  const [authenticating, setAuthenticating] = useState(false);
  const { userId } = route.params;

  useEffect(() => {
    // Auto-trigger biometric authentication on screen mount
    void triggerBiometricAuth();
  }, []);

  const triggerBiometricAuth = useCallback(async () => {
    setAuthenticating(true);
    try {
      await biometricLogin();
    } catch (error) {
      setAuthenticating(false);
      // User will see the retry button if it fails
    }
  }, [biometricLogin]);

  const handleRetry = useCallback(async () => {
    setAuthenticating(true);
    try {
      await biometricLogin();
    } catch (error) {
      Alert.alert(
        'Authentication Failed',
        error instanceof Error ? error.message : 'Biometric authentication failed. Please try again.',
        [
          { text: 'Retry', onPress: () => setAuthenticating(false) },
          { text: 'Use Password', onPress: () => navigation.replace('Login') },
        ]
      );
      setAuthenticating(false);
    }
  }, [biometricLogin, navigation]);

  if (authenticating) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.backdropGlow} />
          <View style={styles.backdropGlowSecondary} />

          <View style={styles.centerContent}>
            <View style={styles.fingerprintContainer}>
              <MaterialCommunityIcons name="fingerprint" size={80} color="#7DFB8C" />
            </View>
            <Text style={styles.title}>Authenticating...</Text>
            <Text style={styles.subtitle}>Place your finger on the sensor</Text>
            <ActivityIndicator size="large" color="#58C95F" style={styles.loader} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.backdropGlow} />
        <View style={styles.backdropGlowSecondary} />

        <View style={styles.centerContent}>
          {/* Brand Section */}
          <View style={styles.brandSection}>
            <View style={styles.brandBadge}>
              <MaterialCommunityIcons name="sprout" size={32} color="#7DFB8C" />
            </View>
            <View style={styles.brandTextWrap}>
              <Text style={styles.brandLabel}>AGRIBOT</Text>
              <Text style={styles.brandSubLabel}>Smart Farming</Text>
            </View>
          </View>

          {/* Biometric Hero */}
          <View style={styles.hero}>
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Quick Access</Text>
            </View>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Use your fingerprint to sign in</Text>
          </View>

          {/* Fingerprint Card */}
          <View style={styles.fingerprintCard}>
            <MaterialCommunityIcons name="fingerprint" size={100} color="#7DFB8C" />
            <Text style={styles.fingerprintTitle}>Place Your Finger</Text>
            <Text style={styles.fingerprintDescription}>
              Touch your device's fingerprint sensor to continue
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => void handleRetry()}
            >
              <MaterialCommunityIcons name="refresh" size={20} color="#07110A" />
              <Text style={styles.primaryButtonText}>Try Again</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.replace('Login')}
            >
              <Text style={styles.secondaryButtonText}>Use Password Instead</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#070A0A',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
  },
  backdropGlow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(88, 201, 95, 0.12)',
    top: -80,
    right: -120,
  },
  backdropGlowSecondary: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(125, 251, 140, 0.10)',
    bottom: 120,
    left: -100,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'space-around',
    alignItems: 'center',
    gap: 20,
  },
  brandSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'flex-start',
  },
  brandBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#151718',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(125, 251, 140, 0.16)',
  },
  brandTextWrap: {
    gap: 2,
  },
  brandLabel: {
    color: '#74F482',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  brandSubLabel: {
    color: '#A7B2B5',
    fontSize: 12,
  },
  hero: {
    borderRadius: 28,
    padding: 22,
    backgroundColor: '#111617',
    borderWidth: 1,
    borderColor: 'rgba(125, 251, 140, 0.10)',
    gap: 14,
    width: '100%',
  },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#0C2108',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#7DFB8C',
  },
  statusText: {
    color: '#7DFB8C',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    color: '#F3F7F6',
    fontSize: 40,
    lineHeight: 42,
    fontWeight: '800',
  },
  subtitle: {
    color: '#B6C4C8',
    fontSize: 15,
    lineHeight: 22,
  },
  fingerprintCard: {
    backgroundColor: '#151718',
    borderRadius: 28,
    padding: 30,
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(88, 201, 95, 0.12)',
    alignItems: 'center',
    width: '100%',
  },
  fingerprintContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#0C2108',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(125, 251, 140, 0.2)',
  },
  fingerprintTitle: {
    color: '#F3F7F6',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  fingerprintDescription: {
    color: '#B6C4C8',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  loader: {
    marginTop: 20,
  },
  actionButtons: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#58C95F',
    borderRadius: 18,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  primaryButtonText: {
    color: '#07110A',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  secondaryButton: {
    backgroundColor: '#1B1F1C',
    borderRadius: 18,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2B322D',
  },
  secondaryButtonText: {
    color: '#F4F7F8',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
