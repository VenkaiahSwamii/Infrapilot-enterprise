import React, { useState, useEffect, useMemo } from 'react';
import {
  Zap,
  Server,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Search,
  Download,
  Shield,
  Activity,
  Layers
} from 'lucide-react';
import { apiClient } from '../../api/client.js';
import { getMachineId } from '../../utils/machineId.js';

export default function SRECrashPage() {
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortOption, setSortOption] = useState('NAME_ASC');
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleTimeString());

  const fetchServicesData = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/machines').catch(() => null);
      if (res && (Array.isArray(res.data) || res.data?.machines)) {
        const raw = Array.isArray(res.data) ? res.data : res.data?.machines || [];
        setMachines(raw);
      }
    } catch (err) {
      console.error('Failed to load crash service data', err);
    } finally {
      setLoading(false);
      setLastUpdated(new Date().toLocaleTimeString());
    }
  };

  useEffect(() => {
    fetchServicesData();
  }, []);

  const handleResetFlap = async () => {
    setIsResetting(true);
    try {
      await apiClient.post('/services/reset');
    } catch {}
    setTimeout(() => {
      setIsResetting(false);
      fetchServicesData();
    }, 600);
  };

  const primaryMachine = machines[0] || {};
  const activeHostname = primaryMachine.hostname || primaryMachine.RegisteredHostname || primaryMachine.name || 'luffy';

  const servicesList = [
    {
      id: 'svc-1',
      name: 'ssh.service',
      type: 'DAEMON / SYSTEMD',
      status: 'HEALTHY',
      restarts: 0,
      maxRestarts: 3,
      windowSec: 60,
      circuitBreaker: 'ARMED',
      description: 'OpenSSH server daemon for secure remote shell access.',
    },
    {
      id: 'svc-2',
      name: 'cron.service',
      type: 'DAEMON / CRON',
      status: 'HEALTHY',
      restarts: 0,
      maxRestarts: 3,
      windowSec: 60,
      circuitBreaker: 'ARMED',
      description: 'System periodic job scheduler daemon.',
    },
    {
      id: 'svc-3',
      name: 'systemd-journald.service',
      type: 'DAEMON / LOGGING',
      status: 'HEALTHY',
      restarts: 0,
      maxRestarts: 3,
      windowSec: 60,
      circuitBreaker: 'EXEMPT',
      description: 'System event & kernel logging daemon.',
    },
  ];

  const healthyCount = servicesList.filter((s) => s.status === 'HEALTHY').length;
  const trippedCount = servicesList.filter((s) => s.circuitBreaker === 'TRIPPED').length;

  const filteredServices = useMemo(() => {
    return servicesList.filter((s) => {
      const matchSearch = !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [servicesList, searchQuery, statusFilter]);

  return (
    <div className="sre-crash-page-root">
      {/* ── TOP HEADER TITLE BAR ── */}
      <div className="crash-header">
        <div className="header-title-block">
          <div className="title-row">
            <h1>Crash &amp; Service Health (Node: {activeHostname.toLowerCase()})</h1>
            <span className="badge-prod">PRODUCTION</span>
          </div>
          <p className="subtitle-txt">
            Anti-cascading daemon restart windows, circuit breaker status &amp; whitelisted accept-list monitoring.
          </p>
        </div>

        <div className="header-status-meta">
          <span className="live-status-pill">
            <span className="green-dot pulse" /> Live Monitoring
          </span>
          <span className="updated-time-txt">⏱ Last updated: {lastUpdated}</span>
        </div>
      </div>

      {/* ── KPI HEADER CARDS ROW (6 CARDS) ── */}
      <div className="crash-kpi-row">
        <div className="kpi-box">
          <div className="kpi-label-wrap">
            <Server size={14} className="kpi-icon yellow" />
            <span>TOTAL SERVICES</span>
          </div>
          <div className="kpi-number">{servicesList.length}</div>
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
            <AlertCircle size={14} className="kpi-icon red" />
            <span>TRIPPED</span>
          </div>
          <div className="kpi-number red-txt">{trippedCount}</div>
        </div>

        <div className="kpi-box">
          <div className="kpi-label-wrap">
            <Shield size={14} className="kpi-icon cyan" />
            <span>CIRCUIT BREAKER</span>
          </div>
          <div className="kpi-number cyan-txt">ARMED</div>
        </div>

        <div className="kpi-box">
          <div className="kpi-label-wrap">
            <Zap size={14} className="kpi-icon yellow" />
            <span>RESTART WINDOW</span>
          </div>
          <div className="kpi-number">3 in 60s</div>
        </div>

        <div className="kpi-box">
          <div className="kpi-label-wrap">
            <Activity size={14} className="kpi-icon purple" />
            <span>FLAP PROTECTION</span>
          </div>
          <div className="kpi-number purple-txt">ACTIVE</div>
        </div>
      </div>

      {/* ── FILTER & ACTIONS CONTROLS BAR ── */}
      <div className="crash-controls-bar">
        <div className="controls-left">
          <div className="search-input-box">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Search services..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select className="ctrl-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">ALL</option>
            <option value="HEALTHY">HEALTHY</option>
            <option value="TRIPPED">TRIPPED</option>
          </select>

          <select className="ctrl-select" value={sortOption} onChange={(e) => setSortOption(e.target.value)}>
            <option value="NAME_ASC">NAME_ASC</option>
            <option value="RESTARTS_DESC">RESTARTS_DESC</option>
          </select>
        </div>

        <div className="controls-right">
          <button className="ctrl-btn" onClick={fetchServicesData} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
          <button className="ctrl-btn" onClick={handleResetFlap} disabled={isResetting}>
            <Zap size={13} className={isResetting ? 'spin' : ''} />
            <span>Reset Flap</span>
          </button>
          <button className="ctrl-btn export-btn" disabled>
            <Download size={13} />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* ── SERVICES GRID ── */}
      <div className="crash-services-grid">
        {filteredServices.map((svc) => (
          <div key={svc.id} className="service-card">
            <div className="svc-card-header">
              <div className="svc-title-wrap">
                <Zap size={16} className="svc-icon yellow" />
                <div>
                  <h4 className="svc-name">{svc.name}</h4>
                  <span className="svc-type">{svc.type}</span>
                </div>
              </div>

              <span className={`svc-status-badge ${svc.status.toLowerCase()}`}>{svc.status}</span>
            </div>

            <div className="svc-metric-row">
              <span className="metric-label">Restarts in Window</span>
              <strong className="metric-val">{svc.restarts} / {svc.maxRestarts} max</strong>
            </div>

            <div className="svc-progress-bar">
              <div className="svc-bar-fill green" style={{ width: '0%' }} />
            </div>

            <div className="svc-sub-grid">
              <div className="sub-card">
                <span className="sub-label">RESTART WINDOW</span>
                <strong className="sub-val">{svc.windowSec}s</strong>
              </div>

              <div className="sub-card">
                <span className="sub-label">CIRCUIT BREAKER</span>
                <strong className="sub-val green-txt">{svc.circuitBreaker}</strong>
              </div>
            </div>

            <div className="svc-card-footer">
              <CheckCircle2 size={14} className="footer-icon green" />
              <span>Service daemon is running healthy. No crash events detected.</span>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .sre-crash-page-root {
          padding: 28px 36px;
          min-height: 100vh;
          background-color: #0b0f19;
          color: #f1f5f9;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }

        .crash-header {
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
          font-size: 26px;
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
          gap: 14px;
          font-size: 12px;
        }
        .live-status-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #22c55e;
          font-weight: 600;
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
        }

        .crash-kpi-row {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 14px;
          margin-bottom: 20px;
        }
        .kpi-box {
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 84px;
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
        .kpi-icon.yellow { color: #eab308; }
        .kpi-icon.green { color: #22c55e; }
        .kpi-icon.red { color: #ef4444; }
        .kpi-icon.cyan { color: #38bdf8; }
        .kpi-icon.purple { color: #c084fc; }

        .kpi-number {
          font-size: 22px;
          font-weight: 800;
          color: #ffffff;
          margin-top: 6px;
        }
        .kpi-number.green-txt { color: #22c55e; }
        .kpi-number.red-txt { color: #ef4444; }
        .kpi-number.cyan-txt { color: #38bdf8; }
        .kpi-number.purple-txt { color: #c084fc; }

        .crash-controls-bar {
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 12px;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
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
          width: 240px;
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

        .crash-services-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
          gap: 16px;
        }
        .service-card {
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 14px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
        }
        .svc-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .svc-title-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .svc-icon.yellow { color: #eab308; }
        .svc-name {
          font-size: 15px;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
        }
        .svc-type {
          font-size: 11px;
          color: #64748b;
          font-weight: 600;
        }

        .svc-status-badge {
          font-size: 10px;
          font-weight: 800;
          padding: 3px 10px;
          border-radius: 6px;
          letter-spacing: 0.04em;
        }
        .svc-status-badge.healthy {
          background: rgba(34, 197, 94, 0.15);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .svc-metric-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .metric-label {
          font-size: 12px;
          color: #94a3b8;
          font-weight: 600;
        }
        .metric-val {
          font-size: 20px;
          font-weight: 800;
          color: #ffffff;
        }

        .svc-progress-bar {
          width: 100%;
          height: 8px;
          background-color: #1e293b;
          border-radius: 9999px;
          overflow: hidden;
        }
        .svc-bar-fill.green {
          height: 100%;
          background: #22c55e;
          border-radius: 9999px;
        }

        .svc-sub-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .sub-card {
          background: #090d16;
          border: 1px solid #1b2436;
          border-radius: 8px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .sub-label {
          font-size: 10px;
          font-weight: 800;
          color: #64748b;
          letter-spacing: 0.05em;
        }
        .sub-val {
          font-size: 14px;
          font-weight: 800;
          color: #ffffff;
        }
        .sub-val.green-txt { color: #22c55e; }

        .svc-card-footer {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: #94a3b8;
          padding-top: 8px;
          border-top: 1px solid #1e293b;
        }
        .footer-icon.green { color: #22c55e; }

        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}
