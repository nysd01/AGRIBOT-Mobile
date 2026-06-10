/**
 * AGRIBOT Analytics — Professional sensor dashboard
 * Time-ranged charts · Live stats · CSV export
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAppMode } from '@/context/AppModeContext';
import {
  useCloudHistory,
  fetchAllForExport,
  computeStats,
  rowsToCSV,
  type TimeRange,
  type MetricKey,
  type HistoryRow,
} from '@/hooks/use-cloud-history';

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  bg:        '#06090A',
  card:      '#0E1412',
  raised:    '#141A16',
  border:    'rgba(255,255,255,0.055)',
  borderHl:  'rgba(114,248,138,0.22)',
  green:     '#72F88A',
  greenDim:  'rgba(114,248,138,0.10)',
  greenGlow: 'rgba(114,248,138,0.18)',
  red:       '#FF6B6B',
  teal:      '#4ECDC4',
  amber:     '#FFD93D',
  purple:    '#C084FC',
  text1:     '#EEF4F0',
  text2:     '#7A8C7E',
  text3:     '#344038',
  text4:     '#1E2820',
};

const SCREEN_W   = Dimensions.get('window').width;
const H_PAD      = 20;
const CHART_W    = SCREEN_W - H_PAD * 2;
const MAX_POINTS = 60;
const LABEL_N    = 6;

// ─────────────────────────────────────────────────────────────────────────────
// Metric definitions
// ─────────────────────────────────────────────────────────────────────────────

interface MetricMeta {
  key:    MetricKey;
  label:  string;
  unit:   string;
  color:  string;
  icon:   string;
  dp:     number;
  range:  [number, number]; // reasonable sensor min/max for y-axis hints
}

const METRICS: MetricMeta[] = [
  { key: 'temperature',   label: 'TEMPERATURE', unit: '°C', color: '#FF6B6B', icon: 'thermometer-lines',  dp: 1, range: [0,   50]  },
  { key: 'humidity',      label: 'HUMIDITY',    unit: '%',  color: '#4ECDC4', icon: 'water-percent',      dp: 1, range: [0,   100] },
  { key: 'soil_moisture', label: 'SOIL',        unit: '%',  color: '#72F88A', icon: 'sprout-outline',     dp: 1, range: [0,   100] },
  { key: 'smoke_raw',     label: 'SMOKE',       unit: '',   color: '#FFD93D', icon: 'smoke-detector-variant-outline', dp: 0, range: [0, 4095] },
];

const TIME_RANGES: { key: TimeRange; label: string }[] = [
  { key: '1H',  label: '1H'  },
  { key: '24H', label: '24H' },
  { key: '7D',  label: '7D'  },
  { key: '30D', label: '30D' },
  { key: '1Y',  label: '1Y'  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function formatLabel(iso: string, range: TimeRange): string {
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, '0');
  const mi = d.getMinutes().toString().padStart(2, '0');
  const DAYS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  switch (range) {
    case '1H':  return `${hh}:${mi}`;
    case '24H': return `${hh}:${mi}`;
    case '7D':  return DAYS[d.getDay()] ?? '';
    case '30D': return `${d.getMonth() + 1}/${d.getDate()}`;
    case '1Y':  return MONS[d.getMonth()] ?? '';
  }
}

function formatTimeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)  return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function formatValue(v: number | null | undefined, dp: number, unit: string): string {
  if (v === null || v === undefined) return '–';
  return `${v.toFixed(dp)}${unit}`;
}

function sampleRows(rows: HistoryRow[], max: number): HistoryRow[] {
  if (rows.length <= max) return rows;
  const step = rows.length / max;
  return Array.from({ length: max }, (_, i) => rows[Math.floor(i * step)]);
}

function computeTrend(rows: HistoryRow[], field: MetricKey) {
  if (rows.length < 4) return null;
  const firstHalf = rows.slice(0, Math.floor(rows.length / 2));
  const lastHalf  = rows.slice(Math.floor(rows.length / 2));
  const avg = (arr: HistoryRow[]) => {
    const vals = arr.map(r => r[field] as number | null).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const a = avg(firstHalf), b = avg(lastHalf);
  if (a === null || b === null || a === 0) return null;
  const pct = ((b - a) / Math.abs(a)) * 100;
  return {
    pct:       Math.round(Math.abs(pct) * 10) / 10,
    direction: pct >  1.5 ? 'up' : pct < -1.5 ? 'down' : 'stable',
  };
}

function buildChartData(rows: HistoryRow[], meta: MetricMeta, range: TimeRange) {
  const sampled = sampleRows(rows, MAX_POINTS);
  const N = sampled.length;
  if (N === 0) return null;

  let lastGood = 0;
  const values = sampled.map(r => {
    const v = r[meta.key] as number | null;
    if (v !== null && !isNaN(Number(v))) { lastGood = Number(v); return Number(v); }
    return lastGood;
  });

  const labels = new Array<string>(N).fill('');
  if (N === 1) {
    labels[0] = formatLabel(sampled[0].created_at, range);
  } else {
    const pos = new Set<number>([0, N - 1]);
    const step = Math.floor((N - 1) / (LABEL_N - 1));
    for (let i = 1; i < LABEL_N - 1; i++) pos.add(Math.min(i * step, N - 1));
    for (const idx of pos) labels[idx] = formatLabel(sampled[idx].created_at, range);
  }

  const finalVals   = N === 1 ? [values[0], values[0]] : values;
  const finalLabels = N === 1 ? [labels[0], '']         : labels;

  return {
    labels: finalLabels,
    datasets: [{
      data:        finalVals,
      color:       (op = 1) => hexToRgba(meta.color, op),
      strokeWidth: 2.5,
    }],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Pulsing green live dot */
