/**
 * CameraControls — overlay button bar for the live feed: zoom -/+, shutter (photo),
 * record (toggle), and face-track toggle. Calls the AGRI-PC camera endpoints via the
 * active base URL (LAN offline / tunnel online). Renders nothing until the camera is
 * active and AGRI-PC is reachable.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEdgeBaseUrl } from '@/hooks/use-edge-base';
import { useCameraControl } from '@/hooks/use-camera-control';

function Btn({
  icon, onPress, color = '#fff', size = 20, bg = 'rgba(0,0,0,0.55)',
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  color?: string;
  size?: number;
  bg?: string;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.btn, { backgroundColor: bg }]} hitSlop={6}>
      <MaterialCommunityIcons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function CameraControls({
  active,
  style,
}: {
  active: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { baseUrl } = useEdgeBaseUrl();
  const c = useCameraControl(baseUrl);

  if (!active || !c.available) return null;

  return (
    <View style={[styles.wrap, style]} pointerEvents="box-none">
      {c.toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{c.toast}</Text>
        </View>
      ) : null}

      <View style={styles.bar}>
        <Btn icon="magnify-minus-outline" onPress={c.zoomOut} />
        <View style={styles.zoomPill}>
          <Text style={styles.zoomText}>{c.zoom.toFixed(1)}×</Text>
        </View>
        <Btn icon="magnify-plus-outline" onPress={c.zoomIn} />

        {/* Shutter */}
        <Pressable onPress={c.takePhoto} style={styles.shutter} hitSlop={6}>
          {c.busy
            ? <ActivityIndicator color="#070A0A" size="small" />
            : <MaterialCommunityIcons name="camera" size={24} color="#070A0A" />}
        </Pressable>

        <Btn
          icon={c.recording ? 'stop-circle' : 'record-circle-outline'}
          color={c.recording ? '#FF4533' : '#fff'}
          onPress={c.toggleRecord}
        />
        <Btn
          icon={c.faceOn ? 'face-recognition' : 'face-man-outline'}
          color={c.faceOn ? '#4A9AFF' : '#fff'}
          bg={c.faceOn ? 'rgba(74,154,255,0.22)' : 'rgba(0,0,0,0.55)'}
          onPress={c.toggleFace}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 28,
    backgroundColor: 'rgba(10,10,10,0.45)',
  },
  btn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  shutter: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#58C95F',
  },
  zoomPill: { minWidth: 38, alignItems: 'center' },
  zoomText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  toast: {
    marginBottom: 8, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.75)',
  },
  toastText: { color: '#fff', fontSize: 12 },
});
