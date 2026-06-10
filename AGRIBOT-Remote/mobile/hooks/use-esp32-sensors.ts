import { useState, useEffect, useCallback } from 'react';
import * as Network from 'expo-network';

export interface SensorData {
  // Domino4 I2C Sensors (Real-time, xChips standard)
  domino4?: {
    weather?: {
      temperatureC: number;
      humidityPct: number;
      source: string;
    };
    light?: {
      luxLevel: number;
      uvIndex: number;
      source: string;
    };
    soil?: {
      moisturePct: number;
      rawTouch: number;
      source: string;
    };
    display?: {
      active: boolean;
      source: string;
    };
  };
  
  // Legacy ADC sensors
  adc?: {
    temperatureC: number;
    humidityPct: number;
    soilMoisturePct: number;
    ph: number;
    batteryPct: number;
  };
  
  // Air Quality (optional)
  airQuality?: {
    co2Ppm: number;
    tvocPpb: number;
  };
  
  // Location
  location?: {
    gps?: {
      lat: number;
      lng: number;
    };
  };
  
  camera?: {
    streaming: boolean;
  };
  
  // System info
  systemInfo?: {
    i2cReady: boolean;
    sht3xReady: boolean;
    oledReady: boolean;
    uptimeSeconds: number;
  };
  
  // Legacy fields for backward compatibility
  temperatureC?: number;
  humidityPct?: number;
  soilMoisturePct?: number;
  batteryPct?: number;
  ph?: number;
  gps?: {
    lat: number;
    lng: number;
  };
  raw?: {
    temperatureAdc: number;
    humidityAdc: number;
    soilAdc: number;
    phAdc: number;
    batteryAdc: number;
  };
  voltage?: {
    temperatureV: number;
    humidityV: number;
    soilV: number;
    phV: number;
    batteryPinV: number;
    batteryPackV: number;
  };
}

export interface ESP32Health {
  status: string;
  name: string;
  ip: string;
  uptimeMs: number;
  service: string;
}

export interface UseESP32SensorsOptions {
  esp32Ip?: string;
  pollInterval?: number; // ms
  autoStart?: boolean;
}

export function useESP32Sensors(options: UseESP32SensorsOptions = {}) {
  const {
    esp32Ip = '192.168.4.1', // Default AP IP
    pollInterval = 2000,
    autoStart = true,
  } = options;

  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [health, setHealth] = useState<ESP32Health | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const fetchSensorData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      try {
        const response = await fetch(`http://${esp32Ip}/sensors`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as SensorData;
        setSensorData(data);
        setIsConnected(true);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch sensor data';
      setError(errorMsg);
      setIsConnected(false);
      console.error('ESP32 Sensor Error:', errorMsg);
    } finally {
      setLoading(false);
    }
  }, [esp32Ip]);

  const fetchHealth = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      try {
        const response = await fetch(`http://${esp32Ip}/health`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as ESP32Health;
        setHealth(data);
        setIsConnected(true);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch health';
      console.error('ESP32 Health Error:', errorMsg);
      setIsConnected(false);
    }
  }, [esp32Ip]);

  const checkESP32Connection = useCallback(async () => {
    try {
      await fetchHealth();
    } catch {
      setIsConnected(false);
    }
  }, [fetchHealth]);

  useEffect(() => {
    if (!autoStart) return;

    // Initial fetch
    fetchSensorData();
    checkESP32Connection();

    // Set up polling
    const pollInterval_ = setInterval(() => {
      fetchSensorData();
    }, pollInterval);

    return () => clearInterval(pollInterval_);
  }, [autoStart, fetchSensorData, checkESP32Connection, pollInterval]);

  return {
    sensorData,
    health,
    loading,
    error,
    isConnected,
    refetch: fetchSensorData,
    checkConnection: checkESP32Connection,
  };
}
