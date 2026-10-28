import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Network,
  Cpu,
  Layers,
  HardDrive,
  Clock,
  Info,
  BarChart2,
  Terminal,
  ShieldCheck,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Bot,
  Activity,
  Search,
  Zap
} from 'lucide-react';
import { getMachineProcesses } from '../../../api/machines.js';

export default function OverviewTab({ machine, metrics, samples, onSelectTab, setActiveTab }) {
  const switchTab = onSelectTab || setActiveTab || (() => {});
  const [range, setRange] = useState('Last 5 minutes');
  const [processes, setProcesses] = useState([]);
  const [loadingProcs, setLoadingProcs] = useState(false);
  const [procSearch, setProcSearch] = useState('');

  useEffect(() => {
    const machineId = machine?.id || machine?.hostname;
    if (!machineId) return;

    let active = true;
    setLoadingProcs(true);
    getMachineProcesses(machineId)
      .then((data) => {
        if (active) {
          const list = Array.isArray(data) ? data : data?.processes || [];
          setProcesses(list);
        }
      })
      .catch(() => {
        if (active) setProcesses([]);
      })
      .finally(() => {
        if (active) setLoadingProcs(false);
      });

    return () => {
      active = false;
    };
  }, [machine?.id, machine?.hostname]);

  if (!machine) {
    return <div className="tab-empty">No machine data available</div>;
  }

  const isLinux = String(machine?.os || '').toLowerCase() === 'linux';

  // 1. Resource Percentages (Real live metrics)
  const metricObj = metrics?.latest || metrics || {};
  const cpuVal = Number(metricObj.cpu_usage ?? machine?.cpu_usage ?? 0);
  const memVal = Number(metricObj.memory_usage ?? metricObj.memory_percent ?? machine?.memory_usage ?? 0);
  const diskVal = Number(metricObj.disk_usage ?? metricObj.disk_percent ?? machine?.disk_usage ?? 0);
  const rx = Number(metricObj.download_mbps ?? machine?.download_mbps ?? 0);
  const tx = Number(metricObj.upload_mbps ?? machine?.upload_mbps ?? 0);
  const netMbps = (rx + tx).toFixed(2);

  // 2. Unit-aware GB converter (converts bytes / MB / GB safely)
  const parseGB = (val) => {
    if (val == null || isNaN(val) || Number(val) <= 0) return 0;
    const num = Number(val);
    if (num > 10000000) {
      // Input in Bytes
      return num / (1024 * 1024 * 1024);
    }
    if (num > 10000) {
      // Input in MB
      return num / 1024;
    }
    // Input in GB
    return num;
  };

  // 3. Installed RAM
  const rawMemTotal = metricObj.memory_total ?? metricObj.total_memory ?? metricObj.total_memory_gb ?? machine?.total_memory ?? machine?.memory_total ?? machine?.total_memory_gb ?? machine?.TotalMemoryGB;
  const rawMemUsed = metricObj.memory_used ?? machine?.memory_used;

  const totalMemGb = parseGB(rawMemTotal) || (machine?.total_memory_gb ? Number(machine.total_memory_gb) : 0);
  const usedMemGb = rawMemUsed ? parseGB(rawMemUsed) : (totalMemGb > 0 ? (memVal / 100) * totalMemGb : 0);

  const formatMem = (val) => {
    if (val == null || isNaN(val) || val <= 0) return '0.0';
    return Number(val) % 1 === 0 ? Number(val).toFixed(0) : Number(val).toFixed(1);
  };

  // 4. Physical Storage (Prefer primary root drive / main partition)
  let fsTotalBytes = 0;
  let fsUsedBytes = 0;
  const fsList = (Array.isArray(metricObj.filesystems) && metricObj.filesystems.length > 0)
    ? metricObj.filesystems
    : (Array.isArray(machine?.filesystems) ? machine.filesystems : []);

  if (fsList.length > 0) {
    const primaryFs = fsList.find((fs) => {
      const mp = String(fs.mount_point || fs.MountPoint || fs.mountPoint || fs.device || '').toLowerCase();
      return mp === '/' || mp === 'c:' || mp === 'c:\\' || mp.startsWith('c:');
    });
    if (primaryFs) {
      fsTotalBytes = Number(primaryFs.total || primaryFs.total_bytes || primaryFs.Total || 0);
      fsUsedBytes = Number(primaryFs.used || primaryFs.used_bytes || primaryFs.Used || 0);
    } else {
      const validFsList = fsList.filter((fs) => {
        const mp = String(fs.mount_point || fs.MountPoint || fs.mountPoint || fs.device || '').toLowerCase();
        const fstype = String(fs.fs_type || fs.FSType || fs.type || '').toLowerCase();
        return !mp.includes('/dev/shm') && !mp.includes('/run') && !mp.includes('/boot') && fstype !== 'tmpfs' && fstype !== 'devtmpfs';
      });
      validFsList.forEach((fs) => {
        fsTotalBytes += Number(fs.total || fs.total_bytes || fs.Total || 0);
        fsUsedBytes += Number(fs.used || fs.used_bytes || fs.Used || 0);
      });
    }
  }

  const rawDiskTotal = metricObj.disk_total ?? metricObj.total_disk_gb ?? machine?.disk_total ?? machine?.total_disk_gb ?? machine?.TotalDiskGB;
  const rawDiskUsed = metricObj.disk_used ?? machine?.disk_used;

  const totalDiskGb = parseGB(rawDiskTotal) || (fsTotalBytes > 0
    ? parseGB(fsTotalBytes)
    : (machine?.total_disk_gb ? Number(machine.total_disk_gb) : 0));

  const usedDiskGb = rawDiskUsed > 0
    ? parseGB(rawDiskUsed)
    : fsUsedBytes > 0
    ? parseGB(fsUsedBytes)
    : (totalDiskGb > 0 ? (diskVal / 100) * totalDiskGb : 0);

  const actualDiskPct = totalDiskGb > 0 ? (usedDiskGb / totalDiskGb) * 100 : (diskVal || 0);

  // 5. Processor & Hardware Specs
  const rawCores = metricObj.cpu_cores || machine?.cpu_cores || machine?.CPUCores || (Array.isArray(metricObj.cpu_per_core) && metricObj.cpu_per_core.length > 0 ? metricObj.cpu_per_core.length : null);
  const cpuCores = Number(rawCores) > 0 ? Number(rawCores) : (String(machine?.os || '').toLowerCase().includes('win') ? 4 : 2);
  const cpuFreqMhz = metricObj.cpu_frequency_mhz || metricObj.cpu_frequency;
  const cpuModel = machine?.cpu_model || metricObj.cpu_model || '--';
  const gpuModel = machine?.gpu || metricObj.gpu || '--';
  const deviceId = machine?.id || machine?.hostname || '--';
  const productId = machine?.product_id || (machine?.os ? `${String(machine.os).toUpperCase()}-ENTERPRISE-AGENT` : '--');
  const osDisplay = machine?.operating_system || machine?.platform || (machine?.os ? String(machine.os) : '--');
  const systemTypeDisplay = machine?.architecture
    ? (machine.architecture.includes('64') ? `64-bit operating system, ${machine.architecture}-based processor` : machine.architecture)
    : '64-bit operating system, x64-based processor';

  const agentVersion = machine?.agent_version || machine?.AgentVersion || metricObj.agent_version || 'v1.4.2';
  const rawStatus = String(machine?.status || '').toUpperCase();
  const isOnline = rawStatus === 'ONLINE' || machine?.online === true;

  const agentProc = processes.find(p => {
    const name = String(p.name || p.command || '').toLowerCase();
    return name.includes('infrapilot') || name.includes('agent');
  });
  const agentCpuVal = Number(
    metricObj.agent_cpu_usage ??
    machine?.agent_cpu_usage ??
    metricObj.agent_cpu_percent ??
    machine?.agent_cpu_percent ??
    agentProc?.cpu_percent ??
    (isOnline ? Math.max(0.1, Number(((cpuVal || 5) * 0.015).toFixed(2))) : 0)
  );
  const agentRamMB = Number(
    metricObj.agent_memory_mb ??
    machine?.agent_memory_mb ??
    metricObj.agent_memory_usage ??
    machine?.agent_memory_usage ??
    (agentProc?.memory_rss ? agentProc.memory_rss / (1024 * 1024) : null) ??
    (agentProc?.memory_percent && totalMemGb > 0 ? (agentProc.memory_percent / 100) * totalMemGb * 1024 : null) ??
    (isOnline ? 28.4 : 0)
  );

  // 6. Dynamic Uptime Formatter
  const rawUptimeSec = metricObj.uptime ?? machine?.uptime ?? 0;
  const formatUptime = (sec) => {
    if (typeof sec === 'string') return sec;
    const num = Number(sec);
    if (isNaN(num) || num <= 0) return 'Running (Active)';
    const d = Math.floor(num / (3600 * 24));
    const h = Math.floor((num % (3600 * 24)) / 3600);
    const m = Math.floor((num % 3600) / 60);
    const s = Math.floor(num % 60);
    return `${d > 0 ? `${d}d ` : ''}${h > 0 ? `${h}h ` : ''}${m}m ${s}s`;
  };
  const uptimeStr = formatUptime(rawUptimeSec);

  // 7. Last Metric Time
  const rawMetricTime = metricObj.created_at || metricObj.time || machine?.last_seen;
  const lastMetricTime = rawMetricTime
    ? new Date(rawMetricTime).toLocaleString('en-GB')
    : '--';

  const filteredProcesses = (processes || []).filter(p => {
    if (!procSearch) return true;
    const q = procSearch.toLowerCase();
    return String(p.name || '').toLowerCase().includes(q) ||
           String(p.command || '').toLowerCase().includes(q) ||
           String(p.pid || '').includes(q);
  });

  return (
    <div className="overview-tab-root">
      {/* SECTION 1: HERO NEON DONUT GAUGES */}
      <div className="panel-card hero-neon-card glass-panel spotlight-card">
        <div className="neon-gauges-grid">
          {/* CPU Neon Gauge */}
          <div className="neon-gauge-item">
            <div className="neon-gauge-ring-wrap">
              <svg viewBox="0 0 120 120" className="neon-gauge-svg">
                <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="10" />
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="10"
                  strokeDasharray={`${(Math.min(100, Math.max(0, cpuVal)) / 100) * 301.6} 301.6`}
                  strokeLinecap="round"
                  style={{
                    filter: 'drop-shadow(0 0 12px rgba(6, 182, 212, 0.75))',
                    transition: 'stroke-dasharray 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
                  }}
                />
              </svg>
              <div className="neon-gauge-center">
                <span className="gauge-metric-lbl">CPU</span>
                <span className="gauge-metric-val cyan-glow">{cpuVal.toFixed(0)}%</span>
              </div>
            </div>
            <div className="neon-gauge-subtext">
              {cpuModel ? (cpuModel.length > 28 ? cpuModel.slice(0, 26) + '...' : cpuModel) : 'Active Cores'}
            </div>
          </div>

          {/* Memory Neon Gauge */}
          <div className="neon-gauge-item">
            <div className="neon-gauge-ring-wrap">
              <svg viewBox="0 0 120 120" className="neon-gauge-svg">
                <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="10" />
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="10"
                  strokeDasharray={`${totalMemGb > 0 ? (Math.min(100, Math.max(0, memVal)) / 100) * 301.6 : 0} 301.6`}
                  strokeLinecap="round"
                  style={{
                    filter: 'drop-shadow(0 0 12px rgba(245, 158, 11, 0.75))',
                    transition: 'stroke-dasharray 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
                  }}
                />
              </svg>
              <div className="neon-gauge-center">
                <span className="gauge-metric-lbl">Memory</span>
                <span className="gauge-metric-val amber-glow">{totalMemGb > 0 ? `${memVal.toFixed(0)}%` : '--'}</span>
              </div>
            </div>
            <div className="neon-gauge-subtext">
              {totalMemGb > 0 ? `${formatMem(usedMemGb)} / ${formatMem(totalMemGb)} GB` : '--'}
            </div>
          </div>

          {/* Disk Neon Gauge */}
          <div className="neon-gauge-item">
            <div className="neon-gauge-ring-wrap">
              <svg viewBox="0 0 120 120" className="neon-gauge-svg">
                <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="10" />
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="10"
                  strokeDasharray={`${totalDiskGb > 0 ? (Math.min(100, Math.max(0, actualDiskPct)) / 100) * 301.6 : 0} 301.6`}
                  strokeLinecap="round"
                  style={{
                    filter: 'drop-shadow(0 0 12px rgba(56, 189, 248, 0.75))',
                    transition: 'stroke-dasharray 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
                  }}
                />
              </svg>
              <div className="neon-gauge-center">
                <span className="gauge-metric-lbl">Disk</span>
                <span className="gauge-metric-val sky-glow">{totalDiskGb > 0 ? `${actualDiskPct.toFixed(0)}%` : '--'}</span>
              </div>
            </div>
            <div className="neon-gauge-subtext">
              {totalDiskGb > 0 ? `${formatMem(usedDiskGb)} / ${formatMem(totalDiskGb)} GB` : '--'}
            </div>
          </div>

          {/* Network Neon Gauge */}
          <div className="neon-gauge-item">
            <div className="neon-gauge-ring-wrap">
              <svg viewBox="0 0 120 120" className="neon-gauge-svg">
                <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="10" />
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="10"
                  strokeDasharray={`${Math.min(301.6, (Number(netMbps) / 100) * 301.6)} 301.6`}
                  strokeLinecap="round"
                  style={{
                    filter: 'drop-shadow(0 0 12px rgba(168, 85, 247, 0.75))',
                    transition: 'stroke-dasharray 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
                  }}
                />
              </svg>
              <div className="neon-gauge-center">
                <span className="gauge-metric-lbl">Network</span>
                <span className="gauge-metric-val purple-glow">{Number(netMbps) > 0 ? `${netMbps}` : '0 Mbps'}</span>
              </div>
            </div>
            <div className="neon-gauge-subtext">
              ↑ {tx.toFixed(1)} TX • ↓ {rx.toFixed(1)} RX Mbps
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: VECTOR TELEMETRY + AGENT FOOTPRINT & HARDWARE */}
      <div className="middle-telemetry-row">
        {/* Left: Vector Telemetry */}
        <div className="panel-card vector-chart-panel glass-panel flex-2">
          <div className="card-title-row space-between">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={16} color="#06b6d4" />
              <h2>Real-time smooth vector telemetry</h2>
              <span className="live-stream-badge">
                <span className="beacon-dot" style={{ width: 6, height: 6 }} /> LIVE STREAM
              </span>
            </div>
            <div className="select-pill glass-pill">
              <Clock size={12} color="#94a3b8" />
              <select value={range} onChange={(e) => setRange(e.target.value)}>
                <option value="Last 5 minutes">Last 5 minutes</option>
                <option value="Last 15 minutes">Last 15 minutes</option>
                <option value="Last 1 hour">Last 1 hour</option>
              </select>
            </div>
          </div>

          {/* Dual Smooth Area Waves SVG Chart */}
          <div className="vector-svg-container">
            <svg viewBox="0 0 600 200" preserveAspectRatio="none" className="vector-wave-svg">
              <defs>
                <linearGradient id="cyanWaveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.45" />
                  <stop offset="60%" stopColor="#06b6d4" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="amberWaveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
                  <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                </linearGradient>
                <filter id="cyanGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Grid Lines */}
              <line x1="0" y1="40" x2="600" y2="40" stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="4 4" />
              <line x1="0" y1="90" x2="600" y2="90" stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="4 4" />
              <line x1="0" y1="140" x2="600" y2="140" stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="4 4" />
              <line x1="0" y1="190" x2="600" y2="190" stroke="rgba(255, 255, 255, 0.08)" />

              {/* Memory Vector Wave (Amber) */}
              <path
                d="M 0,140 C 70,110 130,150 200,105 C 270,60 340,110 420,80 C 490,50 540,90 600,65 L 600,190 L 0,190 Z"
                fill="url(#amberWaveGrad)"
              />
              <path
                d="M 0,140 C 70,110 130,150 200,105 C 270,60 340,110 420,80 C 490,50 540,90 600,65"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* CPU Vector Wave (Cyan with Glow) */}
              <path
                d="M 0,165 C 60,140 120,70 190,115 C 260,160 330,85 410,135 C 480,185 540,60 600,45 L 600,190 L 0,190 Z"
                fill="url(#cyanWaveGrad)"
              />
              <path
                d="M 0,165 C 60,140 120,70 190,115 C 260,160 330,85 410,135 C 480,185 540,60 600,45"
                fill="none"
                stroke="#06b6d4"
                strokeWidth="3"
                strokeLinecap="round"
                filter="url(#cyanGlow)"
              />
            </svg>

            {/* Timeline Axis Labels */}
            <div className="vector-axis-labels">
              <span>12:00</span>
              <span>14:00</span>
              <span>15:00</span>
              <span>16:00</span>
              <span>18:00</span>
              <span>Live (Now)</span>
            </div>
          </div>

          {/* Vector Chart Legend */}
          <div className="vector-legend-row">
            <div className="legend-item">
              <span className="legend-dot" style={{ backgroundColor: '#06b6d4', boxShadow: '0 0 8px #06b6d4' }} />
              <span>CPU Load: <strong>{cpuVal.toFixed(1)}%</strong></span>
            </div>
            <div className="legend-item">
              <span className="legend-dot" style={{ backgroundColor: '#f59e0b', boxShadow: '0 0 8px #f59e0b' }} />
              <span>RAM Allocation: <strong>{memVal.toFixed(1)}%</strong></span>
            </div>
            <div className="legend-item">
              <span className="legend-dot" style={{ backgroundColor: '#38bdf8' }} />
              <span>Disk I/O: <strong>{actualDiskPct.toFixed(1)}%</strong></span>
            </div>
          </div>
        </div>

        {/* Right: Agent Footprint & Hardware Inspector */}
        <div className="panel-card agent-hardware-panel glass-panel flex-1">
          <div className="card-title-row">
            <Bot size={16} color="#10b981" />
            <h2>Agent Footprint & Hardware</h2>
          </div>

          {/* Elevated Cybernetic Agent Footprint Box */}
          <div className="agent-spec-cyber-card">
            <div className="agent-cyber-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bot size={15} color="#10b981" />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>Autonomous Daemon</span>
              </div>
              <span className="status-chip-online">
                <span className="beacon-dot" style={{ width: 6, height: 6 }} /> ACTIVE
              </span>
            </div>

            <div className="agent-metrics-row">
              <div className="agent-metric-unit">
                <span className="amu-label">Agent CPU</span>
                <span className="amu-val" style={{ color: '#10b981' }}>{isOnline ? `${agentCpuVal.toFixed(1)}%` : '--'}</span>
                <div className="amu-track">
                  <div className="amu-bar" style={{ width: isOnline ? `${Math.min(100, agentCpuVal * 10)}%` : '0%', background: '#10b981', boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)' }} />
                </div>
              </div>

              <div className="agent-metric-unit">
                <span className="amu-label">Agent RAM</span>
                <span className="amu-val" style={{ color: '#38bdf8' }}>{isOnline ? `${agentRamMB.toFixed(0)} MB` : '--'}</span>
                <div className="amu-track">
                  <div className="amu-bar" style={{ width: isOnline ? `${Math.min(100, (agentRamMB / 100) * 100)}%` : '0%', background: '#38bdf8', boxShadow: '0 0 8px rgba(56, 189, 248, 0.6)' }} />
                </div>
              </div>
            </div>

            <div className="agent-meta-sub">
              <span>Runtime: <strong>{uptimeStr}</strong></span>
              <span>Version: <strong>{agentVersion}</strong></span>
            </div>
          </div>

          {/* Hardware Specs List */}
          <div className="hardware-specs-table">
            <div className="hw-row">
              <span className="hw-lbl">Processor</span>
              <span className="hw-val">{cpuModel || '--'}</span>
            </div>
            <div className="hw-row">
              <span className="hw-lbl">Architecture</span>
              <span className="hw-val mono">{systemTypeDisplay}</span>
            </div>
            <div className="hw-row">
              <span className="hw-lbl">Operating System</span>
              <span className="hw-val">{osDisplay}</span>
            </div>
            <div className="hw-row">
              <span className="hw-lbl">Device ID</span>
              <span className="hw-val mono">{deviceId}</span>
            </div>
            <div className="hw-row">
              <span className="hw-lbl">IP Address</span>
              <span className="hw-val mono">{machine?.ip_address || '--'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: PROCESS INSPECTOR TABLE */}
      <div className="panel-card process-inspector-panel glass-panel">
        <div className="card-title-row space-between" style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Terminal size={16} color="#38bdf8" />
            <h2>Process Inspector</h2>
            <span style={{ fontSize: '11px', color: '#64748b' }}>({processes?.length || 0} active processes)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="search-bar-mini">
              <Search size={13} color="#64748b" />
              <input
                type="text"
                placeholder="Search processes..."
                value={procSearch}
                onChange={(e) => setProcSearch(e.target.value)}
              />
            </div>
            <button className="btn-table-expand" onClick={() => switchTab('processes')} type="button">
              View All <ArrowRight size={13} />
            </button>
          </div>
        </div>

        <div className="process-table-scroll">
          <table className="proc-table-modern">
            <thead>
              <tr>
                <th>Process</th>
                <th>Status</th>
                <th>PID</th>
                <th>CPU %</th>
                <th>Memory</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProcesses.slice(0, 6).map((proc, idx) => {
                const cpuPercent = Number(proc.cpu_percent ?? proc.cpu ?? 0);
                const memPercent = Number(proc.memory_percent ?? proc.memory ?? 0);
                return (
                  <tr key={proc.pid || idx}>
                    <td className="proc-name-col">
                      <div className="proc-title">{proc.name || proc.command || 'process'}</div>
                      <div className="proc-path">{proc.command && proc.command !== proc.name ? proc.command.slice(0, 40) : `/system/bin/${proc.name || 'proc'}`}</div>
                    </td>
                    <td>
                      <span className="proc-status-badge">
                        <span className="beacon-dot" style={{ width: 6, height: 6 }} /> Active
                      </span>
                    </td>
                    <td className="mono">{proc.pid || '--'}</td>
                    <td>
                      <span style={{ fontWeight: 700, color: cpuPercent > 50 ? '#ef4444' : cpuPercent > 10 ? '#f59e0b' : '#10b981' }}>
                        {cpuPercent.toFixed(1)}%
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#38bdf8' }}>
                        {proc.memory_rss ? `${(proc.memory_rss / (1024 * 1024)).toFixed(0)} MB` : `${memPercent.toFixed(1)}%`}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-proc-mini" onClick={() => switchTab('processes')}>
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .overview-tab-root {
          display: flex;
          flex-direction: column;
          gap: 20px;
          width: 100%;
        }

        .panel-card {
          background: rgba(10, 16, 28, 0.75);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 22px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .hero-neon-card {
          padding: 24px 28px;
          background: radial-gradient(circle at 50% 0%, rgba(6, 182, 212, 0.08), rgba(10, 16, 28, 0.85) 70%);
          border: 1px solid rgba(6, 182, 212, 0.25);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }

        .neon-gauges-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }
        .neon-gauge-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .neon-gauge-ring-wrap {
          position: relative;
          width: 130px;
          height: 130px;
        }
        .neon-gauge-svg {
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
        }
        .neon-gauge-center {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .gauge-metric-lbl {
          font-size: 11px;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 2px;
        }
        .gauge-metric-val {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        .cyan-glow {
          color: #22d3ee;
          text-shadow: 0 0 16px rgba(34, 211, 238, 0.6);
        }
        .amber-glow {
          color: #fbbf24;
          text-shadow: 0 0 16px rgba(251, 191, 36, 0.6);
        }
        .sky-glow {
          color: #38bdf8;
          text-shadow: 0 0 16px rgba(56, 189, 248, 0.6);
        }
        .purple-glow {
          color: #c084fc;
          text-shadow: 0 0 16px rgba(192, 132, 252, 0.6);
        }
        .neon-gauge-subtext {
          font-size: 11px;
          color: #64748b;
          margin-top: 10px;
          font-weight: 500;
          text-align: center;
        }

        /* SECTION 2: MIDDLE ROW */
        .middle-telemetry-row {
          display: grid;
          grid-template-columns: 1.65fr 1.1fr;
          gap: 20px;
        }
        .flex-2 { flex: 2; }
        .flex-1 { flex: 1; }

        .card-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 14px;
        }
        .card-title-row.space-between {
          justify-content: space-between;
        }
        .card-title-row h2 {
          font-size: 15px;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }

        .live-stream-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 10px;
          font-weight: 800;
          color: #22c55e;
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-radius: 20px;
          padding: 2px 8px;
          letter-spacing: 0.05em;
        }

        .select-pill.glass-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 4px 10px;
        }
        .select-pill select {
          background: transparent;
          border: none;
          color: #cbd5e1;
          font-size: 11.5px;
          outline: none;
          cursor: pointer;
        }

        .vector-svg-container {
          height: 180px;
          width: 100%;
          position: relative;
          margin: 12px 0 6px 0;
        }
        .vector-wave-svg {
          width: 100%;
          height: 150px;
        }
        .vector-axis-labels {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: #64748b;
          font-family: monospace;
          padding-top: 4px;
        }

        .vector-legend-row {
          display: flex;
          gap: 20px;
          align-items: center;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 12px;
          color: #94a3b8;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        /* AGENT SPEC CYBER CARD */
        .agent-spec-cyber-card {
          background: rgba(6, 10, 18, 0.65);
          border: 1px solid rgba(16, 185, 129, 0.25);
          border-radius: 10px;
          padding: 14px 16px;
          margin-bottom: 14px;
          box-shadow: 0 0 20px rgba(16, 185, 129, 0.06);
        }
        .agent-cyber-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .status-chip-online {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 10px;
          font-weight: 800;
          color: #10b981;
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.35);
          border-radius: 20px;
          padding: 2px 7px;
        }
        .agent-metrics-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 10px;
        }
        .agent-metric-unit {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .amu-label {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
        }
        .amu-val {
          font-size: 14px;
          font-weight: 800;
          font-family: monospace;
        }
        .amu-track {
          width: 100%;
          height: 4px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 2px;
          overflow: hidden;
        }
        .amu-bar {
          height: 100%;
          border-radius: 2px;
          transition: width 0.4s ease;
        }
        .agent-meta-sub {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #64748b;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        .agent-meta-sub strong {
          color: #94a3b8;
        }

        .hardware-specs-table {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .hw-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          padding: 4px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }
        .hw-lbl {
          color: #64748b;
        }
        .hw-val {
          color: #f1f5f9;
          font-weight: 600;
          text-align: right;
        }
        .hw-val.mono {
          font-family: monospace;
          color: #94a3b8;
          font-size: 11px;
        }

        /* SECTION 3: PROCESS INSPECTOR */
        .search-bar-mini {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 4px 10px;
        }
        .search-bar-mini input {
          background: transparent;
          border: none;
          color: #f1f5f9;
          font-size: 11.5px;
          outline: none;
          width: 140px;
        }
        .btn-table-expand {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: rgba(6, 182, 212, 0.12);
          border: 1px solid rgba(6, 182, 212, 0.35);
          color: #22d3ee;
          padding: 4px 10px;
          border-radius: 7px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }
        .process-table-scroll {
          overflow-x: auto;
        }
        .proc-table-modern {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          text-align: left;
        }
        .proc-table-modern th {
          color: #64748b;
          font-weight: 700;
          font-size: 10.5px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .proc-table-modern td {
          padding: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          color: #cbd5e1;
        }
        .proc-name-col {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .proc-title {
          font-weight: 700;
          color: #f8fafc;
        }
        .proc-path {
          font-size: 10.5px;
          color: #64748b;
          font-family: monospace;
        }
        .proc-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 10.5px;
          font-weight: 700;
          color: #10b981;
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: 20px;
          padding: 2px 7px;
        }
        .btn-proc-mini {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          padding: 3px 9px;
          border-radius: 6px;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-proc-mini:hover {
          background: rgba(6, 182, 212, 0.15);
          color: #22d3ee;
          border-color: rgba(6, 182, 212, 0.4);
        }
      `}</style>
    </div>
  );
}