function LiveDot() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);
  return (
    <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{
        width: 16, height: 16, borderRadius: 8,
        backgroundColor: C.green, opacity: pulse,
      }} />
      <View style={{
        position: 'absolute', width: 8, height: 8,
        borderRadius: 4, backgroundColor: C.green,
      }} />
    </View>
  );
}

/** Animated count-up for stat values */
function AnimatedStat({ value, unit, dp }: { value: number; unit: string; dp: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    Animated.timing(anim, { toValue: value, duration: 600, useNativeDriver: false }).start();
    const id = anim.addListener(({ value: v }) => setDisplay(v));
    return () => anim.removeListener(id);
  }, [value]);

  return (
    <Text style={ss.statVal}>{display.toFixed(dp)}{unit}</Text>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const { isOnline, cloudConfig } = useAppMode();
  const [range,          setRange]          = useState<TimeRange>('24H');
  const [metric,         setMetric]         = useState<MetricKey>('temperature');
  const [downloading,    setDownloading]    = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);

  const { rows, loading, error, refetch } = useCloudHistory(cloudConfig, range, isOnline);

  const meta       = METRICS.find(m => m.key === metric) ?? METRICS[0];
  const chartData  = useMemo(() => buildChartData(rows, meta, range), [rows, meta, range]);
  const stats      = useMemo(() => computeStats(rows, metric), [rows, metric]);
  const trend      = useMemo(() => computeTrend(rows, metric), [rows, metric]);
  const latestRow  = rows.length > 0 ? rows[rows.length - 1] : null;
  const syncLabel  = latestRow ? formatTimeAgo(latestRow.created_at) : null;

  // Fade-in on mount
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  // Download — fetches ALL rows from Supabase (no row cap), then shares CSV
  const handleDownload = useCallback(async () => {
    if (!cloudConfig) { Alert.alert('No config', 'Cloud config is not set.'); return; }
    setDownloading(true);
    setExportProgress(0);
    try {
      // Full paginated fetch — every row in the selected range
      const allRows = await fetchAllForExport(
        cloudConfig,
        range,
        (fetched) => setExportProgress(fetched),
      );

      if (allRows.length === 0) {
        Alert.alert('No data', 'Nothing to export for this range.');
        return;
      }

      const csv  = rowsToCSV(allRows);
      const date = new Date().toISOString().split('T')[0];
      const name = `agribot_${range}_${date}.csv`;

      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        Object.assign(document.createElement('a'), { href: url, download: name }).click();
        URL.revokeObjectURL(url);
      } else {
        const uri = `${FileSystem.documentDirectory}${name}`;
        // Use the string literal 'utf8' — avoids EncodingType.UTF8 undefined crash
        await FileSystem.writeAsStringAsync(uri, csv, { encoding: 'utf8' as any });
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Export AGRIBOT Data' });
      }
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setDownloading(false);
      setExportProgress(null);
    }
  }, [cloudConfig, range]);

  // ── Offline gate ──────────────────────────────────────────────────────────

  if (!isOnline) {
    return (
      <SafeAreaView style={ss.root} edges={['top']}>
        <View style={ss.offlineWrap}>
          <LinearGradient
            colors={['#0E1F12', C.bg]}
            style={ss.offlineGradBg}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
          />
          <View style={ss.offlineCard}>
            <MaterialCommunityIcons name="chart-timeline-variant-shimmer" size={64} color={C.text3} />
            <Text style={ss.offlineH}>Cloud Mode Required</Text>
            <Text style={ss.offlineB}>
              Open the <Text style={{ color: C.green, fontWeight: '700' }}>NETWORK</Text> tab,
              switch to <Text style={{ color: C.green, fontWeight: '700' }}>Online mode</Text>,
              and connect your Supabase project to unlock historical analytics.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Chart config ──────────────────────────────────────────────────────────

  const chartCfg = {
    backgroundGradientFrom:        C.card,
    backgroundGradientTo:          C.card,
    backgroundGradientFromOpacity: 1,
    backgroundGradientToOpacity:   1,
    decimalPlaces:                 meta.dp,
    color:                         (op = 1) => hexToRgba(meta.color, op),
    labelColor:                    () => C.text2,
    strokeWidth:                   2.5,
    propsForDots: {
      r:           rows.length > 40 ? '0' : '3.5',
      strokeWidth: '2',
      stroke:      meta.color,
    },
    propsForBackgroundLines: {
      stroke:          C.text4,
      strokeDasharray: '5,4',
      strokeWidth:     '1',
    },
    propsForLabels: {
      fontSize: 10,
      fontWeight: '600',
    },
    fillShadowGradientFrom:        meta.color,
    fillShadowGradientFromOpacity: 0.28,
    fillShadowGradientTo:          meta.color,
    fillShadowGradientToOpacity:   0,
  };

  // ── Trend display ─────────────────────────────────────────────────────────

  const trendColor  = trend?.direction === 'up' ? C.green : trend?.direction === 'down' ? C.red : C.text2;
  const trendIcon   = trend?.direction === 'up' ? 'trending-up' : trend?.direction === 'down' ? 'trending-down' : 'trending-neutral';
  const trendLabel  = trend?.direction === 'up' ? `+${trend.pct}%` : trend?.direction === 'down' ? `-${trend.pct}%` : 'STABLE';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={ss.root} edges={['top']}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView
          contentContainerStyle={ss.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refetch}
              tintColor={C.green}
              colors={[C.green]}
            />
          }
        >

          {/* ── HEADER ────────────────────────────────────────────────────── */}
          <LinearGradient
            colors={['#0C1F12', '#091410', C.bg]}
            style={ss.headerGrad}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          >
            <View style={ss.headerRow}>
              <View>
                <Text style={ss.headerEyebrow}>AGRIBOT · SUPABASE</Text>
                <Text style={ss.headerTitle}>Analytics</Text>
                {syncLabel && (
                  <View style={ss.syncRow}>
                    <MaterialCommunityIcons name="clock-outline" size={11} color={C.text2} />
                    <Text style={ss.syncText}>Last update {syncLabel}</Text>
                  </View>
                )}
              </View>
              <View style={ss.headerRight}>
                <LiveDot />
                <Text style={ss.liveLabel}>LIVE</Text>
              </View>
            </View>

            {/* Live metric chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={ss.chipRow}
            >
              {METRICS.map(m => {
                const val = latestRow ? latestRow[m.key] as number | null : null;
                const active = m.key === metric;
                return (
                  <Pressable
                    key={m.key}
                    style={({ pressed }) => [
                      ss.chip,
                      active && { borderColor: m.color, backgroundColor: hexToRgba(m.color, 0.12) },
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => setMetric(m.key)}
                  >
                    <MaterialCommunityIcons name={m.icon as any} size={15} color={active ? m.color : C.text2} />
                    <Text style={[ss.chipVal, active && { color: m.color }]}>
                      {val !== null && val !== undefined ? `${val.toFixed(m.dp)}${m.unit}` : '–'}
                    </Text>
                    <Text style={[ss.chipLabel, active && { color: hexToRgba(m.color, 0.75) }]}>
                      {m.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </LinearGradient>

          {/* ── TIME RANGE ────────────────────────────────────────────────── */}
          <View style={ss.section}>
            <Text style={ss.sectionEye}>TIME RANGE</Text>
            <View style={ss.rangeRow}>
              {TIME_RANGES.map(({ key, label }) => (
                <Pressable
                  key={key}
                  style={({ pressed }) => [
                    ss.rangePill,
                    range === key && { backgroundColor: C.green, borderColor: C.green },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => setRange(key)}
                >
                  <Text style={[ss.rangeTxt, range === key && { color: '#060A07' }]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* ── CHART ─────────────────────────────────────────────────────── */}
          <View style={ss.chartCard}>
            {/* Chart header */}
            <View style={ss.chartHead}>
              <View style={ss.chartHeadLeft}>
                <View style={[ss.chartDot, { backgroundColor: meta.color }]} />
                <Text style={[ss.chartMetricName, { color: meta.color }]}>{meta.label}</Text>
                {meta.unit ? <Text style={ss.chartUnit}>{meta.unit}</Text> : null}
              </View>
              <View style={ss.chartHeadRight}>
                {trend && (
                  <View style={[ss.trendBadge, { backgroundColor: hexToRgba(trendColor, 0.12), borderColor: hexToRgba(trendColor, 0.25) }]}>
                    <MaterialCommunityIcons name={trendIcon as any} size={12} color={trendColor} />
                    <Text style={[ss.trendTxt, { color: trendColor }]}>{trendLabel}</Text>
                  </View>
                )}
                {rows.length > 0 && (
                  <Text style={ss.chartPts}>{rows.length} pts</Text>
                )}
              </View>
            </View>

            {/* Current big value */}
            {latestRow && (
              <View style={ss.bigValRow}>
                <Text style={[ss.bigVal, { color: meta.color }]}>
                  {formatValue(latestRow[metric] as number | null, meta.dp, meta.unit)}
                </Text>
                <Text style={ss.bigValLabel}>current</Text>
              </View>
            )}

            {/* Divider */}
            <View style={[ss.chartDivider, { backgroundColor: hexToRgba(meta.color, 0.1) }]} />

            {/* Chart body */}
            {loading && rows.length === 0 ? (
              <View style={ss.chartPlaceholder}>
                <ActivityIndicator size="large" color={C.green} />
                <Text style={ss.phTxt}>Fetching from Supabase…</Text>
              </View>
            ) : error ? (
              <View style={ss.chartPlaceholder}>
                <MaterialCommunityIcons name="alert-circle-outline" size={44} color={C.red} />
                <Text style={[ss.phTxt, { color: C.red }]}>{error}</Text>
              </View>
            ) : !chartData ? (
              <View style={ss.chartPlaceholder}>
                <MaterialCommunityIcons name="chart-timeline-variant" size={54} color={C.text3} />
                <Text style={ss.phTxt}>No data for this range</Text>
                <Text style={ss.phSub}>Ensure the ESP32 is posting to Supabase, or widen the time range.</Text>
              </View>
            ) : (
              <View style={ss.chartWrap}>
                <LineChart
                  data={chartData}
                  width={CHART_W + 32}
                  height={200}
                  chartConfig={chartCfg}
                  bezier
                  withShadow={false}
                  withInnerLines
                  withOuterLines={false}
                  withVerticalLines={false}
                  style={{ marginLeft: -16 }}
                  formatYLabel={v => `${parseFloat(v).toFixed(meta.dp)}`}
                  getDotColor={() => meta.color}
                />
              </View>
            )}
          </View>

          {/* ── STATS ─────────────────────────────────────────────────────── */}
          {stats && (
            <View style={ss.statsSection}>
              <Text style={ss.sectionEye}>STATISTICS · {range}</Text>
              <View style={ss.statsRow}>
                {([
                  { label: 'MINIMUM', val: stats.min, icon: 'arrow-collapse-down' },
                  { label: 'MAXIMUM', val: stats.max, icon: 'arrow-collapse-up'   },
                  { label: 'AVERAGE', val: stats.avg, icon: 'approximately-equal' },
                ] as const).map(c => (
                  <LinearGradient
                    key={c.label}
                    colors={[hexToRgba(meta.color, 0.07), 'transparent']}
                    style={ss.statCard}
                    start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
                  >
                    <View style={[ss.statBar, { backgroundColor: meta.color }]} />
                    <MaterialCommunityIcons name={c.icon as any} size={16} color={hexToRgba(meta.color, 0.7)} />
                    <AnimatedStat value={c.val} unit={meta.unit} dp={meta.dp} />
                    <Text style={ss.statLabel}>{c.label}</Text>
                  </LinearGradient>
                ))}
              </View>

              {/* Samples pill */}
              <View style={ss.samplesPill}>
                <MaterialCommunityIcons name="database-outline" size={13} color={C.text2} />
                <Text style={ss.samplesText}>
                  <Text style={{ color: C.text1, fontWeight: '700' }}>{stats.count}</Text> samples recorded
                  {' '}· {range === '1H' ? 'Last hour' : range === '24H' ? 'Last 24 hours' : range === '7D' ? 'Last 7 days' : range === '30D' ? 'Last 30 days' : 'Last year'}
                </Text>
              </View>
            </View>
          )}

          {/* ── TREND ANALYSIS ────────────────────────────────────────────── */}
          {trend && (
            <View style={ss.trendCard}>
              <LinearGradient
                colors={[
                  hexToRgba(trendColor, 0.08),
                  'transparent',
                ]}
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
              />
              <MaterialCommunityIcons name={trendIcon as any} size={28} color={trendColor} />
              <View style={{ flex: 1 }}>
                <Text style={[ss.trendCardTitle, { color: trendColor }]}>
                  {trend.direction === 'up' ? 'TRENDING UP' : trend.direction === 'down' ? 'TRENDING DOWN' : 'STABLE'}
                </Text>
                <Text style={ss.trendCardSub}>
                  {meta.label} changed <Text style={{ color: trendColor, fontWeight: '700' }}>{trendLabel}</Text> over the selected period
                </Text>
              </View>
              <View style={[ss.trendPctBadge, { backgroundColor: hexToRgba(trendColor, 0.14) }]}>
                <Text style={[ss.trendPctTxt, { color: trendColor }]}>{trendLabel}</Text>
              </View>
            </View>
          )}

          {/* ── EXPORT ────────────────────────────────────────────────────── */}
          <View style={ss.exportSection}>
            <Text style={ss.sectionEye}>DATA EXPORT</Text>
            <Pressable
              onPress={handleDownload}
              disabled={downloading}
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            >
              <LinearGradient
                colors={['#3DEB63', '#25C44A', '#1AAD3E']}
                style={ss.exportBtn}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              >
                {downloading
                  ? <ActivityIndicator size="small" color="#04100A" />
                  : <MaterialCommunityIcons name="download-circle-outline" size={24} color="#04100A" />
                }
                <View style={{ flex: 1 }}>
                  <Text style={ss.exportBtnTitle}>
                    {downloading
                      ? exportProgress !== null
                        ? `Fetching… ${exportProgress.toLocaleString()} rows`
                        : 'Preparing…'
                      : 'EXPORT ALL DATA (CSV)'}
                  </Text>
                  <Text style={ss.exportBtnSub}>
                    {downloading
                      ? 'Fetching every record — please wait'
                      : `${rows.length.toLocaleString()} rows loaded · fetches ALL for export`}
                  </Text>
                </View>
                {!downloading && (
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={22}
                    color="rgba(4,16,10,0.55)"
                  />
                )}
              </LinearGradient>
            </Pressable>
            <Text style={ss.exportHint}>
              Exports every row in the {range} range · share to Files, Drive, email & more
            </Text>
          </View>

          {/* Pull to refresh hint */}
          <Text style={ss.refreshHint}>↓ Pull to refresh data</Text>

          {/* Tab bar clearance */}
          <View style={{ height: 100 }} />
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  scroll: { paddingBottom: 0 },

  // ── Header ──────────────────────────────────────────────────────────────
  headerGrad: {
    paddingHorizontal: H_PAD,
    paddingTop:        14,
    paddingBottom:     20,
    marginBottom:      4,
  },
  headerRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   20,
  },
  headerEyebrow: {
    fontSize:     10,
    fontWeight:   '700',
    color:        C.text2,
    letterSpacing: 2.5,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize:     32,
    fontWeight:   '900',
    color:        C.text1,
    letterSpacing: 0.5,
    lineHeight:   38,
  },
  syncRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  syncText:  { fontSize: 11, color: C.text2, letterSpacing: 0.3 },
  headerRight: { alignItems: 'center', gap: 4, paddingTop: 4 },
  liveLabel: { fontSize: 10, fontWeight: '800', color: C.green, letterSpacing: 2 },

  // Chips
  chipRow:   { gap: 10 },
  chip: {
    alignItems:      'center',
    paddingHorizontal: 14,
    paddingVertical:  10,
    borderRadius:     14,
    backgroundColor:  C.card,
    borderWidth:      1,
    borderColor:      C.border,
    gap:              3,
    minWidth:         70,
  },
  chipVal:   { fontSize: 16, fontWeight: '800', color: C.text1 },
  chipLabel: { fontSize: 9, fontWeight: '700', color: C.text2, letterSpacing: 1.5 },

  // ── Section label ────────────────────────────────────────────────────────
  section:      { paddingHorizontal: H_PAD, marginBottom: 16 },
  statsSection: { paddingHorizontal: H_PAD, marginBottom: 16 },
  sectionEye: {
    fontSize:     9,
    fontWeight:   '700',
    color:        C.text3,
    letterSpacing: 2.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },

  // ── Time range ───────────────────────────────────────────────────────────
  rangeRow: {
    flexDirection:  'row',
    gap:            8,
  },
  rangePill: {
    flex:              1,
    paddingVertical:   10,
    borderRadius:      12,
    alignItems:        'center',
    backgroundColor:   C.card,
    borderWidth:       1,
    borderColor:       C.border,
  },
  rangeTxt: { fontSize: 12, fontWeight: '800', color: C.text2, letterSpacing: 0.8 },

  // ── Chart card ───────────────────────────────────────────────────────────
  chartCard: {
    marginHorizontal: H_PAD,
    backgroundColor:  C.card,
    borderRadius:     20,
    overflow:         'hidden',
    borderWidth:      1,
    borderColor:      C.border,
    marginBottom:     16,
  },
  chartHead: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    paddingHorizontal: 20,
    paddingTop:      18,
    paddingBottom:   4,
  },
  chartHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chartDot:      { width: 8, height: 8, borderRadius: 4 },
  chartMetricName: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  chartUnit:       { fontSize: 11, color: C.text2 },
  chartHeadRight:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chartPts:        { fontSize: 10, color: C.text3 },

  trendBadge: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius:    8,
    borderWidth:     1,
  },
  trendTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  bigValRow: {
    flexDirection: 'row',
    alignItems:    'baseline',
    gap:           8,
    paddingHorizontal: 20,
    paddingTop:    6,
    paddingBottom: 12,
  },
  bigVal:      { fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  bigValLabel: { fontSize: 11, color: C.text2, fontWeight: '600' },

  chartDivider: { height: 1, marginHorizontal: 20, marginBottom: 4 },

  chartWrap:       { overflow: 'hidden', paddingHorizontal: H_PAD - 4 },
  chartPlaceholder: {
    height:          230,
    alignItems:      'center',
    justifyContent:  'center',
    gap:             12,
    paddingHorizontal: 32,
  },
  phTxt: { fontSize: 14, fontWeight: '700', color: C.text2, textAlign: 'center' },
  phSub: { fontSize: 12, color: C.text3, textAlign: 'center', lineHeight: 18 },

  // ── Stats ────────────────────────────────────────────────────────────────
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCard: {
    flex:           1,
    borderRadius:   16,
    borderWidth:    1,
    borderColor:    C.border,
    paddingVertical: 16,
    alignItems:     'center',
    gap:            6,
    overflow:       'hidden',
    backgroundColor: C.card,
  },
  statBar:   { width: '100%', height: 3, position: 'absolute', top: 0, left: 0, right: 0 },
  statVal:   { fontSize: 18, fontWeight: '900', color: C.text1, textAlign: 'center' },
  statLabel: { fontSize: 8, fontWeight: '700', color: C.text2, letterSpacing: 2 },

  samplesPill: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             6,
    alignSelf:       'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius:    20,
    backgroundColor: C.card,
    borderWidth:     1,
    borderColor:     C.border,
  },
  samplesText: { fontSize: 12, color: C.text2 },

  // ── Trend card ───────────────────────────────────────────────────────────
  trendCard: {
    marginHorizontal: H_PAD,
    backgroundColor:  C.card,
    borderRadius:     16,
    borderWidth:      1,
    borderColor:      C.border,
    padding:          18,
    flexDirection:    'row',
    alignItems:       'center',
    gap:              14,
    marginBottom:     16,
    overflow:         'hidden',
  },
  trendCardTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginBottom: 3 },
  trendCardSub:   { fontSize: 12, color: C.text2, lineHeight: 17 },
  trendPctBadge:  {
    paddingHorizontal: 10,
    paddingVertical:   6,
    borderRadius:      10,
    alignSelf:         'flex-start',
  },
  trendPctTxt: { fontSize: 13, fontWeight: '900' },

  // ── Export ───────────────────────────────────────────────────────────────
  exportSection: { paddingHorizontal: H_PAD, marginBottom: 8 },
  exportBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             14,
    paddingVertical: 18,
    paddingHorizontal: 22,
    borderRadius:    18,
    marginBottom:    8,
  },
  exportBtnTitle: { fontSize: 15, fontWeight: '900', color: '#04100A', letterSpacing: 1.5 },
  exportBtnSub:   { fontSize: 11, color: 'rgba(4,16,10,0.6)', fontWeight: '600', marginTop: 1 },
  exportHint:     { fontSize: 11, color: C.text3, textAlign: 'center' },

  // ── Refresh hint ─────────────────────────────────────────────────────────
  refreshHint: {
    textAlign:    'center',
    fontSize:     11,
    color:        C.text4,
    marginTop:    8,
    letterSpacing: 0.5,
  },

  // ── Offline ──────────────────────────────────────────────────────────────
  offlineWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  offlineGradBg: { ...StyleSheet.absoluteFillObject },
  offlineCard: {
    alignItems:      'center',
    paddingHorizontal: 40,
    gap:             18,
  },
  offlineH: {
    fontSize:     20,
    fontWeight:   '800',
    color:        C.text1,
    textAlign:    'center',
    letterSpacing: 0.5,
  },
  offlineB: {
    fontSize:   13,
    color:      C.text2,
    textAlign:  'center',
    lineHeight: 21,
  },
});
