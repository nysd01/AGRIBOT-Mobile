/**
 * Web stub for RemoteCameraFeed. react-native-webrtc / react-native-zeroconf are
 * native-only, so the web bundle renders a placeholder instead of importing them.
 */

import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export const RemoteCameraFeed = React.memo(function RemoteCameraFeed({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.center, style]}>
      <MaterialCommunityIcons name="cctv-off" size={72} color="#58C95F" style={{ opacity: 0.35 }} />
      <Text style={styles.label}>Live camera is available on the mobile app</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0A' },
  label: { color: '#9BA1A6', marginTop: 12, textAlign: 'center', fontSize: 13 },
});
