/**
 * useCameraControl — drives the AGRI-PC camera pipeline from the app:
 * photo, video record, zoom, face-track. Captures are recorded on AGRI-PC and
 * auto-copied to the phone (FileSystem.documentDirectory/agribot-media) so they're
 * available in the in-app gallery even if AGRI-PC goes away.
 */

import { useCallback, useState } from 'react';
import * as FileSystem from 'expo-file-system';

export const MEDIA_DIR = `${FileSystem.documentDirectory}agribot-media`;

const HEADERS = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' };

function trimBase(base: string) {
  return base.replace(/\/+$/, '');
}

/** Pull a captured file from AGRI-PC into the phone's local media folder. */
export async function downloadCapture(baseUrl: string, name: string): Promise<string | null> {
  try {
    await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true }).catch(() => {});
    const dest = `${MEDIA_DIR}/${name}`;
    const res = await FileSystem.downloadAsync(`${trimBase(baseUrl)}/media/${name}`, dest, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
    return res.uri;
  } catch {
    return null;
  }
}

export function useCameraControl(baseUrl: string | null) {
  const [recording, setRecording] = useState(false);
  const [faceOn, setFaceOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }, []);

  const post = useCallback(
    async (path: string, body?: object): Promise<any | null> => {
      if (!baseUrl) {
        flash('AGRI-PC not connected');
        return null;
      }
      try {
        const res = await fetch(`${trimBase(baseUrl)}${path}`, {
          method: 'POST',
          headers: HEADERS,
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch {
        flash('Action failed');
        return null;
      }
    },
    [baseUrl, flash],
  );

  const takePhoto = useCallback(async () => {
    setBusy(true);
    const r = await post('/capture/photo');
    if (r?.file && baseUrl) {
      await downloadCapture(baseUrl, r.file);
      flash('📸 Photo saved');
    }
    setBusy(false);
  }, [post, baseUrl, flash]);

  const toggleRecord = useCallback(async () => {
    if (!recording) {
      const r = await post('/record/start');
      if (r?.recording) {
        setRecording(true);
        flash('● Recording…');
      }
    } else {
      setBusy(true);
      const r = await post('/record/stop');
      setRecording(false);
      if (r?.file && baseUrl) {
        await downloadCapture(baseUrl, r.file);
        flash('🎥 Video saved');
      }
      setBusy(false);
    }
  }, [recording, post, baseUrl, flash]);

  const zoomIn = useCallback(async () => {
    const r = await post('/zoom/in');
    if (typeof r?.zoom === 'number') setZoom(r.zoom);
  }, [post]);

  const zoomOut = useCallback(async () => {
    const r = await post('/zoom/out');
    if (typeof r?.zoom === 'number') setZoom(r.zoom);
  }, [post]);

  const toggleFace = useCallback(async () => {
    const r = await post('/facetrack', { on: !faceOn });
    if (r) setFaceOn(!!r.facetrack);
  }, [post, faceOn]);

  return {
    available: !!baseUrl,
    recording, faceOn, zoom, busy, toast,
    takePhoto, toggleRecord, zoomIn, zoomOut, toggleFace,
  };
}
