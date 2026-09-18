import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Network,
  Server,
  RefreshCw,
  Radio,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { getMachineMetrics } from '../api/machines.js';
import DashboardCharts from '../components/dashboard/DashboardCharts.jsx';
import { useServerStore } from '../store/serverStore.jsx';
import { getMachineId } from '../utils/machineId.js';
import ServerSelectDropdown from '../components/common/ServerSelectDropdown.jsx';

export default function LiveMetricsPage() {
  const store = useServerStore();
  const servers = store?.servers || [];
  const liveMetricsMap = store?.liveMetricsMap || {};
  const telemetryHistoryMap = store?.telemetryHistoryMap || {};
  const fetchServers = store?.fetchServers;

  const globalSelectedId = store?.selectedServerId || '';
  const setGlobalSelectedId = store?.setSelectedServerId;

  const [selectedServerId, setSelectedServerId] = useState(globalSelectedId);
  const [initialSamples, setInitialSamples] = useState([]);
  const [range, setRange] = useState('1h');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (globalSelectedId) {
      setSelectedServerId(globalSelectedId);
    }
  }, [globalSelectedId]);

  // 1. Initial Load of Servers
  useEffect(() => {
    if (typeof fetchServers === 'function') {
      fetchServers();
    }
  }, [fetchServers]);

  // 2. Filter active connected machines (or fallback to all servers)
  const connectedServers = useMemo(() => {
    if (!Array.isArray(servers) || servers.length === 0) return [];
    const active = servers.filter((s) => {
      const statusUpper = String(s.status || s.Status || '').toUpperCase();
      return statusUpper === 'ONLINE' || s.online === true;
    });
    return active.length > 0 ? active : servers;
  }, [servers]);

  // 3. Auto-select first active connected machine if none selected
  useEffect(() => {
    if (!selectedServerId && connectedServers.length > 0) {
      const activeId = getMachineId(connectedServers[0]);
      setSelectedServerId(activeId);
      if (setGlobalSelectedId) setGlobalSelectedId(activeId);
    }
  }, [connectedServers, selectedServerId, setGlobalSelectedId]);

  // 4. Fetch metrics for selected machine
  const loadMetrics = useCallback(async () => {
    if (!selectedServerId) return;
    try {
      setIsRefreshing(true);
      setLoadError(null);
      const res = await getMachineMetrics(selectedServerId, range);
      if (res && Array.isArray(res.samples)) {
        setInitialSamples(res.samples);
      }
    } catch (err) {
      console.warn('Metrics polling error:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedServerId, range]);

  useEffect(() => {
    if (selectedServerId) {
      loadMetrics();
      const timer = setInterval(loadMetrics, 3000);
      return () => clearInterval(timer);
    }
  }, [selectedServerId, loadMetrics]);

  // Derive metrics data
  const normalizedId = getMachineId(selectedServerId);
  const selectedServer =
    servers.find((s) => getMachineId(s) === normalizedId) ||
    connectedServers[0] ||
    servers[0];

  const liveMetric = liveMetricsMap[normalizedId];
  const sharedSamples = telemetryHistoryMap[normalizedId] || [];
  const displaySamples = Array.isArray(sharedSamples) && sharedSamples.length > 0 ? sharedSamples : initialSamples;

  const latestSample = displaySamples.length > 0 ? displaySamples[displaySamples.length - 1] : null;

  const currentCpu = Number(liveMetric?.cpu_usage ?? latestSample?.cpu_usage ?? selectedServer?.cpu_usage ?? 0);
  const currentRam = Number(liveMetric?.memory_usage ?? latestSample?.memory_usage ?? selectedServer?.memory_usage ?? 0);
  const currentDisk = Number(liveMetric?.disk_usage ?? latestSample?.disk_usage ?? selectedServer?.disk_usage ?? 0);

  const uploadMbps = Number(liveMetric?.upload_mbps ?? latestSample?.upload_mbps ?? 0);
  const downloadMbps = Number(liveMetric?.download_mbps ?? latestSample?.download_mbps ?? 0);
  const totalNetworkMbps = (uploadMbps + downloadMbps).toFixed(2);

  const osName = String(selectedServer?.os || selectedServer?.OS || 'linux').toLowerCase();
  const isWin = osName.includes('win');

  return (
    <div className="live-metrics-page" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', color: '#f1f5f9' }}>
      {/* 1. Header Row */}
      <div
        style={{
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity size={26} color="#06b6d4" />
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
              Live Telemetry & Performance Stream
            </h1>
          </div>
          <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px', margin: 0 }}>
            Real-time kernel telemetry, memory buffers, and bandwidth analytics streaming from your agent network.
          </p>
        </div>

        {/* Monitored Machine Selector & Refresh Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ServerSelectDropdown
            value={selectedServerId}
            onChange={(sId) => {
              setSelectedServerId(sId);
              if (setGlobalSelectedId) setGlobalSelectedId(sId);
            }}
          />

          <button
            onClick={loadMetrics}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#f8fafc',
              padding: '8px 14px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} />
            <span>Poll Stream</span>
          </button>
        </div>
      </div>

      {/* 2. Machine Specs & Connection Banner */}
      {selectedServer ? (
        <div
          style={{
            background: 'linear-gradient(90deg, rgba(6, 182, 212, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)',
            border: '1px solid rgba(6, 182, 212, 0.2)',
            borderRadius: '12px',
            padding: '14px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justify: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '8px', background: 'rgba(6, 182, 212, 0.15)', borderRadius: '8px' }}>
              <Radio size={18} color="#06b6d4" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong style={{ color: '#f8fafc', fontSize: '15px' }}>{selectedServer.hostname || 'Connected Host'}</strong>
                <span style={{ fontSize: '11px', background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                  CONNECTED & STREAMING
                </span>
              </div>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                IP: <code style={{ color: '#06b6d4' }}>{selectedServer.ip_address || '127.0.0.1'}</code> &nbsp;|&nbsp; OS: {isWin ? 'Windows Server/Host' : 'Linux Kernel'} &nbsp;|&nbsp; Machine ID: <code style={{ color: '#cbd5e1' }}>{selectedServer.id || normalizedId}</code>
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>STREAM INTERVAL</span>
              <strong style={{ fontSize: '12px', color: '#22c55e' }}>3 Seconds Real-time</strong>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: '#0d1220', border: '1px dashed #1f2e44', padding: '16px', borderRadius: '12px', marginBottom: '24px', textAlign: 'center', color: '#94a3b8' }}>
          Select an active machine above to view real-time performance telemetry.
        </div>
      )}

      {/* 3. Live Gauges Metric Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        {/* CPU Card */}
        <div style={{ background: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#06b6d4', fontSize: '12px', fontWeight: 600 }}>
            <span>CPU UTILIZATION</span>
            <Cpu size={16} />
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#f1f5f9', marginTop: '8px' }}>
            {isNaN(currentCpu) ? '0.0' : currentCpu.toFixed(1)}%
          </div>
          <div style={{ height: '6px', background: '#1e293b', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, Math.max(0, currentCpu))}%`,
                height: '100%',
                background: currentCpu > 80 ? '#ef4444' : currentCpu > 60 ? '#f59e0b' : '#06b6d4',
                transition: 'width 0.4s ease-in-out',
              }}
            />
          </div>
        </div>

        {/* Memory Card */}
        <div style={{ background: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a855f7', fontSize: '12px', fontWeight: 600 }}>
            <span>MEMORY USAGE</span>
            <HardDrive size={16} />
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#f1f5f9', marginTop: '8px' }}>
            {isNaN(currentRam) ? '0.0' : currentRam.toFixed(1)}%
          </div>
          <div style={{ height: '6px', background: '#1e293b', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, Math.max(0, currentRam))}%`,
                height: '100%',
                background: currentRam > 85 ? '#ef4444' : '#a855f7',
                transition: 'width 0.4s ease-in-out',
              }}
            />
          </div>
        </div>

        {/* Disk Card */}
        <div style={{ background: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#eab308', fontSize: '12px', fontWeight: 600 }}>
            <span>DISK CAPACITY</span>
            <HardDrive size={16} />
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#f1f5f9', marginTop: '8px' }}>
            {isNaN(currentDisk) ? '0.0' : currentDisk.toFixed(1)}%
          </div>
          <div style={{ height: '6px', background: '#1e293b', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, Math.max(0, currentDisk))}%`,
                height: '100%',
                background: currentDisk > 85 ? '#ef4444' : '#eab308',
                transition: 'width 0.4s ease-in-out',
              }}
            />
          </div>
        </div>

        {/* Network Card */}
        <div style={{ background: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#3b82f6', fontSize: '12px', fontWeight: 600 }}>
            <span>NETWORK THROUGHPUT</span>
            <Network size={16} />
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#f1f5f9', marginTop: '8px' }}>
            {totalNetworkMbps} <span style={{ fontSize: '14px', color: '#94a3b8' }}>Mbps</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>
            <span>↓ {downloadMbps.toFixed(2)} Mbps</span>
            <span>↑ {uploadMbps.toFixed(2)} Mbps</span>
          </div>
        </div>
      </div>

      {/* 4. Interactive Telemetry Stream Graph */}
      <div style={{ background: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Historical Telemetry Stream</h2>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0' }}>Multi-metric graph showing real-time agent metrics over time.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['1h', '6h', '24h', '7d'].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                type="button"
                style={{
                  backgroundColor: range === r ? '#06b6d4' : '#1f2e44',
                  color: range === r ? '#000000' : '#cbd5e1',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <DashboardCharts samples={displaySamples} range={range} />
      </div>
    </div>
  );
}
