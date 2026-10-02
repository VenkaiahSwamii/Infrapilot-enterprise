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
  ExternalLink,
  ShieldCheck,
  Zap,
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
    const interval = setInterval(fetchDashboardData, 10000); // 10s auto-refresh
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
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1 w-max">
            <CheckCircle size={12} /> PASS
          </span>
        );
      case 'DEGRADED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center gap-1 w-max">
            <AlertTriangle size={12} /> DEGRADED
          </span>
        );
      case 'FAIL':
      case 'ERROR':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center gap-1 w-max">
            <XCircle size={12} /> {status}
          </span>
        );
      case 'TIMEOUT':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-500/10 border border-orange-500/30 text-orange-400 flex items-center gap-1 w-max">
            <Clock size={12} /> TIMEOUT
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1 w-max">
            <Activity size={12} /> PENDING
          </span>
        );
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-slate-100">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <Globe size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Synthetic Monitoring</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                In-house automated probe runner testing endpoints, SLAs, latency & response integrity
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchDashboardData}
            className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-lg transition-all"
            title="Refresh Data"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
          >
            <Plus size={16} /> New Synthetic Probe
          </button>
        </div>
      </div>

      {/* Overview Metric Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <span className="text-[10px] font-semibold uppercase text-slate-400 tracking-wider">Total Probes</span>
          <div className="text-2xl font-bold text-white mt-1 font-mono">{stats?.total_tests || 0}</div>
          <span className="text-[10px] text-slate-500">Configured checks</span>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <span className="text-[10px] font-semibold uppercase text-emerald-400 tracking-wider">Healthy</span>
          <div className="text-2xl font-bold text-emerald-400 mt-1 font-mono">{stats?.healthy || 0}</div>
          <span className="text-[10px] text-emerald-500/70">100% PASS</span>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <span className="text-[10px] font-semibold uppercase text-amber-400 tracking-wider">Degraded</span>
          <div className="text-2xl font-bold text-amber-400 mt-1 font-mono">{stats?.degraded || 0}</div>
          <span className="text-[10px] text-amber-500/70">High latency</span>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <span className="text-[10px] font-semibold uppercase text-rose-400 tracking-wider">Failing</span>
          <div className="text-2xl font-bold text-rose-400 mt-1 font-mono">{stats?.failed || 0}</div>
          <span className="text-[10px] text-rose-500/70">HTTP err / timeout</span>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <span className="text-[10px] font-semibold uppercase text-cyan-400 tracking-wider">Availability SLA</span>
          <div className="text-2xl font-bold text-cyan-400 mt-1 font-mono">
            {stats?.availability_pct !== undefined ? `${stats.availability_pct.toFixed(2)}%` : '100%'}
          </div>
          <span className="text-[10px] text-cyan-500/70">Overall uptime</span>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <span className="text-[10px] font-semibold uppercase text-indigo-400 tracking-wider">Avg Latency</span>
          <div className="text-2xl font-bold text-indigo-300 mt-1 font-mono">
            {stats?.avg_response_ms ? `${stats.avg_response_ms.toFixed(0)} ms` : '--'}
          </div>
          <span className="text-[10px] text-indigo-400/70">Response time</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
        <div className="relative w-full sm:w-80">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search probes by name or target URL..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {['ALL', 'PASS', 'DEGRADED', 'FAIL', 'DISABLED'].map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusFilter === f
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Dense Enterprise Data Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Probe Name & Method</th>
                <th className="px-4 py-3">Target Endpoint URL</th>
                <th className="px-4 py-3">Interval</th>
                <th className="px-4 py-3">Last Response Time</th>
                <th className="px-4 py-3">Last Checked</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredTests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No synthetic probes found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredTests.map((test) => (
                  <tr
                    key={test.id}
                    onClick={() => navigate(`/synthetic/${test.id}`)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">{statusBadge(test.last_status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{test.name}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-indigo-300 border border-slate-700">
                          {test.method}
                        </span>
                        {!test.enabled && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-slate-400">PAUSED</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400 max-w-xs truncate">{test.url}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono">{test.interval_seconds}s</td>
                    <td className="px-4 py-3">
                      <div className="font-mono">
                        <span
                          className={`font-bold ${
                            test.last_response_time_ms > test.response_time_threshold_ms
                              ? 'text-amber-400'
                              : 'text-cyan-400'
                          }`}
                        >
                          {test.last_response_time_ms ? `${test.last_response_time_ms.toFixed(0)} ms` : '--'}
                        </span>
                        <span className="text-[10px] text-slate-500 ml-1">
                          / {test.response_time_threshold_ms}ms
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                      {test.last_check_at ? new Date(test.last_check_at).toLocaleTimeString() : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={(e) => handleRunNow(e, test.id)}
                          disabled={runningMap[test.id]}
                          className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                          title="Run Manual Probe"
                        >
                          <Play size={14} className={runningMap[test.id] ? 'animate-spin' : ''} />
                        </button>
                        <button
                          onClick={(e) => handleEdit(e, test)}
                          className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors"
                          title="Edit Probe"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, test.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                          title="Delete Probe"
                        >
                          <Trash2 size={14} />
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
    </div>
  );
}
