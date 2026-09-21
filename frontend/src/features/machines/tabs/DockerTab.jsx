import React, { useEffect, useState, useMemo } from 'react';
import { 
  Layers, 
  FileText, 
  Search, 
  RefreshCw, 
  AlertCircle, 
  HardDrive, 
  Globe, 
  Box, 
  Cpu, 
  Copy, 
  Check, 
  X, 
  Terminal, 
  Zap, 
  Eye,
  Activity,
  AlertTriangle,
  Download
} from 'lucide-react';
import { 
  getDockerOverview, 
  getDockerContainers, 
  getDockerImages, 
  getDockerNetworks, 
  getDockerVolumes, 
  getDockerEvents, 
  getContainerLogs
} from '../../../api/docker.js';
import { useDashboardStore } from '../../../store/dashboardStore.jsx';

export default function DockerTab({ machine }) {
  const machineId = machine?.id || machine?.ID || machine?.Id;
  const { addToast } = useDashboardStore();

  // Active Sub-Tab
  const [activeSubTab, setActiveSubTab] = useState('containers'); // 'containers' | 'images' | 'networks' | 'volumes' | 'events'

  // Data States
  const [overview, setOverview] = useState(null);
  const [containers, setContainers] = useState([]);
  const [images, setImages] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [events, setEvents] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Filtering & Searching
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'running' | 'high-load' | 'restarting' | 'error' | 'stopped'

  // Modals
  const [activeLogContainer, setActiveLogContainer] = useState(null);
  const [containerLogs, setContainerLogs] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const [logSeverity, setLogSeverity] = useState('all'); // 'all' | 'warn-error' | 'error'

  const [inspectContainer, setInspectContainer] = useState(null);
  const [inspectTab, setInspectTab] = useState('telemetry'); // 'telemetry' | 'diagnostics' | 'ports' | 'raw'
  const [copiedId, setCopiedId] = useState(null);

  // Fetch all Docker data for this machine
  const fetchAllData = async (isManualRefresh = false) => {
    if (!machineId) return;
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const [overviewRes, containersRes, imagesRes, networksRes, volumesRes, eventsRes] = await Promise.allSettled([
        getDockerOverview(machineId),
        getDockerContainers(machineId),
        getDockerImages(machineId),
        getDockerNetworks(machineId),
        getDockerVolumes(machineId),
        getDockerEvents(machineId)
      ]);

      if (overviewRes.status === 'fulfilled') setOverview(overviewRes.value);
      if (containersRes.status === 'fulfilled' && Array.isArray(containersRes.value)) {
        setContainers(containersRes.value);
      }
      if (imagesRes.status === 'fulfilled' && Array.isArray(imagesRes.value)) {
        setImages(imagesRes.value);
      }
      if (networksRes.status === 'fulfilled' && Array.isArray(networksRes.value)) {
        setNetworks(networksRes.value);
      }
      if (volumesRes.status === 'fulfilled' && Array.isArray(volumesRes.value)) {
        setVolumes(volumesRes.value);
      }
      if (eventsRes.status === 'fulfilled' && Array.isArray(eventsRes.value)) {
        setEvents(eventsRes.value);
      }
    } catch (err) {
      console.error('Docker telemetry fetch error:', err);
      setError(err.message || 'Failed to fetch Docker telemetry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAllData(false);
    const interval = setInterval(() => {
      fetchAllData(false);
    }, 15000);
    return () => clearInterval(interval);
  }, [machineId]);

  // Open Log Streamer
  const handleOpenLogs = async (container) => {
    const cId = container.id || container.ID || container.name;
    setActiveLogContainer(container);
    setLogsLoading(true);
    setContainerLogs('');
    setLogSearch('');
    setLogSeverity('all');

    try {
      const data = await getContainerLogs(cId);
      setContainerLogs(data.logs || 'No log output emitted by container yet.');
    } catch (err) {
      setContainerLogs(`Error loading container logs: ${err.response?.data?.error || err.message}`);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleDownloadLogs = () => {
    if (!containerLogs) return;
    const blob = new Blob([containerLogs], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `docker-${activeLogContainer?.name || 'container'}-logs.txt`;
    link.click();
    URL.revokeObjectURL(url);
    addToast('success', 'Logs Downloaded', 'Container log file saved to your device.');
  };

  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Metrics summary
  const stats = useMemo(() => {
    const total = containers.length;
    let running = 0;
    let highLoad = 0;
    let restarting = 0;
    let failed = 0;
    let stopped = 0;
    let totalCpu = 0;
    let totalMem = 0;

    containers.forEach(c => {
      const state = String(c.state || c.State || c.status || '').toLowerCase();
      const isUp = state === 'running' || state.includes('up');
      const isRest = state.includes('restarting') || (c.restart_count && c.restart_count > 5);
      const isErr = state.includes('exit (1') || state.includes('dead') || state.includes('failed') || state.includes('137');
      const cpu = c.cpu_percent || 0;
      const memUsed = c.memory_used_bytes || c.memory_used || 0;
      const memLimit = c.memory_limit_bytes || c.memory_limit || 0;
      const memPct = memLimit > 0 ? (memUsed / memLimit) * 100 : 0;

      totalCpu += cpu;
      totalMem += memUsed;

      if (isErr) failed++;
      else if (isRest) restarting++;
      else if (isUp) {
        running++;
        if (cpu > 75 || memPct > 80) highLoad++;
      } else {
        stopped++;
      }
    });

    let reclaimableBytes = 0;
    images.forEach(img => {
      const fullImg = img.repository ? `${img.repository}:${img.tag || 'latest'}` : (img.name || img.id);
      const inUse = containers.some(c => c.image === fullImg || c.image === img.name || c.image === img.repository);
      if (!inUse && img.size_bytes) {
        reclaimableBytes += img.size_bytes;
      }
    });

    return { total, running, highLoad, restarting, failed, stopped, totalCpu, totalMem, reclaimableBytes };
  }, [containers, images]);

  // Filtered containers
  const filteredContainers = useMemo(() => {
    return containers.filter(c => {
      const state = String(c.state || c.State || c.status || '').toLowerCase();
      const isUp = state === 'running' || state.includes('up');
      const isRest = state.includes('restarting') || (c.restart_count && c.restart_count > 5);
      const isErr = state.includes('exit (1') || state.includes('dead') || state.includes('failed') || state.includes('137');
      const cpu = c.cpu_percent || 0;
      const memUsed = c.memory_used_bytes || c.memory_used || 0;
      const memLimit = c.memory_limit_bytes || c.memory_limit || 0;
      const memPct = memLimit > 0 ? (memUsed / memLimit) * 100 : 0;
      const isHighLoad = cpu > 75 || memPct > 80;

      if (statusFilter === 'running' && (!isUp || isHighLoad || isRest)) return false;
      if (statusFilter === 'high-load' && (!isUp || !isHighLoad)) return false;
      if (statusFilter === 'restarting' && !isRest) return false;
      if (statusFilter === 'error' && !isErr) return false;
      if (statusFilter === 'stopped' && (isUp || isRest || isErr)) return false;

      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const name = String(c.name || c.names || c.Name || '').toLowerCase();
      const image = String(c.image || c.Image || '').toLowerCase();
      const id = String(c.id || c.ID || '').toLowerCase();
      return name.includes(q) || image.includes(q) || id.includes(q);
    });
  }, [containers, statusFilter, searchQuery]);

  // Filtered images
  const filteredImages = useMemo(() => {
    if (!searchQuery) return images;
    const q = searchQuery.toLowerCase();
    return images.filter(img => {
      const name = String(img.name || img.repository || '').toLowerCase();
      const tag = String(img.tag || '').toLowerCase();
      return name.includes(q) || tag.includes(q);
    });
  }, [images, searchQuery]);

  const parsedLogLines = useMemo(() => {
    if (!containerLogs) return [];
    const lines = containerLogs.split('\n');
    return lines
      .map((line, idx) => {
        const lower = line.toLowerCase();
        let level = 'info';
        if (lower.includes('error') || lower.includes('err') || lower.includes('fatal') || lower.includes('panic') || lower.includes('exception') || lower.includes('fail')) {
          level = 'error';
        } else if (lower.includes('warn') || lower.includes('warning')) {
          level = 'warn';
        } else if (lower.includes('debug') || lower.includes('trace')) {
          level = 'debug';
        }
        return { index: idx + 1, text: line, level };
      })
      .filter(item => {
        if (logSeverity === 'error' && item.level !== 'error') return false;
        if (logSeverity === 'warn-error' && item.level !== 'error' && item.level !== 'warn') return false;
        if (logSearch.trim() && !item.text.toLowerCase().includes(logSearch.toLowerCase())) return false;
        return true;
      });
  }, [containerLogs, logSearch, logSeverity]);

  // Automated Container Health Analyzer for Inspector
  const getContainerDiagnostic = (c) => {
    if (!c) return [];
    const diags = [];
    const state = String(c.state || c.State || c.status || '').toLowerCase();
    const isUp = state === 'running' || state.includes('up');
    const cpu = c.cpu_percent || 0;
    const memUsed = c.memory_used_bytes || c.memory_used || 0;
    const memLimit = c.memory_limit_bytes || c.memory_limit || 0;
    const memPct = memLimit > 0 ? (memUsed / memLimit) * 100 : 0;
    const restarts = c.restart_count || 0;

    if (isUp) {
      if (cpu > 85) {
        diags.push({ type: 'danger', title: 'High CPU Saturation', msg: `Container is using ${cpu.toFixed(1)}% CPU, which exceeds the 85% recommended threshold.` });
      } else if (cpu > 60) {
        diags.push({ type: 'warning', title: 'Moderate CPU Load', msg: `Container CPU is at ${cpu.toFixed(1)}%. Monitor for throttling spikes.` });
      } else {
        diags.push({ type: 'success', title: 'CPU Health Nominal', msg: `Current CPU utilization (${cpu.toFixed(1)}%) is well within steady-state limits.` });
      }

      if (memPct > 88) {
        diags.push({ type: 'danger', title: 'Critical OOM-Kill Risk', msg: `Memory usage (${memPct.toFixed(1)}%) is dangerously close to limit (${formatBytes(memLimit)}). Risk of OOM killer.` });
      } else if (memPct > 70) {
        diags.push({ type: 'warning', title: 'Elevated Memory Utilization', msg: `Memory usage is at ${memPct.toFixed(1)}% of allocated limit.` });
      } else {
        diags.push({ type: 'success', title: 'Memory Allocation Stable', msg: `RAM utilization is healthy at ${formatBytes(memUsed)} (${memPct.toFixed(1)}%).` });
      }
    } else {
      if (state.includes('137')) {
        diags.push({ type: 'danger', title: 'Terminated by OOM Killer (Exit 137)', msg: 'Container was killed by Linux Kernel Out-Of-Memory (OOM) killer due to exceeding memory cgroup limits.' });
      } else if (state.includes('1')) {
        diags.push({ type: 'danger', title: 'Application Runtime Crash (Exit 1)', msg: 'Container process exited with error code 1. Inspect live stdout/stderr logs for stack traces.' });
      } else {
        diags.push({ type: 'info', title: 'Graceful Termination / Standby', msg: 'Container was stopped cleanly (Exit 0) and is ready to start on demand.' });
      }
    }

    if (restarts > 5) {
      diags.push({ type: 'danger', title: 'Crash-Looping Detected', msg: `Container has restarted ${restarts} times. Check configuration or dependency health.` });
    } else if (restarts > 0) {
      diags.push({ type: 'warning', title: 'Restart History', msg: `Container has restarted ${restarts} time(s) since host boot.` });
    }

    return diags;
  };

  return (
    <div className="docker-node-monitoring" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* ========================================================================= */}
      {/* 1. NODE DOCKER ENTERPRISE KPI CARDS */}
      {/* ========================================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        
        {/* Total Containers Card */}
        <div style={{
          backgroundColor: '#0d1220',
          border: '1px solid var(--border-soft)',
          borderRadius: '12px',
          padding: '16px 18px',
          borderLeft: '4px solid #06b6d4'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Containers Inventory</span>
            <Box size={16} color="#06b6d4" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9' }}>{stats.total}</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '11px', fontWeight: 600, marginTop: '4px' }}>
            <span style={{ color: '#22c55e' }}>🟢 {stats.running} Healthy</span>
            {stats.highLoad > 0 && <span style={{ color: '#f59e0b' }}>🟡 {stats.highLoad} High Load</span>}
            {stats.restarting > 0 && <span style={{ color: '#eab308' }}>🟠 {stats.restarting} Restarting</span>}
            {stats.failed > 0 && <span style={{ color: '#ef4444' }}>🔴 {stats.failed} Crash</span>}
          </div>
        </div>

        {/* Container Resource Footprint Card */}
        <div style={{
          backgroundColor: '#0d1220',
          border: '1px solid var(--border-soft)',
          borderRadius: '12px',
          padding: '16px 18px',
          borderLeft: '4px solid #a855f7'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Resources In Use</span>
            <Cpu size={16} color="#a855f7" />
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9' }}>
            {stats.totalCpu.toFixed(1)}% <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>CPU</span>
          </div>
          <div style={{ fontSize: '12px', color: '#c084fc', marginTop: '4px', fontWeight: 600 }}>
            {formatBytes(stats.totalMem)} RAM allocated
          </div>
        </div>

        {/* Images & Volumes Count Card */}
        <div style={{
          backgroundColor: '#0d1220',
          border: '1px solid var(--border-soft)',
          borderRadius: '12px',
          padding: '16px 18px',
          borderLeft: '4px solid #3b82f6'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Storage & Net</span>
            <HardDrive size={16} color="#3b82f6" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '4px' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#f1f5f9' }}>{images.length || overview?.images || 0}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Images</div>
            </div>
            <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-soft)' }} />
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#f1f5f9' }}>{volumes.length || overview?.volumes || 0}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Volumes</div>
            </div>
            <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-soft)' }} />
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#f1f5f9' }}>{networks.length || overview?.networks || 0}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Networks</div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. SUB-NAVIGATION TOOLBAR & SEARCH */}
      {/* ========================================================================= */}
      <div style={{
        backgroundColor: '#0d1220',
        border: '1px solid var(--border-soft)',
        borderRadius: '12px',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {[
            { id: 'containers', label: 'Containers', count: containers.length, icon: Box },
            { id: 'images', label: 'Images', count: images.length, icon: Layers },
            { id: 'networks', label: 'Networks', count: networks.length, icon: Globe },
            { id: 'volumes', label: 'Volumes', count: volumes.length, icon: HardDrive },
            { id: 'events', label: 'Events Audit', count: events.length, icon: Zap }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  backgroundColor: isActive ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                  border: isActive ? '1px solid #06b6d4' : '1px solid transparent',
                  borderRadius: '8px',
                  color: isActive ? '#06b6d4' : 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: isActive ? 700 : 500,
                  transition: 'all 0.15s'
                }}
              >
                <Icon size={14} />
                {tab.label}
                <span style={{
                  padding: '1px 6px',
                  borderRadius: '10px',
                  backgroundColor: isActive ? '#06b6d4' : 'rgba(255, 255, 255, 0.06)',
                  color: isActive ? '#080c14' : 'var(--text)',
                  fontSize: '10px',
                  fontWeight: 700
                }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Search & Refresh Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {activeSubTab === 'containers' && (
            <>
              {/* Status Filter Pills */}
              <div style={{ display: 'flex', backgroundColor: 'rgba(255, 255, 255, 0.04)', borderRadius: '6px', border: '1px solid var(--border-soft)', padding: '2px' }}>
                {[
                  { id: 'all', label: 'All' },
                  { id: 'running', label: 'Healthy' },
                  { id: 'high-load', label: 'High Load' },
                  { id: 'restarting', label: 'Restarting' },
                  { id: 'error', label: 'OOM/Err' },
                  { id: 'stopped', label: 'Stopped' }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setStatusFilter(f.id)}
                    style={{
                      padding: '3px 8px',
                      border: 'none',
                      borderRadius: '4px',
                      backgroundColor: statusFilter === f.id ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                      color: statusFilter === f.id ? '#06b6d4' : 'var(--muted)',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: statusFilter === f.id ? 700 : 500
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Search Box */}
              <div style={{ position: 'relative', width: '180px' }}>
                <Search size={13} style={{ position: 'absolute', left: '9px', top: '9px', color: 'var(--muted)' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter containers..."
                  style={{
                    width: '100%',
                    height: '30px',
                    backgroundColor: '#0a0e17',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    padding: '0 24px 0 28px',
                    fontSize: '12px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ position: 'absolute', right: '6px', top: '6px', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </>
          )}

          {/* Refresh Button */}
          <button
            onClick={() => fetchAllData(true)}
            disabled={refreshing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '0 14px',
              height: '32px',
              minWidth: '95px',
              backgroundColor: 'rgba(6, 182, 212, 0.12)',
              border: '1px solid rgba(6, 182, 212, 0.35)',
              borderRadius: '6px',
              color: '#06b6d4',
              fontSize: '12px',
              fontWeight: 700,
              cursor: refreshing ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          color: '#f87171',
          fontSize: '13px'
        }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SUB-TAB 1: CONTAINERS FLEET VIEW */}
      {/* ========================================================================= */}
      {activeSubTab === 'containers' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid var(--border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
          {filteredContainers.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>
              No containers found matching current filters.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                  <th style={{ padding: '12px 16px' }}>Container & Image</th>
                  <th style={{ padding: '12px 16px' }}>Status & Health</th>
                  <th style={{ padding: '12px 16px' }}>Ports</th>
                  <th style={{ padding: '12px 16px' }}>CPU Usage</th>
                  <th style={{ padding: '12px 16px' }}>Memory Footprint</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Observability Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredContainers.map(container => {
                  const name = container.name || container.Name || container.names || 'unnamed';
                  const rawId = container.id || container.ID || 'unknown';
                  const shortId = rawId.substring(0, 12);
                  const image = container.image || container.Image || 'unknown';
                  const state = String(container.state || container.State || container.status || '').toLowerCase();
                  const isRunning = state === 'running' || state.includes('up');
                  const isRestarting = state.includes('restarting') || (container.restart_count && container.restart_count > 5);
                  const isOOM = state.includes('137');
                  const isExitErr = state.includes('exit (1') || state.includes('dead') || state.includes('failed');

                  const ports = container.ports || container.Ports || '-';
                  const cpu = container.cpu_percent || 0;
                  const memUsed = container.memory_used_bytes || container.memory_used || 0;
                  const memLimit = container.memory_limit_bytes || container.memory_limit || 0;
                  const memPct = memLimit > 0 ? ((memUsed / memLimit) * 100).toFixed(1) : 0;
                  const isHighMem = memPct > 80;
                  const isHighCpu = cpu > 75;

                  return (
                    <tr 
                      key={rawId}
                      style={{ 
                        borderBottom: '1px solid var(--border-soft)',
                        transition: 'background-color 0.15s'
                      }}
                      className="container-row"
                    >
                      {/* Name, Image & ID */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9' }}>{name}</span>
                            <span 
                              onClick={() => handleCopyId(rawId)}
                              style={{ 
                                fontSize: '11px', 
                                color: copiedId === rawId ? '#34d399' : 'var(--muted)', 
                                fontFamily: 'monospace',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                              title="Click to copy SHA container ID"
                            >
                              {copiedId === rawId ? <Check size={11} /> : <Copy size={11} />}
                              {shortId}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              padding: '1px 6px',
                              backgroundColor: 'rgba(6, 182, 212, 0.1)',
                              border: '1px solid rgba(6, 182, 212, 0.3)',
                              borderRadius: '4px',
                              color: '#06b6d4',
                              fontSize: '11px',
                              fontFamily: 'monospace'
                            }}>
                              {image}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: isRunning ? '#22c55e' : (isRestarting ? '#eab308' : '#ef4444'),
                              boxShadow: isRunning ? '0 0 8px #22c55e' : (isRestarting ? '0 0 8px #eab308' : 'none')
                            }} />
                            <span style={{
                              fontSize: '12px',
                              fontWeight: 700,
                              color: isRunning ? (isHighCpu || isHighMem ? '#f59e0b' : '#22c55e') : (isRestarting ? '#eab308' : '#ef4444')
                            }}>
                              {isOOM ? 'OOMKilled (137)' : (isExitErr ? 'Crash Exited' : (isRunning ? (isHighCpu || isHighMem ? 'Degraded Load' : 'Healthy') : (isRestarting ? 'Restarting' : 'Stopped')))}
                            </span>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                            {container.status || '-'}
                          </span>
                        </div>
                      </td>

                      {/* Ports */}
                      <td style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: '12px', fontFamily: 'monospace' }}>
                        {ports !== '-' ? (
                          <span style={{
                            padding: '2px 6px',
                            backgroundColor: 'rgba(255, 255, 255, 0.04)',
                            borderRadius: '4px',
                            border: '1px solid var(--border-soft)',
                            color: '#e2e8f0'
                          }}>
                            {ports}
                          </span>
                        ) : '-'}
                      </td>

                      {/* CPU Progress */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ width: '100px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text)', marginBottom: '3px' }}>
                            <span style={{ fontWeight: 600, color: cpu > 75 ? '#ef4444' : (cpu > 40 ? '#f59e0b' : '#06b6d4') }}>
                              {cpu.toFixed(1)}%
                            </span>
                          </div>
                          <div style={{ height: '5px', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(cpu, 100)}%`,
                              height: '100%',
                              backgroundColor: cpu > 75 ? '#ef4444' : (cpu > 40 ? '#f59e0b' : '#06b6d4'),
                              borderRadius: '3px'
                            }} />
                          </div>
                        </div>
                      </td>

                      {/* Memory */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', color: isHighMem ? '#f87171' : '#f1f5f9', fontFamily: 'monospace' }}>
                              {formatBytes(memUsed)}
                            </span>
                            {isHighMem && (
                              <span style={{ fontSize: '9px', backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '1px 4px', borderRadius: '3px', fontWeight: 700 }}>
                                OOM Risk
                              </span>
                            )}
                          </div>
                          {memLimit > 0 && (
                            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{memPct}% of {formatBytes(memLimit)}</span>
                          )}
                        </div>
                      </td>

                      {/* Action Controls */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          
                          {/* Deep Dive Inspect & Metrics */}
                          <button
                            onClick={() => {
                              setInspectContainer(container);
                              setInspectTab('telemetry');
                            }}
                            type="button"
                            style={{
                              padding: '6px 11px',
                              backgroundColor: 'rgba(6, 182, 212, 0.12)',
                              border: '1px solid rgba(6, 182, 212, 0.35)',
                              borderRadius: '6px',
                              color: '#06b6d4',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              fontSize: '12px',
                              fontWeight: 700
                            }}
                            title="Open Deep-Dive Container Telemetry Monitor"
                          >
                            <Eye size={13} />
                            Inspect
                          </button>

                          {/* Logs */}
                          <button
                            onClick={() => handleOpenLogs(container)}
                            type="button"
                            style={{
                              padding: '6px 11px',
                              backgroundColor: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid var(--border-soft)',
                              borderRadius: '6px',
                              color: '#cbd5e1',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              fontSize: '12px',
                              fontWeight: 600
                            }}
                            title="View Streaming Logs with Syntax Highlighting"
                          >
                            <FileText size={13} color="#38bdf8" />
                            Logs
                          </button>

                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. SUB-TAB 2: DOCKER IMAGES */}
      {/* ========================================================================= */}
      {activeSubTab === 'images' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid var(--border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
          {images.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>
              No images found on this node.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                  <th style={{ padding: '12px 16px' }}>Repository & Tag</th>
                  <th style={{ padding: '12px 16px' }}>Image ID</th>
                  <th style={{ padding: '12px 16px' }}>Virtual Size</th>
                  <th style={{ padding: '12px 16px' }}>Created</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Active Usage & Reclaim</th>
                </tr>
              </thead>
              <tbody>
                {images.map((img, idx) => {
                  const fullImg = img.repository ? `${img.repository}:${img.tag || 'latest'}` : (img.name || img.id);
                  const inUseCount = containers.filter(c => (c.image === fullImg || c.image === img.name || c.image === img.repository)).length;

                  return (
                    <tr key={img.id || idx} style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--text)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Layers size={16} color="#06b6d4" />
                          <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{img.repository || img.name || 'Unnamed'}</span>
                          <span style={{
                            padding: '1px 6px',
                            backgroundColor: 'rgba(255, 255, 255, 0.06)',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: '#06b6d4'
                          }}>
                            {img.tag || 'latest'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--muted)' }}>
                        {(img.id || '').substring(0, 16)}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#38bdf8', fontFamily: 'monospace', fontWeight: 600 }}>
                        {img.size || (img.size_bytes ? formatBytes(img.size_bytes) : '-')}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: '11px' }}>
                        {img.created || img.created_at || 'Cached'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {inUseCount > 0 ? (
                          <span style={{
                            padding: '3px 10px',
                            borderRadius: '10px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: 'rgba(34, 197, 94, 0.15)',
                            color: '#22c55e',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          }}>
                            Active ({inUseCount} container{inUseCount === 1 ? '' : 's'})
                          </span>
                        ) : (
                          <span style={{
                            padding: '3px 10px',
                            borderRadius: '10px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            color: '#f59e0b',
                            border: '1px solid rgba(245, 158, 11, 0.3)'
                          }}>
                            Unused (Reclaimable)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. SUB-TAB 3: NETWORKS */}
      {/* ========================================================================= */}
      {activeSubTab === 'networks' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid var(--border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
          {networks.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>
              No custom Docker networks detected.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                  <th style={{ padding: '12px 16px' }}>Network Name</th>
                  <th style={{ padding: '12px 16px' }}>Driver</th>
                  <th style={{ padding: '12px 16px' }}>Scope</th>
                  <th style={{ padding: '12px 16px' }}>Subnet CIDR</th>
                  <th style={{ padding: '12px 16px' }}>Gateway</th>
                </tr>
              </thead>
              <tbody>
                {networks.map((net, idx) => (
                  <tr key={net.id || idx} style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--text)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#f1f5f9' }}>
                        <Globe size={16} color="#3b82f6" />
                        {net.name}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '2px 6px',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '4px',
                        color: '#3b82f6',
                        fontSize: '11px',
                        fontFamily: 'monospace'
                      }}>
                        {net.driver || 'bridge'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--muted)' }}>{net.scope || 'local'}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#e2e8f0' }}>{net.subnet || '-'}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#e2e8f0' }}>{net.gateway || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. SUB-TAB 4: VOLUMES */}
      {/* ========================================================================= */}
      {activeSubTab === 'volumes' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid var(--border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
          {volumes.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>
              No persistent volumes mapped.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                  <th style={{ padding: '12px 16px' }}>Volume Name</th>
                  <th style={{ padding: '12px 16px' }}>Driver</th>
                  <th style={{ padding: '12px 16px' }}>Mount Point</th>
                  <th style={{ padding: '12px 16px' }}>Size</th>
                </tr>
              </thead>
              <tbody>
                {volumes.map((vol, idx) => (
                  <tr key={vol.name || idx} style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--text)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#f1f5f9' }}>
                        <HardDrive size={16} color="#a855f7" />
                        {vol.name}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--muted)' }}>{vol.driver || 'local'}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--muted)', fontSize: '11px' }}>
                      {vol.mountpoint || vol.Mountpoint || '-'}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#c084fc', fontWeight: 600 }}>{vol.size || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. SUB-TAB 5: EVENTS & AUDIT STREAM */}
      {/* ========================================================================= */}
      {activeSubTab === 'events' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid var(--border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
          {events.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>
              No recent daemon lifecycle events recorded.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                  <th style={{ padding: '12px 16px' }}>Timestamp</th>
                  <th style={{ padding: '12px 16px' }}>Action</th>
                  <th style={{ padding: '12px 16px' }}>Type</th>
                  <th style={{ padding: '12px 16px' }}>Resource Target</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt, idx) => (
                  <tr key={evt.id || idx} style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--text)' }}>
                    <td style={{ padding: '12px 16px', color: 'var(--muted)', fontFamily: 'monospace', fontSize: '11px' }}>
                      {evt.time || evt.timestamp ? new Date(evt.time || evt.timestamp).toLocaleString() : '-'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: String(evt.action).includes('die') || String(evt.action).includes('kill') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                        color: String(evt.action).includes('die') || String(evt.action).includes('kill') ? '#ef4444' : '#22c55e'
                      }}>
                        {evt.action || 'event'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--muted)', textTransform: 'uppercase', fontSize: '11px' }}>
                      {evt.type || 'container'}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#f1f5f9' }}>
                      {evt.actor || evt.target || evt.resource || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: LIVE CONTAINER LOG STREAMER */}
      {/* ========================================================================= */}
      {activeLogContainer && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.88)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '24px'
        }}>
          <div style={{
            backgroundColor: '#0d1220',
            border: '1px solid var(--border-soft)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '960px',
            height: '82vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 60px -15px rgba(0,0,0,0.9)'
          }}>
            {/* Header */}
            <div style={{
              padding: '14px 20px',
              backgroundColor: '#111827',
              borderBottom: '1px solid var(--border-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Terminal size={18} color="#06b6d4" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', color: '#f1f5f9', fontWeight: 700 }}>
                    Container Logs: {activeLogContainer.name || activeLogContainer.id}
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'monospace' }}>
                    {activeLogContainer.image}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                
                {/* Severity Filter */}
                <div style={{ display: 'flex', backgroundColor: '#070a11', borderRadius: '6px', border: '1px solid var(--border-soft)', padding: '2px' }}>
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'warn-error', label: 'Warn/Err' },
                    { id: 'error', label: 'Errors' }
                  ].map(s => (
                    <button
                      key={s.id}
                      onClick={() => setLogSeverity(s.id)}
                      type="button"
                      style={{
                        padding: '3px 8px',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor: logSeverity === s.id ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                        color: logSeverity === s.id ? '#06b6d4' : 'var(--muted)',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: logSeverity === s.id ? 700 : 500
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#070a11', border: '1px solid var(--border-soft)', borderRadius: '6px', padding: '4px 8px' }}>
                  <Search size={12} color="var(--muted)" />
                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    style={{ background: 'none', border: 'none', color: '#f1f5f9', outline: 'none', fontSize: '11px', width: '120px' }}
                  />
                  {logSearch && (
                    <button onClick={() => setLogSearch('')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0 }}>
                      <X size={10} />
                    </button>
                  )}
                </div>

                <button
                  onClick={handleDownloadLogs}
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '0 10px',
                    height: '30px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    color: '#38bdf8',
                    fontSize: '11px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                  title="Download full container log file"
                >
                  <Download size={12} />
                  Download
                </button>

                <button
                  onClick={() => handleOpenLogs(activeLogContainer)}
                  disabled={logsLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '0 10px',
                    height: '30px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  <RefreshCw size={12} className={logsLoading ? 'spin' : ''} />
                  Refresh
                </button>

                <button
                  onClick={() => setActiveLogContainer(null)}
                  style={{
                    width: '30px',
                    height: '30px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    color: 'var(--muted)',
                    cursor: 'pointer'
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Log Terminal Window */}
            <div style={{
              flex: 1,
              padding: '14px',
              backgroundColor: '#050811',
              fontFamily: '"Fira Code", monospace',
              fontSize: '12px',
              lineHeight: 1.6,
              overflowY: 'auto'
            }}>
              {logsLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#06b6d4', padding: '12px' }}>
                  <RefreshCw size={14} className="spin" />
                  Streaming live stdout/stderr logs...
                </div>
              ) : parsedLogLines.length === 0 ? (
                <div style={{ color: 'var(--muted)', padding: '12px' }}>
                  No log entries matching filter criteria.
                </div>
              ) : (
                parsedLogLines.map(line => {
                  let color = '#34d399';
                  if (line.level === 'error') color = '#f87171';
                  else if (line.level === 'warn') color = '#fbbf24';
                  else if (line.level === 'debug') color = '#c084fc';

                  return (
                    <div key={line.index} style={{ display: 'flex', gap: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      <span style={{ color: '#475569', userSelect: 'none', width: '32px', textAlign: 'right', flexShrink: 0 }}>
                        {line.index}
                      </span>
                      <span style={{ color }}>{line.text}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CONTAINER TELEMETRY & DIAGNOSTIC INSPECTOR */}
      {/* ========================================================================= */}
      {inspectContainer && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.88)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#0d1220',
            border: '1px solid var(--border-soft)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '850px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 60px -15px rgba(0,0,0,0.9)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              backgroundColor: '#111827',
              borderBottom: '1px solid var(--border-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Box size={20} color="#06b6d4" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', color: '#f1f5f9', fontWeight: 700 }}>
                    Container Telemetry: {inspectContainer.name || inspectContainer.id}
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'monospace' }}>
                    {inspectContainer.image}
                  </span>
                </div>
              </div>
              <button onClick={() => setInspectContainer(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {/* Sub-Nav Toolbar in Modal */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-soft)', backgroundColor: '#090d16', padding: '0 16px' }}>
              {[
                { id: 'telemetry', label: 'Live Metrics', icon: Activity },
                { id: 'diagnostics', label: 'Diagnostics', icon: AlertTriangle },
                { id: 'ports', label: 'Ports & Network', icon: Globe },
                { id: 'raw', label: 'JSON Metadata', icon: FileText }
              ].map(t => {
                const Icon = t.icon;
                const isActive = inspectTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setInspectTab(t.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '10px 14px',
                      background: 'none',
                      border: 'none',
                      borderBottom: isActive ? '2px solid #06b6d4' : '2px solid transparent',
                      color: isActive ? '#06b6d4' : 'var(--muted)',
                      fontSize: '12px',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer'
                    }}
                  >
                    <Icon size={14} />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Telemetry Tab */}
              {inspectTab === 'telemetry' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                    <div style={{ padding: '12px', backgroundColor: '#070a11', borderRadius: '8px', border: '1px solid var(--border-soft)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>CPU Utilization</span>
                      <strong style={{ fontSize: '18px', color: '#38bdf8' }}>{(inspectContainer.cpu_percent || 0).toFixed(1)}%</strong>
                    </div>
                    <div style={{ padding: '12px', backgroundColor: '#070a11', borderRadius: '8px', border: '1px solid var(--border-soft)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>Memory Used (RSS)</span>
                      <strong style={{ fontSize: '18px', color: '#c084fc' }}>{formatBytes(inspectContainer.memory_used_bytes || inspectContainer.memory_used || 0)}</strong>
                    </div>
                    <div style={{ padding: '12px', backgroundColor: '#070a11', borderRadius: '8px', border: '1px solid var(--border-soft)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>Status</span>
                      <strong style={{ fontSize: '14px', color: '#22c55e', textTransform: 'uppercase' }}>{inspectContainer.state || 'running'}</strong>
                    </div>
                    <div style={{ padding: '12px', backgroundColor: '#070a11', borderRadius: '8px', border: '1px solid var(--border-soft)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>Restarts</span>
                      <strong style={{ fontSize: '18px', color: '#f59e0b' }}>{inspectContainer.restart_count || 0}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-soft)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>Full SHA ID</span>
                      <strong style={{ fontSize: '12px', color: '#f1f5f9', fontFamily: 'monospace' }}>{inspectContainer.id || inspectContainer.ID}</strong>
                    </div>
                    <div style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-soft)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>Image Tag</span>
                      <strong style={{ fontSize: '12px', color: '#06b6d4', fontFamily: 'monospace' }}>{inspectContainer.image}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button
                      onClick={() => handleOpenLogs(inspectContainer)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#06b6d4',
                        color: '#080c14',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <FileText size={14} /> Open Live Streaming Logs
                    </button>
                  </div>
                </>
              )}

              {/* Diagnostics Tab */}
              {inspectTab === 'diagnostics' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#f1f5f9' }}>
                    Automated Stability & Diagnostic Health Checks
                  </span>
                  {getContainerDiagnostic(inspectContainer).map((diag, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: diag.type === 'danger' 
                          ? '1px solid rgba(239, 68, 68, 0.4)' 
                          : (diag.type === 'warning' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(34, 197, 94, 0.4)'),
                        backgroundColor: diag.type === 'danger' 
                          ? 'rgba(239, 68, 68, 0.1)' 
                          : (diag.type === 'warning' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(34, 197, 94, 0.1)'),
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px'
                      }}
                    >
                      <strong style={{
                        fontSize: '13px',
                        color: diag.type === 'danger' ? '#f87171' : (diag.type === 'warning' ? '#fbbf24' : '#4ade80')
                      }}>
                        {diag.title}
                      </strong>
                      <span style={{ fontSize: '12px', color: '#cbd5e1' }}>{diag.msg}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Ports Tab */}
              {inspectTab === 'ports' && (
                <div style={{ padding: '16px', backgroundColor: '#070a11', borderRadius: '8px', border: '1px solid var(--border-soft)' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9', display: 'block', marginBottom: '8px' }}>
                    Port Mappings & Networks
                  </span>
                  <div style={{ fontFamily: 'monospace', color: '#38bdf8', fontSize: '13px' }}>
                    {inspectContainer.ports || inspectContainer.Ports || 'No host ports mapped.'}
                  </div>
                </div>
              )}

              {/* Raw JSON Tab */}
              {inspectTab === 'raw' && (
                <pre style={{
                  padding: '16px',
                  backgroundColor: '#050811',
                  borderRadius: '8px',
                  border: '1px solid var(--border-soft)',
                  color: '#a5f3fc',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  overflowX: 'auto',
                  maxHeight: '320px'
                }}>
                  {JSON.stringify(inspectContainer, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
