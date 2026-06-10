import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Agribot</Text>
        <Text style={styles.subtitle}>
          The mobile app is configured for native Expo/React Native use.
        </Text>
        <Text style={styles.subtitle}>
          Use Expo Go on your phone to run the full app.
        </Text>
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    color: '#72F88A',
    fontSize: 36,
    fontWeight: '800',
    marginBottom: 12,
  },
  subtitle: {
    color: '#D6E2DA',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 6,
  },
});
