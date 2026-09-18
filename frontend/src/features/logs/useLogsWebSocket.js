import { useState, useEffect, useRef, useCallback } from 'react';
import { getWebSocketUrl } from '../../websocket/liveEvents.js';

export function useLogsWebSocket(wsUrl = null) {
  const [liveLogs, setLiveLogs] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const wsRef = useRef(null);
  const isPausedRef = useRef(isPaused);

  if (!wsUrl) {
    wsUrl = getWebSocketUrl('/api/v1/ws/logs');
  }

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const connect = useCallback(() => {
    try {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setIsConnected(true);
      };

      socket.onmessage = (event) => {
        if (isPausedRef.current) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload.event === 'log_entry' && payload.data) {
            setLiveLogs((prev) => [payload.data, ...prev.slice(0, 499)]);
          }
        } catch (e) {
          // Ignore non-JSON or unrelated WS messages
        }
      };

      socket.onclose = () => {
        setIsConnected(false);
        // Auto-reconnect after 3 seconds
        setTimeout(connect, 3000);
      };

      socket.onerror = () => {
        setIsConnected(false);
      };
    } catch (err) {
      setIsConnected(false);
    }
  }, [wsUrl]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const clearLiveLogs = useCallback(() => {
    setLiveLogs([]);
  }, []);

  return {
    liveLogs,
    isConnected,
    isPaused,
    togglePause,
    clearLiveLogs,
  };
}
