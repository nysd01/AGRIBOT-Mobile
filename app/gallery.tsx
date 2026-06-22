/**
 * Gallery — browse photos/videos captured on AGRI-PC (GET /media). Tap a photo to
 * view full-screen; tap a video to download + open/share (OS player). Opened from
 * the Settings page.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useEdgeBaseUrl } from '@/hooks/use-edge-base';
import { downloadCapture } from '@/hooks/use-camera-control';

interface MediaItem {
  name: string;
  type: 'photo' | 'video';
  size: number;
  ts: number;
}

const NUMCOL = 3;
const HEADERS = { 'ngrok-skip-browser-warning': 'true' };

export default function GalleryScreen() {
  const router = useRouter();
  const { baseUrl } = useEdgeBaseUrl();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const base = baseUrl ? baseUrl.replace(/\/+$/, '') : null;

  const load = useCallback(async () => {
    if (!base) { setItems([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`${base}/media`, { headers: HEADERS });
      const json = await res.json();
      setItems(json.media ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [base]);

  useEffect(() => { void load(); }, [load]);

  const openItem = useCallback(async (item: MediaItem) => {
    if (!base || !baseUrl) return;
    if (item.type === 'photo') {
      setViewing(`${base}/media/${item.name}`);
    } else {
      const uri = await downloadCapture(baseUrl, item.name);
      if (uri && (await Sharing.isAvailableAsync())) void Sharing.shareAsync(uri);
    }
  }, [base, baseUrl]);

  const cell = Dimensions.get('window').width / NUMCOL;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Gallery</Text>
        <Pressable onPress={() => void load()} hitSlop={12}>
          <MaterialCommunityIcons name="refresh" size={22} color="#58C95F" />
        </Pressable>
      </View>

      {!base ? (
        <Empty icon="server-network-off" text={'AGRI-PC not connected.\nConnect to view captured media.'} />
      ) : items.length === 0 && !loading ? (
        <Empty icon="image-multiple-outline" text={'No photos or videos yet.\nUse the camera controls to capture.'} />
      ) : (
        <FlatList
          data={items}
          numColumns={NUMCOL}
          keyExtractor={(i) => i.name}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#58C95F" />}
          renderItem={({ item }) => (
            <Pressable onPress={() => void openItem(item)} style={[styles.cell, { width: cell, height: cell }]}>
              {item.type === 'photo' ? (
                <Image
                  source={{ uri: `${base}/media/${item.name}`, headers: HEADERS }}
                  style={styles.thumb}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.thumb, styles.videoThumb]}>
                  <MaterialCommunityIcons name="play-circle" size={36} color="#fff" />
                </View>
              )}
              {item.type === 'video' && (
                <View style={styles.vidBadge}>
                  <MaterialCommunityIcons name="video" size={12} color="#fff" />
                </View>
              )}
            </Pressable>
          )}
        />
      )}

      {loading && items.length === 0 && (
        <ActivityIndicator color="#58C95F" style={{ marginTop: 24 }} />
      )}

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)}>
          {viewing && (
            <Image source={{ uri: viewing, headers: HEADERS }} style={styles.full} contentFit="contain" />
          )}
          <View style={styles.closeHint}>
            <MaterialCommunityIcons name="close" size={22} color="#fff" />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Empty({ icon, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }) {
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name={icon} size={64} color="#444" />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070A0A' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1c1f1f',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  cell: { padding: 1 },
  thumb: { flex: 1, backgroundColor: '#111', borderRadius: 2 },
  videoThumb: { alignItems: 'center', justifyContent: 'center' },
  vidBadge: {
    position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4, padding: 2,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: '#9BA1A6', textAlign: 'center', marginTop: 14, lineHeight: 20 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  full: { width: '100%', height: '100%' },
  closeHint: { position: 'absolute', top: 44, right: 20 },
});
