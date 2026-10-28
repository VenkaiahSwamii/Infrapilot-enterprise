import React, { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import {
  listAlerts,
  getAlertStats,
  acknowledgeAlert as apiAcknowledgeAlert,
  resolveAlert as apiResolveAlert,
  silenceAlert as apiSilenceAlert,
  bulkAcknowledgeAlerts as apiBulkAcknowledgeAlerts,
  bulkResolveAlerts as apiBulkResolveAlerts,
  purgeResolvedAlerts as apiPurgeResolvedAlerts,
  cleanupDuplicateAlerts as apiCleanupDuplicates,
} from '../api/alerts.js';

const AlertStoreContext = createContext(null);

export function AlertStoreProvider({ children }) {
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({
    total_active: 0,
    critical_p1: 0,
    major_p2: 0,
    warning_p3: 0,
    info_p4: 0,
    acknowledged: 0,
    silenced: 0,
    resolved_today: 0,
    total_resolved: 0,
    avg_mttr_min: 4.2,
    health_score: 100,
    event_alerts: 0,
    rule_alerts: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const data = await getAlertStats();
      if (data && typeof data.total_active === 'number') {
        setStats(data);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchAlerts = useCallback(async (params = { status: 'all', limit: 300 }) => {
    try {
      setLoading(true);
      setError(null);
      const [alertsData, statsData] = await Promise.all([
        listAlerts(params).catch(() => []),
        getAlertStats().catch(() => null),
      ]);
      setAlerts(Array.isArray(alertsData) ? alertsData : []);
      if (statsData && typeof statsData.total_active === 'number') {
        setStats(statsData);
      }
    } catch (err) {
      setError(err.message || 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const timer = setInterval(() => {
      fetchStats();
    }, 12000);
    return () => clearInterval(timer);
  }, [fetchAlerts, fetchStats]);

  const activeAlerts = useMemo(() => {
    return alerts.filter((a) => {
      const s = (a.status || 'ACTIVE').toUpperCase();
      return s === 'OPEN' || s === 'ACTIVE';
    });
  }, [alerts]);

  const activeCount = useMemo(() => {
    if (typeof stats.total_active === 'number' && stats.total_active >= 0) {
      return stats.total_active;
    }
    return activeAlerts.length;
  }, [stats.total_active, activeAlerts.length]);

  const criticalCount = useMemo(() => {
    if (typeof stats.critical_p1 === 'number' && stats.critical_p1 >= 0) {
      return stats.critical_p1;
    }
    return activeAlerts.filter(
      (a) => (a.severity || '').toLowerCase() === 'critical' || a.priority === 'P1'
    ).length;
  }, [stats.critical_p1, activeAlerts]);

  const addAlert = useCallback((incoming) => {
    if (!incoming) return;
    const raw = incoming.payload || incoming.alert || incoming;
    const id = raw.id || raw.ID;

    setAlerts((prev) => {
      const index = prev.findIndex((a) => (a.id || a.ID) === id);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = { ...updated[index], ...raw, updated_at: new Date().toISOString() };
        return updated;
      }
      return [{ ...raw, status: raw.status || 'ACTIVE' }, ...prev];
    });

    setStats((prev) => ({
      ...prev,
      total_active: prev.total_active + 1,
      critical_p1: (raw.severity || '').toLowerCase() === 'critical' || raw.priority === 'P1'
        ? prev.critical_p1 + 1
        : prev.critical_p1,
    }));

    fetchStats();
  }, [fetchStats]);

  const acknowledgeAlert = useCallback(async (alertId) => {
    try {
      await apiAcknowledgeAlert(alertId);
      setAlerts((prev) =>
        prev.map((a) =>
          (a.id || a.ID) === alertId
            ? { ...a, status: 'ACKNOWLEDGED', acknowledged_by: 'Operator', updated_at: new Date().toISOString() }
            : a
        )
      );
      setStats((prev) => ({
        ...prev,
        total_active: Math.max(0, prev.total_active - 1),
        acknowledged: prev.acknowledged + 1,
      }));
      fetchStats();
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
      throw err;
    }
  }, [fetchStats]);

  const resolveAlert = useCallback(async (alertId, resolutionNote = 'Resolved manually') => {
    try {
      await apiResolveAlert(alertId, resolutionNote);
      setAlerts((prev) =>
        prev.map((a) =>
          (a.id || a.ID) === alertId
            ? {
                ...a,
                status: 'RESOLVED',
                resolved_by: 'Operator',
                resolution_note: resolutionNote,
                resolved_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }
            : a
        )
      );
      setStats((prev) => ({
        ...prev,
        total_active: Math.max(0, prev.total_active - 1),
        resolved_today: prev.resolved_today + 1,
        total_resolved: prev.total_resolved + 1,
      }));
      fetchStats();
    } catch (err) {
      console.error('Failed to resolve alert:', err);
      throw err;
    }
  }, [fetchStats]);

  const silenceAlert = useCallback(async (alertId, durationMinutes = 60, reason = 'Scheduled maintenance') => {
    try {
      await apiSilenceAlert(alertId, durationMinutes, reason);
      setAlerts((prev) =>
        prev.map((a) =>
          (a.id || a.ID) === alertId
            ? { ...a, status: 'SILENCED', updated_at: new Date().toISOString() }
            : a
        )
      );
      setStats((prev) => ({
        ...prev,
        total_active: Math.max(0, prev.total_active - 1),
        silenced: prev.silenced + 1,
      }));
      fetchStats();
    } catch (err) {
      console.error('Failed to silence alert:', err);
      throw err;
    }
  }, [fetchStats]);

  const bulkAcknowledge = useCallback(async (ids, allActive = false) => {
    try {
      await apiBulkAcknowledgeAlerts({ ids, all_active: allActive });
      setAlerts((prev) =>
        prev.map((a) => {
          const aId = a.id || a.ID;
          if (allActive ? ((a.status || '').toUpperCase() === 'OPEN' || (a.status || '').toUpperCase() === 'ACTIVE') : ids.includes(aId)) {
            return { ...a, status: 'ACKNOWLEDGED', updated_at: new Date().toISOString() };
          }
          return a;
        })
      );
      fetchStats();
    } catch (err) {
      console.error('Failed to bulk acknowledge alerts:', err);
      throw err;
    }
  }, [fetchStats]);

  const bulkResolve = useCallback(async (ids, allActive = false, resolutionNote = 'Bulk resolved') => {
    try {
      await apiBulkResolveAlerts({ ids, all_active: allActive, resolution_note: resolutionNote });
      setAlerts((prev) =>
        prev.map((a) => {
          const aId = a.id || a.ID;
          const isTarget = allActive
            ? ((a.status || '').toUpperCase() === 'OPEN' || (a.status || '').toUpperCase() === 'ACTIVE' || (a.status || '').toUpperCase() === 'ACKNOWLEDGED')
            : ids.includes(aId);
          if (isTarget) {
            return {
              ...a,
              status: 'RESOLVED',
              resolved_at: new Date().toISOString(),
              resolution_note: resolutionNote,
              updated_at: new Date().toISOString(),
            };
          }
          return a;
        })
      );
      if (allActive) {
        setStats((prev) => ({
          ...prev,
          total_active: 0,
          critical_p1: 0,
          major_p2: 0,
          warning_p3: 0,
          info_p4: 0,
          total_resolved: prev.total_resolved + prev.total_active,
        }));
      }
      fetchStats();
    } catch (err) {
      console.error('Failed to bulk resolve alerts:', err);
      throw err;
    }
  }, [fetchStats]);

  const resolveAllActive = useCallback(async (resolutionNote = 'Resolved all active alerts') => {
    return bulkResolve([], true, resolutionNote);
  }, [bulkResolve]);

  const acknowledgeAllActive = useCallback(async () => {
    return bulkAcknowledge([], true);
  }, [bulkAcknowledge]);

  const purgeResolved = useCallback(async () => {
    try {
      await apiPurgeResolvedAlerts();
      setAlerts((prev) => prev.filter((a) => (a.status || '').toUpperCase() !== 'RESOLVED'));
      fetchStats();
    } catch (err) {
      console.error('Failed to purge resolved alerts:', err);
      throw err;
    }
  }, [fetchStats]);

  const cleanupDuplicates = useCallback(async () => {
    try {
      await apiCleanupDuplicates();
      await fetchAlerts();
      await fetchStats();
    } catch (err) {
      console.error('Failed to cleanup duplicate alerts:', err);
    }
  }, [fetchAlerts, fetchStats]);

  return (
    <AlertStoreContext.Provider
      value={{
        alerts,
        stats,
        activeAlerts,
        activeCount,
        criticalCount,
        loading,
        error,
        fetchAlerts,
        fetchStats,
        addAlert,
        acknowledgeAlert,
        resolveAlert,
        silenceAlert,
        bulkAcknowledge,
        bulkResolve,
        resolveAllActive,
        acknowledgeAllActive,
        purgeResolved,
        cleanupDuplicates,
      }}
    >
      {children}
    </AlertStoreContext.Provider>
  );
}

export function useAlertStore() {
  const context = useContext(AlertStoreContext);
  if (!context) throw new Error('useAlertStore must be used within AlertStoreProvider');
  return context;
}
