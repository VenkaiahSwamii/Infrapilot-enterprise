import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Globe,
  Plus,
  Play,
  RefreshCw,
  Search,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Trash2,
  Edit,
  Activity,
} from 'lucide-react';
import { getOverviewStats, getAllTests, deleteSyntheticTest, runSyntheticTestNow } from '../../api/synthetic.js';
import SyntheticTestDrawer from './SyntheticTestDrawer.jsx';

export default function SyntheticMonitoringPage() {
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTest, setEditingTest] = useState(null);
  const [runningMap, setRunningMap] = useState({});

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsData, testsData] = await Promise.all([getOverviewStats(), getAllTests()]);
      setStats(statsData);
      setTests(testsData?.tests || []);
    } catch (err) {
      console.error('Failed to load synthetic monitoring data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const handleRunNow = async (e, testId) => {
    e.stopPropagation();
    setRunningMap((prev) => ({ ...prev, [testId]: true }));
    try {
      await runSyntheticTestNow(testId);
      setTimeout(fetchDashboardData, 1000);
    } catch (err) {
      console.error('Failed manual test run:', err);
    } finally {
      setRunningMap((prev) => ({ ...prev, [testId]: false }));
    }
  };

  const handleDelete = async (e, testId) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this synthetic probe?')) return;

    try {
      await deleteSyntheticTest(testId);
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to delete synthetic test:', err);
    }
  };

  const handleEdit = (e, test) => {
    e.stopPropagation();
    setEditingTest(test);
    setDrawerOpen(true);
  };

  const handleCreate = () => {
    setEditingTest(null);
    setDrawerOpen(true);
  };

  const filteredTests = tests.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.url.toLowerCase().includes(searchQuery.toLowerCase());

    if (statusFilter === 'ALL') return matchesSearch;
    if (statusFilter === 'PASS') return matchesSearch && t.last_status === 'PASS';
    if (statusFilter === 'DEGRADED') return matchesSearch && t.last_status === 'DEGRADED';
    if (statusFilter === 'FAIL')
      return matchesSearch && (t.last_status === 'FAIL' || t.last_status === 'ERROR' || t.last_status === 'TIMEOUT');
    if (statusFilter === 'DISABLED') return matchesSearch && !t.enabled;

    return matchesSearch;
  });

  const statusBadge = (status) => {
    switch (status) {
      case 'PASS':
        return (
          <span className="synth-status-badge pass">
            <CheckCircle size={12} /> PASS
          </span>
        );
      case 'DEGRADED':
        return (
          <span className="synth-status-badge degraded">
            <AlertTriangle size={12} /> DEGRADED
          </span>
        );
      case 'FAIL':
      case 'ERROR':
        return (
          <span className="synth-status-badge fail">
            <XCircle size={12} /> {status}
          </span>
        );
      case 'TIMEOUT':
        return (
          <span className="synth-status-badge timeout">
            <Clock size={12} /> TIMEOUT
          </span>
        );
      default:
        return (
          <span className="synth-status-badge pending">
            <Activity size={12} /> PENDING
          </span>
        );
    }
  };

  return (
    <div className="synth-page-root">
      {/* Top Banner Header */}
      <div className="synth-header">
        <div className="synth-header-title-block">
          <div className="title-row">
            <div className="icon-badge">
              <Globe size={22} color="#6366f1" />
            </div>
            <div>
              <h1>Synthetic Monitoring</h1>
              <span className="badge-synth">AUTOMATED PROBES</span>
            </div>
          </div>
          <p className="subtitle-txt">
            In-house HTTP/API uptime, response integrity, SLA availability &amp; multi-stage network latency tracing
          </p>
        </div>

        <div className="synth-header-actions">
          <button onClick={fetchDashboardData} className="ctrl-btn" title="Refresh Data">
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
          <button onClick={handleCreate} className="ctrl-btn primary-btn">
            <Plus size={15} />
            <span>New Synthetic Probe</span>
          </button>
        </div>
      </div>

      {/* Overview Metric Summary Cards */}
      <div className="synth-kpi-row">
        <div className="kpi-card">
          <span className="kpi-lbl">TOTAL PROBES</span>
          <div className="kpi-val font-mono">{stats?.total_tests || 0}</div>
          <span className="kpi-sub">Configured checks</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-lbl green-txt">HEALTHY</span>
          <div className="kpi-val green-txt font-mono">{stats?.healthy || 0}</div>
          <span className="kpi-sub">100% PASS</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-lbl amber-txt">DEGRADED</span>
          <div className="kpi-val amber-txt font-mono">{stats?.degraded || 0}</div>
          <span className="kpi-sub">High latency</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-lbl red-txt">FAILING</span>
          <div className="kpi-val red-txt font-mono">{stats?.failed || 0}</div>
          <span className="kpi-sub">HTTP err / timeout</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-lbl cyan-txt">AVAILABILITY SLA</span>
          <div className="kpi-val cyan-txt font-mono">
            {stats?.availability_pct !== undefined ? `${stats.availability_pct.toFixed(2)}%` : '100%'}
          </div>
          <span className="kpi-sub">Overall uptime</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-lbl indigo-txt">AVG LATENCY</span>
          <div className="kpi-val indigo-txt font-mono">
            {stats?.avg_response_ms ? `${stats.avg_response_ms.toFixed(0)} ms` : '--'}
          </div>
          <span className="kpi-sub">Response time</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="synth-controls-bar">
        <div className="search-input-box">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            placeholder="Search probes by name or target URL..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-pills-row">
          {['ALL', 'PASS', 'DEGRADED', 'FAIL', 'DISABLED'].map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`filter-pill ${statusFilter === f ? 'active' : ''}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Dense Enterprise Data Table */}
      <div className="synth-table-card">
        <div className="synth-table-wrap">
          <table className="synth-data-table">
            <thead>
              <tr>
                <th>STATUS</th>
                <th>PROBE NAME &amp; METHOD</th>
                <th>TARGET ENDPOINT URL</th>
                <th>INTERVAL</th>
                <th>LAST RESPONSE TIME</th>
                <th>LAST CHECKED</th>
                <th style={{ textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredTests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="synth-empty-td">
                    No synthetic probes found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredTests.map((test) => (
                  <tr
                    key={test.id}
                    onClick={() => navigate(`/synthetic/${test.id}`)}
                    className="clickable-tr"
                  >
                    <td>{statusBadge(test.last_status)}</td>
                    <td>
                      <div className="name-cell">
                        <span className="test-name">{test.name}</span>
                        <span className="method-badge">{test.method}</span>
                        {!test.enabled && <span className="paused-tag">PAUSED</span>}
                      </div>
                    </td>
                    <td className="mono-txt muted-txt max-url">{test.url}</td>
                    <td className="mono-txt muted-txt">{test.interval_seconds}s</td>
                    <td>
                      <div className="mono-txt">
                        <span
                          className={
                            test.last_response_time_ms > test.response_time_threshold_ms
                              ? 'amber-txt fw-bold'
                              : 'cyan-txt fw-bold'
                          }
                        >
                          {test.last_response_time_ms ? `${test.last_response_time_ms.toFixed(0)} ms` : '--'}
                        </span>
                        <span className="thresh-sub"> / {test.response_time_threshold_ms}ms</span>
                      </div>
                    </td>
                    <td className="mono-txt muted-txt time-cell">
                      {test.last_check_at ? new Date(test.last_check_at).toLocaleTimeString() : 'Never'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="actions-row">
                        <button
                          onClick={(e) => handleRunNow(e, test.id)}
                          disabled={runningMap[test.id]}
                          className="action-icon-btn run-btn"
                          title="Run Manual Probe"
                        >
                          <Play size={13} className={runningMap[test.id] ? 'spin' : ''} />
                        </button>
                        <button
                          onClick={(e) => handleEdit(e, test)}
                          className="action-icon-btn"
                          title="Edit Probe"
                        >
                          <Edit size={13} />
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, test.id)}
                          className="action-icon-btn del-btn"
                          title="Delete Probe"
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

      {/* Synthetic Probe Modal/Drawer */}
      <SyntheticTestDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={fetchDashboardData}
        initialTest={editingTest}
      />

      <style>{`
        .synth-page-root {
          padding: 28px 36px;
          min-height: 100vh;
          background-color: #0b0f19;
          color: #f1f5f9;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }

        .synth-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 24px;
        }
        .synth-header-title-block {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .title-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .icon-badge {
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          padding: 8px;
          border-radius: 10px;
        }
        .title-row h1 {
          font-size: 24px;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
          letter-spacing: -0.02em;
        }
        .badge-synth {
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

        .synth-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
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
        .primary-btn {
          background: #4f46e5 !important;
          border-color: #4338ca !important;
          color: #ffffff !important;
        }
        .primary-btn:hover {
          background: #4338ca !important;
        }

        .synth-kpi-row {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
          margin-bottom: 20px;
        }
        @media (min-width: 768px) {
          .synth-kpi-row { grid-template-columns: repeat(6, 1fr); }
        }
        .kpi-card {
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 84px;
        }
        .kpi-lbl {
          font-size: 10px;
          font-weight: 800;
          color: #94a3b8;
          letter-spacing: 0.04em;
        }
        .kpi-val {
          font-size: 24px;
          font-weight: 800;
          color: #ffffff;
          margin-top: 4px;
        }
        .kpi-sub {
          font-size: 10px;
          color: #64748b;
          margin-top: 2px;
        }

        .green-txt { color: #22c55e; }
        .amber-txt { color: #f59e0b; }
        .red-txt { color: #ef4444; }
        .cyan-txt { color: #38bdf8; }
        .indigo-txt { color: #818cf8; }
        .font-mono { font-family: monospace; }
        .fw-bold { font-weight: 700; color: #ffffff; }

        .synth-controls-bar {
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
        .search-input-box {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #0b0f19;
          border: 1px solid #1f293d;
          border-radius: 8px;
          padding: 8px 12px;
          width: 320px;
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
        .filter-pills-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .filter-pill {
          background: #0b0f19;
          border: 1px solid #1f293d;
          color: #94a3b8;
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .filter-pill.active {
          background: #4f46e5;
          border-color: #4f46e5;
          color: #ffffff;
        }

        .synth-table-card {
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 14px;
          overflow: hidden;
        }
        .synth-table-wrap {
          overflow-x: auto;
        }
        .synth-data-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 12px;
        }
        .synth-data-table th {
          background: #0b0f19;
          color: #64748b;
          padding: 12px 16px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.04em;
          border-bottom: 1px solid #1f293d;
        }
        .synth-data-table td {
          padding: 14px 16px;
          border-bottom: 1px solid #1a2333;
          color: #cbd5e1;
        }
        .clickable-tr {
          cursor: pointer;
        }
        .clickable-tr:hover td {
          background: rgba(30, 41, 59, 0.4);
        }
        .synth-empty-td {
          text-align: center;
          padding: 36px !important;
          color: #64748b;
        }

        .name-cell {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .test-name {
          font-weight: 700;
          color: #ffffff;
        }
        .method-badge {
          background: #1e293b;
          color: #a5b4fc;
          border: 1px solid #334155;
          font-size: 10px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
        }
        .paused-tag {
          background: #1e293b;
          color: #64748b;
          font-size: 9px;
          padding: 2px 4px;
          border-radius: 4px;
        }

        .mono-txt { font-family: monospace; }
        .muted-txt { color: #94a3b8; }
        .max-url { max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .thresh-sub { font-size: 10px; color: #64748b; }
        .time-cell { font-size: 11px; }

        .synth-status-badge {
          font-size: 10px;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .synth-status-badge.pass {
          background: rgba(34, 197, 94, 0.15);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }
        .synth-status-badge.degraded {
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }
        .synth-status-badge.fail {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .synth-status-badge.timeout {
          background: rgba(249, 115, 22, 0.15);
          color: #f97316;
          border: 1px solid rgba(249, 115, 22, 0.3);
        }
        .synth-status-badge.pending {
          background: #1e293b;
          color: #94a3b8;
          border: 1px solid #334155;
        }

        .actions-row {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
        }
        .action-icon-btn {
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
        .action-icon-btn:hover { background: #334155; color: #ffffff; }
        .run-btn:hover { color: #22c55e; }
        .del-btn:hover { color: #ef4444; }

        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}
