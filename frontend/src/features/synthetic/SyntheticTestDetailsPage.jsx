import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Globe,
  Play,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Activity,
  RefreshCw,
} from 'lucide-react';
import { getSyntheticTestByID, getSyntheticTestResults, runSyntheticTestNow } from '../../api/synthetic.js';

export default function SyntheticTestDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [test, setTest] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [timeRange, setTimeRange] = useState('24h');

  const fetchData = async () => {
    try {
      setLoading(true);
      const testRes = await getSyntheticTestByID(id);
      setTest(testRes);

      const resData = await getSyntheticTestResults(id, { timeRange, limit: 50 });
      setResults(resData?.results || []);
    } catch (err) {
      console.error('Failed to load synthetic test details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id, timeRange]);

  const handleRunNow = async () => {
    setRunning(true);
    try {
      await runSyntheticTestNow(id);
      setTimeout(fetchData, 1000);
    } catch (err) {
      console.error('Manual run failed:', err);
    } finally {
      setRunning(false);
    }
  };

  if (loading && !test) {
    return (
      <div className="synth-details-loading">
        <RefreshCw size={24} className="spin cyan-txt mr-3" />
        <span>Loading synthetic probe investigation data...</span>
      </div>
    );
  }

  if (!test) {
    return (
      <div className="synth-details-notfound">
        <p>Synthetic probe not found.</p>
        <button onClick={() => navigate('/synthetic')} className="ctrl-btn">
          Back to Synthetic Monitoring
        </button>
      </div>
    );
  }

  // Calculate SLA & summary metrics
  const totalProbes = results.length;
  const passProbes = results.filter((r) => r.status === 'PASS').length;
  const availPct = totalProbes > 0 ? ((passProbes / totalProbes) * 100).toFixed(2) : '100.00';

  const latestResult = results[0] || {};

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
    <div className="synth-details-root">
      {/* Back Navigation Bar */}
      <div className="details-nav-bar">
        <button onClick={() => navigate('/synthetic')} className="back-btn">
          <ArrowLeft size={15} />
          <span>Back to Synthetic Probes</span>
        </button>

        <div className="actions-right">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="ctrl-select"
          >
            <option value="1h">Last 1 Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>

          <button onClick={handleRunNow} disabled={running} className="ctrl-btn primary-btn">
            <Play size={14} className={running ? 'spin' : ''} />
            <span>{running ? 'Executing Probe...' : 'Run Probe Now'}</span>
          </button>
        </div>
      </div>

      {/* Main Title Banner */}
      <div className="details-banner">
        <div className="banner-left">
          <div className="icon-badge">
            <Globe size={26} color="#6366f1" />
          </div>
          <div>
            <div className="title-row">
              <h2>{test.name}</h2>
              <span className="method-badge">{test.method}</span>
              {statusBadge(test.last_status)}
            </div>
            <p className="url-txt font-mono">{test.url}</p>
          </div>
        </div>

        <div className="banner-meta">
          <div>
            <span className="meta-lbl">CHECK INTERVAL</span>
            <span className="meta-val font-mono">{test.interval_seconds}s</span>
          </div>
          <div>
            <span className="meta-lbl">DEGRADED THRESHOLD</span>
            <span className="meta-val font-mono">{test.response_time_threshold_ms}ms</span>
          </div>
          <div>
            <span className="meta-lbl">EXPECTED STATUS</span>
            <span className="meta-val font-mono">{test.expected_status || 200}</span>
          </div>
        </div>
      </div>

      {/* Metric Tiles Row */}
      <div className="details-kpi-row">
        <div className="kpi-card">
          <span className="kpi-lbl">AVAILABILITY SLA ({timeRange})</span>
          <div className="kpi-val green-txt font-mono">{availPct}%</div>
          <span className="kpi-sub">{passProbes} / {totalProbes} successful probes</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-lbl">LAST RESPONSE TIME</span>
          <div className="kpi-val cyan-txt font-mono">
            {test.last_response_time_ms ? `${test.last_response_time_ms.toFixed(1)} ms` : '--'}
          </div>
          <span className="kpi-sub">Threshold: {test.response_time_threshold_ms} ms</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-lbl">BREACH COUNTER</span>
          <div className={`kpi-val font-mono ${test.breach_counter > 0 ? 'red-txt' : ''}`}>
            {test.breach_counter || 0}
          </div>
          <span className="kpi-sub">Consecutive failing checks</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-lbl">LAST CHECKED AT</span>
          <div className="kpi-val font-mono text-sm">
            {test.last_check_at ? new Date(test.last_check_at).toLocaleTimeString() : 'Never'}
          </div>
          <span className="kpi-sub">
            {test.last_check_at ? new Date(test.last_check_at).toLocaleDateString() : ''}
          </span>
        </div>
      </div>

      {/* Latency Breakdown */}
      {latestResult.response_time_ms > 0 && (
        <div className="breakdown-card">
          <div className="breakdown-header">
            <span>Latest Probe Network Latency Breakdown</span>
            <span className="total-lat font-mono">Total: {latestResult.response_time_ms.toFixed(2)} ms</span>
          </div>

          <div className="breakdown-grid">
            <div className="metric-box">
              <span className="lbl">DNS Lookup</span>
              <span className="val amber-txt font-mono">{latestResult.dns_time_ms?.toFixed(2) || '0.00'} ms</span>
            </div>
            <div className="metric-box">
              <span className="lbl">TLS Handshake</span>
              <span className="val indigo-txt font-mono">{latestResult.tls_time_ms?.toFixed(2) || '0.00'} ms</span>
            </div>
            <div className="metric-box">
              <span className="lbl">Time To First Byte (TTFB)</span>
              <span className="val cyan-txt font-mono">{latestResult.ttfb_ms?.toFixed(2) || '0.00'} ms</span>
            </div>
            <div className="metric-box">
              <span className="lbl">HTTP Status Code</span>
              <span className="val green-txt font-mono">{latestResult.http_status || test.expected_status}</span>
            </div>
          </div>
        </div>
      )}

      {/* Historical Execution Log Table */}
      <div className="details-table-card">
        <div className="table-header">
          <h3>Execution Logs &amp; Probe History</h3>
          <span>{results.length} recent executions</span>
        </div>

        <div className="table-wrap">
          <table className="synth-data-table">
            <thead>
              <tr>
                <th>TIMESTAMP</th>
                <th>RESULT STATUS</th>
                <th>HTTP CODE</th>
                <th>TOTAL LATENCY</th>
                <th>DNS</th>
                <th>TLS</th>
                <th>TTFB</th>
                <th>DETAILS / NOTES</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr>
                  <td colSpan={8} className="synth-empty-td">
                    No probe history recorded yet. Click "Run Probe Now" to trigger an instant check.
                  </td>
                </tr>
              ) : (
                results.map((r) => (
                  <tr key={r.id} className="font-mono">
                    <td className="muted-txt">{new Date(r.timestamp || r.created_at).toLocaleString()}</td>
                    <td>{statusBadge(r.status)}</td>
                    <td className="fw-bold">{r.http_status || '--'}</td>
                    <td className="cyan-txt fw-bold">{r.response_time_ms.toFixed(1)} ms</td>
                    <td className="muted-txt">{r.dns_time_ms?.toFixed(1)} ms</td>
                    <td className="muted-txt">{r.tls_time_ms?.toFixed(1)} ms</td>
                    <td className="muted-txt">{r.ttfb_ms?.toFixed(1)} ms</td>
                    <td className="muted-txt max-err">{r.error_message || 'OK'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .synth-details-root {
          padding: 28px 36px;
          min-height: 100vh;
          background-color: #0b0f19;
          color: #f1f5f9;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .synth-details-loading, .synth-details-notfound {
          padding: 48px;
          text-align: center;
          color: #94a3b8;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 400px;
        }

        .details-nav-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .back-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }
        .back-btn:hover { color: #ffffff; }

        .actions-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .ctrl-select {
          background: #111827;
          border: 1px solid #1f293d;
          color: #cbd5e1;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 12px;
          outline: none;
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
        }
        .ctrl-btn:hover { background: #334155; }
        .primary-btn {
          background: #4f46e5 !important;
          border-color: #4338ca !important;
          color: #ffffff !important;
        }

        .details-banner {
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 16px;
          padding: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .banner-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .icon-badge {
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          padding: 10px;
          border-radius: 12px;
        }
        .title-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .title-row h2 {
          font-size: 20px;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
        }
        .method-badge {
          background: #1e293b;
          color: #a5b4fc;
          border: 1px solid #334155;
          font-size: 11px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
        }
        .url-txt {
          font-size: 12px;
          color: #64748b;
          margin: 4px 0 0 0;
        }

        .banner-meta {
          display: flex;
          align-items: center;
          gap: 24px;
          border-left: 1px solid #1f293d;
          padding-left: 24px;
        }
        .meta-lbl {
          display: block;
          font-size: 10px;
          font-weight: 800;
          color: #64748b;
        }
        .meta-val {
          font-size: 13px;
          font-weight: 700;
          color: #e2e8f0;
        }

        .details-kpi-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }
        .kpi-card {
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .kpi-lbl {
          font-size: 10px;
          font-weight: 800;
          color: #94a3b8;
          letter-spacing: 0.04em;
        }
        .kpi-val {
          font-size: 22px;
          font-weight: 800;
          color: #ffffff;
          margin-top: 4px;
        }
        .kpi-sub {
          font-size: 10px;
          color: #64748b;
          margin-top: 2px;
        }

        .breakdown-card {
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 14px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .breakdown-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
          font-weight: 700;
          color: #e2e8f0;
        }
        .total-lat { color: #38bdf8; font-weight: 800; }

        .breakdown-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        .metric-box {
          background: #0b0f19;
          border: 1px solid #1f293d;
          border-radius: 8px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .metric-box .lbl {
          font-size: 10px;
          color: #64748b;
          font-weight: 700;
          text-transform: uppercase;
        }
        .metric-box .val {
          font-size: 15px;
          font-weight: 800;
        }

        .details-table-card {
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 14px;
          overflow: hidden;
        }
        .table-header {
          padding: 16px 20px;
          background: #0b0f19;
          border-bottom: 1px solid #1f293d;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .table-header h3 {
          font-size: 14px;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
        }
        .table-header span {
          font-size: 12px;
          color: #64748b;
        }

        .table-wrap { overflow-x: auto; }
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

        .green-txt { color: #22c55e; }
        .amber-txt { color: #f59e0b; }
        .red-txt { color: #ef4444; }
        .cyan-txt { color: #38bdf8; }
        .indigo-txt { color: #818cf8; }
        .font-mono { font-family: monospace; }
        .fw-bold { font-weight: 700; color: #ffffff; }
        .muted-txt { color: #94a3b8; }
        .max-err { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}
