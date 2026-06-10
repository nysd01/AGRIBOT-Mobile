import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useESP32Sensors } from '@/hooks/use-esp32-sensors';

type Severity = 'good' | 'watch' | 'bad';

type Insight = {
  id: string;
  title: string;
  value: string;
  severity: Severity;
  reason: string;
  action: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
};

function severityColor(severity: Severity): string {
  if (severity === 'good') return '#58C95F';
  if (severity === 'watch') return '#F4A460';
  return '#FF6B6B';
}

function soilStatusFromScore(score: number): {
  label: string;
  summary: string;
  color: string;
} {
  if (score >= 80) {
    return {
      label: 'Soil Status: GOOD',
      summary: 'Conditions are stable. Keep current care routine and continue monitoring.',
      color: '#58C95F',
    };
  }

  if (score >= 60) {
    return {
      label: 'Soil Status: FAIR',
      summary: 'Soil is workable, but a few parameters need adjustment to avoid stress.',
      color: '#F4A460',
    };
  }

  return {
    label: 'Soil Status: POOR',
    summary: 'Immediate corrective action is recommended to protect crop health.',
    color: '#FF6B6B',
  };
}

export default function IntelligenceScreen() {
  const { sensorData, loading, error, isConnected } = useESP32Sensors({
    esp32Ip: '192.168.4.1',
    pollInterval: 2000,
    autoStart: true,
  });

  const analysis = useMemo(() => {
    const moisture = sensorData?.domino4?.soil?.moisturePct ?? sensorData?.soilMoisturePct ?? 0;
    const temperature = sensorData?.domino4?.weather?.temperatureC ?? sensorData?.temperatureC ?? 0;
    const humidity = sensorData?.domino4?.weather?.humidityPct ?? sensorData?.humidityPct ?? 0;
    const ph = sensorData?.adc?.ph ?? sensorData?.ph ?? 0;
    const uv = sensorData?.domino4?.light?.uvIndex ?? 0;
    const battery = sensorData?.adc?.batteryPct ?? sensorData?.batteryPct ?? 0;

    const insights: Insight[] = [];
    let score = 100;

    if (moisture < 30) {
      insights.push({
        id: 'moisture-low',
        title: 'Soil Moisture',
        value: `${moisture.toFixed(0)}%`,
        severity: 'bad',
        reason: 'Soil is too dry for stable nutrient uptake.',
        action: 'Run irrigation in short cycles and re-check after 20-30 minutes.',
        icon: 'water-alert',
      });
      score -= 25;
    } else if (moisture > 75) {
      insights.push({
        id: 'moisture-high',
        title: 'Soil Moisture',
        value: `${moisture.toFixed(0)}%`,
        severity: 'bad',
        reason: 'Soil is waterlogged, raising root-rot risk.',
        action: 'Pause irrigation and improve drainage or aeration in this zone.',
        icon: 'waves-arrow-up',
      });
      score -= 25;
    } else {
      insights.push({
        id: 'moisture-good',
        title: 'Soil Moisture',
        value: `${moisture.toFixed(0)}%`,
        severity: 'good',
        reason: 'Moisture is in the target band for most crops.',
        action: 'Maintain current watering schedule.',
        icon: 'water-check',
      });
    }

    if (ph > 0 && ph < 5.8) {
      insights.push({
        id: 'ph-acidic',
        title: 'Soil pH',
        value: ph.toFixed(1),
        severity: 'bad',
        reason: 'Soil is too acidic, which can lock key nutrients.',
        action: 'Apply agricultural lime in controlled doses and re-test pH.',
        icon: 'flask-empty-minus',
      });
      score -= 20;
    } else if (ph > 7.5) {
      insights.push({
        id: 'ph-alkaline',
        title: 'Soil pH',
        value: ph.toFixed(1),
        severity: 'watch',
        reason: 'Soil is trending alkaline and may reduce micronutrient availability.',
        action: 'Use acidifying amendments (such as sulfur) and monitor weekly.',
        icon: 'flask-empty-off',
      });
      score -= 10;
    } else if (ph > 0) {
      insights.push({
        id: 'ph-good',
        title: 'Soil pH',
        value: ph.toFixed(1),
        severity: 'good',
        reason: 'pH is in a healthy growth range.',
        action: 'No immediate correction needed.',
        icon: 'flask-empty-check',
      });
    }

    if (temperature > 35) {
      insights.push({
        id: 'temp-high',
        title: 'Soil Temperature Risk',
        value: `${temperature.toFixed(1)}°C`,
        severity: 'bad',
        reason: 'High heat can stress roots and increase evaporation.',
        action: 'Mulch exposed soil and irrigate during cooler hours.',
        icon: 'thermometer-high',
      });
      score -= 15;
    } else if (temperature < 15 && temperature > 0) {
      insights.push({
        id: 'temp-low',
        title: 'Soil Temperature Risk',
        value: `${temperature.toFixed(1)}°C`,
        severity: 'watch',
        reason: 'Cool conditions can slow root activity and nutrient uptake.',
        action: 'Delay heavy feeding and consider row covers if crops are sensitive.',
        icon: 'thermometer-low',
      });
      score -= 8;
    }

    if (humidity > 85) {
      insights.push({
        id: 'humidity-high',
        title: 'Ambient Humidity',
        value: `${humidity.toFixed(0)}%`,
        severity: 'watch',
        reason: 'Very high humidity can increase disease pressure.',
        action: 'Increase airflow and avoid overwatering late in the day.',
        icon: 'cloud-alert',
      });
      score -= 8;
    } else if (humidity > 0 && humidity < 35) {
      insights.push({
        id: 'humidity-low',
        title: 'Ambient Humidity',
        value: `${humidity.toFixed(0)}%`,
        severity: 'watch',
        reason: 'Dry air can increase transpiration stress.',
        action: 'Use lighter, more frequent watering and monitor leaf stress.',
        icon: 'weather-windy',
      });
      score -= 8;
    }

    if (uv >= 8) {
      insights.push({
        id: 'uv-high',
        title: 'UV Exposure',
        value: uv.toFixed(1),
        severity: 'watch',
        reason: 'Very high UV can stress young plants and surface biology.',
        action: 'Use temporary shade for sensitive crops during peak hours.',
        icon: 'white-balance-sunny',
      });
      score -= 6;
    }

    if (battery > 0 && battery < 20) {
      insights.push({
        id: 'battery-low',
        title: 'Robot Battery',
        value: `${battery.toFixed(0)}%`,
        severity: 'watch',
        reason: 'Low battery may interrupt irrigation or monitoring cycles.',
        action: 'Recharge soon to keep sensor and care routines consistent.',
        icon: 'battery-alert-variant-outline',
      });
      score -= 8;
    }

    score = Math.max(0, Math.min(100, score));

    const urgentActions = insights
      .filter(item => item.severity !== 'good')
      .slice(0, 3)
      .map(item => `• ${item.action}`);

    return {
      score,
      insights,
      urgentActions,
      moisture,
      temperature,
      ph,
    };
  }, [sensorData]);

  const status = soilStatusFromScore(analysis.score);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.kicker}>AGRONOMY INTELLIGENCE</Text>
          <Text style={styles.title}>Soil Analysis</Text>
          <View style={styles.titleUnderline} />
        </View>

        {!isConnected && (
          <View style={styles.offlineBanner}>
            <MaterialCommunityIcons name="access-point-off" size={18} color="#FF6B6B" />
            <Text style={styles.offlineText}>
              {error || 'ESP32 is offline. Connect via Network tab to enable live analysis.'}
            </Text>
          </View>
        )}

        {loading && !sensorData && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#4A9AFF" />
            <Text style={styles.loadingText}>Collecting sensor data for analysis...</Text>
          </View>
        )}

        {!!sensorData && (
          <>
            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>SOIL HEALTH SCORE</Text>
              <Text style={styles.scoreValue}>{analysis.score}/100</Text>
              <View style={[styles.statusPill, { backgroundColor: `${status.color}22` }]}>
                <Text style={[styles.statusPillText, { color: status.color }]}>{status.label}</Text>
              </View>
              <Text style={styles.statusSummary}>{status.summary}</Text>
            </View>

            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>MOISTURE</Text>
                <Text style={styles.metricValue}>{analysis.moisture.toFixed(0)}%</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>PH</Text>
                <Text style={styles.metricValue}>{analysis.ph > 0 ? analysis.ph.toFixed(1) : '--'}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>TEMP</Text>
                <Text style={styles.metricValue}>{analysis.temperature.toFixed(1)}°C</Text>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Recommended Actions</Text>
              {analysis.urgentActions.length > 0 ? (
                analysis.urgentActions.map(action => (
                  <Text key={action} style={styles.actionText}>
                    {action}
                  </Text>
                ))
              ) : (
                <Text style={styles.goodText}>
                  • No urgent action needed. Continue normal soil-care routine.
                </Text>
              )}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Detailed Insights</Text>
              {analysis.insights.map(item => {
                const color = severityColor(item.severity);
                return (
                  <View key={item.id} style={styles.insightRow}>
                    <View style={[styles.iconWrap, { backgroundColor: `${color}22` }]}>
                      <MaterialCommunityIcons name={item.icon} size={18} color={color} />
                    </View>
                    <View style={styles.insightContent}>
                      <View style={styles.insightTopRow}>
                        <Text style={styles.insightTitle}>{item.title}</Text>
                        <Text style={[styles.badge, { color }]}>{item.value}</Text>
                      </View>
                      <Text style={styles.insightReason}>{item.reason}</Text>
                      <Text style={styles.insightAction}>Action: {item.action}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  header: {
    marginBottom: 22,
  },
  kicker: {
    color: '#7A8582',
    fontSize: 11,
    letterSpacing: 0.9,
    fontWeight: '600',
    marginBottom: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '700',
    marginBottom: 12,
  },
  titleUnderline: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4A9AFF',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF6B6B',
    backgroundColor: '#FF6B6B22',
    padding: 12,
    marginBottom: 14,
    gap: 10,
  },
  offlineText: {
    color: '#FFADAD',
    fontSize: 13,
    flex: 1,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
  },
  loadingText: {
    marginTop: 12,
    color: '#AAB5B4',
    fontSize: 14,
  },
  scoreCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2A3130',
    backgroundColor: '#151718',
    padding: 16,
    marginBottom: 14,
  },
  scoreLabel: {
    color: '#7A8582',
    fontSize: 11,
    letterSpacing: 0.7,
    fontWeight: '600',
  },
  scoreValue: {
    color: '#F2F7F5',
    fontSize: 40,
    fontWeight: '700',
    marginTop: 6,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 6,
  },
  statusPillText: {
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.7,
  },
  statusSummary: {
    color: '#C4D0CC',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#121415',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#252A29',
    padding: 12,
  },
  metricLabel: {
    color: '#7A8582',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  metricValue: {
    color: '#F1F6F5',
    fontSize: 20,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: '#151718',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#252A29',
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#F1F6F5',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  actionText: {
    color: '#DCE6E2',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 6,
  },
  goodText: {
    color: '#93F0A0',
    fontSize: 13,
    lineHeight: 20,
  },
  insightRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  insightContent: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#232727',
    paddingBottom: 10,
  },
  insightTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  insightTitle: {
    color: '#F0F4F3',
    fontSize: 14,
    fontWeight: '700',
  },
  badge: {
    fontSize: 12,
    fontWeight: '700',
  },
  insightReason: {
    color: '#B5C0BD',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  insightAction: {
    color: '#DCE5E2',
    fontSize: 12,
    lineHeight: 18,
  },
});
