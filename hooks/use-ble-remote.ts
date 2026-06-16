/**
 * useBleRemote — direct Bluetooth Low Energy link to ESP32-Motors
 * ("AGRIBOT-MOTORS"), for sending the same command strings (M../S/CU/CD/CX/CY/CS)
 * that the offline HTTP/UDP path uses, without needing any WiFi connection at all.
 *
 * This is the BLE counterpart to useMqtt's online MQTT path — a third command
 * channel selectable from the Remote screen's WiFi/Bluetooth switch (offline mode only).
 *
 * react-native-ble-plx requires a native module (no Expo Go / web support), so
 * the module is dynamically imported and every call is a no-op on web.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';

// Must match BLE_SERVICE_UUID / BLE_CMD_CHAR_UUID in esp32-firmware-motors/src/main.cpp
const SERVICE_UUID  = '8e3b1a40-7c2e-4a1a-9c3a-1f6e2b9d4c10';
const CMD_CHAR_UUID = '8e3b1a41-7c2e-4a1a-9c3a-1f6e2b9d4c10';
const DEVICE_NAME   = 'AGRIBOT-MOTORS';
const SCAN_TIMEOUT_MS = 10000;

export type BleStatus = 'idle' | 'scanning' | 'connecting' | 'connected' | 'error' | 'unsupported';

// Tiny base64 encoder — commands are short ASCII strings (e.g. "M255,-255", "CU"),
// avoids pulling in the 'buffer' polyfill just for this.
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toBase64(str: string): string {
  let out = '';
  for (let i = 0; i < str.length; i += 3) {
    const b0 = str.charCodeAt(i);
    const b1 = str.charCodeAt(i + 1);
    const b2 = str.charCodeAt(i + 2);
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 0x03) << 4) | (isNaN(b1) ? 0 : b1 >> 4)];
    out += isNaN(b1) ? '=' : B64_CHARS[((b1 & 0x0f) << 2) | (isNaN(b2) ? 0 : b2 >> 6)];
    out += isNaN(b2) ? '=' : B64_CHARS[b2 & 0x3f];
  }
  return out;
}

export function useBleRemote() {
  const [bleStatus, setBleStatus] = useState<BleStatus>(Platform.OS === 'web' ? 'unsupported' : 'idle');
  const [bleDeviceName, setBleDeviceName] = useState<string | null>(null);

  const managerRef  = useRef<any>(null);
  const deviceRef   = useRef<any>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lazily create the BleManager once (native platforms only)
  const getManager = useCallback(async () => {
    if (Platform.OS === 'web') return null;
    if (managerRef.current) return managerRef.current;
    try {
      const { BleManager } = await import('react-native-ble-plx');
      managerRef.current = new BleManager();
      return managerRef.current;
    } catch (err) {
      console.warn('[BLE] react-native-ble-plx unavailable:', err);
      setBleStatus('unsupported');
      return null;
    }
  }, []);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    const apiLevel = Platform.Version as number;
    if (apiLevel < 31) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return (
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
    );
  }, []);

  const disconnectBle = useCallback(async () => {
    if (scanTimerRef.current) { clearTimeout(scanTimerRef.current); scanTimerRef.current = null; }
    const manager = managerRef.current;
    try { manager?.stopDeviceScan(); } catch { /* ignore */ }
    try { await deviceRef.current?.cancelConnection(); } catch { /* ignore */ }
    deviceRef.current = null;
    setBleDeviceName(null);
    setBleStatus('idle');
  }, []);

  const scanAndConnect = useCallback(async () => {
    const manager = await getManager();
    if (!manager) return;

    const ok = await requestPermissions();
    if (!ok) { setBleStatus('error'); return; }

    setBleStatus('scanning');

    try { manager.stopDeviceScan(); } catch { /* ignore */ }

    scanTimerRef.current = setTimeout(() => {
      try { manager.stopDeviceScan(); } catch { /* ignore */ }
      setBleStatus(prev => (prev === 'scanning' ? 'error' : prev));
    }, SCAN_TIMEOUT_MS);

    manager.startDeviceScan([SERVICE_UUID], { allowDuplicates: false }, async (error: any, device: any) => {
      if (error) {
        console.warn('[BLE] scan error:', error.message ?? error);
        setBleStatus('error');
        return;
      }
      if (!device || (device.name !== DEVICE_NAME && device.localName !== DEVICE_NAME)) return;

      try { manager.stopDeviceScan(); } catch { /* ignore */ }
      if (scanTimerRef.current) { clearTimeout(scanTimerRef.current); scanTimerRef.current = null; }
      setBleStatus('connecting');

      try {
        const connected = await device.connect();
        await connected.discoverAllServicesAndCharacteristics();
        deviceRef.current = connected;
        setBleDeviceName(device.name ?? DEVICE_NAME);
        setBleStatus('connected');

        connected.onDisconnected(() => {
          deviceRef.current = null;
          setBleDeviceName(null);
          setBleStatus('idle');
        });
      } catch (err) {
        console.warn('[BLE] connect error:', err);
        setBleStatus('error');
      }
    });
  }, [getManager, requestPermissions]);

  /** Fire-and-forget write of a command string. Returns true if a write was attempted. */
  const sendBleCmd = useCallback((cmd: string): boolean => {
    const device = deviceRef.current;
    if (!device) return false;
    device
      .writeCharacteristicWithoutResponseForService(SERVICE_UUID, CMD_CHAR_UUID, toBase64(cmd))
      .catch((err: unknown) => console.warn('[BLE] write error:', err));
    return true;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      try { managerRef.current?.stopDeviceScan(); } catch { /* ignore */ }
      try { deviceRef.current?.cancelConnection(); } catch { /* ignore */ }
      try { managerRef.current?.destroy(); } catch { /* ignore */ }
    };
  }, []);

  return {
    bleStatus,
    bleConnected: bleStatus === 'connected',
    bleDeviceName,
    scanAndConnect,
    disconnectBle,
    sendBleCmd,
  };
}
