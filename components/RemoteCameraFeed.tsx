/**
 * RemoteCameraFeed — shows the AGRI-PC camera/mic stream (WebRTC).
 *
 * Replaces the old phone-camera placeholder in app/(tabs)/remote.tsx. Picks the
 * path automatically:
 *   • OFFLINE → mDNS-discovered (or manual) AGRI-PC LAN IP, STUN only
 *   • ONLINE  → public tunnel URL + TURN relay (from Network settings)
 */

import React, { useMemo } from 'react';
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
import { useEdgeBaseUrl } from '@/hooks/use-edge-base';
import { useWebrtcFeed, type IceServer } from '@/hooks/use-webrtc-feed';

const STUN: IceServer = { urls: 'stun:stun.l.google.com:19302' };

export const RemoteCameraFeed = React.memo(function RemoteCameraFeed({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}) {
  const { streamConfig, isOnlineMode } = useAppMode();
  const { baseUrl: signalingUrl } = useEdgeBaseUrl();

  const iceServers = useMemo<IceServer[]>(() => {
    const list: IceServer[] = [STUN];
    const turn = streamConfig?.turnUrl?.trim();
    const user = streamConfig?.turnUsername?.trim();
    const cred = streamConfig?.turnPassword;
    // TURN requires BOTH credentials — an entry with missing/undefined creds makes
    // the native RTCPeerConnection fail to initialize. Only add it when complete.
    if (isOnlineMode && turn && user && cred) {
      list.push({ urls: turn, username: user, credential: cred });
    }
    return list;
  }, [isOnlineMode, streamConfig?.turnUrl, streamConfig?.turnUsername, streamConfig?.turnPassword]);

  const { stream, status, error } = useWebrtcFeed(signalingUrl, iceServers);

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
      {!signalingUrl ? (
        <Text style={styles.label}>
          {isOnlineMode
            ? 'Set the online stream URL in Network settings'
            : 'Searching for AGRI-PC…'}
        </Text>
      ) : status === 'failed' ? (
        <Text style={styles.label}>
          Can&apos;t reach AGRI-PC camera{'\n'}
          {error ? error : signalingUrl}
        </Text>
      ) : (
        <>
          <ActivityIndicator color="#58C95F" style={{ marginTop: 10 }} />
          <Text style={styles.label}>Connecting{isOnlineMode ? ' (online)…' : '…'}</Text>
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0A' },
  label: { color: '#9BA1A6', marginTop: 12, textAlign: 'center', fontSize: 13, lineHeight: 18 },
});
