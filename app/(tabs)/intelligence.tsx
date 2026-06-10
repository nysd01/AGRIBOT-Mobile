/**
 * AGRIBOT Intelligence — AI-driven agronomic expert system
 *
 * Rule engine covers:
 *  • Soil moisture (deficit, saturation, compound heat+drought)
 *  • Temperature (heat stress, cold stress, extreme events)
 *  • Humidity (disease pressure model, transpiration stress)
 *  • Cross-correlation (heat×drought, humidity×temp fungal index)
 *  • Threat detection (smoke, flame, CO₂)
 *  • Time-aware irrigation scheduling
 *  • Autonomous operation readiness decision
 */

import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useESP32Sensors, type SensorData } from '@/hooks/use-esp32-sensors';

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  bg:      '#05080A',
  card:    '#0C1110',
  raised:  '#121918',
  border:  'rgba(255,255,255,0.05)',
  green:   '#72F88A',
  red:     '#FF4444',
  orange:  '#FF8C42',
  yellow:  '#FFD93D',
  teal:    '#4ECDC4',
  purple:  '#C084FC',
  text1:   '#EEF4F0',
  text2:   '#6C8070',
  text3:   '#2E3C32',
};

// ─────────────────────────────────────────────────────────────────────────────
// AI Engine types
// ─────────────────────────────────────────────────────────────────────────────

type Priority = 'critical' | 'high' | 'medium' | 'low' | 'ok';
type Category = 'irrigation' | 'temperature' | 'humidity' | 'soil'
              | 'threat' | 'air' | 'operation' | 'cross';

