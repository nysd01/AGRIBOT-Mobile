<<<<<<< HEAD
import { useRouter } from 'expo-router';
=======
>>>>>>> 216f2d664496eb2cb633b76c9586539cb2f22b5d
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth } from '@/context/AuthContext';
import { getBiometricSession, isBiometricAvailable } from '@/utils/biometrics';

export default function LoginScreen() {
  const router = useRouter();
  const { login, biometricLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showBiometricButton, setShowBiometricButton] = useState(false);

  useEffect(() => {
    const checkBiometricState = async () => {
      // Biometric is only available on native platforms
      if (Platform.OS === 'web') {
        setShowBiometricButton(false);
        return;
      }

      const [sessionUserId, available] = await Promise.all([
        getBiometricSession(),
        isBiometricAvailable(),
      ]);

      setShowBiometricButton(Boolean(sessionUserId) && available);
    };

    void checkBiometricState();
  }, []);

  const handleLogin = useCallback(async () => {
    try {
      setSubmitting(true);
      await login(email, password);
    } catch (error) {
      Alert.alert(
        'Login failed',
        error instanceof Error ? error.message : 'Unknown login error'
      );
    } finally {
      setSubmitting(false);
    }
  }, [email, password, login]);

  const handleBiometricLogin = useCallback(async () => {
    try {
      setSubmitting(true);
      await biometricLogin();
    } catch (error) {
      Alert.alert(
        'Biometric login failed',
        error instanceof Error ? error.message : 'Unknown biometric error'
      );
    } finally {
      setSubmitting(false);
    }
  }, [biometricLogin]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Backdrop Glow Effects */}
        <View style={styles.backdropGlow} />
        <View style={styles.backdropGlowSecondary} />

        <View style={styles.container}>
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

          {/* Hero Section */}
          <View style={styles.hero}>
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Ready to grow</Text>
            </View>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Sign in to manage your farms and sensors</Text>
          </View>

          {/* Biometric Button */}
          {showBiometricButton ? (
            <TouchableOpacity
              style={styles.biometricCard}
              onPress={() => void handleBiometricLogin()}
              disabled={submitting}
            >
              <View style={styles.biometricRow}>
                <View>
                  <Text style={styles.biometricLabel}>Quick Access</Text>
                  <Text style={styles.biometricDescription}>Use your fingerprint to sign in</Text>
                </View>
                <MaterialCommunityIcons name="fingerprint" size={28} color="#7DFB8C" />
              </View>
            </TouchableOpacity>
          ) : null}

          {/* Form Card */}
          <View style={styles.card}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                placeholder="Enter your email"
                placeholderTextColor="#6C7473"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                placeholder="Enter your password"
                placeholderTextColor="#6C7473"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                style={styles.input}
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
              onPress={() => void handleLogin()}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#07110A" />
              ) : (
                <>
                  <MaterialCommunityIcons name="login" size={20} color="#07110A" />
                  <Text style={styles.primaryButtonText}>Sign In</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account?</Text>
            <TouchableOpacity onPress={() => router.push('/signup')}>
              <Text style={styles.footerLink}>Create one now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#070A0A',
  },
  scrollContent: {
    flexGrow: 1,
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
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 20,
  },
  brandSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  card: {
    backgroundColor: '#151718',
    borderRadius: 28,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(88, 201, 95, 0.12)',
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: '#A7B2B5',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#0C0E0F',
    color: '#F4F7F8',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#232829',
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: '#58C95F',
    borderRadius: 18,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#07110A',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  biometricCard: {
    backgroundColor: '#0C2108',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(125, 251, 140, 0.14)',
    padding: 16,
    gap: 12,
  },
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  biometricLabel: {
    color: '#E6F4EA',
    fontSize: 14,
    fontWeight: '800',
  },
  biometricDescription: {
    color: '#B9D8BF',
    fontSize: 12,
    lineHeight: 18,
  },
  footer: {
    alignItems: 'center',
    gap: 10,
    paddingBottom: 10,
  },
  footerText: {
    color: '#A7B2B5',
    fontSize: 13,
  },
  footerLink: {
    color: '#7DFB8C',
    fontSize: 14,
    fontWeight: '800',
  },
});
