/**
 * RemoteCameraFeed — shows the AGRI-PC camera/mic stream (WebRTC).
 *
 * Replaces the old phone-camera placeholder in app/(tabs)/remote.tsx. It is only
 * rendered while the camera is "active", so it self-contains discovery + the
 * WebRTC connection and just needs a style. Address resolution:
 *   1. AppModeContext.edgeHost   (manual override, if set)
 *   2. mDNS discovery            (agribot-edge.local → current IP)
 */

import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RTCView } from 'react-native-webrtc';
import { useAppMode } from '@/context/AppModeContext';
import { useEdgeDiscovery } from '@/hooks/use-edge-discovery';
import { useWebrtcFeed } from '@/hooks/use-webrtc-feed';

export const RemoteCameraFeed = React.memo(function RemoteCameraFeed({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}) {
  const { edgeHost } = useAppMode();
  const { service } = useEdgeDiscovery(true);

  const host = edgeHost || service?.host || null;
  const port = service?.port ?? 8000;
  const { stream, status, error } = useWebrtcFeed(host, port);

  if (stream) {
    return (
      <RTCView
        streamURL={(stream as any).toURL()}
        objectFit="cover"
        style={style as any}
        zOrder={0}
      />
    );
  }

  return (
    <View style={[styles.center, style]}>
      <MaterialCommunityIcons name="cctv" size={72} color="#58C95F" style={{ opacity: 0.35 }} />
      {!host ? (
        <Text style={styles.label}>Searching for AGRI-PC…</Text>
      ) : status === 'failed' ? (
        <Text style={styles.label}>
          Can&apos;t reach AGRI-PC camera{'\n'}
          {host}{error ? ` — ${error}` : ''}
        </Text>
      ) : (
        <>
          <ActivityIndicator color="#58C95F" style={{ marginTop: 10 }} />
          <Text style={styles.label}>Connecting to {host}…</Text>
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0A' },
  label: { color: '#9BA1A6', marginTop: 12, textAlign: 'center', fontSize: 13, lineHeight: 18 },
});