interface Insight {
  id:       string;
  priority: Priority;
  category: Category;
  icon:     string;
  timing:   'immediate' | '2h' | 'today' | 'week' | 'monitor';
  title:    string;
  finding:  string;
  impact:   string;
  steps:    string[];
  value:    string;
  range:    string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Priority helpers
// ─────────────────────────────────────────────────────────────────────────────

function pColor(p: Priority): string {
  return { critical: C.red, high: C.orange, medium: C.yellow, low: C.teal, ok: C.green }[p];
}
function pBg(p: Priority): string {
  return { critical: '#200808', high: '#1A0E06', medium: '#1C1804', low: '#071A1A', ok: '#0D1F12' }[p];
}
function pOrder(p: Priority): number {
  return { critical: 0, high: 1, medium: 2, low: 3, ok: 4 }[p];
}
function timingLabel(t: Insight['timing']): string {
  return { immediate: 'DO NOW', '2h': 'WITHIN 2H', today: 'TODAY', week: 'THIS WEEK', monitor: 'MONITOR' }[t];
}
function timingColor(t: Insight['timing']): string {
  return { immediate: C.red, '2h': C.orange, today: C.yellow, week: C.teal, monitor: C.text2 }[t];
}
function gradeColor(g: string): string {
  return { A: C.green, B: '#A3F06B', C: C.yellow, D: C.orange, F: C.red }[g] ?? C.text2;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Rule Engine
// ─────────────────────────────────────────────────────────────────────────────

interface EngineResult {
  score:      number;
  grade:      string;
  insights:   Insight[];
  opMode:     'halt' | 'caution' | 'standard' | 'optimal';
  opTitle:    string;
  opSummary:  string;
  opSteps:    string[];
  temp:       number;
  humidity:   number;
  moisture:   number;
  smokeRaw:   number;
  smokeOn:    boolean;
  flameOn:    boolean;
  co2:        number;
  isBestIrrigationTime: boolean;
  isPeakHeat:           boolean;
  timeOfDay:            string;
  moistureDeficit:      number;
}

function runEngine(sensors: SensorData | null): EngineResult {
  // ── Extract readings ──────────────────────────────────────────────────────
  const temp     = sensors?.domino4?.weather?.temperatureC ?? sensors?.temperatureC    ?? 0;
  const humidity = sensors?.domino4?.weather?.humidityPct  ?? sensors?.humidityPct     ?? 0;
  const moisture = sensors?.domino4?.soil?.moisturePct     ?? sensors?.soilMoisturePct ?? 0;
  const smokeRaw = sensors?.smoke?.raw     ?? 0;
  const smokeOn  = sensors?.smoke?.detected  ?? false;
  const flameOn  = sensors?.flame?.detected  ?? false;
  const co2      = sensors?.airQuality?.co2Ppm  ?? 0;
  const uptime   = sensors?.systemInfo?.uptimeSeconds ?? 0;

  // ── Time context ──────────────────────────────────────────────────────────
  const hour = new Date().getHours();
  const isBestIrrigationTime = (hour >= 5 && hour <= 9) || (hour >= 17 && hour <= 20);
  const isPeakHeat           = hour >= 11 && hour <= 15;
  const timeOfDay =
    hour < 6 ? 'night' : hour < 11 ? 'morning' : hour < 14 ? 'midday'
                       : hour < 18 ? 'afternoon' : hour < 22 ? 'evening' : 'night';

  // ── Derived calculations ──────────────────────────────────────────────────
  const TARGET_MOISTURE = 55;
  const moistureDeficit = Math.max(0, TARGET_MOISTURE - moisture);
  const evapFactor      = temp > 35 ? 1.8 : temp > 30 ? 1.4 : temp > 25 ? 1.15 : 1.0;
  const mmNeeded        = parseFloat((moistureDeficit * 0.55 * evapFactor).toFixed(1));

  // ── Fungal disease index (Blight Risk) ───────────────────────────────────
  // High when: humidity > 75% AND temp 15–28°C (classic Botrytis window)
  const blightRisk =
    humidity > 90 && temp >= 13 && temp <= 28 ? 'critical' :
    humidity > 80 && temp >= 15 && temp <= 28 ? 'high'     :
    humidity > 70 && temp >= 18 && temp <= 25 ? 'medium'   : 'low';

  const insights: Insight[] = [];
  let score = 100;

  // ════════════════════════════════════════════════════════════════════
  // THREAT: FIRE — always evaluated first, highest possible priority
  // ════════════════════════════════════════════════════════════════════
  if (flameOn) {
    insights.push({
      id: 'fire', priority: 'critical', category: 'threat',
      icon: 'fire-alert', timing: 'immediate',
      title: 'ACTIVE FIRE DETECTED',
      finding: 'Flame sensor is triggered. An open flame or intense heat source is present in the robot\'s proximity.',
      impact: 'Immediate crop loss, equipment destruction, and uncontrolled fire spread. Every second matters.',
      steps: [
        'Halt all robot operations and return to safe zone',
        'Alert all field personnel — evacuate the zone immediately',
        'Call emergency fire services if spread is visible',
        'Activate remote irrigation if safe to do so without entering the zone',
        'Do NOT send autonomous robot into a fire zone under any circumstances',
        'After fire: assess crop damage and soil contamination before resuming operations',
      ],
      value: 'TRIGGERED', range: 'Should be: Not detected',
    });
    score -= 45;
  } else if (smokeOn) {
    const smokeLevel = smokeRaw > 2500 ? 'dense' : smokeRaw > 1500 ? 'moderate' : 'light';
    insights.push({
      id: 'smoke', priority: 'critical', category: 'threat',
      icon: 'smoke-detector-alert', timing: 'immediate',
      title: 'SMOKE / GAS DETECTED',
      finding: `${smokeLevel.charAt(0).toUpperCase() + smokeLevel.slice(1)} smoke or gas detected (sensor raw: ${smokeRaw}). Possible fire, field burning, pesticide vapour, or decomposition gas.`,
      impact: 'If from a fire source: crop and equipment at immediate risk. If from gases: air quality hazard for humans and the robot\'s electronics.',
      steps: [
        'Visually inspect the field perimeter before sending robot in',
        'If fire source: escalate to fire alert protocol immediately',
        'If from crop burning or pesticide: delay all field operations until air clears',
        'Keep humans out of the area until smoke sensor reads clear',
        `Raw value ${smokeRaw} — re-check every 5 minutes for trend`,
        'Log this event with timestamp for insurance and compliance records',
      ],
      value: `Raw: ${smokeRaw}`, range: 'Should be: Not detected',
    });
    score -= 28;
  }

  // ════════════════════════════════════════════════════════════════════
  // SOIL MOISTURE
  // ════════════════════════════════════════════════════════════════════
  if (moisture < 20) {
    insights.push({
      id: 'moisture-critical', priority: 'critical', category: 'irrigation',
      icon: 'water-alert', timing: 'immediate',
      title: 'Severe Drought Stress — Irrigate Now',
      finding: `Soil moisture at ${moisture.toFixed(0)}% — critically below the 25% wilting threshold. Root water uptake has halted.`,
      impact: 'Permanent wilting damage begins within hours at this level. Photosynthesis has dropped by more than 60%. Yield loss is happening right now.',
      steps: [
        `Start irrigation immediately — ${mmNeeded} mm needed to restore balance`,
        'Run in short 15-minute cycles to prevent runoff on hydrophobic dry soil',
        isBestIrrigationTime ? '✓ Timing is ideal — irrigate now' : isPeakHeat ? '⚠ Despite peak heat, delay is not an option at this moisture level' : 'Schedule additional cycle this evening',
        'Re-measure soil moisture 30 minutes after each cycle',
        'Apply a light mulch layer after irrigation to retain moisture',
        'Check plant stems and leaves for wilting — if wilted before noon, apply emergency irrigation',
      ],
      value: `${moisture.toFixed(0)}%`, range: 'Target: 40–65%',
    });
    score -= 35;
  } else if (moisture < 35) {
    const urgency = temp > 30 ? 'high' : 'medium';
    const timing  = temp > 30 ? '2h' : 'today';
    insights.push({
      id: 'moisture-low', priority: urgency, category: 'irrigation',
      icon: 'water-minus', timing,
      title: 'Low Soil Moisture',
      finding: `Moisture at ${moisture.toFixed(0)}%${temp > 28 ? ` — combined with ${temp.toFixed(1)}°C, evaporation is ${evapFactor.toFixed(1)}× normal rate.` : ' — below the optimal growth band.'}`,
      impact: 'Root nutrient uptake is reduced by ~30%. Crop growth rate is slowing. Continued deficit will delay flowering and harvest.',
      steps: [
        isBestIrrigationTime ? `✓ Perfect irrigation window — apply ${mmNeeded} mm now`
          : isPeakHeat ? `⚠ Peak heat — schedule ${mmNeeded} mm for this evening (5–8pm)`
          : `Apply ${mmNeeded} mm today, preferably before 9am or after 5pm`,
        'Use drip irrigation if available — reduces evaporation by up to 50% vs overhead',
        `At ${evapFactor.toFixed(1)}× evaporation rate, moisture drops ~${(evapFactor * 1.5).toFixed(0)}% per hour without irrigation`,
        'Target bringing moisture to 50–60% before next check',
        'Consider mulching if heat persists above 28°C',
      ],
      value: `${moisture.toFixed(0)}%`, range: 'Target: 40–65%',
    });
    score -= urgency === 'high' ? 20 : 12;
  } else if (moisture > 80) {
    insights.push({
      id: 'moisture-saturation', priority: 'high', category: 'irrigation',
      icon: 'waves-arrow-up', timing: '2h',
      title: 'Soil Waterlogged — Root Rot Risk',
      finding: `Moisture at ${moisture.toFixed(0)}% — well above the 75% saturation threshold. Soil oxygen is depleted.`,
      impact: 'Anaerobic conditions are active. Root rot pathogens (Pythium, Phytophthora) thrive in waterlogged soil. Roots suffocate within 24–48 hours if uncorrected.',
      steps: [
        'Stop all irrigation systems immediately',
        'Open drainage channels, trenches, or furrows to move standing water',
        'Avoid heavy machinery — wheeled equipment compresses waterlogged soil, worsening the issue',
        'Do not apply fertiliser — nutrients are leaching out rapidly in saturated soil',
        'Re-check in 2 hours — moisture should be declining as drainage occurs',
        'Consider raised-bed planting in chronically waterlogged zones',
      ],
      value: `${moisture.toFixed(0)}%`, range: 'Target: 40–65%',
    });
    score -= 22;
  } else if (moisture >= 40 && moisture <= 70) {
    insights.push({
      id: 'moisture-ok', priority: 'ok', category: 'irrigation',
      icon: 'water-check', timing: 'monitor',
      title: 'Soil Moisture Optimal',
      finding: `Moisture at ${moisture.toFixed(0)}% — within the ideal 40–65% range. Root uptake is maximised.`,
      impact: 'Nutrient transport and photosynthesis operating at full efficiency.',
      steps: [
        'Maintain current irrigation schedule',
        temp > 28 ? `⚠ Heat (${temp.toFixed(1)}°C) will accelerate moisture loss — check again in 2–3 hours` : 'Next check recommended in 4–6 hours',
        'No corrective action required',
      ],
      value: `${moisture.toFixed(0)}%`, range: 'Target: 40–65%',
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // TEMPERATURE
  // ════════════════════════════════════════════════════════════════════
  if (temp > 38) {
    insights.push({
      id: 'temp-extreme', priority: 'critical', category: 'temperature',
      icon: 'thermometer-alert', timing: 'immediate',
      title: 'Extreme Heat Event — Crop Emergency',
      finding: `Temperature at ${temp.toFixed(1)}°C — above the 38°C threshold where irreversible cellular damage begins in most crops.`,
      impact: 'Photosynthesis halts above 38°C. Pollen viability drops to near zero — fruiting crops will abort. Protein denaturation begins in leaf tissue. Yield loss is permanent at this stage.',
      steps: [
        'Deploy shade nets (40–50% shade factor) over sensitive crops immediately',
        'Irrigate to cool soil surface — reduces root-zone temp by 5–8°C',
        'Avoid all field work between 10am and 4pm',
        `Robot should operate only before 9am or after 6pm — electronics risk overheating at ${temp.toFixed(1)}°C`,
        'Apply foliar water mist to reduce leaf temperature',
        'Document duration of heat event for yield forecast adjustment',
      ],
      value: `${temp.toFixed(1)}°C`, range: 'Ideal: 18–30°C',
    });
    score -= 28;
  } else if (temp > 33) {
    insights.push({
      id: 'temp-high', priority: 'high', category: 'temperature',
      icon: 'thermometer-high', timing: 'today',
      title: 'High Temperature Warning',
      finding: `Temperature at ${temp.toFixed(1)}°C — above the 32°C stress threshold. Evaporation is ${evapFactor.toFixed(1)}× the normal rate.`,
      impact: 'Young plants and flowering crops show reduced fruit set. Heat stress compounds with moisture deficit — each hour of combined stress reduces yield potential by ~1–2%.',
      steps: [
        'Schedule irrigation for early morning (5–9am) or this evening (5–8pm)',
        'Apply mulch to exposed soil to reduce surface temperature',
        `Moisture is evaporating at ${(evapFactor * 2).toFixed(0)}%+ per hour — monitor closely`,
        'Protect flowering and fruit-setting crops with shade cloth (30–40% shade)',
        'Avoid fertiliser application in heat — leaf-burn risk is elevated',
      ],
      value: `${temp.toFixed(1)}°C`, range: 'Ideal: 18–30°C',
    });
    score -= 14;
  } else if (temp < 8 && temp > 0) {
    insights.push({
      id: 'temp-cold', priority: 'high', category: 'temperature',
      icon: 'thermometer-low', timing: '2h',
      title: 'Cold Stress — Root Activity Suppressed',
      finding: `Temperature at ${temp.toFixed(1)}°C — below the 10°C threshold where root enzymatic activity ceases for most crops.`,
      impact: 'Nutrient uptake has effectively stopped. Microbial soil activity is suppressed, reducing natural nitrogen cycling. Cold-sensitive crops risk chilling injury.',
      steps: [
        'Apply frost cloth or row covers on sensitive crops before nightfall',
        'Delay all fertiliser applications — nutrients cannot be absorbed in cold soil',
        'Avoid evening irrigation — wet soil radiates heat away, increasing frost risk',
        'Cold-hardy crops (brassicas, root vegetables) require no action',
        'Monitor overnight low forecast for frost risk below 2°C',
      ],
      value: `${temp.toFixed(1)}°C`, range: 'Ideal: 18–30°C',
    });
    score -= 15;
  } else if (temp < 0) {
    insights.push({
      id: 'temp-frost', priority: 'critical', category: 'temperature',
      icon: 'snowflake-alert', timing: 'immediate',
      title: 'FROST ALERT',
      finding: `Temperature at ${temp.toFixed(1)}°C — below freezing. Ice crystal formation in plant cells is occurring.`,
      impact: 'Cell membrane rupture from ice crystals causes irreversible tissue death. Most vegetable crops suffer permanent damage below −2°C.',
      steps: [
        'Cover all frost-sensitive crops with frost cloth immediately',
        'Run irrigation — wet soil holds heat better than dry (frost protection technique)',
        'Bring any container or potted plants indoors',
        'Do not operate robot on frozen ground — traction and sensor accuracy are compromised',
        'Assess crop damage after thaw — do not prune frost-damaged tissue for 48h',
      ],
      value: `${temp.toFixed(1)}°C`, range: 'Ideal: 18–30°C',
    });
    score -= 35;
  } else if (temp >= 18 && temp <= 30) {
    insights.push({
      id: 'temp-ok', priority: 'ok', category: 'temperature',
      icon: 'thermometer-check', timing: 'monitor',
      title: 'Temperature Optimal',
      finding: `Temperature at ${temp.toFixed(1)}°C — ideal for active crop growth and maximum photosynthesis.`,
      impact: 'All metabolic processes running at full efficiency. Enzyme activity is optimised.',
      steps: ['No action needed. Temperature conditions are excellent.'],
      value: `${temp.toFixed(1)}°C`, range: 'Ideal: 18–30°C',
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // HUMIDITY
  // ════════════════════════════════════════════════════════════════════
  if (humidity > 92) {
    insights.push({
      id: 'hum-critical', priority: 'critical', category: 'humidity',
      icon: 'cloud-alert', timing: 'immediate',
      title: 'Critical Humidity — Disease Outbreak Imminent',
      finding: `Humidity at ${humidity.toFixed(0)}% — above 90%. Spore germination is active. Combined with ${temp.toFixed(1)}°C this creates a ${blightRisk} fungal outbreak risk.`,
      impact: 'Botrytis (grey mold) and Downy Mildew can colonise an entire field within 48–72 hours under these conditions. Fruit crops and leafy greens are most vulnerable.',
      steps: [
        'Apply preventive fungicide within the next 6 hours — do not wait for visible symptoms',
        'Scout lower leaf surfaces for early lesions immediately',
        'Remove and destroy any infected material found — do not compost',
        'Switch to drip irrigation only — overhead watering keeps foliage wet, worsening disease',
        'Delay morning irrigation until humidity drops below 80%',
        'Thin plant canopy in dense areas to increase airflow',
      ],
      value: `${humidity.toFixed(0)}%`, range: 'Ideal: 40–75%',
    });
    score -= 20;
  } else if (humidity > 82) {
    insights.push({
      id: 'hum-high', priority: 'high', category: 'humidity',
      icon: 'water-percent', timing: '2h',
      title: 'High Humidity — Disease Pressure Elevated',
      finding: `Humidity at ${humidity.toFixed(0)}% — above the 80% threshold. Fungal disease risk is ${blightRisk}.`,
      impact: 'Sustained periods above 80% humidity accelerate Powdery Mildew and Botrytis cycles by 2–3×. Harvest quality and shelf life are affected.',
      steps: [
        'Apply a preventive fungicide or biofungicide (copper-based) as a precaution',
        'Scout fields for early fungal signs — check undersides of leaves',
        'Increase row spacing or canopy ventilation if possible',
        'Avoid overhead irrigation — keep foliage dry',
        'Prioritise early-morning harvest before humidity peaks',
      ],
      value: `${humidity.toFixed(0)}%`, range: 'Ideal: 40–75%',
    });
    score -= 12;
  } else if (humidity < 28) {
    insights.push({
      id: 'hum-low', priority: 'medium', category: 'humidity',
      icon: 'weather-windy', timing: 'today',
      title: 'Low Humidity — Transpiration Stress',
      finding: `Humidity at ${humidity.toFixed(0)}%${temp > 28 ? ` combined with ${temp.toFixed(1)}°C — severe vapour pressure deficit. Crops lose water faster than roots can supply.` : ' — below the ideal range.'}`,
      impact: 'Stomata close under high VPD, reducing CO₂ intake and photosynthesis by up to 40%. Fruit cracking and tip-burn are common in low-humidity stress.',
      steps: [
        'Use smaller, more frequent irrigation doses — avoid large single applications',
        'Apply windbreaks if low humidity coincides with wind',
        'Mist foliage lightly in the early morning to raise local humidity',
        'Avoid harvesting during the hottest, driest part of the day',
      ],
      value: `${humidity.toFixed(0)}%`, range: 'Ideal: 40–75%',
    });
    score -= 10;
  } else if (humidity >= 40 && humidity <= 75) {
    insights.push({
      id: 'hum-ok', priority: 'ok', category: 'humidity',
      icon: 'water-percent', timing: 'monitor',
      title: 'Humidity Optimal',
      finding: `Humidity at ${humidity.toFixed(0)}% — balanced. Disease pressure is low and transpiration is efficient.`,
      impact: 'Stomata are open, gas exchange is maximised, and fungal risk is minimal.',
      steps: ['No action needed.'],
      value: `${humidity.toFixed(0)}%`, range: 'Ideal: 40–75%',
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // CROSS-CORRELATION RULES (compound conditions)
  // ════════════════════════════════════════════════════════════════════

  // Rule 1: Heat + Drought compound stress
  if (temp > 30 && moisture < 35) {
    insights.push({
      id: 'cross-heat-drought', priority: 'critical', category: 'cross',
      icon: 'sun-thermometer-outline', timing: 'immediate',
      title: 'Compound Stress: Heat + Drought',
      finding: `Simultaneous heat (${temp.toFixed(1)}°C) and moisture deficit (${moisture.toFixed(0)}%). Evapotranspiration demand is ${(evapFactor * 1.6).toFixed(1)}× the supply rate.`,
      impact: 'This combination is the single largest cause of crop failure in field agriculture. The yield impact multiplies — heat stress alone reduces yield 10%, drought alone 15%, but together the compounded effect exceeds 40%. Every hour of delay increases damage.',
      steps: [
        `PRIORITY: Begin irrigation now — ${mmNeeded} mm needed immediately`,
        'This is a field emergency — do not wait for the ideal irrigation window',
        'Deploy shade nets simultaneously — reduces canopy temperature by 5–8°C',
        'After irrigation, monitor every 30 minutes until moisture exceeds 45%',
        'Reduce robot workload — heat and low moisture stress motors and sensors',
        'Log this event: compound stress events must be reported for crop insurance claims',
      ],
      value: `${temp.toFixed(1)}°C · ${moisture.toFixed(0)}% moisture`, range: 'Safe: < 30°C + > 40% moisture',
    });
    score -= 18;
  }

  // Rule 2: Fungal disease pressure (humidity × temperature index)
  if (humidity > 75 && temp >= 14 && temp <= 28 && !smokeOn && !flameOn) {
    const riskLabel = blightRisk === 'critical' ? 'CRITICAL' : blightRisk === 'high' ? 'HIGH' : 'ELEVATED';
    const riskPriority: Priority = blightRisk === 'critical' ? 'critical' : blightRisk === 'high' ? 'high' : 'medium';
    if (!insights.find(i => i.id === 'hum-critical' || i.id === 'hum-high')) {
      insights.push({
        id: 'cross-fungal', priority: riskPriority, category: 'cross',
        icon: 'mushroom-outline', timing: riskPriority === 'critical' ? 'immediate' : riskPriority === 'high' ? '2h' : 'today',
        title: `Fungal Disease Index: ${riskLabel}`,
        finding: `Humidity ${humidity.toFixed(0)}% + temperature ${temp.toFixed(1)}°C = the classic Botrytis/Downy Mildew infection window. Risk index: ${riskLabel}.`,
        impact: 'Under these exact conditions, fungal spores germinate in 2–6 hours and can spread to cover an entire plant within 24 hours. Early action is 4× more effective than treating established infection.',
        steps: [
          riskPriority === 'critical' || riskPriority === 'high'
            ? 'Apply preventive copper-based or systemic fungicide today'
            : 'Scout fields for early fungal signs before deciding on treatment',
          'Focus scouting on lower leaves, fruit/flower junctions, and dense canopy areas',
          'Improve air circulation: thin canopy, orient rows for prevailing wind',
          'Time any irrigation for morning only — foliage must dry before evening',
          'Maintain spray records for regulatory and insurance purposes',
        ],
        value: `${humidity.toFixed(0)}% RH · ${temp.toFixed(1)}°C`, range: 'Low risk: < 75% RH',
      });
      score -= riskPriority === 'critical' ? 15 : riskPriority === 'high' ? 10 : 6;
    }
  }

  // Rule 3: Low humidity + high temp = vapour pressure deficit alert
  if (humidity < 35 && temp > 28 && !insights.find(i => i.id === 'hum-low')) {
    insights.push({
      id: 'cross-vpd', priority: 'high', category: 'cross',
      icon: 'thermometer-lines', timing: '2h',
      title: 'High Vapour Pressure Deficit',
      finding: `VPD is very high: ${temp.toFixed(1)}°C at ${humidity.toFixed(0)}% humidity creates extreme atmospheric dryness. Crops are losing water faster than roots can supply.`,
      impact: 'High VPD forces stomatal closure, reducing photosynthesis 30–50%. This condition triggers the same cellular damage as a water deficit even when soil moisture is adequate.',
      steps: [
        'Increase irrigation frequency — small, frequent applications work better than large infrequent ones',
        'Create windbreaks to reduce VPD at canopy level',
        'Consider shade structure to reduce temperature and raise relative humidity simultaneously',
        'Monitor for leaf curling or wilting — signs of VPD-induced water stress',
      ],
      value: `${temp.toFixed(1)}°C · ${humidity.toFixed(0)}%`, range: 'Safe VPD: temp < 28°C or humidity > 50%',
    });
    score -= 12;
  }

  // ════════════════════════════════════════════════════════════════════
  // AIR QUALITY (optional — only if sensor reports values)
  // ════════════════════════════════════════════════════════════════════
  if (co2 > 1000) {
    const co2Priority: Priority = co2 > 2500 ? 'critical' : co2 > 1500 ? 'high' : 'medium';
    insights.push({
      id: 'air-co2', priority: co2Priority, category: 'air',
      icon: 'molecule-co2', timing: co2 > 2000 ? 'immediate' : '2h',
      title: `CO₂ Elevated: ${co2} ppm`,
      finding: `CO₂ at ${co2} ppm — significantly above the outdoor baseline of 420 ppm. ${co2 > 2000 ? 'This is a hazardous level for enclosed spaces.' : 'Possible decomposition or combustion source nearby.'}`,
      impact: co2 > 2000
        ? 'Human exposure at 2000+ ppm causes drowsiness, headache, and impaired judgement. Do not allow personnel in enclosed areas.'
        : 'Elevated CO₂ in open fields may indicate fermentation, composting activity, or a nearby combustion source.',
      steps: [
        co2 > 2000 ? 'Evacuate any enclosed structures immediately' : 'Identify and investigate the CO₂ source',
        'Check for covered compost piles, underground storage, or fermentation tanks nearby',
        co2 > 1500 ? 'Increase ventilation — open all vents, doors, and structures' : 'Monitor trend — if rising, escalate',
        'Cross-reference with smoke sensor data',
      ],
      value: `${co2} ppm`, range: 'Safe outdoor: < 800 ppm',
    });
    score -= co2Priority === 'critical' ? 15 : co2Priority === 'high' ? 10 : 5;
  }

  // ════════════════════════════════════════════════════════════════════
  // AUTONOMOUS OPERATION DECISION
  // ════════════════════════════════════════════════════════════════════
  const criticalCount = insights.filter(i => i.priority === 'critical').length;
  const highCount     = insights.filter(i => i.priority === 'high').length;

  let opMode: EngineResult['opMode'];
  let opTitle: string;
  let opSummary: string;
  let opSteps: string[];
  let opPriority: Priority;

  if (flameOn || smokeOn) {
    opMode = 'halt'; opPriority = 'critical';
    opTitle = 'AUTONOMOUS MODE: HALTED';
    opSummary = flameOn
      ? 'Fire detected. Robot must not enter or operate in a hazardous zone. Halt immediately.'
      : 'Smoke/gas present. Autonomous operation is suspended until the field is declared safe.';
    opSteps = [
      'Return robot to base station or safe parking position',
      'Switch to Manual mode with human observer only',
      'Resolve fire/smoke alert before resuming any autonomous mission',
      'Document downtime for operational records',
    ];
    score -= 10;
  } else if (criticalCount > 0) {
    opMode = 'caution'; opPriority = 'high';
    opTitle = 'AUTONOMOUS MODE: Restricted';
    opSummary = `${criticalCount} critical field condition${criticalCount > 1 ? 's' : ''} detected. Short supervised missions only.`;
    opSteps = [
      'Limit autonomous missions to under 10 minutes',
      'Monitor robot position on the Map tab throughout each run',
      'Resolve critical alerts before returning to full autonomous schedule',
      temp > 35 ? `⚠ High temp (${temp.toFixed(1)}°C) — robot electronics risk overheating during prolonged operation` : '',
    ].filter(Boolean);
  } else if (highCount > 1 || isPeakHeat) {
    opMode = 'caution'; opPriority = 'medium';
    opTitle = 'AUTONOMOUS MODE: Caution';
    opSummary = isPeakHeat
      ? `Peak heat window (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}). Limit robot operation to avoid sensor drift and motor stress.`
      : 'Multiple elevated conditions detected. Operate with increased monitoring.';
    opSteps = [
      'Keep missions under 20 minutes during this period',
      isBestIrrigationTime ? '✓ Good time for irrigation mission — prioritise watering route' : isPeakHeat ? 'Postpone heavy patrol missions until after 5pm' : 'Standard monitoring mission recommended',
      'Check sensor data after each mission cycle',
    ];
  } else {
    opMode = 'optimal'; opPriority = 'ok';
    opTitle = 'AUTONOMOUS MODE: Clear for Operation';
    opSummary = 'All field conditions are within safe operating ranges. Full autonomous mission is recommended.';
    opSteps = [
      isBestIrrigationTime
        ? '✓ Best irrigation window active — prioritise watering mission now'
        : timeOfDay === 'morning' ? 'Morning conditions are ideal — run a full field patrol mission'
        : timeOfDay === 'evening' ? 'Evening conditions are ideal — irrigation + patrol recommended'
        : 'Standard monitoring mission is appropriate for this time of day',
      'All sensor conditions are nominal',
      `Next full review recommended in ${timeOfDay === 'midday' ? '2' : '4'} hours`,
    ];
  }

  insights.push({
    id: 'operation', priority: opPriority, category: 'operation',
    icon: opMode === 'halt' ? 'robot-dead-outline' : opMode === 'optimal' ? 'robot-happy-outline' : 'robot-angry-outline',
    timing: opMode === 'halt' ? 'immediate' : 'monitor',
    title: opTitle,
    finding: opSummary,
    impact: opMode === 'halt' ? 'Operating robot in hazardous conditions risks equipment loss and personnel safety.' : '',
    steps: opSteps,
    value: opMode.toUpperCase(), range: '',
  });

  // ── Normalise and sort ────────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score));
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 55 ? 'C' : score >= 35 ? 'D' : 'F';
  insights.sort((a, b) => pOrder(a.priority) - pOrder(b.priority));

  return {
    score, grade, insights, opMode, opTitle, opSummary, opSteps,
    temp, humidity, moisture, smokeRaw, smokeOn, flameOn, co2,
    isBestIrrigationTime, isPeakHeat, timeOfDay, moistureDeficit,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Animated score bar
// ─────────────────────────────────────────────────────────────────────────────

function ScoreBar({ score, color }: { score: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: score / 100, duration: 1200, useNativeDriver: false }).start();
  }, [score]);
  return (
    <View style={ss.barBg}>
      <Animated.View style={[ss.barFill, {
        width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        backgroundColor: color,
      }]} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sensor mini-gauge (used in the metrics strip)
// ─────────────────────────────────────────────────────────────────────────────

function MiniGauge({
  label, value, unit, min, max, good,
}: {
  label: string; value: number; unit: string; min: number; max: number;
  good: [number, number];
}) {
  const pct   = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const inGood = value >= good[0] && value <= good[1];
  const color  = inGood ? C.green : value < good[0] ? C.teal : C.orange;
  const anim   = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 900, useNativeDriver: false }).start();
  }, [pct]);
  return (
    <View style={ss.miniGauge}>
      <Text style={ss.miniLabel}>{label}</Text>
      <Text style={[ss.miniValue, { color }]}>{value.toFixed(label === 'SOIL' ? 0 : 1)}{unit}</Text>
      <View style={ss.miniBarBg}>
        <Animated.View style={[ss.miniBarFill, {
          width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          backgroundColor: color,
        }]} />
      </View>
      <Text style={ss.miniRange}>{good[0]}–{good[1]}{unit}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Insight Card
// ─────────────────────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: Insight }) {
  const color = pColor(insight.priority);
  const bg    = pBg(insight.priority);
  return (
    <View style={[ss.insightCard, { backgroundColor: bg, borderColor: `${color}30` }]}>
      {/* Top accent bar */}
      <View style={[ss.insightAccent, { backgroundColor: color }]} />

      {/* Header row */}
      <View style={ss.insightHeader}>
        <View style={[ss.insightIconWrap, { backgroundColor: `${color}18` }]}>
          <MaterialCommunityIcons name={insight.icon as any} size={20} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[ss.insightTitle, { color }]}>{insight.title}</Text>
          <View style={ss.insightBadgeRow}>
            <View style={[ss.timingBadge, { backgroundColor: `${timingColor(insight.timing)}22` }]}>
              <Text style={[ss.timingText, { color: timingColor(insight.timing) }]}>
                {timingLabel(insight.timing)}
              </Text>
            </View>
            {insight.value !== '' && (
              <View style={ss.valueBadge}>
                <Text style={[ss.valueText, { color }]}>{insight.value}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Finding */}
      <Text style={ss.insightFinding}>{insight.finding}</Text>

      {/* Impact (only if present) */}
      {insight.impact !== '' && (
        <View style={[ss.impactBox, { borderLeftColor: color }]}>
          <Text style={ss.impactText}>{insight.impact}</Text>
        </View>
      )}

      {/* Action steps */}
      <View style={ss.stepsWrap}>
        <Text style={[ss.stepsHeader, { color }]}>
          <MaterialCommunityIcons name="clipboard-check-outline" size={11} color={color} />
          {'  '}RECOMMENDED ACTIONS
        </Text>
        {insight.steps.map((step, i) => (
          <View key={i} style={ss.stepRow}>
            <View style={[ss.stepDot, { backgroundColor: color }]} />
            <Text style={ss.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      {/* Range hint */}
      {insight.range !== '' && (
        <Text style={ss.rangeHint}>{insight.range}</Text>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Irrigation Summary Card
// ─────────────────────────────────────────────────────────────────────────────

function IrrigationCard({ result }: { result: EngineResult }) {
  const { moisture, temp, moistureDeficit, isBestIrrigationTime, isPeakHeat, timeOfDay } = result;
  const mmNeeded  = parseFloat((moistureDeficit * 0.55 * (temp > 30 ? 1.4 : 1)).toFixed(1));
  const statusColor = moisture < 30 ? C.red : moisture < 45 ? C.orange : moisture > 75 ? C.teal : C.green;

  const windowLabel = isBestIrrigationTime
    ? '✓ Optimal window active'
    : isPeakHeat
    ? '⚠ Peak heat — schedule for evening'
    : timeOfDay === 'night'
    ? '◌ Night — schedule for 6am'
    : '→ Next window: this evening (5–8pm)';

  return (
    <View style={[ss.irrCard, { borderColor: `${statusColor}30` }]}>
      <LinearGradient
        colors={[`${statusColor}12`, 'transparent']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      />
      <View style={ss.irrHeader}>
        <MaterialCommunityIcons name="water-pump" size={22} color={statusColor} />
        <Text style={[ss.irrTitle, { color: statusColor }]}>IRRIGATION CALCULATOR</Text>
      </View>

      <View style={ss.irrRow}>
        <View style={ss.irrStat}>
          <Text style={ss.irrStatLabel}>CURRENT MOISTURE</Text>
          <Text style={[ss.irrStatValue, { color: statusColor }]}>{moisture.toFixed(0)}%</Text>
        </View>
        <View style={ss.irrStat}>
          <Text style={ss.irrStatLabel}>TARGET</Text>
          <Text style={ss.irrStatValue}>55%</Text>
        </View>
        <View style={ss.irrStat}>
          <Text style={ss.irrStatLabel}>DEFICIT</Text>
          <Text style={[ss.irrStatValue, { color: moistureDeficit > 20 ? C.red : C.orange }]}>
            {moistureDeficit.toFixed(0)}%
          </Text>
        </View>
      </View>

      <View style={ss.irrDivider} />

      <View style={ss.irrRow}>
        <View style={ss.irrStat}>
          <Text style={ss.irrStatLabel}>WATER NEEDED</Text>
          <Text style={[ss.irrStatValue, { color: C.teal }]}>
            {moistureDeficit <= 0 ? 'None' : `${mmNeeded} mm`}
          </Text>
        </View>
        <View style={[ss.irrStat, { flex: 2 }]}>
          <Text style={ss.irrStatLabel}>BEST WINDOW</Text>
          <Text style={[ss.irrWindowText, { color: isBestIrrigationTime ? C.green : C.yellow }]}>
            {windowLabel}
          </Text>
        </View>
      </View>

      {moistureDeficit > 0 && (
        <View style={ss.irrTip}>
          <MaterialCommunityIcons name="lightbulb-on-outline" size={13} color={C.yellow} />
          <Text style={ss.irrTipText}>
            {temp > 30
              ? `At ${temp.toFixed(1)}°C, drip irrigation saves ~50% water vs overhead sprinklers`
              : 'Early morning irrigation reduces evaporation by 20–30% vs midday'}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function IntelligenceScreen() {
  const { sensorData, loading, error, isConnected } = useESP32Sensors({ pollInterval: 3000 });

  const result = useMemo(() => runEngine(sensorData), [sensorData]);

  // Fade on mount
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  // Pulse for live indicator
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  const scoreColor   = gradeColor(result.grade);
  const criticalList = result.insights.filter(i => i.priority === 'critical' || i.priority === 'high');
  const otherList    = result.insights.filter(i => i.priority !== 'critical' && i.priority !== 'high');

  return (
    <SafeAreaView style={ss.root} edges={['top']}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView contentContainerStyle={ss.scroll} showsVerticalScrollIndicator={false}>

          {/* ── HEADER ──────────────────────────────────────────────────── */}
          <LinearGradient
            colors={['#0A1F10', '#06120B', C.bg]}
            style={ss.headerGrad}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          >
            <View style={ss.headerRow}>
              <View>
                <Text style={ss.headerEye}>AGRIBOT · AI ENGINE</Text>
                <Text style={ss.headerTitle}>Intelligence</Text>
                <Text style={ss.headerSub}>
                  {sensorData
                    ? `${result.insights.length} analyses · ${result.insights.filter(i => i.priority === 'critical').length} critical · ${result.insights.filter(i => i.priority === 'high').length} high`
                    : 'Waiting for sensor data…'}
                </Text>
              </View>
              <View style={ss.headerRight}>
                <Animated.View style={[ss.liveDot, { opacity: pulse, backgroundColor: isConnected ? C.green : '#FF4444' }]} />
                <View style={ss.liveDotCore} />
                <Text style={[ss.liveLabel, { color: isConnected ? C.green : '#FF4444' }]}>
                  {isConnected ? 'LIVE' : 'OFFLINE'}
                </Text>
              </View>
            </View>
          </LinearGradient>

          {/* ── OFFLINE BANNER ───────────────────────────────────────────── */}
          {!isConnected && (
            <View style={ss.offlineBanner}>
              <MaterialCommunityIcons name="access-point-off" size={16} color="#FF6B6B" />
              <Text style={ss.offlineText}>
                {error ?? 'ESP32 is offline. Connect via Network tab to enable live AI analysis.'}
              </Text>
            </View>
          )}

          {/* ── FIELD HEALTH SCORE ───────────────────────────────────────── */}
          {sensorData && (
            <>
              <View style={ss.section}>
                <View style={ss.scoreCard}>
                  <LinearGradient
                    colors={[`${scoreColor}14`, 'transparent']}
                    style={StyleSheet.absoluteFillObject}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  />
                  <View style={ss.scoreRow}>
                    <View>
                      <Text style={ss.scoreEye}>FIELD HEALTH SCORE</Text>
                      <View style={ss.scoreNumRow}>
                        <Text style={[ss.scoreNum, { color: scoreColor }]}>{result.score}</Text>
                        <Text style={ss.scoreOf}>/100</Text>
                      </View>
                      <Text style={ss.scoreDesc}>
                        {result.score >= 90 ? 'Excellent — field is in peak condition'
                          : result.score >= 75 ? 'Good — minor optimisations available'
                          : result.score >= 55 ? 'Fair — corrective actions recommended'
                          : result.score >= 35 ? 'Poor — multiple issues require attention'
                          : 'Critical — immediate intervention required'}
                      </Text>
                    </View>
                    <View style={[ss.gradeBadge, { backgroundColor: `${scoreColor}20`, borderColor: `${scoreColor}40` }]}>
                      <Text style={[ss.gradeText, { color: scoreColor }]}>{result.grade}</Text>
                    </View>
                  </View>
                  <ScoreBar score={result.score} color={scoreColor} />
                  <View style={ss.scoreMeta}>
                    <Text style={ss.scoreMetaText}>
                      {result.insights.filter(i => i.priority === 'critical').length} critical ·{' '}
                      {result.insights.filter(i => i.priority === 'high').length} high ·{' '}
                      {result.insights.filter(i => i.priority === 'medium').length} medium
                    </Text>
                    <Text style={ss.scoreMetaText}>
                      Updated {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              </View>

              {/* ── SENSOR METRICS STRIP ──────────────────────────────────── */}
              <View style={ss.section}>
                <Text style={ss.sectionEye}>LIVE SENSOR READINGS</Text>
                <View style={ss.metricsStrip}>
                  <MiniGauge label="TEMP"     value={result.temp}     unit="°C" min={0}  max={50}   good={[18, 30]} />
                  <View style={ss.metricDivider} />
                  <MiniGauge label="HUMIDITY" value={result.humidity} unit="%" min={0}  max={100}  good={[40, 75]} />
                  <View style={ss.metricDivider} />
                  <MiniGauge label="SOIL"     value={result.moisture} unit="%" min={0}  max={100}  good={[40, 65]} />
                  {result.co2 > 0 && <>
                    <View style={ss.metricDivider} />
                    <MiniGauge label="CO₂" value={result.co2} unit="ppm" min={400} max={3000} good={[400, 800]} />
                  </>}
                </View>
              </View>

              {/* ── IRRIGATION CALCULATOR ─────────────────────────────────── */}
              <View style={ss.section}>
                <Text style={ss.sectionEye}>IRRIGATION INTELLIGENCE</Text>
                <IrrigationCard result={result} />
              </View>

              {/* ── CRITICAL + HIGH PRIORITY INSIGHTS ────────────────────── */}
              {criticalList.length > 0 && (
                <View style={ss.section}>
                  <Text style={ss.sectionEye}>⚠ PRIORITY ACTIONS</Text>
                  {criticalList.map(insight => (
                    <InsightCard key={insight.id} insight={insight} />
                  ))}
                </View>
              )}

              {/* ── ALL OTHER INSIGHTS ────────────────────────────────────── */}
              {otherList.length > 0 && (
                <View style={ss.section}>
                  <Text style={ss.sectionEye}>DETAILED FIELD ANALYSIS</Text>
                  {otherList.map(insight => (
                    <InsightCard key={insight.id} insight={insight} />
                  ))}
                </View>
              )}
            </>
          )}

          {/* ── LOADING STATE ─────────────────────────────────────────────── */}
          {loading && !sensorData && (
            <View style={ss.loadingWrap}>
              <MaterialCommunityIcons name="brain" size={52} color={C.text3} />
              <Text style={ss.loadingTitle}>AI Engine Starting</Text>
              <Text style={ss.loadingText}>Collecting sensor data for analysis…</Text>
            </View>
          )}

          {/* ── OFFLINE EMPTY STATE ──────────────────────────────────────── */}
          {!isConnected && !sensorData && !loading && (
            <View style={ss.emptyWrap}>
              <MaterialCommunityIcons name="robot-off-outline" size={72} color={C.text3} />
              <Text style={ss.emptyTitle}>No Data Available</Text>
              <Text style={ss.emptyText}>
                Connect your ESP32 via the{' '}
                <Text style={{ color: C.green, fontWeight: '700' }}>NETWORK</Text>
                {' '}tab to unlock live AI field analysis, irrigation recommendations, and threat detection.
              </Text>
            </View>
          )}

          <View style={{ height: 110 }} />
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 0 },

  // ── Header ──────────────────────────────────────────────────────────────
  headerGrad: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24, marginBottom: 4 },
  headerRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerEye:  { fontSize: 9, fontWeight: '800', color: C.text2, letterSpacing: 2.5, marginBottom: 6 },
  headerTitle: { fontSize: 36, fontWeight: '900', color: C.text1, letterSpacing: 0.3 },
  headerSub:   { fontSize: 12, color: C.text2, marginTop: 6, letterSpacing: 0.3 },
  headerRight: { alignItems: 'center', gap: 4, paddingTop: 4 },
  liveDot:    { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: C.green },
  liveDotCore:{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.green },
  liveLabel:  { fontSize: 10, fontWeight: '800', letterSpacing: 2, marginTop: 4 },

  // ── Offline banner ───────────────────────────────────────────────────────
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 20, marginBottom: 12,
    backgroundColor: '#200808', borderRadius: 12,
    borderWidth: 1, borderColor: '#FF444440',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  offlineText: { color: '#FF9999', fontSize: 12, flex: 1, lineHeight: 18 },

  // ── Section wrapper ──────────────────────────────────────────────────────
  section: { paddingHorizontal: 20, marginBottom: 16, gap: 10 },
  sectionEye: {
    fontSize: 9, fontWeight: '800', color: C.text3, letterSpacing: 2.5,
    textTransform: 'uppercase',
  },

  // ── Score card ───────────────────────────────────────────────────────────
  scoreCard: {
    backgroundColor: C.card, borderRadius: 20,
    borderWidth: 1, borderColor: C.border,
    padding: 20, overflow: 'hidden', gap: 14,
  },
  scoreRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  scoreEye:    { fontSize: 9, fontWeight: '800', color: C.text2, letterSpacing: 2.2, marginBottom: 6 },
  scoreNumRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  scoreNum:    { fontSize: 64, fontWeight: '900', letterSpacing: -2, lineHeight: 68 },
  scoreOf:     { fontSize: 18, color: C.text2, fontWeight: '600' },
  scoreDesc:   { fontSize: 12, color: C.text2, marginTop: 6, lineHeight: 18 },
  gradeBadge: {
    width: 64, height: 64, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  gradeText: { fontSize: 34, fontWeight: '900' },
  barBg:    { height: 6, backgroundColor: '#1A2220', borderRadius: 3, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 3 },
  scoreMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  scoreMetaText: { fontSize: 10, color: C.text3 },

  // ── Metrics strip ────────────────────────────────────────────────────────
  metricsStrip: {
    backgroundColor: C.card, borderRadius: 16,
    borderWidth: 1, borderColor: C.border,
    flexDirection: 'row', padding: 16, gap: 0,
  },
  miniGauge:    { flex: 1, gap: 5 },
  miniLabel:    { fontSize: 8, fontWeight: '800', color: C.text2, letterSpacing: 2 },
  miniValue:    { fontSize: 18, fontWeight: '900' },
  miniBarBg:    { height: 3, backgroundColor: '#1A2220', borderRadius: 2, overflow: 'hidden' },
  miniBarFill:  { height: '100%', borderRadius: 2 },
  miniRange:    { fontSize: 9, color: C.text3 },
  metricDivider: { width: 1, backgroundColor: C.border, marginHorizontal: 12 },

  // ── Irrigation card ──────────────────────────────────────────────────────
  irrCard: {
    backgroundColor: C.card, borderRadius: 18,
    borderWidth: 1, padding: 18, gap: 12, overflow: 'hidden',
  },
  irrHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  irrTitle:      { fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  irrRow:        { flexDirection: 'row', gap: 8 },
  irrStat:       { flex: 1, gap: 4 },
  irrStatLabel:  { fontSize: 8, fontWeight: '800', color: C.text2, letterSpacing: 1.8 },
  irrStatValue:  { fontSize: 22, fontWeight: '900', color: C.text1 },
  irrWindowText: { fontSize: 12, fontWeight: '700', lineHeight: 17 },
  irrDivider:    { height: 1, backgroundColor: C.border },
  irrTip: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#1C1804', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  irrTipText: { flex: 1, fontSize: 11, color: '#B8A050', lineHeight: 17 },

  // ── Insight card ─────────────────────────────────────────────────────────
  insightCard: {
    borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 10, gap: 12, padding: 16,
  },
  insightAccent:  { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  insightHeader:  { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  insightIconWrap:{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  insightTitle:   { fontSize: 14, fontWeight: '900', letterSpacing: 0.3, marginBottom: 5 },
  insightBadgeRow:{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  timingBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  timingText:     { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  valueBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#FFFFFF0A' },
  valueText:      { fontSize: 10, fontWeight: '800' },
  insightFinding: { fontSize: 13, color: '#B8C9BC', lineHeight: 20 },
  impactBox: {
    borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 4,
    backgroundColor: '#FFFFFF06', borderRadius: 4,
  },
  impactText:   { fontSize: 12, color: '#E8C8A0', lineHeight: 18, fontStyle: 'italic' },
  stepsWrap:    { gap: 8 },
  stepsHeader:  { fontSize: 9, fontWeight: '900', letterSpacing: 2, marginBottom: 2 },
  stepRow:      { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepDot:      { width: 6, height: 6, borderRadius: 3, marginTop: 6, flexShrink: 0 },
  stepText:     { flex: 1, fontSize: 13, color: C.text1, lineHeight: 20 },
  rangeHint:    { fontSize: 10, color: C.text2, borderTopWidth: 1, borderTopColor: '#FFFFFF08', paddingTop: 8 },

  // ── Loading / empty states ───────────────────────────────────────────────
  loadingWrap: { alignItems: 'center', paddingVertical: 60, gap: 16, paddingHorizontal: 40 },
  loadingTitle:{ fontSize: 22, fontWeight: '800', color: C.text2 },
  loadingText: { fontSize: 13, color: C.text3, textAlign: 'center', lineHeight: 20 },
  emptyWrap:   { alignItems: 'center', paddingVertical: 60, gap: 16, paddingHorizontal: 40 },
  emptyTitle:  { fontSize: 22, fontWeight: '800', color: C.text2 },
  emptyText:   { fontSize: 13, color: C.text3, textAlign: 'center', lineHeight: 20 },
});
