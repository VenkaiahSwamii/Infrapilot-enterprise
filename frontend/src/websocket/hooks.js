import { useEffect, useRef } from 'react';
import { wsClientInstance } from './client.js';
import { useServerStore } from '../store/serverStore.jsx';
import { useAlertStore } from '../store/alertStore.jsx';
import { useDashboardStore } from '../store/dashboardStore.jsx';
import { getWebSocketUrl } from './liveEvents.js';

export function useWebSocketConnection() {
  const { updateServerMetrics, fetchServers } = useServerStore();
  const { addAlert, resolveAlert } = useAlertStore();
  const {
    setWsStatus,
    setWsLatency,
    setWsEventsPerSec,
    setWsReconnects,
    addToast
  } = useDashboardStore();

  const prevStatus = useRef('Disconnected');

  // Keep references to the latest callbacks so we don't need them in the connect useEffect dependency array
  const callbacksRef = useRef({});
  callbacksRef.current = {
    updateServerMetrics,
    fetchServers,
    addAlert,
    resolveAlert,
    setWsStatus,
    setWsLatency,
    setWsEventsPerSec,
    setWsReconnects,
    addToast,
  };

  const recentToastsRef = useRef(new Map());

  const dispatchToast = (type, title, messageText) => {
    const key = `${type}:${title}:${messageText}`;
    const now = Date.now();
    const lastTime = recentToastsRef.current.get(key) || 0;
    if (now - lastTime < 15000) {
      // Suppress identical toast within 15 seconds
      return;
    }
    recentToastsRef.current.set(key, now);
    if (recentToastsRef.current.size > 50) {
      for (const [k, t] of recentToastsRef.current.entries()) {
        if (now - t > 30000) recentToastsRef.current.delete(k);
      }
    }
    callbacksRef.current.addToast(type, title, messageText);
  };

  useEffect(() => {
    wsClientInstance.onStatusChangeCallback = (status) => {
      callbacksRef.current.setWsStatus(status);
      if (status !== prevStatus.current) {
        if (status === 'Connected') {
          dispatchToast('success', 'System Connected', 'WebSocket connection established successfully.');
        } else {
          dispatchToast('warning', 'System Offline', 'Lost connection to backend. Retrying...');
        }
        prevStatus.current = status;
      }
    };

    wsClientInstance.onStatsChangeCallback = (stats) => {
      if (stats.latency !== undefined) callbacksRef.current.setWsLatency(stats.latency);
      if (stats.eventsPerSec !== undefined) callbacksRef.current.setWsEventsPerSec(stats.eventsPerSec);
      if (stats.reconnects !== undefined) callbacksRef.current.setWsReconnects(stats.reconnects);
    };

    wsClientInstance.onMetricsUpdateCallback = (message) => {
      const { updateServerMetrics, addAlert, resolveAlert, fetchServers } = callbacksRef.current;
      if (message.event) {
        const payload = message.payload;
        if (message.event === 'metric.updated') {
          updateServerMetrics(message.server_id, payload);
        } else if (message.event === 'alert.created') {
          addAlert(payload);
          dispatchToast(
            payload.severity === 'Critical' ? 'critical' : 'warning',
            `🚨 Alert: ${payload.title}`,
            `Server: ${payload.hostname || 'Unknown'} - ${payload.description}`
          );
        } else if (message.event === 'alert.resolved') {
          resolveAlert(payload.id);
          // Silent resolution: updates store and clears badges without popping toast banners
        } else if (message.event === 'alert.updated') {
          // Silent telemetry update for existing active alert: update in store without popping toast
          addAlert(payload);
        } else if (message.event === 'server.online') {
          fetchServers();
          dispatchToast('success', 'Server Online', `Server ${payload.hostname} is now online.`);
        } else if (message.event === 'server.offline') {
          fetchServers();
          dispatchToast('warning', 'Server Offline', `Server ${payload.hostname} has gone offline.`);
        }
      } else {
        if (message.type === 'metrics_update') {
          updateServerMetrics(message.machine_id, message);
        } else if (message.type === 'alert_update') {
          // Silent telemetry update: no toast
          addAlert(message);
        } else if (message.type === 'alert') {
          if (message.status === 'RESOLVED') {
            resolveAlert(message.id);
            // Silent resolution: updates store and clears badges without popping toast banners
          } else {
            addAlert(message);
            dispatchToast(
              message.severity === 'Critical' ? 'critical' : 'warning',
              `🚨 Alert: ${message.title || 'System Alert'}`,
              `Server: ${message.hostname || 'Unknown'} - ${message.description || message.message || 'Alert threshold triggered.'}`
            );
          }
        } else if (message.type === 'machine_status_changed' || message.type === 'machine_status') {
          fetchServers();
        }
      }
    };

    const wsUrlWithAuth = getWebSocketUrl();
    wsClientInstance.connect(wsUrlWithAuth);

    return () => {
      wsClientInstance.disconnect();
    };
  }, []);
}

export function useRoomSubscription(room) {
  useEffect(() => {
    if (room) {
      wsClientInstance.subscribe(room);
      return () => {
        wsClientInstance.unsubscribe(room);
      };
    }
  }, [room]);
}
