<<<<<<< HEAD
import { useRouter } from 'expo-router';
=======
>>>>>>> 216f2d664496eb2cb633b76c9586539cb2f22b5d
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth } from '@/context/AuthContext';
import { isPasswordValid, PASSWORD_VALIDATION_MESSAGE } from '@/utils/auth';
import { isBiometricAvailable } from '@/utils/biometrics';

export default function SignupScreen() {
  const router = useRouter();
  const { signup } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [enrollBiometric, setEnrollBiometric] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    username?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  useEffect(() => {
    const loadBiometricState = async () => {
      // Biometric is only available on native platforms
      if (Platform.OS === 'web') {
        setBiometricAvailable(false);
        setEnrollBiometric(false);
        return;
      }

      const available = await isBiometricAvailable();
      setBiometricAvailable(available);
      setEnrollBiometric(available);
    };

    void loadBiometricState();
  }, []);

  const validate = useCallback(() => {
    const nextErrors: {
      username?: string;
      email?: string;
      password?: string;
      confirmPassword?: string;
    } = {};

    if (!username.trim()) {
      nextErrors.username = 'Username is required.';
    }

    if (!email.trim()) {
      nextErrors.email = 'Email is required.';
    }

    if (!isPasswordValid(password)) {
      nextErrors.password = PASSWORD_VALIDATION_MESSAGE;
    }

    if (password !== confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [username, email, password, confirmPassword]);

  const hasErrors = useMemo(() => Object.keys(errors).length > 0, [errors]);

  const handleSignup = useCallback(async () => {
    if (!validate()) {
      return;
    }

    try {
      setSubmitting(true);
      await signup(username, email, password, enrollBiometric);
    } catch (error) {
      Alert.alert(
        'Signup failed',
        error instanceof Error ? error.message : 'Unknown signup error'
      );
    } finally {
      setSubmitting(false);
    }
  }, [validate, signup, username, email, password, enrollBiometric]);

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
              <Text style={styles.statusText}>Get started now</Text>
            </View>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join us to revolutionize your farming experience</Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                placeholder="Choose a username"
                placeholderTextColor="#6C7473"
                value={username}
                onChangeText={setUsername}
                style={styles.input}
              />
              {errors.username ? <Text style={styles.errorText}>{errors.username}</Text> : null}
            </View>

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
              {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                placeholder="Create a password"
                placeholderTextColor="#6C7473"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                style={styles.input}
              />
              {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                placeholder="Confirm your password"
                placeholderTextColor="#6C7473"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                style={styles.input}
              />
              {errors.confirmPassword ? (
                <Text style={styles.errorText}>{errors.confirmPassword}</Text>
              ) : null}
            </View>

            {biometricAvailable ? (
              <View style={styles.toggleRow}>
                <View style={styles.toggleTextWrap}>
                  <Text style={styles.toggleTitle}>Enable Fingerprint</Text>
                  <Text style={styles.toggleDescription}>Quick access on next login</Text>
                </View>
                <Switch
                  value={enrollBiometric}
                  onValueChange={setEnrollBiometric}
                  trackColor={{ false: '#2B322D', true: '#58C95F' }}
                  thumbColor={enrollBiometric ? '#7DFB8C' : '#A7B2B5'}
                />
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
              onPress={() => void handleSignup()}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#07110A" />
              ) : (
                <>
                  <MaterialCommunityIcons name="account-plus" size={20} color="#07110A" />
                  <Text style={styles.primaryButtonText}>Create Account</Text>
                </>
              )}
            </TouchableOpacity>

            {hasErrors ? (
              <Text style={styles.helperText}>Please fix the errors above to continue.</Text>
            ) : null}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
<<<<<<< HEAD
            <TouchableOpacity onPress={() => router.back()}>
=======
            <TouchableOpacity onPress={() => router.replace('/login')}>
>>>>>>> 216f2d664496eb2cb633b76c9586539cb2f22b5d
              <Text style={styles.footerLink}>Sign in here</Text>
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
  errorText: {
    color: '#F28C8C',
    fontSize: 12,
    lineHeight: 18,
  },
  helperText: {
    color: '#7A8582',
    fontSize: 12,
    lineHeight: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0C0E0F',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 16,
  },
  toggleTextWrap: {
    flex: 1,
    gap: 4,
  },
  toggleTitle: {
    color: '#F4F7F8',
    fontSize: 15,
    fontWeight: '700',
  },
  toggleDescription: {
    color: '#7A8582',
    fontSize: 12,
    lineHeight: 18,
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
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#07110A',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
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
