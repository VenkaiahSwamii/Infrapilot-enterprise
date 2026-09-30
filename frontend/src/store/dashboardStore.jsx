import { useState, createContext, useContext, useCallback } from 'react';

const DashboardStoreContext = createContext(null);

export function DashboardStoreProvider({ children }) {
  const [range, setRange] = useState('1h');
  const [filterType, setFilterType] = useState('all');

  // WebSocket connection metrics
  const [wsStatus, setWsStatus] = useState('Disconnected');
  const [wsLatency, setWsLatency] = useState(0);
  const [wsEventsPerSec, setWsEventsPerSec] = useState(0);
  const [wsReconnects, setWsReconnects] = useState(0);

  // Live notifications / Toast system
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type, title, message) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => {
      // Keep only up to 2 existing toasts so the new one brings it to max 3
      const capped = prev.length >= 3 ? prev.slice(prev.length - 2) : prev;
      return [...capped, { id, type, title, message }];
    });
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  }, [removeToast]);

  return (
    <DashboardStoreContext.Provider
      value={{
        range,
        setRange,
        filterType,
        setFilterType,
        wsStatus,
        setWsStatus,
        wsLatency,
        setWsLatency,
        wsEventsPerSec,
        setWsEventsPerSec,
        wsReconnects,
        setWsReconnects,
        toasts,
        addToast,
        removeToast,
      }}
    >
      {children}
    </DashboardStoreContext.Provider>
  );
}

export function useDashboardStore() {
  const context = useContext(DashboardStoreContext);
  if (!context) throw new Error('useDashboardStore must be used within DashboardStoreProvider');
  return context;
}
