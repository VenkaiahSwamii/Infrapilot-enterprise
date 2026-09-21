import React, { useEffect, useState, useMemo } from 'react';
import { 
  Layers, 
  Activity, 
  RefreshCw, 
  Server, 
  FileText, 
  Copy, 
  Check, 
  Terminal, 
  Box, 
  Globe, 
  HardDrive, 
  Zap, 
  X, 
  Search, 
  Eye,
  Radio,
  Download,
  AlertTriangle,
  ShieldCheck,
  Cpu,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  ArrowDownCircle,
  ArrowUpCircle,
  Sliders,
  Filter
} from 'lucide-react';
import { listServers } from '../api/server.js';
import { 
  getDockerContainers, 
  getDockerImages, 
  getDockerNetworks, 
  getDockerVolumes, 
  getDockerEvents, 
  getContainerLogs
} from '../api/docker.js';
import { useDashboardStore } from '../store/dashboardStore.jsx';
import ServerSelectDropdown from '../components/common/ServerSelectDropdown.jsx';

export default function DockerPage() {
  const [servers, setServers] = useState([]);
  const [containers, setContainers] = useState([]);
  const [images, setImages] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [events, setEvents] = useState([]);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedServerId, setSelectedServerId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'running' | 'high-load' | 'restarting' | 'error' | 'stopped'
  const [activeTab, setActiveTab] = useState('containers'); // 'containers' | 'images' | 'networks' | 'volumes' | 'events'
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Deep Dive Inspector Modal
  const [inspectContainer, setInspectContainer] = useState(null);
  const [inspectTab, setInspectTab] = useState('telemetry'); // 'telemetry' | 'diagnostics' | 'ports' | 'mounts' | 'security' | 'raw'

  // Live Logs Modal
  const [activeLogContainer, setActiveLogContainer] = useState(null);
  const [containerLogs, setContainerLogs] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const [logSeverity, setLogSeverity] = useState('all'); // 'all' | 'error' | 'warn-error'
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);

  const { addToast } = useDashboardStore();

  const backendHost = typeof window !== 'undefined' ? (window.location.hostname || '192.168.1.2') : '192.168.1.2';
  const dockerCmd = `docker run -d --name infrapilot-agent --restart always --net=host -v /var/run/docker.sock:/var/run/docker.sock:ro -e BACKEND_URL=http://${backendHost}:8080 infrapilot/agent:latest`;

  const handleCopyCmd = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(dockerCmd);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2500);
      addToast('success', 'Command Copied', 'Docker agent run command copied to clipboard.');
    }
  };

  // Fetch servers & Docker telemetry across all connected nodes
  const fetchDockerData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const serverList = await listServers();
      const activeServers = Array.isArray(serverList) ? serverList : [];
      setServers(activeServers);

      const allContainers = [];
      const allImages = [];
      const allNetworks = [];
      const allVolumes = [];
      const allEvents = [];

      await Promise.allSettled(
        activeServers.map(async (srv) => {
          const sId = srv.id || srv.ID;
          const sName = srv.hostname || srv.name || srv.Hostname || 'Node';

          try {
            const [cRes, iRes, nRes, vRes, eRes] = await Promise.allSettled([
              getDockerContainers(sId),
              getDockerImages(sId),
              getDockerNetworks(sId),
              getDockerVolumes(sId),
              getDockerEvents(sId)
            ]);

            if (cRes.status === 'fulfilled' && Array.isArray(cRes.value)) {
              cRes.value.forEach(c => {
                allContainers.push({
                  ...c,
                  hostServerId: sId,
                  hostServerName: sName,
                  hostPlatform: srv.platform || srv.os || 'linux',
                });
              });
            }

            if (iRes.status === 'fulfilled' && Array.isArray(iRes.value)) {
              iRes.value.forEach(img => {
                allImages.push({
                  ...img,
                  hostServerId: sId,
                  hostServerName: sName,
                });
              });
            }

            if (nRes.status === 'fulfilled' && Array.isArray(nRes.value)) {
              nRes.value.forEach(net => {
                allNetworks.push({
                  ...net,
                  hostServerId: sId,
                  hostServerName: sName,
                });
              });
            }

            if (vRes.status === 'fulfilled' && Array.isArray(vRes.value)) {
              vRes.value.forEach(vol => {
                allVolumes.push({
                  ...vol,
                  hostServerId: sId,
                  hostServerName: sName,
                });
              });
            }

            if (eRes.status === 'fulfilled' && Array.isArray(eRes.value)) {
              eRes.value.forEach(evt => {
                allEvents.push({
                  ...evt,
                  hostServerId: sId,
                  hostServerName: sName,
                });
              });
            }
          } catch (err) {
            console.error(`Error querying Docker telemetry for host ${sName}:`, err);
          }
        })
      );

      setContainers(allContainers);
      setImages(allImages);
      setNetworks(allNetworks);
      setVolumes(allVolumes);
      setEvents(allEvents.sort((a, b) => new Date(b.time || b.timestamp || 0) - new Date(a.time || a.timestamp || 0)));
    } catch (err) {
      console.error('Failed to load fleet Docker telemetry:', err);
      setError('Failed to fetch Docker fleet telemetry. Please check server connections.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDockerData(false);
    const interval = setInterval(() => {
      fetchDockerData(false);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Open Log Viewer
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

  const handleExportCSV = () => {
    if (containers.length === 0) {
      addToast('warning', 'Export Empty', 'No container telemetry available to export.');
      return;
    }

    const headers = ['Container Name', 'Container ID', 'Image', 'Host Machine', 'Status', 'CPU %', 'Memory Used Bytes', 'Memory Limit Bytes', 'Restarts', 'Ports'];
    const rows = containers.map(c => [
      `"${c.name || c.names || ''}"`,
      `"${c.id || ''}"`,
      `"${c.image || ''}"`,
      `"${c.hostServerName || ''}"`,
      `"${c.status || c.state || ''}"`,
      (c.cpu_percent || 0).toFixed(2),
      c.memory_used_bytes || c.memory_used || 0,
      c.memory_limit_bytes || c.memory_limit || 0,
      c.restart_count || 0,
      `"${c.ports || ''}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `docker-fleet-telemetry-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    addToast('success', 'Telemetry Exported', 'Fleet Docker telemetry exported to CSV successfully.');
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

  // Fleet Statistics Calculation
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

    // Reclaimable storage from unused images
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
      if (selectedServerId !== 'all' && String(c.hostServerId) !== String(selectedServerId)) {
        return false;
      }
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
      const name = String(c.names || c.Names || c.name || '').toLowerCase();
      const image = String(c.image || c.Image || '').toLowerCase();
      const server = String(c.hostServerName || '').toLowerCase();
      const id = String(c.id || c.ID || '').toLowerCase();
      return name.includes(q) || image.includes(q) || server.includes(q) || id.includes(q);
    });
  }, [containers, selectedServerId, searchQuery, statusFilter]);

  const filteredImages = useMemo(() => {
    return images.filter(img => {
      if (selectedServerId !== 'all' && String(img.hostServerId) !== String(selectedServerId)) {
        return false;
      }
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const name = String(img.name || img.repository || '').toLowerCase();
      const tag = String(img.tag || '').toLowerCase();
      const server = String(img.hostServerName || '').toLowerCase();
      return name.includes(q) || tag.includes(q) || server.includes(q);
    });
  }, [images, selectedServerId, searchQuery]);

  // Log line colorizer & filter
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
    <div className="docker-page" style={{ padding: '24px', maxWidth: '1480px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* ========================================================================= */}
      {/* 1. ENTERPRISE OBSERVABILITY HEADER */}
      {/* ========================================================================= */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '10px', backgroundColor: 'rgba(6, 182, 212, 0.15)', borderRadius: '12px', border: '1px solid rgba(6, 182, 212, 0.35)', boxShadow: '0 0 20px rgba(6, 182, 212, 0.2)' }}>
              <Layers size={28} color="#06b6d4" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9', margin: 0, letterSpacing: '-0.02em' }}>
                  Enterprise Docker Observability & Telemetry
                </h1>
                <span style={{
                  padding: '2px 8px',
                  backgroundColor: 'rgba(6, 182, 212, 0.15)',
                  border: '1px solid rgba(6, 182, 212, 0.4)',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#38bdf8'
                }}>
                  Fleet Matrix
                </span>
              </div>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0' }}>
                Multi-cluster container health monitoring, live CPU/RAM load metrics, OOM risk analytics, and automated diagnostics.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Live Sync Status */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 14px',
            backgroundColor: '#0a101d',
            border: '1px solid #1f2e44',
            borderRadius: '8px',
            fontSize: '12px',
            color: '#22c55e',
            fontWeight: 600
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
            Live Sync Active (15s)
          </div>

          {/* Export CSV Button */}
          <button
            onClick={handleExportCSV}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              color: '#f1f5f9',
              border: '1px solid #1f2e44',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              transition: 'all 0.15s'
            }}
            title="Export full fleet container telemetry to CSV"
          >
            <Download size={14} color="#38bdf8" />
            Export CSV
          </button>

          {/* Sync Fleet Button */}
          <button
            onClick={() => fetchDockerData(true)}
            disabled={refreshing}
            type="button"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 16px',
              minWidth: '115px',
              backgroundColor: 'rgba(6, 182, 212, 0.15)',
              color: '#06b6d4',
              border: '1px solid rgba(6, 182, 212, 0.4)',
              borderRadius: '8px',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 700,
              boxShadow: '0 4px 12px rgba(6, 182, 212, 0.15)',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Syncing...' : 'Sync Fleet'}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. FLEET OBSERVABILITY KPI METRICS MATRIX */}
      {/* ========================================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        
        {/* Total Containers & Health Breakdown Card */}
        <div style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', padding: '16px 18px', borderLeft: '4px solid #06b6d4' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Fleet Containers
            </span>
            <Box size={16} color="#06b6d4" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#f1f5f9', marginTop: '4px' }}>{stats.total}</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '11px', fontWeight: 600, marginTop: '6px' }}>
            <span style={{ color: '#22c55e' }}>🟢 {stats.running} Healthy</span>
            {stats.highLoad > 0 && <span style={{ color: '#f59e0b' }}>🟡 {stats.highLoad} High Load</span>}
            {stats.restarting > 0 && <span style={{ color: '#eab308' }}>🟠 {stats.restarting} Restarting</span>}
            {stats.failed > 0 && <span style={{ color: '#ef4444' }}>🔴 {stats.failed} Crash/OOM</span>}
          </div>
        </div>

        {/* Aggregate CPU Utilization Card */}
        <div style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', padding: '16px 18px', borderLeft: '4px solid #38bdf8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Fleet CPU Load
            </span>
            <Cpu size={16} color="#38bdf8" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#f1f5f9', marginTop: '4px' }}>
            {stats.totalCpu.toFixed(1)}%
          </div>
          <div style={{ height: '4px', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', overflow: 'hidden', marginTop: '8px' }}>
            <div style={{
              width: `${Math.min(stats.totalCpu / Math.max(servers.length, 1), 100)}%`,
              height: '100%',
              backgroundColor: stats.totalCpu > 150 ? '#ef4444' : (stats.totalCpu > 75 ? '#f59e0b' : '#38bdf8')
            }} />
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
            Across {servers.length} connected server host{servers.length === 1 ? '' : 's'}
          </div>
        </div>

        {/* Aggregate Memory Footprint Card */}
        <div style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', padding: '16px 18px', borderLeft: '4px solid #a855f7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              RAM Allocated
            </span>
            <Activity size={16} color="#a855f7" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#f1f5f9', marginTop: '4px' }}>
            {formatBytes(stats.totalMem)}
          </div>
          <div style={{ fontSize: '11px', color: '#c084fc', marginTop: '6px', fontWeight: 600 }}>
            {stats.highLoad > 0 ? `⚠️ ${stats.highLoad} container(s) near memory limits` : '🟢 Zero memory starvation warnings'}
          </div>
        </div>

        {/* Image Registry & Storage Reclaim Card */}
        <div style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', padding: '16px 18px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Images & Storage
            </span>
            <Layers size={16} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#f1f5f9', marginTop: '4px' }}>
            {images.length} <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 500 }}>Images</span>
          </div>
          <div style={{ fontSize: '11px', color: '#fbbf24', marginTop: '6px' }}>
            {stats.reclaimableBytes > 0 ? `💡 ~${formatBytes(stats.reclaimableBytes)} reclaimable from unused images` : 'Clean image utilization'}
          </div>
        </div>

        {/* Volumes & Bridges Card */}
        <div style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', padding: '16px 18px', borderLeft: '4px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Topology & Net
            </span>
            <HardDrive size={16} color="#10b981" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#f1f5f9', marginTop: '4px' }}>
            {volumes.length} <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 500 }}>Vols</span> / {networks.length} <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 500 }}>Nets</span>
          </div>
          <div style={{ fontSize: '11px', color: '#6ee7b7', marginTop: '6px' }}>
            Persistent storage & virtual bridges
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. DOCKER AGENT TELEMETRY CONNECTION BANNER */}
      {/* ========================================================================= */}
      <div style={{
        backgroundColor: '#070c18',
        border: '1px solid rgba(6, 182, 212, 0.25)',
        borderRadius: '10px',
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '240px' }}>
          <Radio size={18} color="#06b6d4" className="pulse-indicator" />
          <div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#f1f5f9', display: 'block' }}>
              Stream Container Telemetry From Any Remote Server
            </span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Deploy our lightweight read-only container monitor to stream live metrics and stdout/stderr logs.
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '750px' }}>
          <div style={{
            flex: 1,
            backgroundColor: '#040711',
            border: '1px solid #1f2e44',
            borderRadius: '6px',
            padding: '6px 12px',
            color: '#38bdf8',
            fontFamily: 'monospace',
            fontSize: '11px',
            overflowX: 'auto',
            whiteSpace: 'nowrap'
          }}>
            {dockerCmd}
          </div>
          <button
            onClick={handleCopyCmd}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 12px',
              backgroundColor: copiedCmd ? 'rgba(34, 197, 94, 0.15)' : 'rgba(6, 182, 212, 0.15)',
              border: copiedCmd ? '1px solid #22c55e' : '1px solid #06b6d4',
              borderRadius: '6px',
              color: copiedCmd ? '#22c55e' : '#06b6d4',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            {copiedCmd ? <Check size={12} /> : <Copy size={12} />}
            {copiedCmd ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MULTI-DIMENSIONAL SUB-TAB TOOLBAR & FILTER CONTROLS */}
      {/* ========================================================================= */}
      <div style={{
        backgroundColor: '#0d1220',
        border: '1px solid #1f2e44',
        borderRadius: '12px',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { id: 'containers', label: 'Containers Fleet', count: containers.length, icon: Box },
            { id: 'images', label: 'Docker Images', count: images.length, icon: Layers },
            { id: 'networks', label: 'Networks', count: networks.length, icon: Globe },
            { id: 'volumes', label: 'Volumes', count: volumes.length, icon: HardDrive },
            { id: 'events', label: 'Events Audit', count: events.length, icon: Zap }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  backgroundColor: isActive ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                  border: isActive ? '1px solid #06b6d4' : '1px solid transparent',
                  borderRadius: '6px',
                  color: isActive ? '#06b6d4' : '#94a3b8',
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
                  backgroundColor: isActive ? '#06b6d4' : 'rgba(255, 255, 255, 0.08)',
                  color: isActive ? '#080c14' : '#cbd5e1',
                  fontSize: '10px',
                  fontWeight: 700
                }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Search & Health Filter Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {activeTab === 'containers' && (
            <div style={{ display: 'flex', backgroundColor: '#080c14', borderRadius: '6px', border: '1px solid #1f2e44', padding: '2px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: 'All' },
                { id: 'running', label: 'Healthy' },
                { id: 'high-load', label: 'High Load' },
                { id: 'restarting', label: 'Restarting' },
                { id: 'error', label: 'OOM / Error' },
                { id: 'stopped', label: 'Stopped' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  type="button"
                  style={{
                    padding: '3px 8px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: statusFilter === f.id ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                    color: statusFilter === f.id ? '#06b6d4' : '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: statusFilter === f.id ? 700 : 500
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#080c14', border: '1px solid #1f2e44', borderRadius: '6px', padding: '5px 10px', width: '220px' }}>
            <Search size={14} color="#64748b" />
            <input
              type="text"
              placeholder="Search container, image..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ background: 'none', border: 'none', color: '#f1f5f9', outline: 'none', width: '100%', fontSize: '12px' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}>
                <X size={12} />
              </button>
            )}
          </div>

          <ServerSelectDropdown
            value={selectedServerId}
            onChange={(sId) => setSelectedServerId(sId)}
            showAll={true}
            allLabel="All Connected Hosts"
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. SUB-TAB 1: ENTERPRISE CONTAINERS FLEET OBSERVABILITY TABLE */}
      {/* ========================================================================= */}
      {activeTab === 'containers' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', overflow: 'hidden' }}>
          {filteredContainers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 24px', color: '#64748b' }}>
              <Box size={42} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <strong style={{ color: '#cbd5e1', display: 'block', fontSize: '15px' }}>No containers match current criteria</strong>
              <p style={{ fontSize: '12px', marginTop: '4px', color: '#64748b' }}>
                Ensure your agents are running or adjust your health status/host filter.
              </p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#080c14', borderBottom: '1px solid #1f2e44', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Container & Identity</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Image Tag</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Host Node</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Status & Health</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Live CPU %</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Memory Footprint</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>PIDs</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Observability Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredContainers.map((container, idx) => {
                  const rawId = container.id || container.ID || container.name || `c-${idx}`;
                  const shortId = rawId.length > 12 ? rawId.substring(0, 12) : rawId;
                  const name = container.names || container.Names || container.name || 'unnamed';
                  const image = container.image || container.Image || '--';
                  const state = String(container.state || container.State || container.status || '').toLowerCase();
                  const isUp = state === 'running' || state.includes('up');
                  const isRestarting = state.includes('restarting') || (container.restart_count && container.restart_count > 5);
                  const isOOM = state.includes('137');
                  const isExitErr = state.includes('exit (1') || state.includes('dead') || state.includes('failed');

                  const cpu = container.cpu_percent || 0;
                  const memUsed = container.memory_used_bytes || container.memory_used || 0;
                  const memLimit = container.memory_limit_bytes || container.memory_limit || 0;
                  const memPct = memLimit > 0 ? ((memUsed / memLimit) * 100).toFixed(1) : 0;
                  const isHighMem = memPct > 80;
                  const isHighCpu = cpu > 75;

                  return (
                    <tr 
                      key={rawId} 
                      style={{ borderBottom: '1px solid rgba(31, 46, 68, 0.4)', color: '#cbd5e1', transition: 'background-color 0.15s' }}
                      className="container-hover-row"
                    >
                      {/* Name & ID */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '14px' }}>{name}</span>
                          <span
                            onClick={() => handleCopyId(rawId)}
                            style={{ fontSize: '11px', color: copiedId === rawId ? '#34d399' : '#64748b', fontFamily: 'monospace', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            title="Click to copy SHA Container ID"
                          >
                            {copiedId === rawId ? <Check size={11} /> : <Copy size={11} />}
                            {shortId}
                          </span>
                        </div>
                      </td>

                      {/* Image Tag */}
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>
                        <span style={{
                          padding: '3px 8px',
                          backgroundColor: 'rgba(6, 182, 212, 0.1)',
                          border: '1px solid rgba(6, 182, 212, 0.3)',
                          borderRadius: '4px',
                          color: '#06b6d4',
                          fontSize: '11px'
                        }}>
                          {image}
                        </span>
                      </td>

                      {/* Host Node */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Server size={14} color="#38bdf8" />
                          <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{container.hostServerName}</span>
                        </div>
                      </td>

                      {/* Health Status */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 700,
                              backgroundColor: isUp 
                                ? (isHighCpu || isHighMem ? 'rgba(245, 158, 11, 0.15)' : 'rgba(34, 197, 94, 0.15)') 
                                : (isRestarting ? 'rgba(234, 179, 8, 0.15)' : 'rgba(239, 68, 68, 0.15)'),
                              color: isUp 
                                ? (isHighCpu || isHighMem ? '#f59e0b' : '#22c55e') 
                                : (isRestarting ? '#eab308' : '#ef4444'),
                              border: isUp 
                                ? (isHighCpu || isHighMem ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(34, 197, 94, 0.35)') 
                                : '1px solid rgba(239, 68, 68, 0.35)',
                              width: 'fit-content'
                            }}
                          >
                            <span style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              backgroundColor: isUp ? '#22c55e' : (isRestarting ? '#eab308' : '#ef4444'),
                              boxShadow: isUp ? '0 0 8px #22c55e' : 'none'
                            }} />
                            {isOOM ? 'OOMKilled (137)' : (isExitErr ? (container.status || 'Crash Exited') : (isUp ? (isHighCpu || isHighMem ? 'Degraded Load' : 'Healthy') : (isRestarting ? 'Restarting' : 'Stopped')))}
                          </span>
                          {container.restart_count > 0 && (
                            <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 600 }}>
                              {container.restart_count} restart{container.restart_count === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Live CPU % */}
                      <td style={{ padding: '12px 16px' }}>
                        {isUp ? (
                          <div style={{ width: '100px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#f1f5f9', marginBottom: '3px' }}>
                              <span style={{ fontWeight: 600, color: cpu > 75 ? '#ef4444' : (cpu > 40 ? '#f59e0b' : '#38bdf8') }}>
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
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '12px' }}>--</span>
                        )}
                      </td>

                      {/* Memory Footprint */}
                      <td style={{ padding: '12px 16px' }}>
                        {isUp ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '12px', color: isHighMem ? '#f87171' : '#c084fc', fontFamily: 'monospace', fontWeight: 600 }}>
                                {formatBytes(memUsed)}
                              </span>
                              {isHighMem && (
                                <span style={{ fontSize: '9px', backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '1px 4px', borderRadius: '3px', fontWeight: 700 }}>
                                  OOM Risk
                                </span>
                              )}
                            </div>
                            {memLimit > 0 && (
                              <span style={{ fontSize: '10px', color: '#64748b' }}>
                                of {formatBytes(memLimit)} ({memPct}%)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '12px' }}>--</span>
                        )}
                      </td>

                      {/* PIDs */}
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#94a3b8', fontSize: '12px' }}>
                        {container.pids || (isUp ? 1 : 0)}
                      </td>

                      {/* Observability Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          
                          {/* Deep Dive Inspect & Monitor */}
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
                              fontWeight: 700,
                              transition: 'all 0.15s'
                            }}
                            title="Open Deep-Dive Container Telemetry & Diagnostic Inspector"
                          >
                            <Eye size={13} />
                            Inspect
                          </button>

                          {/* Live Logs */}
                          <button
                            onClick={() => handleOpenLogs(container)}
                            type="button"
                            style={{
                              padding: '6px 11px',
                              backgroundColor: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid #1f2e44',
                              borderRadius: '6px',
                              color: '#cbd5e1',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              fontSize: '12px',
                              fontWeight: 600,
                              transition: 'all 0.15s'
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
      {/* 6. SUB-TAB 2: DOCKER IMAGES REGISTRY & STORAGE OBSERVABILITY */}
      {/* ========================================================================= */}
      {activeTab === 'images' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', overflow: 'hidden' }}>
          {filteredImages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 24px', color: '#64748b' }}>
              <Layers size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <strong style={{ color: '#cbd5e1', display: 'block', fontSize: '15px' }}>No Docker images discovered</strong>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#080c14', borderBottom: '1px solid #1f2e44', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Image Repository & Tag</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Host Machine</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Image ID</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Virtual Size</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Created</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Active Usage & Reclaim</th>
                </tr>
              </thead>
              <tbody>
                {filteredImages.map((img, idx) => {
                  const fullImg = img.repository ? `${img.repository}:${img.tag || 'latest'}` : (img.name || img.id);
                  const inUseCount = containers.filter(c => (c.image === fullImg || c.image === img.name || c.image === img.repository) && c.hostServerId === img.hostServerId).length;

                  return (
                    <tr key={img.id || idx} style={{ borderBottom: '1px solid rgba(31, 46, 68, 0.4)', color: '#cbd5e1' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Layers size={16} color="#06b6d4" />
                          <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{img.repository || img.name || 'Unnamed'}</span>
                          <span style={{
                            padding: '1px 6px',
                            backgroundColor: 'rgba(6, 182, 212, 0.1)',
                            border: '1px solid rgba(6, 182, 212, 0.25)',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: '#06b6d4',
                            fontFamily: 'monospace'
                          }}>
                            {img.tag || 'latest'}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#38bdf8' }}>
                          <Server size={13} color="#06b6d4" />
                          {img.hostServerName}
                        </span>
                      </td>

                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#64748b' }}>
                        {(img.id || '').substring(0, 16)}
                      </td>

                      <td style={{ padding: '12px 16px', color: '#38bdf8', fontFamily: 'monospace', fontWeight: 600 }}>
                        {img.size || (img.size_bytes ? formatBytes(img.size_bytes) : '-')}
                      </td>

                      <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '11px' }}>
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
      {/* 7. SUB-TAB 3: NETWORKS */}
      {/* ========================================================================= */}
      {activeTab === 'networks' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', overflow: 'hidden' }}>
          {networks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 24px', color: '#64748b' }}>
              <Globe size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <strong style={{ color: '#cbd5e1', display: 'block', fontSize: '15px' }}>No Docker networks detected</strong>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#080c14', borderBottom: '1px solid #1f2e44', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Network Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Host Node</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Driver</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Scope</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Subnet CIDR</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Gateway</th>
                </tr>
              </thead>
              <tbody>
                {networks.map((net, idx) => (
                  <tr key={net.id || idx} style={{ borderBottom: '1px solid rgba(31, 46, 68, 0.4)', color: '#cbd5e1' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Globe size={16} color="#3b82f6" />
                        {net.name}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#38bdf8' }}>{net.hostServerName}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ padding: '2px 6px', backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '4px', color: '#3b82f6', fontSize: '11px', fontFamily: 'monospace' }}>
                        {net.driver || 'bridge'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{net.scope || 'local'}</td>
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
      {/* 8. SUB-TAB 4: VOLUMES */}
      {/* ========================================================================= */}
      {activeTab === 'volumes' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', overflow: 'hidden' }}>
          {volumes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 24px', color: '#64748b' }}>
              <HardDrive size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <strong style={{ color: '#cbd5e1', display: 'block', fontSize: '15px' }}>No persistent volumes discovered</strong>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#080c14', borderBottom: '1px solid #1f2e44', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Volume Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Host Machine</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Driver</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Mount Path</th>
                </tr>
              </thead>
              <tbody>
                {volumes.map((vol, idx) => (
                  <tr key={vol.name || idx} style={{ borderBottom: '1px solid rgba(31, 46, 68, 0.4)', color: '#cbd5e1' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <HardDrive size={16} color="#a855f7" />
                        {vol.name}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#38bdf8' }}>{vol.hostServerName}</td>
                    <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{vol.driver || 'local'}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#94a3b8', fontSize: '11px' }}>
                      {vol.mountpoint || vol.Mountpoint || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. SUB-TAB 5: EVENTS & AUDIT STREAM */}
      {/* ========================================================================= */}
      {activeTab === 'events' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', overflow: 'hidden' }}>
          {events.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 24px', color: '#64748b' }}>
              <Zap size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <strong style={{ color: '#cbd5e1', display: 'block', fontSize: '15px' }}>No daemon lifecycle events recorded</strong>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#080c14', borderBottom: '1px solid #1f2e44', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Timestamp</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Host Machine</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Action</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Type</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Target Resource</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt, idx) => (
                  <tr key={evt.id || idx} style={{ borderBottom: '1px solid rgba(31, 46, 68, 0.4)', color: '#cbd5e1' }}>
                    <td style={{ padding: '12px 16px', color: '#64748b', fontFamily: 'monospace', fontSize: '11px' }}>
                      {evt.time || evt.timestamp ? new Date(evt.time || evt.timestamp).toLocaleString() : '-'}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#38bdf8' }}>{evt.hostServerName}</td>
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
                    <td style={{ padding: '12px 16px', color: '#94a3b8', textTransform: 'uppercase', fontSize: '11px' }}>
                      {evt.type || 'container'}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#f1f5f9' }}>
                      {evt.actor || evt.actor_name || evt.target || evt.resource || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ENTERPRISE DEEP DIVE CONTAINER TELEMETRY & DIAGNOSTIC INSPECTOR */}
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
            border: '1px solid #1f2e44',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '900px',
            maxHeight: '88vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 60px -15px rgba(0,0,0,0.9)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 22px',
              backgroundColor: '#111827',
              borderBottom: '1px solid #1f2e44',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ padding: '8px', backgroundColor: 'rgba(6, 182, 212, 0.15)', borderRadius: '8px' }}>
                  <Box size={22} color="#06b6d4" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', color: '#f1f5f9', fontWeight: 700 }}>
                    Container Observability: {inspectContainer.name || inspectContainer.names || inspectContainer.id}
                  </h3>
                  <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                    {inspectContainer.image} • Host Node: <strong style={{ color: '#38bdf8' }}>{inspectContainer.hostServerName}</strong>
                  </span>
                </div>
              </div>
              <button onClick={() => setInspectContainer(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {/* Sub-Nav Toolbar in Modal */}
            <div style={{ display: 'flex', borderBottom: '1px solid #1f2e44', backgroundColor: '#090d16', padding: '0 16px', overflowX: 'auto' }}>
              {[
                { id: 'telemetry', label: 'Live Telemetry', icon: Activity },
                { id: 'diagnostics', label: 'Health Diagnostics', icon: AlertTriangle },
                { id: 'ports', label: 'Network & Ports', icon: Globe },
                { id: 'raw', label: 'Raw Inspect JSON', icon: FileText }
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
                      padding: '12px 14px',
                      background: 'none',
                      border: 'none',
                      borderBottom: isActive ? '2px solid #06b6d4' : '2px solid transparent',
                      color: isActive ? '#06b6d4' : '#94a3b8',
                      fontSize: '12px',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
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
              
              {/* TAB 1: LIVE METRICS */}
              {inspectTab === 'telemetry' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                    <div style={{ padding: '12px', backgroundColor: '#070a11', borderRadius: '8px', border: '1px solid #1f2e44' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>CPU Utilization</span>
                      <strong style={{ fontSize: '18px', color: '#38bdf8' }}>{(inspectContainer.cpu_percent || 0).toFixed(1)}%</strong>
                    </div>
                    <div style={{ padding: '12px', backgroundColor: '#070a11', borderRadius: '8px', border: '1px solid #1f2e44' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Memory Used (RSS)</span>
                      <strong style={{ fontSize: '18px', color: '#c084fc' }}>{formatBytes(inspectContainer.memory_used_bytes || inspectContainer.memory_used || 0)}</strong>
                    </div>
                    <div style={{ padding: '12px', backgroundColor: '#070a11', borderRadius: '8px', border: '1px solid #1f2e44' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Active Status</span>
                      <strong style={{ fontSize: '14px', color: '#22c55e', textTransform: 'uppercase' }}>{inspectContainer.state || 'running'}</strong>
                    </div>
                    <div style={{ padding: '12px', backgroundColor: '#070a11', borderRadius: '8px', border: '1px solid #1f2e44' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Restart Count</span>
                      <strong style={{ fontSize: '18px', color: '#f59e0b' }}>{inspectContainer.restart_count || 0}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid #1f2e44' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Full SHA-256 ID</span>
                      <strong style={{ fontSize: '12px', color: '#f1f5f9', fontFamily: 'monospace' }}>{inspectContainer.id || inspectContainer.ID}</strong>
                    </div>
                    <div style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid #1f2e44' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Image Repository</span>
                      <strong style={{ fontSize: '12px', color: '#06b6d4', fontFamily: 'monospace' }}>{inspectContainer.image}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
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

              {/* TAB 2: DIAGNOSTIC ANALYZER */}
              {inspectTab === 'diagnostics' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#f1f5f9' }}>
                    Automated Container Health & Stability Diagnostics
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

              {/* TAB 3: PORTS & NETWORK */}
              {inspectTab === 'ports' && (
                <div style={{ padding: '16px', backgroundColor: '#070a11', borderRadius: '8px', border: '1px solid #1f2e44' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9', display: 'block', marginBottom: '8px' }}>
                    Port Mappings & Virtual Networks
                  </span>
                  <div style={{ fontFamily: 'monospace', color: '#38bdf8', fontSize: '13px' }}>
                    {inspectContainer.ports || inspectContainer.Ports || 'No host ports mapped.'}
                  </div>
                </div>
              )}

              {/* TAB 4: RAW JSON */}
              {inspectTab === 'raw' && (
                <pre style={{
                  padding: '16px',
                  backgroundColor: '#050811',
                  borderRadius: '8px',
                  border: '1px solid #1f2e44',
                  color: '#a5f3fc',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  overflowX: 'auto',
                  maxHeight: '340px'
                }}>
                  {JSON.stringify(inspectContainer, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ENTERPRISE LIVE LOG STREAMER */}
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
            border: '1px solid #1f2e44',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '1000px',
            height: '82vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 60px -15px rgba(0,0,0,0.9)'
          }}>
            {/* Logs Header */}
            <div style={{
              padding: '14px 20px',
              backgroundColor: '#111827',
              borderBottom: '1px solid #1f2e44',
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
                    Stdout/Stderr Logs: {activeLogContainer.name || activeLogContainer.names || activeLogContainer.id}
                  </h3>
                  <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                    {activeLogContainer.image} • Host: {activeLogContainer.hostServerName}
                  </span>
                </div>
              </div>

              {/* Log Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                
                {/* Severity Filter */}
                <div style={{ display: 'flex', backgroundColor: '#070a11', borderRadius: '6px', border: '1px solid #1f2e44', padding: '2px' }}>
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
                        color: logSeverity === s.id ? '#06b6d4' : '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: logSeverity === s.id ? 700 : 500
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Search in logs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#070a11', border: '1px solid #1f2e44', borderRadius: '6px', padding: '4px 8px' }}>
                  <Search size={12} color="#64748b" />
                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    style={{ background: 'none', border: 'none', color: '#f1f5f9', outline: 'none', fontSize: '11px', width: '120px' }}
                  />
                  {logSearch && (
                    <button onClick={() => setLogSearch('')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}>
                      <X size={10} />
                    </button>
                  )}
                </div>

                {/* Download Log File */}
                <button
                  onClick={handleDownloadLogs}
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid #1f2e44',
                    borderRadius: '6px',
                    color: '#38bdf8',
                    fontSize: '11px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                  title="Download complete log output"
                >
                  <Download size={12} />
                  Download
                </button>

                {/* Refresh */}
                <button
                  onClick={() => handleOpenLogs(activeLogContainer)}
                  disabled={logsLoading}
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid #1f2e44',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  <RefreshCw size={12} className={logsLoading ? 'spin' : ''} />
                  Refresh
                </button>

                <button
                  onClick={() => setActiveLogContainer(null)}
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Terminal Body with Line Numbers and Colorized Levels */}
            <div style={{
              flex: 1,
              backgroundColor: '#050811',
              padding: '14px',
              fontFamily: '"Fira Code", monospace',
              fontSize: '12px',
              lineHeight: '1.6',
              overflowY: 'auto'
            }}>
              {logsLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#06b6d4', padding: '12px' }}>
                  <RefreshCw size={14} className="spin" /> Streaming live logs...
                </div>
              ) : parsedLogLines.length === 0 ? (
                <div style={{ color: '#64748b', padding: '12px' }}>
                  No log entries found matching filter.
                </div>
              ) : (
                parsedLogLines.map(line => {
                  let color = '#34d399'; // default info/ok
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

      {/* Internal Custom CSS */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
        .container-hover-row:hover { background-color: rgba(255, 255, 255, 0.03) !important; }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .pulse-indicator { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
      `}</style>
    </div>
  );
}
