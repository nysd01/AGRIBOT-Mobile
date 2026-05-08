import { useEffect, useState, useCallback } from 'react';
import * as Network from 'expo-network';

export interface NetworkInfo {
  ip?: string;
  ssid?: string;
  broadcast?: string;
  gateway?: string;
  netmask?: string;
  dns1?: string;
  dns2?: string;
}

export interface WiFiNetwork {
  ssid: string;
  signal: number;
  level: number;
}

export function useNetworkInfo() {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchNetworkInfo = useCallback(async () => {
    try {
      setLoading(true);
      
      // Check if Network API is available
      if (!Network || typeof Network.getNetworkStateAsync !== 'function') {
        console.warn('Network API not available');
        setNetworkInfo(null);
        return;
      }
      
      const info = await Network.getNetworkStateAsync();
      
      if (info.isConnected && info.type === Network.NetworkStateType.WIFI) {
        const ipAddress = await Network.getIpAddressAsync();
        setNetworkInfo({
          ip: ipAddress,
          ssid: info.details?.ssid || undefined,
        });
      } else {
        setNetworkInfo(null);
      }
    } catch (error) {
      console.error('Error fetching network info:', error);
      setNetworkInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNetworkInfo();
    // Refresh network info every 5 seconds
    const interval = setInterval(fetchNetworkInfo, 5000);
    return () => clearInterval(interval);
  }, [fetchNetworkInfo]);

  return {
    networkInfo,
    loading,
    refetch: fetchNetworkInfo,
  };
}

export function useESP32Connection() {
  const [espIP, setEspIP] = useState<string>('192.168.4.1');
  const [isConnectedToESP, setIsConnectedToESP] = useState(false);
  const [espName, setEspName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const checkESP32Availability = useCallback(async (ip: string = espIP) => {
    try {
      const response = await fetch(`http://${ip}/health`, {
        method: 'GET',
        timeout: 3000,
      });

      if (response.ok) {
        const data = await response.json();
        setIsConnectedToESP(true);
        setEspName(data.name || 'AGRIBOT-ESP');
        setEspIP(ip);
        setError(null);
        return true;
      }
    } catch (err) {
      setIsConnectedToESP(false);
      setError(err instanceof Error ? err.message : 'Unable to connect to ESP32');
    }
    return false;
  }, [espIP]);

  return {
    espIP,
    isConnectedToESP,
    espName,
    error,
    checkConnection: checkESP32Availability,
  };
}
