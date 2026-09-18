import React, { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { listServers } from '../api/server.js';
import { getMachineId, isSameMachine } from '../utils/machineId.js';

const ServerStoreContext = createContext(null);

const stringsEqualFold = (a, b) =>
  String(a || '').toLowerCase().trim() === String(b || '').toLowerCase().trim();

// Universal deduplicator preventing duplicate rows for the same machine ID or IP
function deduplicateServers(serverList) {
  if (!Array.isArray(serverList)) return [];
  const seen = new Set();
  const result = [];
  for (const s of serverList) {
    const key = s.id || getMachineId(s);
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(s);
    }
  }
  return result;
}

export function ServerStoreProvider({ children }) {
  const [servers, setServers] = useState([]);
  const [liveMetricsMap, setLiveMetricsMap] = useState({});
  const [telemetryHistoryMap, setTelemetryHistoryMap] = useState({});
  const [selectedServerId, setSelectedServerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const lastUpdatedRef = useRef({});

  // Auto-select first active or online server if no selection
  useEffect(() => {
    if (servers.length > 0) {
      const exists = servers.some((s) => {
        const sId = String(s.id || s.ID || s.machine_id || '').toLowerCase();
        const curId = String(selectedServerId).toLowerCase();
        return sId === curId || getMachineId(s).toLowerCase() === curId;
      });

      if (!selectedServerId || !exists) {
        const onlineServer = servers.find((s) => {
          const st = String(s.status || s.Status || '').toUpperCase();
          return st === 'ONLINE' || s.online === true;
        });
        const defaultServer = onlineServer || servers[0];
        const defaultId = defaultServer.id || defaultServer.ID || getMachineId(defaultServer);
        setSelectedServerId(String(defaultId));
      }
    }
  }, [servers, selectedServerId]);

  // Derived selected server object
  const selectedServer = React.useMemo(() => {
    if (!servers || servers.length === 0) return null;
    if (!selectedServerId) return servers[0] || null;
    const curId = String(selectedServerId).toLowerCase();
    return (
      servers.find((s) => {
        const sId = String(s.id || s.ID || s.machine_id || '').toLowerCase();
        return sId === curId || getMachineId(s).toLowerCase() === curId || String(s.hostname || '').toLowerCase() === curId;
      }) || servers[0] || null
    );
  }, [servers, selectedServerId]);

  // Fetch real servers strictly from backend DB
  const fetchServers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const incomingData = await listServers();

      if (!Array.isArray(incomingData)) {
        return;
      }

      if (incomingData.length === 0) {
        setServers([]);
        return;
      }

      setServers((prevServers) => {
        const formatted = incomingData.map((fresh) => {
          const existing = (prevServers || []).find((p) => isSameMachine(p, fresh));
          return {
            ...(existing || {}),
            ...fresh,
            _store_id: getMachineId(fresh),
            status: fresh.status || (existing && existing.status) || 'ONLINE',
            last_seen: fresh.last_seen
              ? new Date(fresh.last_seen).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true,
                })
              : (existing && existing.last_seen) || 'Just now',
          };
        });
        return deduplicateServers(formatted);
      });
    } catch (err) {
      console.error('Failed to query backend servers:', err);
      setError(err.message || 'Failed to load servers');
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll real servers from backend DB periodically
  useEffect(() => {
    fetchServers();
    const interval = setInterval(fetchServers, 8000);
    return () => clearInterval(interval);
  }, [fetchServers]);

  // Handle incoming real-time telemetry from WebSocket
  const updateServerMetrics = useCallback((targetServerId, rawMetrics) => {
    if (!rawMetrics) return;

    const normalizedId = getMachineId(rawMetrics);
    if (!normalizedId) return;

    const timestamp = rawMetrics.created_at || rawMetrics.timestamp || new Date().toISOString();
    const timestampMs = new Date(timestamp).getTime() || Date.now();

    if (lastUpdatedRef.current[normalizedId] && timestampMs < lastUpdatedRef.current[normalizedId]) {
      return;
    }
    lastUpdatedRef.current[normalizedId] = timestampMs;

    const formattedTime = new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    const normalizedMetric = {
      cpu_usage: Number(rawMetrics.cpu_usage ?? rawMetrics.cpu ?? 0),
      memory_usage: Number(rawMetrics.memory_usage ?? rawMetrics.memory_percent ?? rawMetrics.memory ?? 0),
      disk_usage: Number(rawMetrics.disk_usage ?? rawMetrics.disk_percent ?? rawMetrics.disk ?? 0),
      upload_mbps: Number(rawMetrics.upload_mbps ?? rawMetrics.upload ?? 0),
      download_mbps: Number(rawMetrics.download_mbps ?? rawMetrics.download ?? 0),
      latency_ms: Number(rawMetrics.latency_ms ?? rawMetrics.latency ?? 12),
      created_at: timestamp,
      formatted_time: formattedTime,
    };

    setLiveMetricsMap((prev) => ({
      ...prev,
      [normalizedId]: normalizedMetric,
    }));

    setTelemetryHistoryMap((prev) => {
      const existing = prev[normalizedId] || [];
      const updatedHistory = [...existing, normalizedMetric].slice(-180);
      return {
        ...prev,
        [normalizedId]: updatedHistory,
      };
    });

    // Update machine record in-place by robust identity
    setServers((prevServers) => {
      const existingIndex = prevServers.findIndex((s) => {
        return (
          (s.id && rawMetrics.id && s.id === rawMetrics.id) ||
          getMachineId(s) === normalizedId ||
          (rawMetrics.ip_address && s.ip_address === rawMetrics.ip_address) ||
          (rawMetrics.hostname && stringsEqualFold(s.hostname, rawMetrics.hostname) && rawMetrics.os && stringsEqualFold(s.os, rawMetrics.os))
        );
      });

      if (existingIndex !== -1) {
        return prevServers.map((s, idx) => {
          if (idx === existingIndex) {
            return {
              ...s,
              cpu_usage: normalizedMetric.cpu_usage,
              memory_usage: normalizedMetric.memory_usage,
              disk_usage: normalizedMetric.disk_usage,
              upload_mbps: normalizedMetric.upload_mbps,
              download_mbps: normalizedMetric.download_mbps,
              latency_ms: normalizedMetric.latency_ms,
              last_seen: formattedTime,
              status: 'ONLINE',
            };
          }
          return s;
        });
      }

      // Only add if truly a new distinct hostname
      const newEntry = {
        id: normalizedId,
        hostname: rawMetrics.hostname || normalizedId,
        ip_address: rawMetrics.ip_address || '--',
        os: rawMetrics.os || '--',
        status: 'ONLINE',
        cpu_usage: normalizedMetric.cpu_usage,
        memory_usage: normalizedMetric.memory_usage,
        disk_usage: normalizedMetric.disk_usage,
        upload_mbps: normalizedMetric.upload_mbps,
        download_mbps: normalizedMetric.download_mbps,
        latency_ms: normalizedMetric.latency_ms,
        last_seen: formattedTime,
      };

      return deduplicateServers([...prevServers, newEntry]);
    });
  }, []);

  return (
    <ServerStoreContext.Provider
      value={{
        servers,
        liveMetricsMap,
        telemetryHistoryMap,
        loading,
        error,
        selectedServerId,
        setSelectedServerId,
        selectedServer,
        fetchServers,
        updateServerMetrics,
      }}
    >
      {children}
    </ServerStoreContext.Provider>
  );
}

export function useServerStore() {
  const context = useContext(ServerStoreContext);
  if (!context) throw new Error('useServerStore must be used within ServerStoreProvider');
  return context;
}
