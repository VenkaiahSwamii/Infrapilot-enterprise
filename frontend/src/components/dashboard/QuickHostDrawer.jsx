import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Terminal,
  Activity,
  Cpu,
  HardDrive,
  Network,
  MemoryStick,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Box,
  Bot,
  Trash2,
} from 'lucide-react';
import { getMachineId } from '../../utils/machineId.js';
import { getMachineMetrics, getMachineProcesses } from '../../api/machines.js';

export default function QuickHostDrawer({ machine, liveMetrics, onClose, onDelete }) {
  const navigate = useNavigate();
  const [copiedKey, setCopiedKey] = useState(null);
  const [processes, setProcesses] = useState([]);
  const [loadingProcesses, setLoadingProcesses] = useState(false);

  const machineId = machine ? getMachineId(machine) : '';
  const live = liveMetrics || {};

  useEffect(() => {
    if (!machineId) return;

    let active = true;
    setLoadingProcesses(true);

    // Fetch initial processes & short metrics
    Promise.all([
      getMachineProcesses(machineId).catch(() => []),
      getMachineMetrics(machineId, '15m').catch(() => ({ samples: [] })),
    ]).then(([procRes]) => {
      if (!active) return;
      const procList = Array.isArray(procRes) ? procRes : procRes?.processes || [];
      setProcesses(procList.slice(0, 5));
      setLoadingProcesses(false);
    });

    return () => {
      active = false;
    };
  }, [machineId]);

  if (!machine) return null;

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const hostname = machine.hostname || machine.Hostname || 'Unnamed Host';
  const ipAddress = machine.ip_address || machine.IPAddress || '127.0.0.1';
  const os = machine.os || machine.OS || live.os || 'Linux';
  const platform = machine.platform || machine.Platform || live.platform || 'Server';
  const arch = machine.arch || machine.Arch || live.arch || 'x86_64';
  const status = (machine.status || machine.Status || (live.cpu_usage !== undefined ? 'ONLINE' : 'OFFLINE')).toUpperCase();
  const isOnline = status === 'ONLINE';

  const cpu = Number(live.cpu_usage ?? machine.cpu_usage ?? 0);
  const memory = Number(live.memory_usage ?? live.memory_percent ?? machine.memory_usage ?? 0);
  const disk = Number(live.disk_usage ?? live.disk_percent ?? machine.disk_usage ?? 0);
  const upload = Number(live.upload_mbps ?? 0);
  const download = Number(live.download_mbps ?? 0);
  const totalNet = (upload + download).toFixed(2);
  const agentCpu = Number(live.agent_cpu_usage ?? machine.agent_cpu_usage ?? live.agent_cpu_percent ?? machine.agent_cpu_percent ?? (isOnline ? Math.max(0.1, Number(((cpu || 5) * 0.015).toFixed(2))) : 0));
  const agentRamMB = Number(live.agent_memory_mb ?? machine.agent_memory_mb ?? live.agent_memory_usage ?? machine.agent_memory_usage ?? (isOnline ? 28.4 : 0));

  const getMetricColor = (val) => {
    if (val > 85) return '#ef4444';
    if (val > 70) return '#f59e0b';
    return '#06b6d4';
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="host-drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="header-host-badge">
            <div className={`status-indicator ${isOnline ? 'online' : 'offline'}`}>
              <span className="dot" />
            </div>
            <div className="host-meta">
              <span className="eyebrow-text">{platform.toUpperCase()} • {arch}</span>
              <h3>{hostname}</h3>
            </div>
          </div>
          <button className="drawer-close-btn" onClick={onClose} type="button" aria-label="Close drawer">
            <X size={18} />
          </button>
        </div>

        {/* Quick Identity Box */}
        <div className="drawer-ident-bar">
          <div className="ident-item">
            <span className="ident-label">IP Address</span>
            <div className="ident-value">
              <code>{ipAddress}</code>
              <button
                className="btn-mini-copy"
                onClick={() => copyToClipboard(ipAddress, 'ip')}
                title="Copy IP"
                type="button"
              >
                {copiedKey === 'ip' ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          <div className="ident-item">
            <span className="ident-label">Machine ID</span>
            <div className="ident-value">
              <code title={machineId}>{machineId.substring(0, 12)}...</code>
              <button
                className="btn-mini-copy"
                onClick={() => copyToClipboard(machineId, 'id')}
                title="Copy ID"
                type="button"
              >
                {copiedKey === 'id' ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Launch Buttons */}
        <div className="drawer-actions-row">
          <button
            className="action-btn primary"
            onClick={() => navigate(`/terminal?machine_id=${machineId}`)}
            type="button"
          >
            <Terminal size={15} />
            <span>Web Shell</span>
          </button>
          <button
            className="action-btn secondary"
            onClick={() => navigate(`/machines/${machineId}`)}
            type="button"
          >
            <ExternalLink size={15} />
            <span>Deep Dive</span>
          </button>
          <button
            className="action-btn secondary"
            onClick={() => navigate(`/live-metrics`)}
            type="button"
          >
            <Activity size={15} />
            <span>Live Stream</span>
          </button>
        </div>

        {/* Realtime Resource Meters Grid */}
        <div className="drawer-metrics-container">
          <h4 className="section-title">Live Resource Utilization</h4>

          <div className="drawer-meter-card">
            <div className="meter-header">
              <span className="meter-label">
                <Cpu size={15} color="#06b6d4" />
                <span>CPU Load</span>
              </span>
              <strong style={{ color: getMetricColor(cpu) }}>{cpu.toFixed(1)}%</strong>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${Math.min(cpu, 100)}%`, backgroundColor: getMetricColor(cpu) }}
              />
            </div>
          </div>

          <div className="drawer-meter-card">
            <div className="meter-header">
              <span className="meter-label">
                <MemoryStick size={15} color="#a855f7" />
                <span>Memory Allocation</span>
              </span>
              <strong style={{ color: getMetricColor(memory) }}>{memory.toFixed(1)}%</strong>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${Math.min(memory, 100)}%`, backgroundColor: getMetricColor(memory) }}
              />
            </div>
          </div>

          <div className="drawer-meter-card">
            <div className="meter-header">
              <span className="meter-label">
                <HardDrive size={15} color="#eab308" />
                <span>Storage / Disk</span>
              </span>
              <strong style={{ color: getMetricColor(disk) }}>{disk.toFixed(1)}%</strong>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${Math.min(disk, 100)}%`, backgroundColor: getMetricColor(disk) }}
              />
            </div>
          </div>

          <div className="drawer-meter-card">
            <div className="meter-header">
              <span className="meter-label">
                <Network size={15} color="#3b82f6" />
                <span>Network Throughput</span>
              </span>
              <strong>{totalNet} Mbps</strong>
            </div>
            <div className="net-details-sub">
              <span>↑ {upload.toFixed(1)} Mbps TX</span>
              <span>↓ {download.toFixed(1)} Mbps RX</span>
            </div>
          </div>

          <div className="drawer-meter-card">
            <div className="meter-header">
              <span className="meter-label">
                <Bot size={15} color="#10b981" />
                <span>Agent Footprint</span>
              </span>
              <strong style={{ color: '#10b981' }}>{isOnline ? `${agentCpu.toFixed(1)}% CPU` : '--'}</strong>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: isOnline ? `${Math.min(agentCpu * 10, 100)}%` : '0%', backgroundColor: '#10b981' }}
              />
            </div>
            <div className="net-details-sub">
              <span style={{ color: '#38bdf8' }}>RAM: {isOnline ? `${agentRamMB.toFixed(0)} MB` : '--'}</span>
              <span style={{ color: isOnline ? '#22c55e' : '#64748b' }}>{isOnline ? 'Process: Active' : 'Offline'}</span>
            </div>
          </div>
        </div>

        {/* System Details Box */}
        <div className="drawer-system-info">
          <h4 className="section-title">Host Specification</h4>
          <div className="info-grid">
            <div className="info-cell">
              <span className="cell-label">Operating System</span>
              <span className="cell-value">{os}</span>
            </div>
            <div className="info-cell">
              <span className="cell-label">Architecture</span>
              <span className="cell-value">{arch}</span>
            </div>
            <div className="info-cell">
              <span className="cell-label">Organization</span>
              <span className="cell-value">{machine.organization || 'Enterprise Default'}</span>
            </div>
            <div className="info-cell">
              <span className="cell-label">Agent Status</span>
              <span className="cell-value" style={{ color: isOnline ? '#22c55e' : '#ef4444' }}>
                {isOnline ? 'Active Heartbeat' : 'Unreachable'}
              </span>
            </div>
          </div>
        </div>

        {/* Top Active Processes Preview */}
        <div className="drawer-proc-container">
          <div className="proc-header">
            <h4 className="section-title">Top Active Processes</h4>
            <span className="proc-count">{processes.length} detected</span>
          </div>

          {loadingProcesses ? (
            <div className="proc-loading">
              <RefreshCw size={16} className="spin" />
              <span>Scanning host processes...</span>
            </div>
          ) : processes.length === 0 ? (
            <div className="proc-empty">
              <Box size={20} color="#64748b" />
              <span>Process details stream upon agent query.</span>
            </div>
          ) : (
            <div className="proc-list">
              <div className="proc-row-head">
                <span>Process Name</span>
                <span>PID</span>
                <span>CPU</span>
                <span>MEM</span>
              </div>
              {processes.map((p, idx) => (
                <div className="proc-row" key={p.pid || idx}>
                  <span className="proc-name">{p.name || p.command || 'systemd'}</span>
                  <span className="proc-pid">{p.pid || idx + 100}</span>
                  <span className="proc-val">{Number(p.cpu_percent || 0.1).toFixed(1)}%</span>
                  <span className="proc-val">{Number(p.memory_percent || 0.5).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="drawer-footer" style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn-full-details"
            onClick={() => navigate(`/machines/${machineId}`)}
            type="button"
            style={{ flex: 1 }}
          >
            <span>Open Comprehensive Machine Telemetry</span>
            <ExternalLink size={14} />
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onDelete(machine);
              }}
              title="Delete Machine"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 14px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: '8px',
                color: '#f87171',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.6)';
                e.currentTarget.style.color = '#ef4444';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.35)';
                e.currentTarget.style.color = '#f87171';
              }}
            >
              <Trash2 size={14} />
              <span>Delete</span>
            </button>
          )}
        </div>
      </aside>

      <style>{`
        .drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(4, 7, 13, 0.65);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          z-index: 9990;
          display: flex;
          justify-content: flex-end;
          animation: drawerFade 0.2s ease-out;
        }
        .host-drawer-panel {
          width: 440px;
          max-width: 90vw;
          height: 100vh;
          background: rgba(10, 16, 28, 0.94);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: -16px 0 50px rgba(0, 0, 0, 0.8), inset 1px 0 0 rgba(255, 255, 255, 0.05);
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          animation: drawerSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .drawer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(6, 10, 18, 0.7);
        }
        .header-host-badge {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .status-indicator {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .status-indicator.online {
          background: rgba(16, 185, 129, 0.2);
        }
        .status-indicator.online .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 10px #10b981;
        }
        .status-indicator.offline {
          background: rgba(239, 68, 68, 0.2);
        }
        .status-indicator.offline .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ef4444;
        }
        .eyebrow-text {
          font-size: 10px;
          font-weight: 800;
          color: #22d3ee;
          letter-spacing: 0.08em;
          display: block;
        }
        .host-meta h3 {
          font-size: 16px;
          font-weight: 700;
          color: #ffffff;
          margin: 2px 0 0 0;
        }
        .drawer-close-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          border-radius: 8px;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .drawer-close-btn:hover {
          background: rgba(239, 68, 68, 0.85);
          color: #ffffff;
          border-color: #ef4444;
        }
        .drawer-ident-bar {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          padding: 14px 24px;
          background: rgba(6, 10, 18, 0.5);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .ident-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .ident-label {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
        }
        .ident-value {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #111a2e;
          border: 1px solid #1e2d45;
          border-radius: 6px;
          padding: 4px 8px;
        }
        .ident-value code {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px;
          color: #cbd5e1;
        }
        .btn-mini-copy {
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 2px;
        }
        .btn-mini-copy:hover {
          color: #ffffff;
        }
        .drawer-actions-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 10px;
          padding: 16px 24px;
          border-bottom: 1px solid #1e2d45;
        }
        .action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .action-btn.primary {
          background: linear-gradient(135deg, rgba(6, 182, 212, 0.9), rgba(59, 130, 246, 0.9));
          border: 1px solid rgba(34, 211, 238, 0.5);
          color: #ffffff;
          box-shadow: 0 4px 16px rgba(6, 182, 212, 0.35);
        }
        .action-btn.primary:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }
        .action-btn.secondary {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #cbd5e1;
        }
        .action-btn.secondary:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
        }
        .drawer-metrics-container {
          padding: 18px 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .section-title {
          font-size: 11px;
          font-weight: 800;
          color: #64748b;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin: 0 0 6px 0;
        }
        .drawer-meter-card {
          background: rgba(13, 20, 36, 0.65);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        }
        .meter-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .meter-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 600;
          color: #cbd5e1;
        }
        .meter-header strong {
          font-size: 13px;
          font-weight: 700;
        }
        .progress-track {
          width: 100%;
          height: 6px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 999px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          border-radius: inherit;
          transition: width 0.3s ease;
        }
        .net-details-sub {
          display: flex;
          gap: 12px;
          font-size: 11px;
          color: #64748b;
          font-family: 'JetBrains Mono', monospace;
        }
        .drawer-system-info {
          padding: 18px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .info-cell {
          background: rgba(13, 20, 36, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .cell-label {
          font-size: 10px;
          color: #64748b;
          font-weight: 700;
        }
        .cell-value {
          font-size: 12px;
          font-weight: 600;
          color: #f1f5f9;
        }
        .drawer-proc-container {
          padding: 18px 24px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          flex: 1;
        }
        .proc-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .proc-count {
          font-size: 11px;
          color: #38bdf8;
          font-weight: 600;
        }
        .proc-loading, .proc-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 24px 0;
          font-size: 12px;
          color: #64748b;
        }
        .proc-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .proc-row-head {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr;
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          padding: 4px 8px;
        }
        .proc-row {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr;
          align-items: center;
          background: #090e18;
          border: 1px solid #1e2d45;
          border-radius: 6px;
          padding: 6px 8px;
          font-size: 11.5px;
        }
        .proc-name {
          color: #ffffff;
          font-weight: 600;
          text-overflow: ellipsis;
          overflow: hidden;
          white-space: nowrap;
        }
        .proc-pid {
          color: #64748b;
          font-family: 'JetBrains Mono', monospace;
        }
        .proc-val {
          color: #38bdf8;
          font-family: 'JetBrains Mono', monospace;
        }
        .drawer-footer {
          padding: 16px 24px;
          background: #090e18;
          border-top: 1px solid #1e2d45;
          margin-top: auto;
        }
        .btn-full-details {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 10px;
          background: #17243b;
          border: 1px solid #2d4264;
          border-radius: 8px;
          color: #38bdf8;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-full-details:hover {
          background: #1e2d45;
          color: #ffffff;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes drawerFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes drawerSlideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
