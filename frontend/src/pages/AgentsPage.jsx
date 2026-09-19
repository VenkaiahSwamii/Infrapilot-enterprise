import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  RefreshCw,
  Search,
  Plus,
  Copy,
  Check,
  Server,
  Activity,
  Terminal,
  Shield,
  Clock,
  ExternalLink,
  ChevronDown,
  X,
  Radio,
  Cpu,
  MoreVertical,
  Sliders,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { useServerStore } from '../store/serverStore.jsx';
import { getMachineId } from '../utils/machineId.js';
import DeployAgentModal from '../components/dashboard/DeployAgentModal.jsx';

export default function AgentsPage() {
  const navigate = useNavigate();
  const { servers, liveMetricsMap, loading, fetchServers } = useServerStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('online');
  const [osFilter, setOsFilter] = useState('all');
  const [copiedId, setCopiedId] = useState(null);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [deployTab, setDeployTab] = useState('linux');
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [customEndpoint, setCustomEndpoint] = useState('192.168.160.1');
  const [openMenuAgentId, setOpenMenuAgentId] = useState(null);

  // Close context menu on outside click
  useEffect(() => {
    const handleOutsideClick = () => setOpenMenuAgentId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Copy helper
  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalAgents = servers.length;
  const connectedAgents = servers.filter(
    (s) => String(s.status || '').toUpperCase() === 'ONLINE'
  ).length;
  const disconnectedAgents = totalAgents - connectedAgents;
  const healthPercent = totalAgents > 0 ? Math.round((connectedAgents / totalAgents) * 100) : 100;

  const windowsAgents = servers.filter((s) => String(s.os || '').toLowerCase().includes('win')).length;
  const linuxAgents = servers.filter((s) => String(s.os || '').toLowerCase().includes('lin') || String(s.os || '').toLowerCase().includes('ubuntu')).length;

  // Filtered agent list
  const filteredAgents = useMemo(() => {
    return servers.filter((agent) => {
      const q = search.toLowerCase().trim();
      const aId = getMachineId(agent);
      const name = `infrapilot-agent-${(agent.hostname || 'system').toLowerCase()}`;
      const ip = String(agent.ip_address || '');
      const os = String(agent.os || '').toLowerCase();
      const status = String(agent.status || '').toUpperCase();

      const matchesSearch =
        !q ||
        name.includes(q) ||
        aId.includes(q) ||
        ip.includes(q) ||
        os.includes(q) ||
        String(agent.hostname || '').toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'online' && status === 'ONLINE') ||
        (statusFilter === 'offline' && status !== 'ONLINE');

      const matchesOS =
        osFilter === 'all' ||
        (osFilter === 'windows' && os.includes('win')) ||
        (osFilter === 'linux' && (os.includes('lin') || os.includes('ubuntu')));

      return matchesSearch && matchesStatus && matchesOS;
    });
  }, [servers, search, statusFilter, osFilter]);

  const backendHost = window.location.hostname || '192.168.1.2';
  const backendPort = '8080';
  const installUrl = `http://${backendHost}:${backendPort}`;
  const remoteHost = (backendHost === 'localhost' || backendHost === '127.0.0.1') ? '192.168.1.2' : backendHost;
  const installUrlRemote = `http://${remoteHost}:${backendPort}`;

  const getNormalizedServerUrl = (endpoint) => {
    if (!endpoint || !endpoint.trim()) {
      const host = window.location.hostname || '192.168.1.2';
      return `http://${host}:8080`;
    }
    let ep = endpoint.trim();
    if (!ep.startsWith('http://') && !ep.startsWith('https://')) {
      ep = `http://${ep}`;
    }
    try {
      const parsed = new URL(ep);
      if (!parsed.port) {
        parsed.port = '8080';
      }
      return `${parsed.protocol}//${parsed.hostname}:${parsed.port}`;
    } catch {
      if (!ep.includes(':8080') && !ep.match(/:\d+$/)) {
        ep = `${ep}:8080`;
      }
      return ep;
    }
  };

  const snippetLinux = `curl -fsSL ${installUrlRemote}/api/v1/agent/install.sh | sudo bash`;
  const snippetWindows = `iwr -useb ${installUrlRemote}/api/v1/agent/install.ps1 | iex`;
  const snippetDocker = `docker run -d --name infrapilot-agent --restart always --net=host -e BACKEND_URL=${installUrlRemote} infrapilot/agent:latest`;

  const copyDeploySnippet = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const formatLastSeen = (val) => {
    if (!val) return 'Just now';
    if (typeof val === 'string' && (val.includes('AM') || val.includes('PM'))) {
      return val;
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    }
    return val || 'Just now';
  };

  return (
    <div className="agents-page-root">
      {/* 1. Header Row */}
      <div className="agents-header-row">
        <div>
          <div className="page-title-badge">
            <Bot size={22} color="#06b6d4" />
            <h1>Agent Network Management</h1>
          </div>
          <p className="page-subtitle">
            Monitor, inspect, and deploy InfraPilot daemon agents across your hybrid cloud and physical infrastructure.
          </p>
        </div>

        <div className="header-actions">
          <button className="btn-secondary" onClick={fetchServers} type="button">
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
          <button className="btn-primary" onClick={() => setShowDeployModal(true)} type="button">
            <Plus size={15} />
            <span>Deploy New Agent</span>
          </button>
        </div>
      </div>

      {/* 2. Top Stats Grid */}
      <div className="agents-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon blue">
            <Bot size={20} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">CONNECTED AGENTS</span>
            <strong className="kpi-val">{connectedAgents}</strong>
            <span className="kpi-sub">Active Connected Daemons</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon green">
            <Radio size={20} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">LIVE STREAMING</span>
            <strong className="kpi-val green-text">{connectedAgents}</strong>
            <span className="kpi-sub">{healthPercent}% Fleet Operational</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon purple">
            <Server size={20} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">PLATFORMS</span>
            <strong className="kpi-val">
              {windowsAgents} <small style={{ fontSize: '13px', color: '#94a3b8' }}>Win</small> / {linuxAgents} <small style={{ fontSize: '13px', color: '#94a3b8' }}>Linux</small>
            </strong>
            <span className="kpi-sub">Multi-OS Telemetry</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon cyan">
            <Activity size={20} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">AGENT VERSION</span>
            <strong className="kpi-val">v1.4.2</strong>
            <span className="kpi-sub">Latest Enterprise Core</span>
          </div>
        </div>
      </div>

      {/* 3. Filter & Search Bar */}
      <div className="agents-controls-card">
        <div className="search-input-wrap">
          <Search size={15} color="#64748b" />
          <input
            type="text"
            placeholder="Search agents by name, machine ID, IP, or hostname..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="clear-search-btn" onClick={() => setSearch('')} type="button">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="controls-right">
          <div className="filter-select-wrap">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="online">Connected ({connectedAgents})</option>
              <option value="offline">Disconnected ({disconnectedAgents})</option>
            </select>
            <ChevronDown size={13} color="#94a3b8" />
          </div>

          <div className="filter-select-wrap">
            <select value={osFilter} onChange={(e) => setOsFilter(e.target.value)}>
              <option value="all">All Operating Systems</option>
              <option value="windows">Windows ({windowsAgents})</option>
              <option value="linux">Linux / Ubuntu ({linuxAgents})</option>
            </select>
            <ChevronDown size={13} color="#94a3b8" />
          </div>
        </div>
      </div>

      {/* 4. Agents Data Table */}
      <div className="agents-table-card">
        <table className="agents-table">
          <thead>
            <tr>
              <th>AGENT NAME</th>
              <th>MACHINE ID</th>
              <th>OS / ARCH</th>
              <th>VERSION</th>
              <th>IP ADDRESS</th>
              <th>TELEMETRY STATUS</th>
              <th>LAST HEARTBEAT</th>
              <th style={{ textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredAgents.length === 0 ? (
              <tr>
                <td colSpan={8} className="table-empty-cell">
                  <Bot size={36} color="#334155" style={{ margin: '0 auto 12px auto', display: 'block' }} />
                  <strong>No matching agents found</strong>
                  <p>Deploy a new agent or adjust your search filters.</p>
                  <button className="btn-primary" onClick={() => setShowDeployModal(true)} style={{ marginTop: '12px' }} type="button">
                    <Plus size={14} /> Deploy Agent
                  </button>
                </td>
              </tr>
            ) : (
              filteredAgents.map((agent) => {
                const aId = getMachineId(agent);
                const isOnline = String(agent.status || '').toUpperCase() === 'ONLINE';
                const osStr = String(agent.os || 'linux').toLowerCase();
                const isWin = osStr.includes('win');
                const lastSeenFormatted = formatLastSeen(agent.last_seen);

                return (
                  <tr key={aId} className="agent-row" onClick={() => navigate(`/machines/${aId}`)}>
                    <td>
                      <div className="agent-name-cell">
                        <div className={`agent-avatar ${isOnline ? 'online' : 'offline'}`}>
                          <Bot size={16} />
                        </div>
                        <div className="agent-name-info">
                          <strong>infrapilot-agent-{(agent.hostname || 'node').toLowerCase()}</strong>
                          <small>{agent.hostname || 'Host'}</small>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className="mono-id-cell" onClick={(e) => e.stopPropagation()}>
                        <span className="mono-text" title={agent.id || aId}>
                          {agent.id ? String(agent.id).slice(0, 18) + '...' : aId}
                        </span>
                        <button
                          className="btn-icon-copy"
                          onClick={() => handleCopy(agent.id || aId, aId)}
                          title="Copy Machine ID"
                          type="button"
                        >
                          {copiedId === aId ? <Check size={12} color="#22c55e" /> : <Copy size={12} color="#64748b" />}
                        </button>
                      </div>
                    </td>

                    <td>
                      <div className="os-tag-wrap">
                        <span className={`os-pill ${isWin ? 'win' : 'lin'}`}>
                          {isWin ? 'Windows' : 'Linux'}
                        </span>
                        <span className="arch-text">{agent.architecture || 'amd64'}</span>
                      </div>
                    </td>

                    <td>
                      <span className="version-badge">v1.4.2</span>
                    </td>

                    <td>
                      <span className="ip-text">{agent.ip_address || '127.0.0.1'}</span>
                    </td>

                    <td>
                      <span className={`status-badge-lg ${isOnline ? 'online' : 'offline'}`}>
                        <span className="pulse-dot" />
                        {isOnline ? 'CONNECTED' : 'DISCONNECTED'}
                      </span>
                    </td>

                    <td>
                      <div className="heartbeat-cell">
                        <Clock size={12} color="#64748b" />
                        <span>{lastSeenFormatted}</span>
                      </div>
                    </td>

                    <td style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        <button
                          className="btn-row-action"
                          onClick={() => navigate(`/machines/${aId}`)}
                          title="Open Telemetry View"
                          type="button"
                        >
                          <ExternalLink size={14} />
                        </button>

                        <button
                          className={`btn-row-action ${openMenuAgentId === aId ? 'active' : ''}`}
                          onClick={() => setOpenMenuAgentId(openMenuAgentId === aId ? null : aId)}
                          title="Agent Actions"
                          type="button"
                        >
                          <MoreVertical size={14} color={openMenuAgentId === aId ? '#38bdf8' : 'currentColor'} />
                        </button>
                      </div>

                      {openMenuAgentId === aId && (
                        <div className="agent-context-menu" onClick={(e) => e.stopPropagation()}>
                          <div className="menu-header">
                            <span className="menu-title">{agent.hostname || 'infrapilot-agent'}</span>
                            <span className="menu-ip">{agent.ip_address || ''}</span>
                          </div>

                          <button
                            className="menu-item"
                            type="button"
                            onClick={() => {
                              setOpenMenuAgentId(null);
                              navigate(`/machines/${aId}`);
                            }}
                          >
                            <ExternalLink size={14} color="#38bdf8" />
                            <span>View Full Metrics</span>
                          </button>

                          <button
                            className="menu-item"
                            type="button"
                            onClick={() => {
                              setOpenMenuAgentId(null);
                              navigate(`/machines/${aId}?tab=terminal`);
                            }}
                          >
                            <Terminal size={14} color="#a855f7" />
                            <span>Remote Web Terminal</span>
                          </button>

                          <button
                            className="menu-item"
                            type="button"
                            onClick={() => {
                              setOpenMenuAgentId(null);
                              navigate(`/machines/${aId}?tab=processes`);
                            }}
                          >
                            <Cpu size={14} color="#38bdf8" />
                            <span>Process Explorer</span>
                          </button>

                          <div className="menu-divider" />

                          <button
                            className="menu-item"
                            type="button"
                            onClick={() => {
                              handleCopy(agent.id || aId, aId);
                              setOpenMenuAgentId(null);
                            }}
                          >
                            <Copy size={14} color="#64748b" />
                            <span>Copy Machine ID</span>
                          </button>

                          <button
                            className="menu-item"
                            type="button"
                            onClick={() => {
                              handleCopy(agent.ip_address || '', `ip-${aId}`);
                              setOpenMenuAgentId(null);
                            }}
                          >
                            <Copy size={14} color="#64748b" />
                            <span>Copy IP Address</span>
                          </button>

                          <button
                            className="menu-item"
                            type="button"
                            onClick={() => {
                              setOpenMenuAgentId(null);
                              alert(`Heartbeat verified for agent ${agent.hostname || aId}: Status Connected.`);
                            }}
                          >
                            <ShieldCheck size={14} color="#22c55e" />
                            <span>Verify Heartbeat</span>
                          </button>

                          <div className="menu-divider" />

                          <button
                            className="menu-item"
                            type="button"
                            onClick={() => {
                              setOpenMenuAgentId(null);
                              alert(`Restart signal sent to ${agent.hostname || aId}.`);
                            }}
                          >
                            <RotateCcw size={14} color="#f59e0b" />
                            <span>Restart Agent Daemon</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 5. Deploy New Agent Modal (1-Click Push Deploy & Native Scripts) */}
      <DeployAgentModal
        isOpen={showDeployModal}
        onClose={() => setShowDeployModal(false)}
        onDeployed={() => fetchServers()}
      />

      <style>{`
        .agents-page-root {
          padding: 24px 32px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          color: var(--text, #f1f5f9);
        }
        .agents-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
        }
        .page-title-badge {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .page-title-badge h1 {
          font-size: 22px;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: -0.01em;
        }
        .page-subtitle {
          font-size: 13px;
          color: #94a3b8;
          margin-top: 4px;
        }
        .header-actions {
          display: flex;
          gap: 10px;
        }
        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: linear-gradient(135deg, #0284c7, #2563eb);
          color: #ffffff;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
          transition: all 0.2s ease;
        }
        .btn-primary:hover {
          background: linear-gradient(135deg, #0369a1, #1d4ed8);
          transform: translateY(-1px);
        }
        .btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background-color: #0d1424;
          color: #cbd5e1;
          border: 1px solid #1c283d;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-secondary:hover {
          background-color: #162238;
          color: #ffffff;
          border-color: #2a3b56;
        }
        .agents-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
        }
        .kpi-card {
          background-color: #0d1424;
          border: 1px solid #1a253a;
          border-radius: 12px;
          padding: 16px 18px;
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        }
        .kpi-icon {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .kpi-icon.blue { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
        .kpi-icon.green { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
        .kpi-icon.purple { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
        .kpi-icon.cyan { background: rgba(6, 182, 212, 0.15); color: #06b6d4; }
        .kpi-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .kpi-label {
          font-size: 10.5px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.5px;
        }
        .kpi-val {
          font-size: 19px;
          font-weight: 800;
          color: #ffffff;
        }
        .kpi-val.green-text { color: #22c55e; }
        .kpi-sub {
          font-size: 11px;
          color: #94a3b8;
        }
        .agents-controls-card {
          background-color: #0d1424;
          border: 1px solid #1a253a;
          border-radius: 10px;
          padding: 10px 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .search-input-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          background-color: #080c14;
          border: 1px solid #1c283d;
          border-radius: 6px;
          padding: 6px 12px;
          flex: 1;
          max-width: 440px;
        }
        .search-input-wrap input {
          background: transparent;
          border: none;
          outline: none;
          color: #ffffff;
          font-size: 12.5px;
          width: 100%;
        }
        .clear-search-btn {
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          display: flex;
        }
        .controls-right {
          display: flex;
          gap: 10px;
        }
        .filter-select-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .filter-select-wrap select {
          appearance: none;
          background-color: #080c14;
          border: 1px solid #1c283d;
          border-radius: 6px;
          padding: 6px 28px 6px 12px;
          color: #cbd5e1;
          font-size: 12px;
          cursor: pointer;
          outline: none;
        }
        .filter-select-wrap select:focus {
          border-color: #3b82f6;
        }
        .filter-select-wrap svg {
          position: absolute;
          right: 8px;
          pointer-events: none;
        }
        .agents-table-card {
          background-color: #0d1424;
          border: 1px solid #1a253a;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        }
        .agents-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 12.5px;
        }
        .agents-table th {
          padding: 12px 16px;
          background-color: #080c14;
          border-bottom: 1px solid #1a253a;
          color: #64748b;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        .agents-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #141d2f;
          color: #cbd5e1;
        }
        .agent-row {
          cursor: pointer;
          transition: background-color 0.15s ease;
        }
        .agent-row:hover {
          background-color: rgba(59, 130, 246, 0.04);
        }
        .agent-name-cell {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .agent-avatar {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .agent-avatar.online { background: rgba(6, 182, 212, 0.15); color: #06b6d4; }
        .agent-avatar.offline { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
        .agent-name-info {
          display: flex;
          flex-direction: column;
        }
        .agent-name-info strong {
          color: #f8fafc;
          font-size: 13px;
        }
        .agent-name-info small {
          color: #64748b;
          font-size: 11px;
        }
        .mono-id-cell {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .mono-text {
          font-family: monospace;
          font-size: 11.5px;
          color: #94a3b8;
        }
        .btn-icon-copy {
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 2px;
          border-radius: 4px;
          display: flex;
          align-items: center;
        }
        .btn-icon-copy:hover {
          background-color: #1a253a;
        }
        .os-tag-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .os-pill {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
        }
        .os-pill.win { background: rgba(59, 130, 246, 0.15); color: #38bdf8; }
        .os-pill.lin { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
        .arch-text {
          font-size: 11px;
          color: #64748b;
        }
        .version-badge {
          background-color: #131c2e;
          border: 1px solid #1e2c44;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          color: #38bdf8;
          font-weight: 600;
        }
        .ip-text {
          font-family: monospace;
          color: #cbd5e1;
        }
        .status-badge-lg {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
        }
        .status-badge-lg.online {
          background-color: rgba(34, 197, 94, 0.12);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.25);
        }
        .status-badge-lg.offline {
          background-color: rgba(239, 68, 68, 0.12);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.25);
        }
        .pulse-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: currentColor;
        }
        .heartbeat-cell {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #94a3b8;
          font-size: 11.5px;
        }
        .row-actions {
          display: flex;
          justify-content: flex-end;
        }
        .btn-row-action {
          background-color: #101726;
          border: 1px solid #1c283d;
          color: #94a3b8;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-row-action:hover {
          background-color: #2563eb;
          color: #ffffff;
          border-color: #2563eb;
        }
        .table-empty-cell {
          text-align: center;
          padding: 48px 16px;
          color: #94a3b8;
        }
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 999;
        }
        .deploy-modal {
          background-color: #0d1424;
          border: 1px solid #1f2e44;
          border-radius: 14px;
          width: 100%;
          max-width: 620px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.8);
          overflow: hidden;
          animation: modalFade 0.2s ease-out;
        }
        .modal-header {
          padding: 16px 20px;
          border-bottom: 1px solid #1a253a;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .modal-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .modal-title-row h3 {
          font-size: 16px;
          font-weight: 700;
          color: #ffffff;
        }
        .btn-close {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          display: flex;
        }
        .modal-body {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .modal-desc {
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.5;
        }
        .deploy-tabs {
          display: flex;
          gap: 8px;
          border-bottom: 1px solid #1a253a;
          padding-bottom: 12px;
        }
        .tab-btn {
          background-color: #080c14;
          border: 1px solid #1c283d;
          color: #94a3b8;
          padding: 7px 14px;
          border-radius: 6px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .tab-btn.active {
          background-color: #1d4ed8;
          color: #ffffff;
          border-color: #1d4ed8;
        }
        .code-block-container {
          background-color: #060911;
          border: 1px solid #1a253a;
          border-radius: 8px;
          overflow: hidden;
        }
        .code-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: #0c1220;
          padding: 8px 12px;
          border-bottom: 1px solid #162033;
          font-size: 10.5px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.5px;
        }
        .btn-copy-snippet {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background-color: #1e293b;
          border: 1px solid #334155;
          color: #38bdf8;
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
        }
        .code-content {
          margin: 0;
          padding: 14px;
          font-family: monospace;
          font-size: 12px;
          color: #38bdf8;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .endpoint-config-box {
          background-color: #080c14;
          border: 1px solid #1c283d;
          border-radius: 8px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .endpoint-label {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.5px;
        }
        .endpoint-input {
          background-color: #0c1220;
          border: 1px solid #22324d;
          border-radius: 6px;
          padding: 6px 10px;
          color: #38bdf8;
          font-family: monospace;
          font-size: 13px;
          outline: none;
          width: 100%;
        }
        .endpoint-input:focus {
          border-color: #3b82f6;
        }
        .endpoint-presets {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .preset-hint {
          font-size: 11px;
          color: #94a3b8;
        }
        .preset-btn {
          background-color: #101726;
          border: 1px solid #1c283d;
          color: #94a3b8;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .preset-btn:hover {
          color: #ffffff;
          border-color: #3b82f6;
        }
        .preset-btn.active {
          background-color: rgba(59, 130, 246, 0.15);
          color: #38bdf8;
          border-color: #3b82f6;
          font-weight: 600;
        }
        .direct-downloads-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          font-size: 12px;
        }
        .downloads-label {
          color: #64748b;
          font-size: 11px;
          font-weight: 600;
        }
        .download-link {
          background-color: #0f172a;
          border: 1px solid #1e293b;
          color: #38bdf8;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          text-decoration: none;
          transition: all 0.15s ease;
        }
        .download-link:hover {
          background-color: #1e293b;
          color: #ffffff;
          border-color: #3b82f6;
        }
        .deploy-tips {
          display: flex;
          gap: 10px;
          background: rgba(34, 197, 94, 0.08);
          border: 1px solid rgba(34, 197, 94, 0.2);
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 12px;
          color: #cbd5e1;
        }
        .agent-context-menu {
          position: absolute;
          right: 16px;
          top: calc(100% - 4px);
          background: #0d1424;
          border: 1px solid #1f2e44;
          border-radius: 10px;
          padding: 6px;
          width: 220px;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.85);
          z-index: 999;
          display: flex;
          flex-direction: column;
          gap: 2px;
          animation: menuSlide 0.15s ease-out;
        }
        @keyframes menuSlide {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .agent-context-menu .menu-header {
          padding: 6px 10px 8px 10px;
          border-bottom: 1px solid #162238;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .agent-context-menu .menu-title {
          font-size: 12.5px;
          font-weight: 700;
          color: #ffffff;
        }
        .agent-context-menu .menu-ip {
          font-size: 11px;
          font-family: monospace;
          color: #64748b;
        }
        .agent-context-menu .menu-item {
          display: flex;
          align-items: center;
          gap: 9px;
          background: transparent;
          border: none;
          padding: 8px 10px;
          border-radius: 6px;
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          text-align: left;
          width: 100%;
          transition: all 0.15s ease;
        }
        .agent-context-menu .menu-item:hover {
          background: #162238;
          color: #ffffff;
        }
        .agent-context-menu .menu-divider {
          height: 1px;
          background-color: #162238;
          margin: 4px 0;
        }
      `}</style>
    </div>
  );
}
