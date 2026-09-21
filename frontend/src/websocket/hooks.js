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

  useEffect(() => {
    wsClientInstance.onStatusChangeCallback = (status) => {
      callbacksRef.current.setWsStatus(status);
      if (status !== prevStatus.current) {
        if (status === 'Connected') {
          callbacksRef.current.addToast('success', 'System Connected', 'WebSocket connection established successfully.');
        } else {
          callbacksRef.current.addToast('warning', 'System Offline', 'Lost connection to backend. Retrying...');
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
      const { updateServerMetrics, addAlert, resolveAlert, addToast, fetchServers } = callbacksRef.current;
      if (message.event) {
        const payload = message.payload;
        if (message.event === 'metric.updated') {
          updateServerMetrics(message.server_id, payload);
        } else if (message.event === 'alert.created') {
          addAlert(payload);
          addToast(
            payload.severity === 'Critical' ? 'critical' : 'warning',
            `🚨 Alert: ${payload.title}`,
            `Server: ${payload.hostname || 'Unknown'} - ${payload.description}`
          );
        } else if (message.event === 'alert.resolved') {
          resolveAlert(payload.id);
          addToast(
            'success',
            `✅ Resolved: ${payload.title}`,
            `Server: ${payload.hostname || 'Unknown'} has returned to normal.`
          );
        } else if (message.event === 'server.online') {
          fetchServers();
          addToast('success', 'Server Online', `Server ${payload.hostname} is now online.`);
        } else if (message.event === 'server.offline') {
          fetchServers();
          addToast('warning', 'Server Offline', `Server ${payload.hostname} has gone offline.`);
        }
      } else {
        if (message.type === 'metrics_update') {
          updateServerMetrics(message.machine_id, message);
        } else if (message.type === 'alert') {
          if (message.status === 'RESOLVED') {
            resolveAlert(message.id);
            addToast(
              'success',
              `✅ Resolved: ${message.title || 'System Alert'}`,
              `Server: ${message.hostname || 'Unknown'} has returned to normal.`
            );
          } else {
            addAlert(message);
            addToast(
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
