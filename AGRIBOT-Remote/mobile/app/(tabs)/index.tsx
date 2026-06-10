import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  ImageBackground,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { styles } from '@/styles/dashboard.styles';

type Mode = 'manual' | 'auto';

export default function DashboardScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('auto');
  const { width } = useWindowDimensions();
  const compact = width < 390;

  const robot = useMemo(
    () => ({
      node: 'AG-01-DELTA',
      sector: 'Sector 7A',
      location: 'Northern Terrace',
      battery: 85,
      uptime: '14h 22m',
      signal: 'Excellent',
      temp: 24,
      humidity: 55,
      soil: 40,
      yieldKg: 1240,
      pathEfficiency: 98.2,
      alerts: 0,
      day: 14,
    }),
    []
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={[styles.container, compact && styles.containerCompact]}>
        <View style={styles.topRow}>
          <View style={styles.brandRow}>
            <MaterialCommunityIcons name="sprout" size={18} color="#70F57D" />
            <Text style={styles.brandText}>Agribot</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <MaterialCommunityIcons name="battery-high" size={18} color="#85F29A" />
            <Pressable
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: '#151718',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onPress={() => router.push('/modal-settings')}
            >
              <MaterialCommunityIcons name="cog" size={18} color="#58C95F" />
            </Pressable>
          </View>
        </View>

        <Text style={styles.systemOnline}>SYSTEM ONLINE</Text>
        <Text style={[styles.title, compact && styles.titleCompact]}>Welcome to Agribot</Text>

        <View style={styles.nodePill}>
          <View style={styles.dot} />
          <Text style={styles.nodePillText}>Node: {robot.node}</Text>
        </View>

        <View style={styles.heroCard}>
          <ImageBackground
            source={{
              uri: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?q=80&w=1200&auto=format&fit=crop',
            }}
            imageStyle={styles.heroImage}
            style={styles.heroImageWrap}>
            <View style={styles.heroShade} />
            <View style={styles.heroContent}>
              <View>
                <Text style={styles.heroSector}>{robot.sector}</Text>
                <Text style={styles.heroLocation}>{robot.location}</Text>
                <Text style={styles.heroBody}>
                  Currently analyzing soil nitrogen levels and moisture density across the quadrant.
                </Text>
              </View>
              <Pressable
                style={styles.liveFeedButton}
                onPress={() => Alert.alert('Live Feed', 'Connecting to robot camera...')}>
                <MaterialCommunityIcons name="video-wireless" size={16} color="#EAF7EE" />
                <Text style={styles.liveFeedText}>Live Feed</Text>
              </Pressable>
            </View>
          </ImageBackground>
        </View>

        <Pressable style={styles.manualButton} onPress={() => setMode('manual')}>
          <View>
            <Text style={styles.buttonLabel}>MANUAL OVERRIDE</Text>
            <Text style={styles.buttonTitle}>Start Manual Control</Text>
          </View>
          <MaterialCommunityIcons name="controller-classic-outline" size={26} color="#2A7F39" />
        </Pressable>

        <Pressable style={styles.autoButton} onPress={() => setMode('auto')}>
          <View>
            <Text style={[styles.buttonLabel, styles.buttonLabelAuto]}>AI PROTOCOL</Text>
            <Text style={styles.buttonTitleDark}>Start Autonomous Mode</Text>
          </View>
          <MaterialCommunityIcons name="crosshairs-gps" size={26} color="#59D96D" />
        </Pressable>

        <View style={styles.panel}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>Robot Status</Text>
            <View style={styles.onlineBadge}>
              <Text style={styles.onlineText}>{mode === 'auto' ? 'ONLINE' : 'MANUAL'}</Text>
            </View>
          </View>

          <View style={styles.statusRow}>
            <View>
              <Text style={styles.metaLabel}>Battery Level</Text>
              <Text style={styles.batteryText}>{robot.battery}%</Text>
            </View>
            <View style={styles.batteryIconWrap}>
              <MaterialCommunityIcons name="lightning-bolt" size={22} color="#6EEB7D" />
            </View>
          </View>

          <View style={styles.metaRow}>
            <View>
              <Text style={styles.metaLabel}>UPTIME</Text>
              <Text style={styles.metaValue}>{robot.uptime}</Text>
            </View>
            <View>
              <Text style={styles.metaLabel}>SIGNAL</Text>
              <Text style={[styles.metaValue, styles.signalValue]}>{robot.signal}</Text>
            </View>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Telemetry Summary</Text>
          <View style={styles.telemetryItem}>
            <View style={styles.telemetryLeft}>
              <MaterialCommunityIcons name="thermometer" size={16} color="#9CC7FF" />
              <Text style={styles.telemetryLabel}>Temperature</Text>
            </View>
            <Text style={styles.telemetryValue}>{robot.temp}°C</Text>
          </View>
          <View style={styles.telemetryItem}>
            <View style={styles.telemetryLeft}>
              <MaterialCommunityIcons name="water-outline" size={16} color="#8FC4FF" />
              <Text style={styles.telemetryLabel}>Humidity</Text>
            </View>
            <Text style={styles.telemetryValue}>{robot.humidity}%</Text>
          </View>
          <View style={styles.telemetryItem}>
            <View style={styles.telemetryLeft}>
              <MaterialCommunityIcons name="leaf" size={16} color="#8BF5A0" />
              <Text style={styles.telemetryLabel}>Soil Moisture</Text>
            </View>
            <Text style={styles.telemetryValue}>{robot.soil}%</Text>
          </View>
        </View>

        <View style={styles.kpiCard}>
          <MaterialCommunityIcons name="sprout" size={18} color="#76FF85" />
          <Text style={styles.kpiLabel}>Total Yield Est.</Text>
          <Text style={styles.kpiValue}>{robot.yieldKg.toLocaleString()} kg</Text>
        </View>

        <View style={styles.kpiCard}>
          <MaterialCommunityIcons name="road-variant" size={18} color="#8BC3FF" />
          <Text style={styles.kpiLabel}>Path Efficiency</Text>
          <Text style={styles.kpiValue}>{robot.pathEfficiency}%</Text>
        </View>

        <View style={styles.kpiCard}>
          <MaterialCommunityIcons name="alert" size={18} color="#FFC2D3" />
          <Text style={styles.kpiLabel}>Alerts</Text>
          <Text style={styles.kpiValue}>{robot.alerts} Pending</Text>
        </View>

        <View style={styles.kpiCard}>
          <MaterialCommunityIcons name="calendar-month-outline" size={18} color="#87F792" />
          <Text style={styles.kpiLabel}>Harvest Cycle</Text>
          <Text style={styles.kpiValue}>Day {robot.day}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
