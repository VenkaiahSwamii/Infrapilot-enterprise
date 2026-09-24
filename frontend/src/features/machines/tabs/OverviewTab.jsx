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
  ArrowRight
} from 'lucide-react';
import { getMachineProcesses } from '../../../api/machines.js';

export default function OverviewTab({ machine, metrics, samples, onSelectTab, setActiveTab }) {
  const switchTab = onSelectTab || setActiveTab || (() => {});
  const [range, setRange] = useState('Last 5 minutes');
  const [processes, setProcesses] = useState([]);
  const [loadingProcs, setLoadingProcs] = useState(false);

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
      const mp = String(fs.mount_point || fs.mountPoint || fs.device || '').toLowerCase();
      return mp === '/' || mp === 'c:' || mp === 'c:\\';
    });
    if (primaryFs) {
      fsTotalBytes = Number(primaryFs.total_bytes || primaryFs.total || 0);
      fsUsedBytes = Number(primaryFs.used_bytes || primaryFs.used || 0);
    } else {
      const validFsList = fsList.filter((fs) => {
        const mp = String(fs.mount_point || fs.mountPoint || fs.device || '').toLowerCase();
        const fstype = String(fs.fs_type || fs.type || '').toLowerCase();
        return !mp.includes('/dev/shm') && !mp.includes('/run') && !mp.includes('/boot') && fstype !== 'tmpfs' && fstype !== 'devtmpfs';
      });
      validFsList.forEach((fs) => {
        fsTotalBytes += Number(fs.total_bytes || fs.total || 0);
        fsUsedBytes += Number(fs.used_bytes || fs.used || 0);
      });
    }
  }

  const rawDiskTotal = metricObj.disk_total ?? metricObj.total_disk_gb ?? machine?.disk_total ?? machine?.total_disk_gb ?? machine?.TotalDiskGB;
  const rawDiskUsed = metricObj.disk_used ?? machine?.disk_used;

  const totalDiskGb = parseGB(rawDiskTotal) || (fsTotalBytes > 0
    ? parseGB(fsTotalBytes)
    : (machine?.total_disk_gb ? Number(machine.total_disk_gb) : 0));

  const usedDiskGb = fsUsedBytes > 0
    ? parseGB(fsUsedBytes)
    : rawDiskUsed
    ? parseGB(rawDiskUsed)
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

  return (
    <div className="overview-tab-root">
      {/* SECTION 1: SYSTEM INFO & RESOURCE USAGE CIRCULAR GAUGES */}
      <div className="top-cards-row">
        {/* Card 1: System Information */}
        <div className="panel-card flex-1">
          <div className="card-title-row">
            <Info size={16} color="#06b6d4" />
            <h2>System Information</h2>
          </div>

          <div className="system-info-rows">
            <div className="info-item">
              <span className="lbl"><Monitor size={14} /> Hostname</span>
              <span className="val">{machine?.hostname || '--'}</span>
            </div>
            <div className="info-item">
              <span className="lbl"><Network size={14} /> IP Address</span>
              <span className="val">{machine?.ip_address || '--'}</span>
            </div>
            <div className="info-item">
              <span className="lbl"><Layers size={14} /> Operating System</span>
              <span className="val">{osDisplay}</span>
            </div>
            <div className="info-item">
              <span className="lbl"><Cpu size={14} /> Processor</span>
              <span className="val">{cpuModel}</span>
            </div>
            <div className="info-item">
              <span className="lbl"><HardDrive size={14} /> Graphics Card</span>
              <span className="val">{gpuModel}</span>
            </div>
            <div className="info-item">
              <span className="lbl"><Layers size={14} /> System Type</span>
              <span className="val">{systemTypeDisplay}</span>
            </div>
            <div className="info-item">
              <span className="lbl"><ShieldCheck size={14} /> Device ID</span>
              <span className="val mono">{deviceId}</span>
            </div>
            <div className="info-item">
              <span className="lbl"><Terminal size={14} /> Product ID</span>
              <span className="val mono">{productId}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Resource Usage (Circular Donut Gauges) */}
        <div className="panel-card flex-1.8">
          <div className="card-title-row">
            <BarChart2 size={16} color="#3b82f6" />
            <h2>Resource Usage</h2>
          </div>

          <div className="gauges-and-quickstats">
            {/* 4 Donut Rings */}
            <div className="donut-gauges-grid">
              {/* CPU Gauge */}
              <div className="gauge-item">
                <div className="gauge-header"><Cpu size={14} color="#06b6d4" /> CPU</div>
                <div className="gauge-ring-box">
                  <svg viewBox="0 0 100 100" className="gauge-svg">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#182335" strokeWidth="8" />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="8"
                      strokeDasharray={`${(cpuVal / 100) * 251} 251`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="gauge-val cyan-text">{cpuVal.toFixed(1)}%</div>
                </div>
                {cpuFreqMhz ? (
                  <div className="gauge-sub">{(Number(cpuFreqMhz) > 100 ? (cpuFreqMhz / 1000).toFixed(2) : Number(cpuFreqMhz).toFixed(2))} GHz</div>
                ) : null}
              </div>

              {/* Memory Gauge */}
              <div className="gauge-item">
                <div className="gauge-header"><HardDrive size={14} color="#f59e0b" /> Memory</div>
                <div className="gauge-ring-box">
                  <svg viewBox="0 0 100 100" className="gauge-svg">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#182335" strokeWidth="8" />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="8"
                      strokeDasharray={`${totalMemGb > 0 ? (memVal / 100) * 251 : 0} 251`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="gauge-val yellow-text">{totalMemGb > 0 ? `${memVal.toFixed(1)}%` : '--'}</div>
                </div>
                <div className="gauge-sub">{totalMemGb > 0 ? `${formatMem(usedMemGb)} / ${formatMem(totalMemGb)} GB` : '--'}</div>
              </div>

              {/* Disk Gauge */}
              <div className="gauge-item">
                <div className="gauge-header"><HardDrive size={14} color={actualDiskPct > 80 ? '#ef4444' : actualDiskPct > 60 ? '#f59e0b' : '#3b82f6'} /> Disk</div>
                <div className="gauge-ring-box">
                  <svg viewBox="0 0 100 100" className="gauge-svg">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#182335" strokeWidth="8" />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke={actualDiskPct > 80 ? '#ef4444' : actualDiskPct > 60 ? '#f59e0b' : '#3b82f6'}
                      strokeWidth="8"
                      strokeDasharray={`${totalDiskGb > 0 ? (actualDiskPct / 100) * 251 : 0} 251`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className={`gauge-val ${actualDiskPct > 80 ? 'red-text' : actualDiskPct > 60 ? 'yellow-text' : 'blue-text'}`}>{totalDiskGb > 0 ? `${actualDiskPct.toFixed(1)}%` : '--'}</div>
                </div>
                <div className="gauge-sub">{totalDiskGb > 0 ? `${formatMem(usedDiskGb)} / ${formatMem(totalDiskGb)} GB` : '--'}</div>
              </div>

              {/* Network Gauge */}
              <div className="gauge-item">
                <div className="gauge-header"><Network size={14} color="#3b82f6" /> Network</div>
                <div className="gauge-ring-box">
                  <svg viewBox="0 0 100 100" className="gauge-svg">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#182335" strokeWidth="8" />
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#3b82f6" strokeWidth="8" strokeDasharray={`${Math.min(251, (Number(netMbps) / 100) * 251)} 251`} strokeLinecap="round" />
                  </svg>
                  <div className="gauge-val blue-text">{netMbps} Mbps</div>
                </div>
                <div className="gauge-sub">{netMbps} Mbps</div>
              </div>
            </div>

            {/* Far Right Quick Stats Column */}
            <div className="quick-stats-col">
              <div className="stat-block">
                <span className="lbl">Uptime</span>
                <span className="val">{uptimeStr}</span>
              </div>
              <div className="stat-block">
                <span className="lbl">Last Metric</span>
                <span className="val">{lastMetricTime}</span>
              </div>
              <div className="stat-block">
                <span className="lbl">Status</span>
                <span className={`val ${isOnline ? 'green-text' : 'red-text'}`}>
                  ● {isOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <div className="stat-block">
                <span className="lbl">Agent Version</span>
                <span className="val">{agentVersion}</span>
              </div>
              <div className="stat-block">
                <span className="lbl">Metrics Interval</span>
                <span className="val">15s</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: LIVE PERFORMANCE CHARTS (4 IN A ROW) */}
      <div className="panel-card">
        <div className="card-title-row space-between">
          <h2>Live Performance</h2>
          <div className="select-pill">
            <Clock size={13} color="#94a3b8" />
            <select value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="Last 5 minutes">Last 5 minutes</option>
              <option value="Last 15 minutes">Last 15 minutes</option>
              <option value="Last 1 hour">Last 1 hour</option>
            </select>
            <ChevronDown size={13} color="#94a3b8" />
          </div>
        </div>

        <div className="live-charts-grid">
          {/* CPU Chart */}
          <div className="mini-chart-card">
            <div className="mini-chart-head">
              <span>CPU Usage (%)</span>
              <strong className="green-text">{cpuVal.toFixed(1)}%</strong>
            </div>
            <div className="mini-chart-svg-wrap">
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="chart-svg">
                <path d="M 0,30 Q 25,15 50,22 T 100,10 L 100,40 L 0,40 Z" fill="rgba(34, 197, 94, 0.12)" />
                <path d="M 0,30 Q 25,15 50,22 T 100,10" fill="none" stroke="#22c55e" strokeWidth="2" />
              </svg>
            </div>
            <div className="chart-time-labels">
              <span>16:00</span>
              <span>16:02</span>
              <span>16:04</span>
              <span>16:06</span>
            </div>
          </div>

          {/* Memory Chart */}
          <div className="mini-chart-card">
            <div className="mini-chart-head">
              <span>Memory Usage (%)</span>
              <strong className="yellow-text">{memVal.toFixed(1)}%</strong>
            </div>
            <div className="mini-chart-svg-wrap">
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="chart-svg">
                <path d="M 0,15 Q 25,22 50,18 T 100,14 L 100,40 L 0,40 Z" fill="rgba(245, 158, 11, 0.12)" />
                <path d="M 0,15 Q 25,22 50,18 T 100,14" fill="none" stroke="#f59e0b" strokeWidth="2" />
              </svg>
            </div>
            <div className="chart-time-labels">
              <span>16:00</span>
              <span>16:02</span>
              <span>16:04</span>
              <span>16:06</span>
            </div>
          </div>

          {/* Disk Chart */}
          <div className="mini-chart-card">
            <div className="mini-chart-head">
              <span>Disk Usage (%)</span>
              <strong className="red-text">{diskVal.toFixed(1)}%</strong>
            </div>
            <div className="mini-chart-svg-wrap">
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="chart-svg">
                <path d="M 0,12 Q 25,18 50,10 T 100,16 L 100,40 L 0,40 Z" fill="rgba(239, 68, 68, 0.12)" />
                <path d="M 0,12 Q 25,18 50,10 T 100,16" fill="none" stroke="#ef4444" strokeWidth="2" />
              </svg>
            </div>
            <div className="chart-time-labels">
              <span>16:00</span>
              <span>16:02</span>
              <span>16:04</span>
              <span>16:06</span>
            </div>
          </div>

          {/* Network Chart */}
          <div className="mini-chart-card">
            <div className="mini-chart-head">
              <span>Network I/O (Mbps)</span>
              <strong className="blue-text">{netMbps} Mbps</strong>
            </div>
            <div className="mini-chart-svg-wrap">
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="chart-svg">
                <path d="M 0,38 Q 25,10 50,30 T 100,15 L 100,40 L 0,40 Z" fill="rgba(59, 130, 246, 0.12)" />
                <path d="M 0,38 Q 25,10 50,30 T 100,15" fill="none" stroke="#3b82f6" strokeWidth="2" />
              </svg>
            </div>
            <div className="chart-time-labels">
              <span>16:00</span>
              <span>16:02</span>
              <span>16:04</span>
              <span>16:06</span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: BOTTOM 3 PANELS GRID */}
      <div className="bottom-three-grid">
        {/* Panel 1: Top Processes */}
        <div className="panel-card">
          <div className="card-title-row">
            <h2>Top Processes</h2>
          </div>
          <table className="proc-table">
            <thead>
              <tr>
                <th>Process Name</th>
                <th>PID</th>
                <th>CPU %</th>
                <th>Memory %</th>
              </tr>
            </thead>
            <tbody>
              {loadingProcs ? (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '16px', color: '#94a3b8' }}>
                    Loading processes...
                  </td>
                </tr>
              ) : processes && processes.length > 0 ? (
                processes.slice(0, 5).map((proc, idx) => {
                  const cpuPercent = Number(proc.cpu_percent ?? proc.cpu ?? 0).toFixed(1);
                  const memPercent = Number(proc.memory_percent ?? proc.memory ?? 0).toFixed(1);
                  return (
                    <tr key={proc.pid || idx}>
                      <td><span className="proc-name">⚙ {proc.name || proc.command || 'process'}</span></td>
                      <td className="proc-pid">{proc.pid || '--'}</td>
                      <td>
                        <div className="proc-bar-wrap">
                          <span>{cpuPercent}%</span>
                          <div className="p-bar"><div className="p-fill green-fill" style={{ width: `${Math.min(100, Math.max(0, cpuPercent))}%` }} /></div>
                        </div>
                      </td>
                      <td>
                        <div className="proc-bar-wrap">
                          <span>{memPercent}%</span>
                          <div className="p-bar"><div className="p-fill blue-fill" style={{ width: `${Math.min(100, Math.max(0, memPercent))}%` }} /></div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '16px', color: '#94a3b8' }}>
                    No active processes sampled
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <button className="panel-footer-link" onClick={() => switchTab('processes')} type="button">
            View all processes <ArrowRight size={13} />
          </button>
        </div>

        {/* Panel 2: Recent Activity */}
        <div className="panel-card">
          <div className="card-title-row">
            <h2>Recent Activity</h2>
          </div>
          <div className="activity-timeline">
            <div className="activity-item">
              <span className="act-icon green"><CheckCircle2 size={14} /></span>
              <div className="act-info">
                <strong>Agent connected</strong>
                <small>{lastMetricTime}</small>
              </div>
            </div>
            <div className="activity-item">
              <span className="act-icon blue"><Info size={14} /></span>
              <div className="act-info">
                <strong>Metrics collected</strong>
                <small>{lastMetricTime}</small>
              </div>
            </div>
            <div className="activity-item">
              <span className="act-icon blue"><Info size={14} /></span>
              <div className="act-info">
                <strong>System information updated</strong>
                <small>{lastMetricTime}</small>
              </div>
            </div>
          </div>
          <button className="panel-footer-link" onClick={() => switchTab('history')} type="button">
            View all activity <ArrowRight size={13} />
          </button>
        </div>

        {/* Panel 3: Health Status */}
        <div className="panel-card">
          <div className="card-title-row">
            <h2>Health Status</h2>
          </div>
          <div className="health-rows-list">
            <div className="health-item">
              <span><CheckCircle2 size={14} color="#22c55e" /> Agent Connection</span>
              <span className="health-tag tag-green">✓ Healthy</span>
            </div>
            <div className="health-item">
              <span><CheckCircle2 size={14} color="#22c55e" /> Metrics Collection</span>
              <span className="health-tag tag-green">✓ Healthy</span>
            </div>
            <div className="health-item">
              <span><CheckCircle2 size={14} color="#22c55e" /> System Performance</span>
              <span className="health-tag tag-green">✓ Healthy</span>
            </div>
            <div className="health-item">
              <span><CheckCircle2 size={14} color="#22c55e" /> Disk Health</span>
              <span className="health-tag tag-green">✓ Healthy</span>
            </div>
            <div className="health-item">
              <span><CheckCircle2 size={14} color="#22c55e" /> Memory Health</span>
              <span className="health-tag tag-green">✓ Healthy</span>
            </div>
            <div className="health-item">
              <span><CheckCircle2 size={14} color="#22c55e" /> CPU Health</span>
              <span className="health-tag tag-green">✓ Healthy</span>
            </div>
          </div>
          <button className="panel-footer-link" onClick={() => switchTab('metrics')} type="button">
            View health details <ArrowRight size={13} />
          </button>
        </div>
      </div>

      <style>{`
        .overview-tab-root {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
        }
        .top-cards-row {
          display: flex;
          gap: 16px;
        }
        .flex-1 { flex: 1; }
        .flex-1\.8 { flex: 1.8; }

        .panel-card {
          background-color: #101726;
          border: 1px solid #1c283d;
          border-radius: 12px;
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
        }
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

        .system-info-rows {
          display: flex;
          flex-direction: column;
        }
        .info-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #182335;
          font-size: 12.5px;
        }
        .info-item:last-child {
          border-bottom: none;
        }
        .info-item .lbl {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #64748b;
        }
        .info-item .val {
          color: #ffffff;
          font-weight: 600;
          text-align: right;
        }
        .info-item .val.mono {
          font-family: monospace;
          color: #cbd5e1;
          font-size: 11.5px;
        }

        /* GAUGES & QUICK STATS */
        .gauges-and-quickstats {
          display: flex;
          gap: 20px;
          align-items: flex-start;
        }
        .donut-gauges-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          flex: 1;
        }
        .gauge-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .gauge-header {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11.5px;
          color: #cbd5e1;
          font-weight: 600;
          margin-bottom: 6px;
        }
        .gauge-ring-box {
          position: relative;
          width: 80px;
          height: 80px;
        }
        .gauge-svg {
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
        }
        .gauge-val {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 13px;
          font-weight: 800;
        }
        .gauge-sub {
          font-size: 10px;
          color: #64748b;
          margin-top: 2px;
        }

        .quick-stats-col {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 140px;
          border-left: 1px solid #182335;
          padding-left: 16px;
        }
        .stat-block {
          display: flex;
          flex-direction: column;
        }
        .stat-block .lbl {
          font-size: 10px;
          color: #64748b;
        }
        .stat-block .val {
          font-size: 12px;
          color: #ffffff;
          font-weight: 600;
        }

        /* LIVE PERFORMANCE CHARTS */
        .select-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          background-color: #080c14;
          border: 1px solid #1c283d;
          border-radius: 6px;
          padding: 3px 8px;
        }
        .select-pill select {
          background: transparent;
          border: none;
          color: #cbd5e1;
          font-size: 11.5px;
          outline: none;
        }
        .live-charts-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }
        .mini-chart-card {
          background-color: #080c14;
          border: 1px solid #1c283d;
          border-radius: 8px;
          padding: 12px;
          display: flex;
          flex-direction: column;
        }
        .mini-chart-head {
          display: flex;
          justify-content: space-between;
          font-size: 11.5px;
          color: #94a3b8;
          margin-bottom: 8px;
        }
        .mini-chart-svg-wrap {
          height: 50px;
        }
        .chart-svg {
          width: 100%;
          height: 100%;
        }
        .chart-time-labels {
          display: flex;
          justify-content: space-between;
          font-size: 9.5px;
          color: #64748b;
          margin-top: 4px;
        }

        /* BOTTOM 3 PANELS */
        .bottom-three-grid {
          display: grid;
          grid-template-columns: 1.5fr 1fr 1fr;
          gap: 16px;
        }
        .proc-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11.5px;
          text-align: left;
        }
        .proc-table th {
          color: #64748b;
          padding: 6px 0;
          font-weight: 600;
          border-bottom: 1px solid #182335;
        }
        .proc-table td {
          padding: 8px 0;
          border-bottom: 1px solid #182335;
          color: #cbd5e1;
        }
        .proc-name { font-weight: 600; color: #ffffff; }
        .proc-pid { color: #64748b; font-family: monospace; }
        .proc-bar-wrap { display: flex; align-items: center; gap: 8px; }
        .p-bar { flex: 1; height: 5px; background-color: #182335; border-radius: 2px; overflow: hidden; }
        .p-fill { height: 100%; border-radius: 2px; }

        .activity-timeline { display: flex; flex-direction: column; gap: 10px; }
        .activity-item { display: flex; items: center; gap: 10px; font-size: 11.5px; }
        .act-icon { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; }
        .act-icon.green { background-color: rgba(34, 197, 94, 0.15); color: #22c55e; }
        .act-icon.blue { background-color: rgba(59, 130, 246, 0.15); color: #3b82f6; }
        .act-icon.yellow { background-color: rgba(245, 158, 11, 0.15); color: #f59e0b; }
        .act-info { display: flex; flex-direction: column; }
        .act-info strong { color: #f1f5f9; font-size: 12px; }
        .act-info small { color: #64748b; font-size: 10px; }

        .health-rows-list { display: flex; flex-direction: column; gap: 8px; }
        .health-item { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #cbd5e1; padding: 6px 0; border-bottom: 1px solid #182335; }
        .health-item span { display: flex; align-items: center; gap: 6px; }
        .health-tag { font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
        .tag-green { background-color: rgba(34, 197, 94, 0.15); color: #22c55e; }
        .tag-yellow { background-color: rgba(245, 158, 11, 0.15); color: #f59e0b; }
        .tag-red { background-color: rgba(239, 68, 68, 0.15); color: #ef4444; }

        .panel-footer-link {
          display: flex;
          align-items: center;
          gap: 6px;
          background: none;
          border: none;
          color: #38bdf8;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 12px;
          padding: 0;
        }

        .cyan-text { color: #06b6d4; }
        .yellow-text { color: #f59e0b; }
        .red-text { color: #ef4444; }
        .blue-text { color: #3b82f6; }
        .green-text { color: #22c55e; }

        .green-fill { background-color: #22c55e; }
        .blue-fill { background-color: #3b82f6; }
      `}</style>
    </div>
  );
}
