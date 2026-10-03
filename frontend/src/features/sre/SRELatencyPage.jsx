import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Globe,
  Activity,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Search,
  Plus,
  Play,
  Edit,
  Trash2,
  Server,
  Radio,
  Network,
} from 'lucide-react';
import { apiClient } from '../../api/client.js';
import { getMachineMetrics } from '../../api/machines.js';
import { createLiveEventsSocket } from '../../websocket/liveEvents.js';
import { getMachineId } from '../../utils/machineId.js';
import { useServerStore } from '../../store/serverStore.jsx';
import ServerSelectDropdown from '../../components/common/ServerSelectDropdown.jsx';
import AdminSREPolicyControl from '../../components/sre/AdminSREPolicyControl.jsx';

import {
  getNetworkOverviewStats,
  getAllNetworkChecks,
  deleteNetworkCheck,
  runNetworkCheckNow,
  getHostNetworkViews,
} from '../../api/network.js';

import NetworkCheckDrawer from '../network/NetworkCheckDrawer.jsx';
import HostNetworkDetailModal from '../network/HostNetworkDetailModal.jsx';

// SVG Sparkline component
function LatencySparkline({ data = [], color = '#22c55e' }) {
  if (!data || data.length === 0) return null;
  const values = data.length === 1 ? [data[0], data[0]] : data;
  const max = Math.max(...values, 10);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);

  const points = values
    .map((val, idx) => {
      const x = (idx / (values.length - 1)) * 100;
      const y = 30 - ((val - min) / range) * 20 - 4;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="sparkline-container">
      <svg viewBox="0 0 100 30" style={{ width: '100%', height: '32px' }} preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function SRELatencyPage() {
  const [machines, setMachines] = useState([]);
  const [liveMetrics, setLiveMetrics] = useState({});
  const [loading, setLoading] = useState(true);

  // Network Monitoring State
  const [networkStats, setNetworkStats] = useState(null);
  const [networkChecks, setNetworkChecks] = useState([]);
  const [hostViews, setHostViews] = useState([]);

  // Filters & Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleTimeString());

  // Modal / Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCheck, setEditingCheck] = useState(null);
  const [selectedHost, setSelectedHost] = useState(null);
  const [runningMap, setRunningMap] = useState({});

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch Machine metrics
      const res = await apiClient.get('/machines').catch(() => null);
      if (res && (Array.isArray(res.data) || res.data?.machines)) {
        const raw = Array.isArray(res.data) ? res.data : res.data?.machines || [];
        setMachines(raw);

        if (raw.length > 0) {
          const metricPromises = raw.map(async (m) => {
            const mId = getMachineId(m);
            if (!mId) return null;
            try {
              const metricsRes = await getMachineMetrics(mId, '5m');
              return metricsRes?.latest ? [mId, metricsRes.latest] : null;
            } catch {
              return null;
            }
          });
          const metricPairs = await Promise.all(metricPromises);
          setLiveMetrics(Object.fromEntries(metricPairs.filter(Boolean)));
        }
      }

      // Fetch Network Probing stats, checks & host views
      const [statsData, checksData, hostsData] = await Promise.all([
        getNetworkOverviewStats().catch(() => null),
        getAllNetworkChecks().catch(() => null),
        getHostNetworkViews().catch(() => null),
      ]);

      if (statsData) setNetworkStats(statsData);
      if (checksData?.checks) setNetworkChecks(checksData.checks);
      if (hostsData?.hosts) setHostViews(hostsData.hosts);
    } catch (err) {
      console.error('Failed to fetch network latency data:', err);
    } finally {
      setLoading(false);
      setLastUpdated(new Date().toLocaleTimeString());
    }
  }, []);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 5000);

    let socket = null;
    try {
      socket = createLiveEventsSocket();
      if (socket) {
        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload?.machine_id) {
              setLiveMetrics((prev) => ({ ...prev, [payload.machine_id]: payload }));
            }
          } catch {}
        };
      }
    } catch (e) {
      console.warn('Live events socket unavailable', e);
    }

    return () => {
      clearInterval(interval);
      if (socket && typeof socket.close === 'function') {
        try { socket.close(); } catch {}
      }
    };
  }, [fetchAllData]);

  const { selectedServer } = useServerStore();
  const primaryMachine = selectedServer || machines[0] || {};
  const rawHostname = primaryMachine.hostname || primaryMachine.RegisteredHostname || primaryMachine.name || 'System';
  const activeHostname = typeof rawHostname === 'string' ? rawHostname : String(rawHostname?.name || rawHostname || 'System');
  const machineId = primaryMachine ? (primaryMachine.id || primaryMachine.ID || getMachineId(primaryMachine)) : '';
  const live = (machineId && liveMetrics[machineId]) ? liveMetrics[machineId] : {};

  // Real live latency ms
  const hasLatencyData = machines.length > 0 && (live.latency_ms !== undefined || primaryMachine.latency_ms !== undefined);
  const rawLat = live.latency_ms ?? primaryMachine.latency_ms ?? 0;
  const realLatency = Number(rawLat).toFixed(1);
  const numLat = Number(realLatency);
  const latencyStatus = numLat >= 120 ? 'CRITICAL' : numLat >= 50 ? 'WARNING' : 'HEALTHY';

  const defaultGatewayEndpoint = hasLatencyData ? [
    {
      id: 'end-gateway',
      name: 'gateway',
      type: 'ENDPOINT',
      status: latencyStatus,
      latencyMs: numLat,
      gatewayIp: primaryMachine.ip_address || primaryMachine.ip || primaryMachine.Host || 'Gateway',
      history: [numLat],
    },
  ] : [];

  // Handle Manual Probe Run
  const handleRunNow = async (e, checkId) => {
    e.stopPropagation();
    setRunningMap((prev) => ({ ...prev, [checkId]: true }));
    try {
      await runNetworkCheckNow(checkId);
      setTimeout(fetchAllData, 1000);
    } catch (err) {
      console.error('Failed manual probe execution:', err);
    } finally {
      setRunningMap((prev) => ({ ...prev, [checkId]: false }));
    }
  };

  // Handle Delete Target Check
  const handleDeleteCheck = async (e, checkId) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this network probe target?')) return;
    try {
      await deleteNetworkCheck(checkId);
      fetchAllData();
    } catch (err) {
      console.error('Failed to delete network check:', err);
    }
  };

  const handleEditCheck = (e, check) => {
    e.stopPropagation();
    setEditingCheck(check);
    setDrawerOpen(true);
  };

  const handleCreateCheck = () => {
    setEditingCheck(null);
    setDrawerOpen(true);
  };

  // Filter checks
  const filteredChecks = useMemo(() => {
    return networkChecks.filter((c) => {
      const matchesSearch =
        !searchQuery ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.target.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType = typeFilter === 'ALL' || c.type === typeFilter;
      const matchesStatus = statusFilter === 'ALL' || c.last_status === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [networkChecks, searchQuery, typeFilter, statusFilter]);

  const healthyCount = networkChecks.filter((c) => c.last_status === 'HEALTHY').length;
  const degradedCount = networkChecks.filter((c) => c.last_status === 'DEGRADED').length;
  const criticalCount = networkChecks.filter((c) => c.last_status === 'CRITICAL').length;

  return (
    <div className="sre-latency-page-root">
      {/* ── TOP HEADER TITLE BAR ── */}
      <div className="latency-header">
        <div className="header-title-block">
          <div className="title-row">
            <h1>Latency &amp; Network Observability ({activeHostname.toLowerCase()})</h1>
            <span className="badge-prod">PRODUCTION</span>
          </div>
          <p className="subtitle-txt">
            Real-time P95 ping responses, packet loss, DNS, TCP, HTTP, Unix domain sockets &amp; interface throughput
          </p>
        </div>

        <div className="header-status-meta" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ServerSelectDropdown size="sm" />
          <button className="ctrl-btn create-target-btn" onClick={handleCreateCheck}>
            <Plus size={14} />
            <span>Configure Target</span>
          </button>
          <span className="live-status-pill">
            <span className="green-dot pulse" /> Live Monitoring
          </span>
          <span className="updated-time-txt">⏱ Last updated: {lastUpdated}</span>
        </div>
      </div>

      {/* ── KPI HEADER CARDS ROW (8 CARDS) ── */}
      <div className="latency-kpi-row">
        <div className="kpi-box fleet-avg">
          <div className="kpi-label-wrap">
            <Activity size={14} className="kpi-icon cyan" />
            <span>FLEET AVG LATENCY</span>
          </div>
          <div className="kpi-number">
            {networkStats?.avg_latency_ms ? networkStats.avg_latency_ms.toFixed(1) : realLatency} <span className="unit-ms">ms</span>
          </div>
        </div>

        <div className="kpi-box">
          <div className="kpi-label-wrap">
            <Radio size={14} className="kpi-icon indigo" />
            <span>PACKET LOSS</span>
          </div>
          <div className="kpi-number cyan-txt">
            {networkStats?.packet_loss_pct !== undefined ? `${networkStats.packet_loss_pct.toFixed(1)}%` : '0.0%'}
          </div>
        </div>

        <div className="kpi-box">
          <div className="kpi-label-wrap">
            <CheckCircle2 size={14} className="kpi-icon green" />
            <span>HEALTHY</span>
          </div>
          <div className="kpi-number green-txt">{healthyCount}</div>
        </div>

        <div className="kpi-box">
          <div className="kpi-label-wrap">
            <AlertTriangle size={14} className="kpi-icon amber" />
            <span>DEGRADED</span>
          </div>
          <div className="kpi-number amber-txt">{degradedCount}</div>
        </div>

        <div className="kpi-box">
          <div className="kpi-label-wrap">
            <AlertCircle size={14} className="kpi-icon red" />
            <span>CRITICAL</span>
          </div>
          <div className="kpi-number red-txt">{criticalCount}</div>
        </div>

        <div className="kpi-box">
          <div className="kpi-label-wrap">
            <Network size={14} className="kpi-icon cyan" />
            <span>INTERFACES</span>
          </div>
          <div className="kpi-number">{networkStats?.network_interfaces ?? (machines.length > 0 ? 1 : 0)}</div>
        </div>

        <div className="kpi-box">
          <div className="kpi-label-wrap">
            <Server size={14} className="kpi-icon indigo" />
            <span>NODES MONITORED</span>
          </div>
          <div className="kpi-number">{networkStats?.hosts_monitored ?? machines.length}</div>
        </div>

        <div className="kpi-box">
          <div className="kpi-label-wrap">
            <AlertCircle size={14} className="kpi-icon red" />
            <span>FAILED CHECKS</span>
          </div>
          <div className="kpi-number red-txt">{networkStats?.failed_checks || 0}</div>
        </div>
      </div>

      {/* ── FILTER & ACTIONS CONTROLS BAR ── */}
      <div className="latency-controls-bar">
        <div className="controls-left">
          <div className="search-input-box">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Search targets or IP/socket paths..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select className="ctrl-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="ALL">ALL TYPES</option>
            <option value="PING">PING</option>
            <option value="TCP">TCP</option>
            <option value="DNS">DNS</option>
            <option value="HTTP">HTTP</option>
            <option value="UNIX_SOCKET">UNIX SOCKET</option>
            <option value="INTERFACE">INTERFACE</option>
          </select>

          <select className="ctrl-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">ALL STATUSES</option>
            <option value="HEALTHY">HEALTHY</option>
            <option value="DEGRADED">DEGRADED</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
        </div>

        <div className="controls-right">
          <button className="ctrl-btn" onClick={fetchAllData} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── NETWORK TARGETS DATA TABLE ── */}
      <div className="sre-table-card">
        <div className="sre-card-header">
          <h3 className="sre-card-title">Network Probe Targets &amp; Service Endpoints</h3>
          <span className="sre-card-meta">{filteredChecks.length} active targets</span>
        </div>

        <div className="sre-table-scroll">
          <table className="sre-data-table">
            <thead>
              <tr>
                <th>STATUS</th>
                <th>TARGET NAME</th>
                <th>CHECK TYPE</th>
                <th>TARGET ADDRESS / PATH</th>
                <th>MEASURED LATENCY</th>
                <th>PACKET LOSS %</th>
                <th>LAST CHECKED</th>
                <th style={{ textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredChecks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="sre-empty-td">
                    No network targets configured. Click <strong>"+ Configure Target"</strong> above to add ping, TCP, DNS, or Unix socket probes.
                  </td>
                </tr>
              ) : (
                filteredChecks.map((check) => (
                  <tr key={check.id}>
                    <td>
                      <span className={`ep-status-badge ${check.last_status ? check.last_status.toLowerCase() : 'healthy'}`}>
                        {check.last_status || 'HEALTHY'}
                      </span>
                    </td>
                    <td className="fw-bold">{check.name}</td>
                    <td>
                      <span className="ep-type-badge">{check.type}</span>
                    </td>
                    <td className="mono-txt muted-txt">{check.target}</td>
                    <td className="cyan-txt fw-bold font-mono">
                      {check.last_latency_ms > 0 ? `${check.last_latency_ms.toFixed(1)} ms` : '--'}
                    </td>
                    <td className="muted-txt font-mono">
                      {check.type === 'UNIX_SOCKET' ? 'N/A' : `${check.last_packet_loss_pct.toFixed(1)}%`}
                    </td>
                    <td className="muted-txt font-mono">
                      {check.last_check_at ? new Date(check.last_check_at).toLocaleTimeString() : 'Just now'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="table-actions-row">
                        <button
                          onClick={() => setSelectedHost(hostViews[0] || { hostname: activeHostname, connectivities: networkChecks, interfaces: [] })}
                          className="action-btn"
                          title="Host Network View"
                        >
                          <Server size={13} />
                        </button>
                        <button
                          onClick={(e) => handleRunNow(e, check.id)}
                          disabled={runningMap[check.id]}
                          className="action-btn run-btn"
                          title="Run Manual Probe"
                        >
                          <Play size={13} className={runningMap[check.id] ? 'spin' : ''} />
                        </button>
                        <button
                          onClick={(e) => handleEditCheck(e, check)}
                          className="action-btn"
                          title="Edit Target"
                        >
                          <Edit size={13} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteCheck(e, check.id)}
                          className="action-btn del-btn"
                          title="Delete Target"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── GATEWAY LATENCY CARDS GRID ── */}
      {defaultGatewayEndpoint.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <h3 className="section-subtitle">Real-Time Gateway &amp; Telemetry Node Ping</h3>
          <div className="latency-endpoints-grid">
            {defaultGatewayEndpoint.map((ep) => (
              <div key={ep.id} className="endpoint-card">
                <div className="ep-card-header">
                  <div className="ep-title-wrap">
                    <Globe size={16} className="ep-icon green" />
                    <div>
                      <h4 className="ep-name">{ep.name}</h4>
                      <span className="ep-type">{ep.type} (IP: {ep.gatewayIp})</span>
                    </div>
                  </div>
                  <span className={`ep-status-badge ${ep.status.toLowerCase()}`}>{ep.status}</span>
                </div>

                <div className="ep-latency-val">
                  {ep.latencyMs} <span className="ms-lbl">ms</span>
                </div>

                <LatencySparkline data={ep.history} color="#22c55e" />

                <AdminSREPolicyControl category="Network" component="gateway" compact />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BOTTOM TRENDS SECTION ── */}
      <div className="latency-trends-section">
        <div className="trends-header">
          <Activity size={16} className="trends-icon cyan" />
          <h3>Latency Distribution &amp; Network Trends</h3>
        </div>

        <div className="trends-chart-area">
          <svg viewBox="0 0 100 25" preserveAspectRatio="none" className="trends-svg">
            <polyline
              points={
                networkChecks.length > 0
                  ? networkChecks
                      .map((c, i) => {
                        const x = (i / Math.max(networkChecks.length - 1, 1)) * 100;
                        const lat = c.last_latency_ms || 0;
                        const y = Math.max(5, 23 - Math.min(lat, 100) * 0.18);
                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                      })
                      .join(' ')
                  : '0,22 100,22'
              }
              fill="none"
              stroke="#22c55e"
              strokeWidth="1.8"
            />
          </svg>
        </div>
      </div>

      {/* ── MODALS & DRAWERS ── */}
      <NetworkCheckDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={fetchAllData}
        initialCheck={editingCheck}
      />

      <HostNetworkDetailModal
        hostView={selectedHost}
        onClose={() => setSelectedHost(null)}
      />

      <style>{`
        .sre-latency-page-root {
          padding: 28px 36px;
          min-height: 100vh;
          background-color: #0b0f19;
          color: #f1f5f9;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }

        .latency-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 24px;
        }
        .header-title-block {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .title-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .title-row h1 {
          font-size: 24px;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
          letter-spacing: -0.02em;
        }
        .badge-prod {
          background-color: #1e293b;
          color: #94a3b8;
          font-size: 10px;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 4px;
          letter-spacing: 0.05em;
          border: 1px solid #334155;
        }
        .subtitle-txt {
          font-size: 13px;
          color: #64748b;
          margin: 0;
        }

        .header-status-meta {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .create-target-btn {
          background: #0284c7 !important;
          border-color: #0369a1 !important;
          color: #ffffff !important;
        }
        .create-target-btn:hover {
          background: #0369a1 !important;
        }

        .live-status-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #22c55e;
          font-weight: 600;
          font-size: 12px;
        }
        .green-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background-color: #22c55e;
        }
        .green-dot.pulse {
          box-shadow: 0 0 8px #22c55e;
        }
        .updated-time-txt {
          color: #64748b;
          font-size: 12px;
        }

        .latency-kpi-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          margin-bottom: 20px;
        }
        @media (min-width: 1200px) {
          .latency-kpi-row {
            grid-template-columns: repeat(8, 1fr);
          }
        }
        .kpi-box {
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 12px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 80px;
        }
        .kpi-label-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 0.04em;
        }
        .kpi-icon.cyan { color: #38bdf8; }
        .kpi-icon.indigo { color: #818cf8; }
        .kpi-icon.green { color: #22c55e; }
        .kpi-icon.amber { color: #f59e0b; }
        .kpi-icon.red { color: #ef4444; }

        .kpi-number {
          font-size: 22px;
          font-weight: 800;
          color: #ffffff;
          margin-top: 4px;
        }
        .unit-ms {
          font-size: 12px;
          font-weight: 600;
          color: #94a3b8;
        }
        .cyan-txt { color: #38bdf8; }
        .green-txt { color: #22c55e; }
        .amber-txt { color: #f59e0b; }
        .red-txt { color: #ef4444; }

        .latency-controls-bar {
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 12px;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          gap: 16px;
        }
        .controls-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
        }
        .search-input-box {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #0b0f19;
          border: 1px solid #1f293d;
          border-radius: 8px;
          padding: 8px 12px;
          width: 260px;
        }
        .search-icon { color: #64748b; }
        .search-input-box input {
          background: transparent;
          border: none;
          outline: none;
          color: #f1f5f9;
          font-size: 12px;
          width: 100%;
        }
        .ctrl-select {
          background: #0b0f19;
          border: 1px solid #1f293d;
          color: #cbd5e1;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 12px;
          outline: none;
        }

        .controls-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .ctrl-btn {
          background: #1e293b;
          border: 1px solid #334155;
          color: #f1f5f9;
          border-radius: 8px;
          padding: 8px 14px;
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .ctrl-btn:hover:not(:disabled) {
          background: #334155;
          color: #ffffff;
        }
        .ctrl-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .sre-table-card {
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 14px;
          overflow: hidden;
          margin-bottom: 24px;
        }
        .sre-card-header {
          padding: 16px 20px;
          background: #0b0f19;
          border-bottom: 1px solid #1f293d;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .sre-card-title {
          font-size: 14px;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
        }
        .sre-card-meta {
          font-size: 12px;
          color: #64748b;
        }

        .sre-table-scroll {
          overflow-x: auto;
        }
        .sre-data-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 12px;
        }
        .sre-data-table th {
          background: #0b0f19;
          color: #64748b;
          padding: 12px 16px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.04em;
          border-bottom: 1px solid #1f293d;
        }
        .sre-data-table td {
          padding: 14px 16px;
          border-bottom: 1px solid #1a2333;
          color: #cbd5e1;
        }
        .sre-data-table tr:hover td {
          background: rgba(30, 41, 59, 0.4);
        }
        .sre-empty-td {
          text-align: center;
          padding: 36px !important;
          color: #64748b;
        }

        .fw-bold { font-weight: 700; color: #ffffff; }
        .muted-txt { color: #94a3b8; }
        .mono-txt { font-family: monospace; }
        .ep-type-badge {
          background: #1e293b;
          color: #94a3b8;
          border: 1px solid #334155;
          font-size: 10px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
        }

        .table-actions-row {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
        }
        .action-btn {
          background: #1e293b;
          border: 1px solid #334155;
          color: #94a3b8;
          border-radius: 6px;
          padding: 5px 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .action-btn:hover { background: #334155; color: #ffffff; }
        .run-btn:hover { color: #22c55e; }
        .del-btn:hover { color: #ef4444; }

        .section-subtitle {
          font-size: 14px;
          font-weight: 800;
          color: #ffffff;
          margin: 0 0 14px 0;
        }

        .latency-endpoints-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }
        .endpoint-card {
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 14px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
        }
        .ep-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .ep-title-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ep-icon.green { color: #22c55e; }
        .ep-name {
          font-size: 15px;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
        }
        .ep-type {
          font-size: 11px;
          color: #64748b;
          font-weight: 600;
        }

        .ep-status-badge {
          font-size: 10px;
          font-weight: 800;
          padding: 3px 10px;
          border-radius: 6px;
          letter-spacing: 0.04em;
        }
        .ep-status-badge.healthy, .ep-status-badge.excellent {
          background: rgba(34, 197, 94, 0.15);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }
        .ep-status-badge.degraded, .ep-status-badge.warning {
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }
        .ep-status-badge.critical {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .ep-latency-val {
          font-size: 32px;
          font-weight: 800;
          color: #22c55e;
          line-height: 1.1;
        }
        .ms-lbl {
          font-size: 14px;
          font-weight: 600;
          color: #94a3b8;
        }

        .sparkline-container {
          background: #090d16;
          border: 1px solid #1b2436;
          border-radius: 8px;
          padding: 8px 12px;
        }

        .latency-trends-section {
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 14px;
          padding: 20px;
        }
        .trends-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
        }
        .trends-header h3 {
          font-size: 15px;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
        }
        .trends-icon.cyan { color: #38bdf8; }

        .trends-chart-area {
          background: #090d16;
          border: 1px solid #1b2436;
          border-radius: 10px;
          padding: 20px;
          height: 120px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .trends-svg {
          width: 100%;
          height: 100%;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}
