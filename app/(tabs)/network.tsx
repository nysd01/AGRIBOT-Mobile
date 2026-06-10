import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const IS_WEB = Platform.OS === 'web';
// Motors static IP on the AGRIBOT-ESP AP — phone (.2) can reach this directly
// without going through the sensors proxy (.1). AP client isolation is OFF by
// default on the ESP32 softAP, so .2 ↔ .100 works natively.
const MOTORS_AP_IP = '192.168.4.100';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetworkInfo, useESP32Connection } from '@/hooks/use-network-connection';
import { useWifiHistory, type SavedNetwork } from '@/hooks/use-wifi-history';
import { useESP32IP, AP_IP } from '@/context/ESP32Context';
import { useAppMode, DEFAULT_MQTT_CONFIG } from '@/context/AppModeContext';
import { useMqtt } from '@/hooks/use-mqtt';


export default function WifiConnectionScreen() {
  const { networkInfo, loading: networkLoading } = useNetworkInfo();
  const {
    espIP,
    isConnectedToESP,
    espName,
    espStaIP,
    error,
    checkConnection,
    sendWifiConfig,
    sendCloudConfig,
    setCustomEspIP,
  } = useESP32Connection();

  // Global context — updates immediately affect Sensors, Map, Remote tabs
  const { espIP: globalEspIP, setEspIP: setGlobalEspIP, resetToAP } = useESP32IP();

  // Online / Offline mode + cloud config + MQTT
  const { mode, setMode, cloudConfig, setCloudConfig, clearCloud, isOnline, isOnlineMode, mqttConfig, setMqttConfig } = useAppMode();

  // Live MQTT connection status (online mode only)
  const { mqttConnected, publishCmd } = useMqtt();

  // ── ESP32-Motors state ───────────────────────────────────────────────────
  const [sendingMotorsWifi,  setSendingMotorsWifi]  = useState(false);
  const [sendingMqttMotors,  setSendingMqttMotors]  = useState(false);
  const [rebootingMotors,    setRebootingMotors]    = useState(false);
  const [forgettingMotorsWifi, setForgettingMotorsWifi] = useState(false);
  const [motorsStatus, setMotorsStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [pingingMotors, setPingingMotors] = useState(false);
  // Motors normally lives at 192.168.4.100 on the AGRIBOT-ESP AP. If it has
  // joined a router (online/MQTT mode) it gets a different IP on that router's
  // network — override it here so Ping/WiFi/MQTT buttons reach it there instead.
  const [motorsIP, setMotorsIP] = useState(MOTORS_AP_IP);
  const [motorsIPInput, setMotorsIPInput] = useState(MOTORS_AP_IP);

  // ── MQTT config form state ────────────────────────────────────────────────
  const initMqtt = mqttConfig ?? DEFAULT_MQTT_CONFIG;
  const [mqttHost,     setMqttHost]     = useState(initMqtt.host);
  const [mqttUser,     setMqttUser]     = useState(initMqtt.username);
  const [mqttPass,     setMqttPass]     = useState(initMqtt.password);
  const [mqttPrefix,   setMqttPrefix]   = useState(initMqtt.topicPrefix);
  const [mqttTls,      setMqttTls]      = useState(initMqtt.useTls);
  const [showMqttPass, setShowMqttPass] = useState(false);

  // Cloud config form state
  const [cloudUrl,      setCloudUrl]      = useState(cloudConfig?.serverUrl ?? '');
  const [cloudKey,      setCloudKey]      = useState(cloudConfig?.apiKey    ?? '');
  const [showCloudKey,  setShowCloudKey]  = useState(false);
  const [savingCloud,   setSavingCloud]   = useState(false);
  const [sendingCloud,  setSendingCloud]  = useState(false);

  const {
    networks: savedNetworks,
    loading: historyLoading,
    saveNetwork,
    markUsed,
    removeNetwork,
    relativeTime,
  } = useWifiHistory();

  const [checking, setChecking]         = useState(false);
  const [sendingConfig, setSendingConfig] = useState(false);

  // Router credentials
  const [routerSSID, setRouterSSID] = useState('');
  const [routerPass, setRouterPass] = useState('');
  const [showPass, setShowPass]     = useState(false);

  // Custom ESP IP override
  const [customIP, setCustomIP] = useState(espIP);

  // Whether to show the full password manager (collapsed by default if there are saved networks)
  const [showAddForm, setShowAddForm] = useState(false);

  // ── Router-connected banner ──────────────────────────────────────────────
  // Shows once when the ESP32 STA IP is first detected.
  const [routerBannerVisible, setRouterBannerVisible] = useState(false);
  const prevStaIP   = useRef<string | null>(null);
  const prevPhoneIP = useRef<string | undefined>(undefined);

  // Detect when ESP32 joins the router (STA IP appears for the first time)
  useEffect(() => {
    if (espStaIP && espStaIP !== prevStaIP.current) {
      prevStaIP.current = espStaIP;
      setRouterBannerVisible(true);
    } else if (!espStaIP) {
      prevStaIP.current = null;
      setRouterBannerVisible(false);
    }
  }, [espStaIP]);

  // ── AUTO-SWITCH: detect phone network change and pick the right ESP IP ──
  //
  // Phone on 192.168.4.x  → on the ESP's AP  → poll AP IP (192.168.4.1)
  // Phone on anything else AND STA IP known   → poll STA IP automatically
  //
  // This means sensor/GPS data resumes the moment the phone joins the router
  // — no "Use STA IP" tap needed.
  useEffect(() => {
    const phoneIP = networkInfo?.ip;
    if (!phoneIP || phoneIP === prevPhoneIP.current) return;
    prevPhoneIP.current = phoneIP;

    const onEspAP = phoneIP.startsWith('192.168.4.');

    if (onEspAP) {
      // Phone is on the ESP's own hotspot → always use AP IP
      if (globalEspIP !== AP_IP) {
        setCustomEspIP(AP_IP);
        setGlobalEspIP(AP_IP);
        setCustomIP(AP_IP);
      }
    } else if (espStaIP && globalEspIP !== espStaIP && networkInfo?.isWifi) {
      // Phone is on a WIFI network (not cellular) AND we know the ESP's router IP
      // → switch every sensor tab to the STA IP automatically.
      // Guard isWifi so a brief cellular fallback doesn't flip espIP away from
      // 192.168.4.1 while the user is still managing the AP.
      setCustomEspIP(espStaIP);
      setGlobalEspIP(espStaIP);
      setCustomIP(espStaIP);
      setRouterBannerVisible(true);
    }
  }, [networkInfo?.ip, espStaIP, globalEspIP, setCustomEspIP, setGlobalEspIP]);
  // ─────────────────────────────────────────────────────────────────────────

  // Ping once on mount only. Manual pings use handleCheck().
  // Keeping checkConnection in deps would re-fire every IP change, racing
  // against the manual ping and resetting isConnectedToESP to false.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void checkConnection(); }, []);

  // Auto-open the form when there are no saved networks yet
  useEffect(() => {
    if (!historyLoading && savedNetworks.length === 0) setShowAddForm(true);
  }, [historyLoading, savedNetworks.length]);

  const handleCheck = async () => {
    setChecking(true);
    await checkConnection(customIP);
    setChecking(false);
  };

  const handleApplyCustomIP = () => {
    if (!customIP.trim()) return;
    setCustomEspIP(customIP);       // updates useESP32Connection local state
    setGlobalEspIP(customIP);       // updates ESP32Context → all tabs pick up new IP
    void checkConnection(customIP);
  };

  /** Apply the ESP32's router IP globally so all sensor tabs switch to it. */
  const handleActivateStaIP = () => {
    if (!espStaIP) return;
    setCustomEspIP(espStaIP);
    setGlobalEspIP(espStaIP);
    setCustomIP(espStaIP);
    Alert.alert(
      'STA IP activated ✓',
      `All sensor tabs now poll ${espStaIP}.\n\nMake sure your phone is on the same router WiFi.`
    );
  };

  /** Revert everything back to the AP IP (192.168.4.1). */
  const handleResetToAP = () => {
    setCustomEspIP(AP_IP);
    resetToAP();
    setCustomIP(AP_IP);
    Alert.alert('Reset to AP', 'ESP IP reverted to 192.168.4.1 (direct AP connection).');
  };

  // ── Cloud config handlers ────────────────────────────────────────────────

  const handleSaveCloud = async () => {
    if (!cloudUrl.trim()) {
      Alert.alert('Missing URL', 'Enter your Supabase or server URL.');
      return;
    }
    setSavingCloud(true);
    try {
      setCloudConfig({ serverUrl: cloudUrl.trim(), apiKey: cloudKey.trim() });
      setMode('online');
      Alert.alert(
        'Cloud saved ✓',
        'The app will now fetch sensor data from your cloud server.\n\nSwitch to Online mode above to activate.',
      );
    } finally {
      setSavingCloud(false);
    }
  };

  const handleSendCloudToESP = async () => {
    if (!cloudUrl.trim()) {
      Alert.alert('Missing URL', 'Save a cloud URL first.');
      return;
    }
    if (!isConnectedToESP) {
      Alert.alert('Not connected', 'Connect to ESP32 first (via AGRIBOT-ESP or router).');
      return;
    }
    setSendingCloud(true);
    try {
      await sendCloudConfig(cloudUrl.trim(), cloudKey.trim());
      Alert.alert('Sent to ESP32 ✓', 'The ESP32 will now POST sensor data to your cloud server whenever it has internet access.');
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Could not reach ESP32.');
    } finally {
      setSendingCloud(false);
    }
  };

  const handleClearCloud = () => {
    Alert.alert('Clear cloud config', 'Remove cloud settings and switch back to Offline mode?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => { clearCloud(); setCloudUrl(''); setCloudKey(''); } },
    ]);
  };

  // ── ESP32-Motors handlers — direct HTTP to motorsIP (default 192.168.4.100)
  // Default: phone (.2) and motors (.100) are on the same AGRIBOT-ESP AP subnet,
  // and ESP32 softAP has no client isolation by default, so .2 → .100 works directly.
  // If Motors has joined a router instead (online/MQTT mode), motorsIP can be
  // overridden below to its address on that router's network.

  const directMotors = async (path: string, body?: object) => {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(`http://${motorsIP}${path}`, {
        method:  body !== undefined ? 'POST' : 'GET',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body:    body !== undefined ? JSON.stringify(body) : undefined,
        signal:  ctrl.signal,
      });
      return res;
    } finally {
      clearTimeout(timer);
    }
  };

  /** Ping ESP32-Motors /health to show a live ACTIVE/OFFLINE badge. */
  const pingMotors = async () => {
    try {
      const res = await directMotors('/health');
      setMotorsStatus(res.ok ? 'online' : 'offline');
    } catch {
      setMotorsStatus('offline');
    }
  };

  // Ping motors on mount and re-check every 10s while the screen is open.
  useEffect(() => {
    void pingMotors();
    const id = setInterval(() => void pingMotors(), 10000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Manual "Ping Motors" button handler — same UX as "Ping ESP32". */
  const handlePingMotors = async () => {
    setPingingMotors(true);
    await pingMotors();
    setPingingMotors(false);
  };

  const handleSendWifiToMotors = async () => {
    if (!routerSSID.trim()) {
      Alert.alert('Missing SSID', 'Enter router SSID in the Router WiFi section first.'); return;
    }
    setSendingMotorsWifi(true);
    try {
      const res = await directMotors('/wifi-config', { ssid: routerSSID, password: routerPass });
      if (res.ok) {
        Alert.alert('WiFi Saved ✓', `Motors will connect to "${routerSSID}" after reboot.\n\nTap Reboot Motors below.`);
      } else {
        Alert.alert('Failed', `HTTP ${res.status} — make sure you are on AGRIBOT-ESP and motors is powered on.`);
      }
    } catch {
      Alert.alert(
        'Cannot reach motors',
        motorsIP === MOTORS_AP_IP
          ? `Make sure your phone WiFi is set to AGRIBOT-ESP.\nMotors IP: ${motorsIP}`
          : `Make sure your phone is on the same WiFi network as the Motors ESP32.\nMotors IP: ${motorsIP}`
      );
    } finally { setSendingMotorsWifi(false); }
  };

  const handleSendMqttToMotors = async () => {
    if (!mqttHost.trim()) {
      Alert.alert('Missing Host', 'Fill the MQTT broker host in the MQTT section first.'); return;
    }
    setSendingMqttMotors(true);
    try {
      const res = await directMotors('/mqtt-config', {
        host:  mqttHost.trim(),
        port:  mqttTls ? 8883 : 1883,
        user:  mqttUser.trim(),
        pass:  mqttPass,
        topic: `${mqttPrefix.trim() || 'agribot'}/motors/cmd`,
      });
      if (res.ok) {
        Alert.alert('MQTT Saved ✓', `Motors will subscribe to ${mqttPrefix || 'agribot'}/motors/cmd after reboot.`);
      } else {
        Alert.alert('Failed', `HTTP ${res.status}`);
      }
    } catch {
      Alert.alert(
        'Cannot reach motors',
        motorsIP === MOTORS_AP_IP
          ? `Make sure your phone WiFi is set to AGRIBOT-ESP.\nMotors IP: ${motorsIP}`
          : `Make sure your phone is on the same WiFi network as the Motors ESP32.\nMotors IP: ${motorsIP}`
      );
    } finally { setSendingMqttMotors(false); }
  };

  const handleRebootMotors = async () => {
    Alert.alert('Reboot Motors?', 'Motors will disconnect briefly and reconnect with new settings.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reboot', style: 'destructive', onPress: async () => {
        setRebootingMotors(true);
        try {
          await directMotors('/reboot', {});
          Alert.alert('Rebooting…', 'Motors is restarting. NeoPixels will turn PURPLE when MQTT connects.');
        } catch {
          Alert.alert('Rebooting…', 'Motors is restarting. NeoPixels will turn PURPLE when MQTT connects.');
        } finally { setRebootingMotors(false); }
      }},
    ]);
  };

  const handleForgetMotorsWifi = async () => {
    Alert.alert(
      'Forget Motors Router WiFi?',
      'Motors will erase its saved router SSID/password. After reboot it will always join AGRIBOT-ESP (offline mode) instead of a router, until you set new WiFi credentials.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Forget', style: 'destructive', onPress: async () => {
          setForgettingMotorsWifi(true);
          try {
            const res = await directMotors('/wifi-forget', {});
            if (res.ok) {
              Alert.alert('Forgotten ✓', 'Router WiFi cleared. Tap "Reboot Motors" to apply — Motors will join AGRIBOT-ESP.');
            } else {
              Alert.alert('Failed', `HTTP ${res.status}`);
            }
          } catch {
            Alert.alert(
              'Cannot reach motors',
              motorsIP === MOTORS_AP_IP
                ? `Make sure your phone WiFi is set to AGRIBOT-ESP.\nMotors IP: ${motorsIP}`
                : `Make sure your phone is on the same WiFi network as the Motors ESP32.\nMotors IP: ${motorsIP}`
            );
          } finally { setForgettingMotorsWifi(false); }
        }},
      ]
    );
  };

  /**
   * Forget Motors' router WiFi via MQTT — works even when Motors is connected
   * to the router (and therefore unreachable at 192.168.4.100 over HTTP).
   * Motors clears its saved SSID/password and reboots, rejoining AGRIBOT-ESP.
   */
  const handleForgetMotorsWifiMqtt = () => {
    Alert.alert(
      'Forget Motors Router WiFi?',
      'Sends a command over MQTT telling Motors to erase its saved router SSID/password and reboot. It will rejoin AGRIBOT-ESP (offline mode) afterwards.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Forget', style: 'destructive', onPress: () => {
          const ok = publishCmd('WIFI_FORGET');
          if (ok) {
            Alert.alert('Sent ✓', 'Motors will forget its router WiFi and reboot — it should rejoin AGRIBOT-ESP within ~15 seconds.');
          } else {
            Alert.alert('Not connected', 'MQTT is not connected — cannot send the command right now.');
          }
        }},
      ]
    );
  };

  const handleSaveMqtt = () => {
    if (!mqttHost.trim()) {
      Alert.alert('Missing Host', 'Enter a broker hostname.');
      return;
    }
    setMqttConfig({
      host:        mqttHost.trim(),
      username:    mqttUser.trim(),
      password:    mqttPass,
      topicPrefix: mqttPrefix.trim() || 'agribot',
      useTls:      mqttTls,
    });
    Alert.alert('MQTT Saved ✓', `App will use MQTT for online motor commands.\n\nBroker: ${mqttHost}\nTopic: ${mqttPrefix}/motors/cmd`);
  };

  /** Fill the form fields from a saved network */
  const handleSelectSaved = (net: SavedNetwork) => {
    setRouterSSID(net.ssid);
    setRouterPass(net.password);
    setShowAddForm(true);   // reveal the form so they can review / send
    markUsed(net.ssid);
  };

  const handleDeleteSaved = (net: SavedNetwork) => {
    Alert.alert(
      'Remove network',
      `Remove "${net.ssid}" from saved networks?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeNetwork(net.id) },
      ]
    );
  };

  const handleSaveOnly = () => {
    if (!routerSSID.trim()) {
      Alert.alert('Missing SSID', 'Enter a network name first.');
      return;
    }
    saveNetwork(routerSSID, routerPass);
    Alert.alert('Saved ✓', `"${routerSSID}" saved to network history.`);
  };

  const handleSendWifiConfig = async () => {
    if (!routerSSID.trim()) {
      Alert.alert('Missing SSID', 'Please enter the router network name (SSID).');
      return;
    }
    Alert.alert(
      'Configure Router WiFi',
      `Send credentials for "${routerSSID}" to the ESP32?\n\nThe ESP32 will:\n• Stay in AP mode (AGRIBOT-ESP)\n• Also connect to "${routerSSID}" as a station\n\nYour phone can then join "${routerSSID}" and both will be on the same network.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            try {
              setSendingConfig(true);
              await sendWifiConfig(routerSSID, routerPass);
              // Auto-save on successful send
              saveNetwork(routerSSID, routerPass);
              Alert.alert(
                'Credentials sent ✓',
                `ESP32 is connecting to "${routerSSID}".\n\n` +
                '• Join your phone to the same router WiFi.\n' +
                '• The ESP32 STA IP will appear in the card above once connected.\n' +
                '• Update the ESP32 IP field to the STA IP for sensor data.'
              );
            } catch (e) {
              // The ESP32 saves credentials BEFORE switching WiFi mode to connect
              // to the router — that mode switch briefly drops the AP link, so the
              // HTTP response often never arrives even though the save succeeded.
              // Treat a timeout/abort as a likely success rather than a failure.
              const isAbort =
                e instanceof Error &&
                (e.name === 'AbortError' || (e.message ?? '').toLowerCase().includes('abort'));
              if (isAbort) {
                saveNetwork(routerSSID, routerPass);
                Alert.alert(
                  'Credentials sent ✓',
                  `No response from the ESP32 — this is normal, it already saved "${routerSSID}" and is now switching networks.\n\n` +
                  '• Join your phone to the same router WiFi.\n' +
                  '• The ESP32 STA IP will appear in the card above once connected.'
                );
              } else {
                Alert.alert('Failed', e instanceof Error ? e.message : 'Could not send credentials.');
              }
            } finally {
              setSendingConfig(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={s.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >

          {/* ── Header ── */}
          <View style={s.header}>
            <Text style={s.title}>Network</Text>
            <Text style={s.subtitle}>Manage ESP32 ↔ Phone connectivity</Text>
          </View>

          {/* ── Router-connected success banner ── */}
          {routerBannerVisible && espStaIP && (
            <View style={s.routerBanner}>
              <MaterialCommunityIcons name="check-circle" size={18} color="#58C95F" />
              <View style={{ flex: 1 }}>
                <Text style={s.routerBannerTitle}>ESP32 joined your router! 🎉</Text>
                <Text style={s.routerBannerBody}>
                  Router IP: <Text style={{ color: '#72F88A', fontWeight: '700' }}>{espStaIP}</Text>
                  {'\n'}Switch your phone to the same router WiFi — the app will
                  {' '}<Text style={{ fontWeight: '700' }}>auto-switch</Text>{' '}
                  and sensor + GPS data will keep streaming.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setRouterBannerVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialCommunityIcons name="close" size={16} color="#58C95F" />
              </TouchableOpacity>
            </View>
          )}

          {/* ── Phone WiFi ── */}
          <View style={s.card}>
            <View style={s.cardTitleRow}>
              <MaterialCommunityIcons name="cellphone-wireless" size={16} color="#4A9AFF" />
              <Text style={s.cardTitle}>Phone WiFi</Text>
            </View>

            <View style={s.infoRow}>
              <Text style={s.label}>Connection</Text>
              {networkLoading
                ? <ActivityIndicator size="small" color="#4A9AFF" />
                : <StatusBadge
                    value={networkInfo?.ssid ?? (networkInfo?.isConnected ? 'Connected (SSID hidden)' : null)}
                    connected={networkInfo?.isConnected ?? false}
                    label={networkInfo?.ssid ?? (networkInfo?.isConnected ? 'Connected' : 'Offline')}
                  />}
            </View>

            {networkInfo?.ip ? (
              <View style={s.infoRow}>
                <Text style={s.label}>Phone IP</Text>
                <Text style={s.value}>{networkInfo.ip}</Text>
              </View>
            ) : !networkLoading && (
              <View style={s.infoRow}>
                <Text style={s.label}>Phone IP</Text>
                <Text style={[s.value, { color: '#666' }]}>—</Text>
              </View>
            )}

            {networkInfo?.isConnected && !networkInfo?.ssid && (
              <View style={s.hintBox}>
                <MaterialCommunityIcons name="information-outline" size={13} color="#4A9AFF" />
                <Text style={s.hintText}>
                  SSID hidden on Android — grant Location permission to see it.
                  Connection is still active if an IP is shown above.
                </Text>
              </View>
            )}
          </View>

          {/* ── ESP32 Device ── */}
          <View style={s.card}>
            <View style={s.cardTitleRow}>
              <MaterialCommunityIcons name="chip" size={16} color="#58C95F" />
              <Text style={s.cardTitle}>ESP32 Device</Text>
            </View>

            <View style={s.infoRow}>
              <Text style={s.label}>Status</Text>
              {checking
                ? <ActivityIndicator size="small" color="#4A9AFF" />
                : <StatusBadge
                    value={espName || 'AGRIBOT-ESP'}
                    connected={isConnectedToESP}
                    label={isConnectedToESP ? (espName || 'AGRIBOT-ESP') : 'Not found'}
                  />}
            </View>

            <View style={s.infoRow}>
              <Text style={s.label}>AP IP (direct)</Text>
              <Text style={s.value}>{espIP}</Text>
            </View>

            {espStaIP && (
              <View style={s.infoRow}>
                <Text style={s.label}>ESP32 STA IP (router)</Text>
                <Text style={[s.value, { color: '#72F88A' }]}>{espStaIP}</Text>
              </View>
            )}

            {/* ── Active polling IP indicator ── */}
            <View style={s.infoRow}>
              <Text style={s.label}>Sensors polling</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[s.badge, globalEspIP === AP_IP ? s.badgeRed : s.badgeGreen]}>
                  <MaterialCommunityIcons
                    name={globalEspIP === AP_IP ? 'wifi' : 'router-wireless'}
                    size={11}
                    color={globalEspIP === AP_IP ? '#FF4533' : '#58C95F'}
                  />
                  <Text style={[s.badgeText, { color: globalEspIP === AP_IP ? '#FF4533' : '#58C95F' }]}>
                    {globalEspIP === AP_IP ? 'AP direct' : 'Router'}
                  </Text>
                </View>
                <Text style={[s.value, { fontSize: 11 }]}>{globalEspIP}</Text>
              </View>
            </View>

            {/* ── STA IP action banner ── */}
            {espStaIP && globalEspIP !== espStaIP && (
              <View style={s.staBanner}>
                <MaterialCommunityIcons name="information-outline" size={15} color="#58C95F" />
                <Text style={s.staBannerText}>
                  ESP32 joined router as{' '}
                  <Text style={{ color: '#72F88A', fontWeight: '700' }}>{espStaIP}</Text>
                  {'. '}Join your phone to the same router WiFi, then tap below.
                </Text>
                <TouchableOpacity style={s.staBtn} onPress={handleActivateStaIP}>
                  <MaterialCommunityIcons name="check-circle-outline" size={14} color="#070A0A" />
                  <Text style={s.staBtnText}>Use STA IP — all sensors</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Reset to AP button (shown when using STA IP) ── */}
            {globalEspIP !== AP_IP && (
              <TouchableOpacity style={s.resetBtn} onPress={handleResetToAP}>
                <MaterialCommunityIcons name="wifi-arrow-left-right" size={14} color="#F4A460" />
                <Text style={s.resetBtnText}>Reset to AP ({AP_IP})</Text>
              </TouchableOpacity>
            )}

            {error && (
              <View style={s.errorBox}>
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            <Text style={s.fieldLabel}>ESP32 IP Address</Text>
            <View style={s.inputRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={customIP}
                onChangeText={setCustomIP}
                placeholder="e.g. 192.168.4.1 or 192.168.1.42"
                placeholderTextColor="#555"
                keyboardType="numeric"
                autoCapitalize="none"
              />
              <TouchableOpacity style={s.applyBtn} onPress={handleApplyCustomIP}>
                <Text style={s.applyBtnText}>Set</Text>
              </TouchableOpacity>
            </View>

            <Pressable
              style={[s.btn, checking && s.btnDisabled]}
              onPress={() => void handleCheck()}
              disabled={checking}
            >
              {checking
                ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
                : <MaterialCommunityIcons name="wifi-check" size={16} color="#fff" style={{ marginRight: 6 }} />}
              <Text style={s.btnText}>{checking ? 'Checking…' : 'Ping ESP32'}</Text>
            </Pressable>
          </View>

          {/* ══════════════════════════════════════════
              Router WiFi — Saved Networks + Config
          ══════════════════════════════════════════ */}
          <View style={s.card}>
            <View style={s.cardTitleRow}>
              <MaterialCommunityIcons name="router-wireless" size={16} color="#F4A460" />
              <Text style={s.cardTitle}>Router WiFi (Dual-Mode)</Text>
            </View>

            {/* Dual-mode explainer */}
            <View style={s.dualModeBox}>
              <Text style={s.dualModeTitle}>How dual-mode works</Text>
              <Text style={s.dualModeBody}>
                The ESP32 connects to your home router{' '}
                <Text style={{ color: '#4A9AFF', fontWeight: '700' }}>and</Text>{' '}
                keeps its own AP active simultaneously.{'\n\n'}
                • Phone on home WiFi → reaches ESP via STA IP{'\n'}
                • No home WiFi → connect phone to{' '}
                <Text style={{ color: '#7DFB8C', fontWeight: '700' }}>AGRIBOT-ESP</Text> AP directly
              </Text>
            </View>

            {/* ── Saved Networks list ── */}
            <View style={s.savedHeader}>
              <Text style={s.savedTitle}>
                <MaterialCommunityIcons name="history" size={14} color="#A7B2B5" />
                {'  '}Saved Networks
              </Text>
              <TouchableOpacity
                style={s.addNewBtn}
                onPress={() => { setRouterSSID(''); setRouterPass(''); setShowAddForm(true); }}
              >
                <MaterialCommunityIcons name="plus" size={14} color="#F4A460" />
                <Text style={s.addNewBtnText}>Add New</Text>
              </TouchableOpacity>
            </View>

            {historyLoading ? (
              <ActivityIndicator size="small" color="#4A9AFF" style={{ marginVertical: 12 }} />
            ) : savedNetworks.length === 0 ? (
              <View style={s.emptyHistory}>
                <MaterialCommunityIcons name="wifi-off" size={28} color="#2a2a2a" />
                <Text style={s.emptyHistoryText}>No saved networks yet.{'\n'}Add one below.</Text>
              </View>
            ) : (
              <View style={s.networkList}>
                {savedNetworks.map(net => {
                  const isActive = net.ssid === routerSSID;
                  return (
                    <TouchableOpacity
                      key={net.id}
                      style={[s.networkRow, isActive && s.networkRowActive]}
                      onPress={() => handleSelectSaved(net)}
                      activeOpacity={0.7}
                    >
                      {/* WiFi icon */}
                      <View style={[s.networkIcon, isActive && s.networkIconActive]}>
                        <MaterialCommunityIcons
                          name="wifi"
                          size={16}
                          color={isActive ? '#070A0A' : '#F4A460'}
                        />
                      </View>

                      {/* SSID + last used */}
                      <View style={{ flex: 1 }}>
                        <Text style={[s.networkSSID, isActive && { color: '#070A0A' }]}>
                          {net.ssid}
                        </Text>
                        <Text style={[s.networkMeta, isActive && { color: '#1a4a20' }]}>
                          {relativeTime(net.lastUsed)}
                          {isActive ? '  •  selected' : ''}
                        </Text>
                      </View>

                      {/* "Use" chip — tap row to fill */}
                      {!isActive && (
                        <View style={s.useChip}>
                          <Text style={s.useChipText}>USE</Text>
                        </View>
                      )}
                      {isActive && (
                        <MaterialCommunityIcons name="check-circle" size={18} color="#58C95F" />
                      )}

                      {/* Delete */}
                      <TouchableOpacity
                        style={s.deleteBtn}
                        onPress={() => handleDeleteSaved(net)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FF4533" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── Add / Edit form (collapsible) ── */}
            {(showAddForm || savedNetworks.length === 0) && (
              <View style={s.addFormWrap}>
                <View style={s.addFormDivider} />

                <Text style={s.fieldLabel}>Router SSID</Text>
                <TextInput
                  style={s.input}
                  value={routerSSID}
                  onChangeText={setRouterSSID}
                  placeholder="Your home WiFi name"
                  placeholderTextColor="#555"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={[s.fieldLabel, { marginTop: 12 }]}>Password</Text>
                <View style={s.inputRow}>
                  <TextInput
                    style={[s.input, { flex: 1 }]}
                    value={routerPass}
                    onChangeText={setRouterPass}
                    placeholder="WiFi password"
                    placeholderTextColor="#555"
                    secureTextEntry={!showPass}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPass(v => !v)}>
                    <MaterialCommunityIcons
                      name={showPass ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color="#666"
                    />
                  </TouchableOpacity>
                </View>

                {/* Action row: Save only | Send to ESP32 */}
                <View style={[s.inputRow, { marginTop: 14, gap: 10 }]}>
                  {/* Save without sending */}
                  <TouchableOpacity
                    style={[s.btnSmall, { flex: 1 }, !routerSSID.trim() && s.btnDisabled]}
                    onPress={handleSaveOnly}
                    disabled={!routerSSID.trim()}
                  >
                    <MaterialCommunityIcons name="content-save-outline" size={15} color="#F4A460" />
                    <Text style={[s.btnSmallText, { color: '#F4A460' }]}>Save</Text>
                  </TouchableOpacity>

                  {/* Send to ESP32 (also saves) */}
                  <Pressable
                    style={[s.btn, s.btnOrange, { flex: 2, marginTop: 0 }, (sendingConfig || !routerSSID.trim()) && s.btnDisabled]}
                    onPress={() => void handleSendWifiConfig()}
                    disabled={sendingConfig || !routerSSID.trim()}
                  >
                    {sendingConfig
                      ? <ActivityIndicator size="small" color="#070A0A" style={{ marginRight: 6 }} />
                      : <MaterialCommunityIcons name="send" size={15} color="#070A0A" style={{ marginRight: 6 }} />}
                    <Text style={[s.btnText, { color: '#070A0A', fontSize: 13 }]}>
                      {sendingConfig ? 'Sending…' : 'Send to ESP32'}
                    </Text>
                  </Pressable>
                </View>

                {/* Collapse if there are saved networks */}
                {savedNetworks.length > 0 && (
                  <TouchableOpacity
                    style={s.collapseBtn}
                    onPress={() => setShowAddForm(false)}
                  >
                    <MaterialCommunityIcons name="chevron-up" size={16} color="#555" />
                    <Text style={s.collapseBtnText}>Collapse</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* ══════════════════════════════════════════
              ESP32-Motors
          ══════════════════════════════════════════ */}
          <View style={s.card}>
            <View style={s.cardTitleRow}>
              <MaterialCommunityIcons name="engine" size={16} color="#A78BFA" />
              <Text style={s.cardTitle}>ESP32-Motors</Text>
              <View style={[s.badge, motorsStatus === 'online' ? s.badgeGreen : s.badgeRed, { marginLeft: 'auto' }]}>
                <MaterialCommunityIcons
                  name={motorsStatus === 'online' ? 'check-circle' : motorsStatus === 'checking' ? 'progress-clock' : 'close-circle'}
                  size={12}
                  color={motorsStatus === 'online' ? '#58C95F' : '#FF4533'}
                />
                <Text style={[s.badgeText, { color: motorsStatus === 'online' ? '#58C95F' : '#FF4533' }]}>
                  {motorsStatus === 'online' ? 'ACTIVE' : motorsStatus === 'checking' ? 'Checking…' : 'OFFLINE'}
                </Text>
              </View>
            </View>

            <View style={[s.modeInfoBox, { borderColor: '#A78BFA33' }]}>
              <MaterialCommunityIcons name="information-outline" size={14} color="#A78BFA" />
              <Text style={s.modeInfoText}>
                Connect to <Text style={{ color: '#A78BFA', fontWeight: '700' }}>AGRIBOT-ESP</Text> to manage motors. Changes take effect after reboot.
              </Text>
            </View>

            <Text style={s.fieldLabel}>Motors IP Address</Text>
            <Text style={[s.hintText, { marginBottom: 8 }]}>
              {motorsIP === MOTORS_AP_IP
                ? `Default — works while phone is on AGRIBOT-ESP and Motors hasn't joined a router.`
                : `Custom — Motors has joined a router. Phone must be on the SAME router WiFi to reach this IP.`}
            </Text>
            <View style={s.inputRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={motorsIPInput}
                onChangeText={setMotorsIPInput}
                placeholder="e.g. 192.168.4.100 or 192.168.1.55"
                placeholderTextColor="#555"
                keyboardType="numeric"
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={s.applyBtn}
                onPress={() => setMotorsIP(motorsIPInput.trim() || MOTORS_AP_IP)}
              >
                <Text style={s.applyBtnText}>Set</Text>
              </TouchableOpacity>
            </View>
            {motorsIP !== MOTORS_AP_IP && (
              <TouchableOpacity
                onPress={() => { setMotorsIP(MOTORS_AP_IP); setMotorsIPInput(MOTORS_AP_IP); }}
                style={{ marginBottom: 8 }}
              >
                <Text style={[s.hintText, { color: '#A78BFA', textDecorationLine: 'underline' }]}>
                  Reset to default ({MOTORS_AP_IP})
                </Text>
              </TouchableOpacity>
            )}

            <Pressable
              style={[s.btn, { backgroundColor: '#A78BFA' }, pingingMotors && s.btnDisabled]}
              onPress={() => void handlePingMotors()}
              disabled={pingingMotors}
            >
              {pingingMotors
                ? <ActivityIndicator size="small" color="#070A0A" style={{ marginRight: 6 }} />
                : <MaterialCommunityIcons name="wifi-check" size={16} color="#070A0A" style={{ marginRight: 6 }} />}
              <Text style={[s.btnText, { color: '#070A0A' }]}>{pingingMotors ? 'Checking…' : `Ping Motors (${motorsIP})`}</Text>
            </Pressable>

            {/* ── Send WiFi ── */}
            <Text style={s.fieldLabel}>Router WiFi for Motors</Text>
            <Text style={[s.hintText, { marginBottom: 8 }]}>
              Uses the SSID/password from the Router WiFi section above.
            </Text>
            <Pressable
              style={[s.btn, { backgroundColor: '#7C3AED' }, (sendingMotorsWifi || !routerSSID.trim()) && s.btnDisabled]}
              onPress={() => void handleSendWifiToMotors()}
              disabled={sendingMotorsWifi || !routerSSID.trim()}
            >
              {sendingMotorsWifi
                ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
                : <MaterialCommunityIcons name="wifi-arrow-up-down" size={16} color="#fff" style={{ marginRight: 6 }} />}
              <Text style={s.btnText}>
                {sendingMotorsWifi ? 'Sending…' : routerSSID.trim() ? `Set WiFi: "${routerSSID}"` : 'Select router SSID above first'}
              </Text>
            </Pressable>

            {/* ── Send MQTT ── */}
            <Text style={[s.fieldLabel, { marginTop: 16 }]}>MQTT Config for Motors</Text>
            <Text style={[s.hintText, { marginBottom: 8 }]}>
              Uses the broker/topic from the MQTT section below.
            </Text>
            <Pressable
              style={[s.btn, { backgroundColor: '#B45309', marginTop: 0 }, (sendingMqttMotors || !mqttHost.trim()) && s.btnDisabled]}
              onPress={() => void handleSendMqttToMotors()}
              disabled={sendingMqttMotors || !mqttHost.trim()}
            >
              {sendingMqttMotors
                ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
                : <MaterialCommunityIcons name="lightning-bolt" size={16} color="#fff" style={{ marginRight: 6 }} />}
              <Text style={s.btnText}>
                {sendingMqttMotors ? 'Sending…' : `Set MQTT: ${mqttHost.trim() || 'fill broker below'}`}
              </Text>
            </Pressable>

            {/* ── Reboot ── */}
            <View style={s.addFormDivider} />
            <Pressable
              style={[s.btn, { backgroundColor: '#374151', marginTop: 0 }, rebootingMotors && s.btnDisabled]}
              onPress={() => void handleRebootMotors()}
              disabled={rebootingMotors}
            >
              {rebootingMotors
                ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
                : <MaterialCommunityIcons name="restart" size={16} color="#fff" style={{ marginRight: 6 }} />}
              <Text style={s.btnText}>{rebootingMotors ? 'Rebooting…' : 'Reboot Motors'}</Text>
            </Pressable>
            <Text style={[s.hintText, { marginTop: 6 }]}>
              After reboot: motors connects to router → NeoPixels <Text style={{ color: '#A78BFA' }}>PURPLE</Text> = MQTT live.
            </Text>

            {/* ── Forget WiFi (force back to AGRIBOT-ESP for offline mode) ── */}
            <Pressable
              style={[s.btn, { backgroundColor: '#7F1D1D', marginTop: 8 }, forgettingMotorsWifi && s.btnDisabled]}
              onPress={() => void handleForgetMotorsWifi()}
              disabled={forgettingMotorsWifi}
            >
              {forgettingMotorsWifi
                ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
                : <MaterialCommunityIcons name="wifi-off" size={16} color="#fff" style={{ marginRight: 6 }} />}
              <Text style={s.btnText}>{forgettingMotorsWifi ? 'Forgetting…' : 'Forget Router WiFi'}</Text>
            </Pressable>
            <Text style={[s.hintText, { marginTop: 6 }]}>
              Clears saved router credentials so Motors always joins{' '}
              <Text style={{ color: '#A78BFA', fontWeight: '700' }}>AGRIBOT-ESP</Text> (192.168.4.100) for offline mode. Reboot to apply.
            </Text>
            <Text style={[s.hintText, { marginTop: 2, fontStyle: 'italic' }]}>
              Can't reach {motorsIP}? If Motors already joined a router, use MQTT instead — no shared WiFi needed.
            </Text>

            {/* ── Forget WiFi via MQTT — works even when Motors is on the router ── */}
            <Pressable
              style={[s.btn, { backgroundColor: '#7F1D1D', marginTop: 8 }, !mqttConnected && s.btnDisabled]}
              onPress={handleForgetMotorsWifiMqtt}
              disabled={!mqttConnected}
            >
              <MaterialCommunityIcons name="lightning-bolt" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={s.btnText}>
                {mqttConnected ? 'Forget Router WiFi (via MQTT)' : 'Forget via MQTT — not connected'}
              </Text>
            </Pressable>
          </View>

          {/* ══════════════════════════════════════════
              MQTT Configuration
          ══════════════════════════════════════════ */}
          <View style={s.card}>
            <View style={s.cardTitleRow}>
              <MaterialCommunityIcons name="lightning-bolt" size={16} color="#F59E0B" />
              <Text style={s.cardTitle}>MQTT (Low-Latency Commands)</Text>
              {mqttConnected ? (
                <View style={[s.badge, s.badgeGreen, { marginLeft: 'auto' }]}>
                  <MaterialCommunityIcons name="lightning-bolt" size={12} color="#58C95F" />
                  <Text style={[s.badgeText, { color: '#58C95F' }]}>ACTIVE</Text>
                </View>
              ) : mqttConfig ? (
                <View style={[s.badge, s.badgeRed, { marginLeft: 'auto' }]}>
                  <MaterialCommunityIcons name="lightning-bolt-outline" size={12} color="#FF4533" />
                  <Text style={[s.badgeText, { color: '#FF4533' }]}>
                    {isOnlineMode ? 'Connecting…' : 'Configured'}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={[s.modeInfoBox, { borderColor: '#F59E0B44' }]}>
              <MaterialCommunityIcons name="information-outline" size={14} color="#F59E0B" />
              <Text style={s.modeInfoText}>
                In Online mode, motor commands go via MQTT (~40 ms) instead of Supabase polling (~500 ms). ESP32-Motors subscribes directly — no ESP32-Sensors involved.
              </Text>
            </View>

            <Text style={s.fieldLabel}>Broker Host</Text>
            <TextInput
              style={s.input}
              value={mqttHost}
              onChangeText={setMqttHost}
              placeholder="broker.hivemq.com"
              placeholderTextColor="#555"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            <Text style={[s.fieldLabel, { marginTop: 12 }]}>Topic Prefix</Text>
            <TextInput
              style={s.input}
              value={mqttPrefix}
              onChangeText={setMqttPrefix}
              placeholder="agribot"
              placeholderTextColor="#555"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={[s.hintText, { marginTop: 4 }]}>Commands go to: <Text style={{ color: '#F59E0B' }}>{mqttPrefix || 'agribot'}/motors/cmd</Text></Text>

            <Text style={[s.fieldLabel, { marginTop: 12 }]}>Username (optional)</Text>
            <TextInput
              style={s.input}
              value={mqttUser}
              onChangeText={setMqttUser}
              placeholder="leave empty for public broker"
              placeholderTextColor="#555"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[s.fieldLabel, { marginTop: 12 }]}>Password (optional)</Text>
            <View style={s.inputRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={mqttPass}
                onChangeText={setMqttPass}
                placeholder="leave empty for public broker"
                placeholderTextColor="#555"
                secureTextEntry={!showMqttPass}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={s.eyeBtn} onPress={() => setShowMqttPass(v => !v)}>
                <MaterialCommunityIcons name={showMqttPass ? 'eye-off-outline' : 'eye-outline'} size={18} color="#666" />
              </TouchableOpacity>
            </View>

            {/* TLS toggle */}
            <TouchableOpacity
              style={[s.inputRow, { marginTop: 14, gap: 10 }]}
              onPress={() => setMqttTls(v => !v)}
            >
              <View style={[s.badge, mqttTls ? s.badgeGreen : s.badgeRed]}>
                <MaterialCommunityIcons name={mqttTls ? 'lock' : 'lock-open'} size={12} color={mqttTls ? '#58C95F' : '#FF4533'} />
                <Text style={[s.badgeText, { color: mqttTls ? '#58C95F' : '#FF4533' }]}>{mqttTls ? 'TLS ON' : 'TLS OFF'}</Text>
              </View>
              <Text style={[s.label, { flex: 0 }]}>
                {mqttTls ? 'App: WSS:8884 · ESP32: TCP:8883' : 'App: WS:8000 · ESP32: TCP:1883'}
              </Text>
            </TouchableOpacity>

            <View style={[s.inputRow, { marginTop: 14, gap: 10 }]}>
              {/* Save to app */}
              <TouchableOpacity
                style={[s.btnSmall, { flex: 1, borderColor: '#F59E0B' }, !mqttHost.trim() && s.btnDisabled]}
                onPress={handleSaveMqtt}
                disabled={!mqttHost.trim()}
              >
                <MaterialCommunityIcons name="content-save-outline" size={15} color="#F59E0B" />
                <Text style={[s.btnSmallText, { color: '#F59E0B' }]}>Save to App</Text>
              </TouchableOpacity>

              {/* Send to motors */}
              <Pressable
                style={[s.btn, { flex: 2, marginTop: 0, backgroundColor: '#B45309' }, (sendingMqttMotors || !mqttHost.trim()) && s.btnDisabled]}
                onPress={() => void handleSendMqttToMotors()}
                disabled={sendingMqttMotors || !mqttHost.trim()}
              >
                {sendingMqttMotors
                  ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
                  : <MaterialCommunityIcons name="upload" size={15} color="#fff" style={{ marginRight: 6 }} />}
                <Text style={[s.btnText, { fontSize: 13 }]}>
                  {sendingMqttMotors ? 'Sending…' : 'Send to Motors'}
                </Text>
              </Pressable>
            </View>

            <View style={s.hintBox}>
              <MaterialCommunityIcons name="lightbulb-outline" size={13} color="#F59E0B" />
              <Text style={[s.hintText, { color: '#92700A' }]}>
                Free broker: <Text style={{ color: '#F59E0B' }}>broker.hivemq.com</Text> — no signup needed. For private use, create a free cluster at hivemq.com/mqtt-cloud.
              </Text>
            </View>
          </View>

          {/* ══════════════════════════════════════════
              Online / Offline Mode
          ══════════════════════════════════════════ */}
          <View style={s.card}>
            <View style={s.cardTitleRow}>
              <MaterialCommunityIcons name="cloud-sync" size={16} color={isOnline ? '#4A9AFF' : '#888'} />
              <Text style={s.cardTitle}>Data Mode</Text>
              {/* Mode toggle */}
              <View style={s.modeToggleRow}>
                <TouchableOpacity
                  style={[s.modeBtn, mode === 'offline' && s.modeBtnActive]}
                  onPress={() => setMode('offline')}
                >
                  <MaterialCommunityIcons name="wifi" size={13} color={mode === 'offline' ? '#070A0A' : '#888'} />
                  <Text style={[s.modeBtnText, mode === 'offline' && { color: '#070A0A' }]}>Offline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.modeBtn, mode === 'online' && s.modeBtnActiveBlue]}
                  onPress={() => setMode('online')}
                >
                  <MaterialCommunityIcons name="cloud" size={13} color={mode === 'online' ? '#fff' : '#888'} />
                  <Text style={[s.modeBtnText, mode === 'online' && { color: '#fff' }]}>Online</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Mode description */}
            <View style={[s.modeInfoBox, { borderColor: mode === 'online' ? '#4A9AFF44' : '#58C95F44' }]}>
              <MaterialCommunityIcons
                name={mode === 'online' ? 'cloud-check' : 'wifi-check'}
                size={14}
                color={mode === 'online' ? '#4A9AFF' : '#58C95F'}
              />
              <Text style={s.modeInfoText}>
                {mode === 'online'
                  ? 'App fetches data from cloud server — works on mobile data, any location.'
                  : IS_WEB
                    ? '⚠️ Offline mode requires the mobile app. Browsers block direct HTTP connections to the ESP32. Use Online mode on web.'
                    : 'App talks directly to the ESP32 — fast, no internet needed, local network only.'}
              </Text>
            </View>

            {/* Cloud status (online mode only) */}
            {mode === 'online' && (
              <View style={s.infoRow}>
                <Text style={s.label}>Cloud</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[s.badge, isOnline ? s.badgeGreen : s.badgeRed]}>
                    <MaterialCommunityIcons
                      name={isOnline ? 'cloud-check' : 'close-circle'}
                      size={12}
                      color={isOnline ? '#58C95F' : '#FF4533'}
                    />
                    <Text style={[s.badgeText, { color: isOnline ? '#58C95F' : '#FF4533' }]}>
                      {isOnline ? 'ACTIVE' : 'Not set'}
                    </Text>
                  </View>
                  {cloudConfig?.serverUrl && (
                    <TouchableOpacity onPress={handleClearCloud}>
                      <MaterialCommunityIcons name="trash-can-outline" size={14} color="#FF4533" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* MQTT live status (online mode only) */}
            {mode === 'online' && (
              <View style={s.infoRow}>
                <Text style={s.label}>MQTT</Text>
                <View style={[s.badge, mqttConnected ? s.badgeGreen : s.badgeRed]}>
                  <MaterialCommunityIcons
                    name={mqttConnected ? 'lightning-bolt' : 'lightning-bolt-outline'}
                    size={12}
                    color={mqttConnected ? '#58C95F' : '#FF4533'}
                  />
                  <Text style={[s.badgeText, { color: mqttConnected ? '#58C95F' : '#FF4533' }]}>
                    {mqttConnected ? 'ACTIVE' : mqttConfig ? 'Connecting…' : 'Not set'}
                  </Text>
                </View>
              </View>
            )}

            {/* ── Cloud config form ── */}
            <Text style={s.fieldLabel}>
              {mode === 'online' ? 'Cloud Server URL (Supabase or custom)' : 'Cloud Server URL (configure for future use)'}
            </Text>
            <TextInput
              style={s.input}
              value={cloudUrl}
              onChangeText={setCloudUrl}
              placeholder="https://xxxx.supabase.co"
              placeholderTextColor="#555"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            <Text style={[s.fieldLabel, { marginTop: 12 }]}>API Key / Anon Key</Text>
            <View style={s.inputRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={cloudKey}
                onChangeText={setCloudKey}
                placeholder="eyJhbGci… (Supabase anon key)"
                placeholderTextColor="#555"
                secureTextEntry={!showCloudKey}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={s.eyeBtn} onPress={() => setShowCloudKey(v => !v)}>
                <MaterialCommunityIcons
                  name={showCloudKey ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color="#666"
                />
              </TouchableOpacity>
            </View>

            {/* Supabase quick-setup hint */}
            <View style={s.hintBox}>
              <MaterialCommunityIcons name="information-outline" size={13} color="#4A9AFF" />
              <Text style={s.hintText}>
                Free backend: supabase.com → New project → Settings → API → copy Project URL & anon key. Run the SQL schema from the code comment in use-cloud-data.ts.
              </Text>
            </View>

            {/* Action buttons */}
            <View style={[s.inputRow, { marginTop: 14, gap: 10 }]}>
              <TouchableOpacity
                style={[s.btnSmall, { flex: 1 }, !cloudUrl.trim() && s.btnDisabled]}
                onPress={() => void handleSaveCloud()}
                disabled={!cloudUrl.trim() || savingCloud}
              >
                <MaterialCommunityIcons name="content-save-outline" size={15} color="#4A9AFF" />
                <Text style={[s.btnSmallText, { color: '#4A9AFF' }]}>
                  {mode === 'online' ? 'Save & Activate' : 'Save'}
                </Text>
              </TouchableOpacity>

              <Pressable
                style={[s.btn, { flex: 2, marginTop: 0, backgroundColor: '#4A9AFF' }, (sendingCloud || !cloudUrl.trim()) && s.btnDisabled]}
                onPress={() => void handleSendCloudToESP()}
                disabled={sendingCloud || !cloudUrl.trim()}
              >
                {sendingCloud
                  ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
                  : <MaterialCommunityIcons name="upload" size={15} color="#fff" style={{ marginRight: 6 }} />}
                <Text style={[s.btnText, { fontSize: 13 }]}>
                  {sendingCloud ? 'Sending…' : 'Send to ESP32'}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* ── Connection Guide ── */}
          <View style={s.card}>
            <View style={s.cardTitleRow}>
              <MaterialCommunityIcons name="format-list-numbered" size={16} color="#7DFB8C" />
              <Text style={s.cardTitle}>Connection Guide</Text>
            </View>

            {[
              { n: '1', text: 'Power on the AGRIBOT-ESP device.' },
              { n: '2', text: 'Connect your phone to the "AGRIBOT-ESP" WiFi (password: agribot123).' },
              { n: '3', text: 'Tap "Ping ESP32" to confirm. You\'ll see sensors and GPS live.' },
              { n: '4', text: 'Pick a saved router or add one below, then tap "Send to ESP32".' },
              { n: '5', text: 'Switch your phone to your home router WiFi. The app auto-detects and switches to the ESP32 router IP — sensor data and GPS keep streaming. ✓' },
              { n: '6', text: 'Both the robot marker and your phone appear on the Map tab. Data works on any device on the same router.' },
            ].map(step => (
              <View key={step.n} style={s.stepRow}>
                <View style={s.stepNum}>
                  <Text style={s.stepNumText}>{step.n}</Text>
                </View>
                <Text style={s.stepText}>{step.text}</Text>
              </View>
            ))}
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Small badge ───────────────────────────────────────────────────────────────

function StatusBadge({ value, connected, label }: { value: string | null; connected: boolean; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={s.value}>{value ?? '—'}</Text>
      <View style={[s.badge, connected ? s.badgeGreen : s.badgeRed]}>
        <MaterialCommunityIcons
          name={connected ? 'check-circle' : 'close-circle'}
          size={12}
          color={connected ? '#58C95F' : '#FF4533'}
        />
        <Text style={[s.badgeText, { color: connected ? '#58C95F' : '#FF4533' }]}>
          {connected ? 'OK' : 'Offline'}
        </Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#070A0A' },
  container: { flex: 1, padding: 16 },
  header:    { marginBottom: 20 },
  title:     { fontSize: 28, fontWeight: '800', color: '#F3F7F6', marginBottom: 4 },
  subtitle:  { fontSize: 14, color: '#7A8582' },

  card: {
    backgroundColor: '#111617',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e2526',
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardTitle:    { fontSize: 15, fontWeight: '700', color: '#F3F7F6' },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  label:   { fontSize: 13, color: '#7A8582', flex: 1 },
  value:   { fontSize: 13, color: '#4A9AFF', fontWeight: '600', textAlign: 'right' },

  badge:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeGreen: { backgroundColor: '#58C95F22' },
  badgeRed:   { backgroundColor: '#FF453322' },
  badgeText:  { fontSize: 11, fontWeight: '600' },

  hintBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#4A9AFF11', borderRadius: 8, padding: 10, marginTop: 6, borderWidth: 1, borderColor: '#4A9AFF22' },
  hintText: { color: '#6A8FAF', fontSize: 11, lineHeight: 16, flex: 1 },

  errorBox:  { backgroundColor: '#FF453322', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#FF4533', marginBottom: 8 },
  errorText: { color: '#FF4533', fontSize: 12 },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#7A8582', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8, marginTop: 10 },
  input: {
    backgroundColor: '#0C0E0F',
    color: '#F4F7F8',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#232829',
    fontSize: 14,
  },
  inputRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  applyBtn:     { backgroundColor: '#4A9AFF22', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: '#4A9AFF44' },
  applyBtnText: { color: '#4A9AFF', fontWeight: '700', fontSize: 13 },
  eyeBtn:       { padding: 11 },

  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A9AFF',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 14,
  },
  btnOrange:  { backgroundColor: '#F4A460' },
  btnDisabled:{ opacity: 0.45 },
  btnText:    { color: '#fff', fontSize: 14, fontWeight: '700' },

  btnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#F4A460',
    backgroundColor: 'transparent',
  },
  btnSmallText: { fontSize: 13, fontWeight: '700' },

  dualModeBox:   { backgroundColor: '#0C0E0F', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#1e2526' },
  dualModeTitle: { color: '#F3F7F6', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  dualModeBody:  { color: '#7A8582', fontSize: 12, lineHeight: 20 },

  // Saved networks list
  savedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  savedTitle:  { color: '#A7B2B5', fontSize: 13, fontWeight: '700' },
  addNewBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: '#F4A46015', borderWidth: 1, borderColor: '#F4A46044' },
  addNewBtnText:{ color: '#F4A460', fontSize: 12, fontWeight: '700' },

  emptyHistory:     { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyHistoryText: { color: '#444', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  networkList: { gap: 8, marginBottom: 4 },
  networkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0C0E0F',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#1e2526',
  },
  networkRowActive: {
    backgroundColor: '#58C95F22',
    borderColor: '#58C95F55',
  },
  networkIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F4A46022',
    alignItems: 'center',
    justifyContent: 'center',
  },
  networkIconActive: { backgroundColor: '#58C95F' },
  networkSSID: { color: '#F3F7F6', fontSize: 14, fontWeight: '700' },
  networkMeta: { color: '#555', fontSize: 11, marginTop: 2 },
  useChip: { backgroundColor: '#F4A46022', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#F4A46055' },
  useChipText: { color: '#F4A460', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  deleteBtn: { padding: 4, marginLeft: 2 },

  // Collapsible add form
  addFormWrap:    { marginTop: 4 },
  addFormDivider: { height: 1, backgroundColor: '#1e2526', marginVertical: 16 },
  collapseBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12, paddingVertical: 8 },
  collapseBtnText:{ color: '#555', fontSize: 12 },

  stepRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  stepNum:     { width: 22, height: 22, borderRadius: 11, backgroundColor: '#58C95F22', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { color: '#58C95F', fontSize: 11, fontWeight: '800' },
  stepText:    { color: '#B6C4C8', fontSize: 13, lineHeight: 20, flex: 1 },

  // Online/Offline mode toggle
  modeToggleRow: { flexDirection: 'row', gap: 6, marginLeft: 'auto' },
  modeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
  },
  modeBtnActive:     { backgroundColor: '#58C95F', borderColor: '#58C95F' },
  modeBtnActiveBlue: { backgroundColor: '#4A9AFF', borderColor: '#4A9AFF' },
  modeBtnText: { color: '#888', fontSize: 11, fontWeight: '700' },
  modeInfoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#0C0E0F', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1 },
  modeInfoText: { color: '#7A8582', fontSize: 12, lineHeight: 18, flex: 1 },

  // STA IP activation banner
  staBanner: {
    backgroundColor: '#58C95F11',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#58C95F44',
    padding: 12,
    marginTop: 10,
    gap: 8,
  },
  staBannerText: { color: '#A7D8B0', fontSize: 12, lineHeight: 18 },
  staBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#58C95F',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  staBtnText: { color: '#070A0A', fontSize: 13, fontWeight: '800' },

  // Router-connected success banner
  routerBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#58C95F18',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#58C95F55',
    padding: 14,
    marginBottom: 14,
  },
  routerBannerTitle: { color: '#72F88A', fontSize: 14, fontWeight: '800', marginBottom: 4 },
  routerBannerBody:  { color: '#A7D8B0', fontSize: 12, lineHeight: 18 },

  // BT command display box
  btCmdBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0C0E0F',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A78BFA44',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  btCmdText: {
    color: '#A78BFA',
    fontSize: 12,
    fontFamily: 'monospace',
    flex: 1,
  },

  // Reset-to-AP button
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F4A46044',
    backgroundColor: '#F4A46011',
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  resetBtnText: { color: '#F4A460', fontSize: 12, fontWeight: '700' },
});
