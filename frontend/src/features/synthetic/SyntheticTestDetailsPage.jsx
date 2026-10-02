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
  ShieldAlert,
  Radio,
  Server,
  RefreshCw,
  Sliders,
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
      <div className="p-8 text-slate-400 flex items-center justify-center min-h-[400px]">
        <RefreshCw size={24} className="animate-spin text-indigo-400 mr-3" />
        <span>Loading synthetic probe investigation data...</span>
      </div>
    );
  }

  if (!test) {
    return (
      <div className="p-8 text-center text-slate-400">
        <p>Synthetic probe not found.</p>
        <button
          onClick={() => navigate('/synthetic')}
          className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm"
        >
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
  const statusColors = {
    PASS: { bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', label: 'PASS ✓', icon: CheckCircle },
    DEGRADED: { bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400', label: 'DEGRADED ⚠', icon: AlertTriangle },
    FAIL: { bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400', label: 'FAIL ✕', icon: XCircle },
    TIMEOUT: { bg: 'bg-orange-500/10 border-orange-500/30 text-orange-400', label: 'TIMEOUT ⌛', icon: Clock },
    ERROR: { bg: 'bg-purple-500/10 border-purple-500/30 text-purple-400', label: 'ERROR !', icon: XCircle },
  };

  const StatusIcon = statusColors[test.last_status]?.icon || Activity;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-slate-100">
      {/* Back Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/synthetic')}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} /> Back to Synthetic Probes
        </button>

        <div className="flex items-center gap-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none"
          >
            <option value="1h">Last 1 Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>

          <button
            onClick={handleRunNow}
            disabled={running}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50"
          >
            <Play size={14} className={running ? 'animate-spin' : ''} />
            {running ? 'Executing Probe...' : 'Run Probe Now'}
          </button>
        </div>
      </div>

      {/* Main Title Banner */}
      <div className="p-6 bg-slate-900/80 border border-slate-800/80 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-md">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400 mt-1">
            <Globe size={28} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white">{test.name}</h1>
              <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-800 text-indigo-300 border border-slate-700">
                {test.method}
              </span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
                  statusColors[test.last_status]?.bg || 'bg-slate-800 text-slate-300'
                }`}
              >
                <StatusIcon size={14} />
                {test.last_status || 'PENDING'}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-1.5">{test.url}</p>
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs text-slate-400 border-t md:border-t-0 md:border-l border-slate-800 pt-3 md:pt-0 md:pl-6">
          <div>
            <span className="block text-[10px] uppercase text-slate-500 font-semibold">Check Interval</span>
            <span className="font-semibold text-slate-200">{test.interval_seconds}s</span>
          </div>
          <div>
            <span className="block text-[10px] uppercase text-slate-500 font-semibold">Degraded Threshold</span>
            <span className="font-semibold text-slate-200">{test.response_time_threshold_ms}ms</span>
          </div>
          <div>
            <span className="block text-[10px] uppercase text-slate-500 font-semibold">Expected Status</span>
            <span className="font-semibold text-slate-200">{test.expected_status || 200}</span>
          </div>
        </div>
      </div>

      {/* Key Metric Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-1">
            Availability SLA ({timeRange})
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono">{availPct}%</div>
          <p className="text-[11px] text-slate-500 mt-1">{passProbes} / {totalProbes} successful probes</p>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-1">
            Last Response Time
          </div>
          <div className="text-2xl font-bold text-cyan-400 font-mono">
            {test.last_response_time_ms ? `${test.last_response_time_ms.toFixed(1)} ms` : '--'}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Threshold: {test.response_time_threshold_ms} ms</p>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-1">
            Failure Breach Count
          </div>
          <div className={`text-2xl font-bold font-mono ${test.breach_counter > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
            {test.breach_counter || 0}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Concurring failing checks</p>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-1">
            Last Checked At
          </div>
          <div className="text-sm font-semibold text-slate-200 mt-2 font-mono">
            {test.last_check_at ? new Date(test.last_check_at).toLocaleTimeString() : 'Never'}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {test.last_check_at ? new Date(test.last_check_at).toLocaleDateString() : ''}
          </p>
        </div>
      </div>

      {/* Latency Breakdown Bar */}
      {latestResult.total_response_time_ms > 0 && (
        <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300">Latest Probe Network Latency Breakdown</span>
            <span className="font-mono text-cyan-400 font-bold">
              Total: {latestResult.total_response_time_ms.toFixed(2)} ms
            </span>
          </div>

          <div className="grid grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">DNS Lookup</span>
              <span className="text-sm font-mono font-bold text-amber-400">
                {latestResult.dns_lookup_ms?.toFixed(2) || '0.00'} ms
              </span>
            </div>
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">TLS Handshake</span>
              <span className="text-sm font-mono font-bold text-indigo-400">
                {latestResult.tls_handshake_ms?.toFixed(2) || '0.00'} ms
              </span>
            </div>
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Time To First Byte (TTFB)</span>
              <span className="text-sm font-mono font-bold text-cyan-400">
                {latestResult.ttfb_ms?.toFixed(2) || '0.00'} ms
              </span>
            </div>
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">HTTP Status Code</span>
              <span className="text-sm font-mono font-bold text-emerald-400">
                {latestResult.status_code || test.expected_status}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Historical Execution Log Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Execution Logs & Probe History</h3>
          <span className="text-xs text-slate-400">{results.length} recent executions</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Result Status</th>
                <th className="px-4 py-3">HTTP Code</th>
                <th className="px-4 py-3">Total Latency</th>
                <th className="px-4 py-3">DNS</th>
                <th className="px-4 py-3">TLS</th>
                <th className="px-4 py-3">TTFB</th>
                <th className="px-4 py-3">Details / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {results.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No probe history recorded yet. Click "Run Probe Now" to trigger an instant check.
                  </td>
                </tr>
              ) : (
                results.map((r) => {
                  const SIcon = statusColors[r.status]?.icon || Activity;
                  return (
                    <tr key={r.id} className="hover:bg-slate-800/30 transition-colors font-mono">
                      <td className="px-4 py-3 text-slate-400">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 w-max ${
                            statusColors[r.status]?.bg || 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          <SIcon size={12} />
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-200">{r.status_code || '--'}</td>
                      <td className="px-4 py-3 text-cyan-400 font-bold">{r.total_response_time_ms.toFixed(1)} ms</td>
                      <td className="px-4 py-3 text-slate-400">{r.dns_lookup_ms?.toFixed(1)} ms</td>
                      <td className="px-4 py-3 text-slate-400">{r.tls_handshake_ms?.toFixed(1)} ms</td>
                      <td className="px-4 py-3 text-slate-400">{r.ttfb_ms?.toFixed(1)} ms</td>
                      <td className="px-4 py-3 text-slate-400 font-sans max-w-xs truncate" title={r.error_message}>
                        {r.error_message || 'OK'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
