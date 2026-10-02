import React, { useEffect, useState, useCallback } from 'react';
import {
  Network,
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
  Server,
  Activity,
  Radio,
  Sliders,
  ShieldCheck,
} from 'lucide-react';
import {
  getNetworkOverviewStats,
  getAllNetworkChecks,
  deleteNetworkCheck,
  runNetworkCheckNow,
  getHostNetworkViews,
} from '../../api/network.js';
import NetworkCheckDrawer from './NetworkCheckDrawer.jsx';
import HostNetworkDetailModal from './HostNetworkDetailModal.jsx';

export default function NetworkMonitoringPage() {
  const [stats, setStats] = useState(null);
  const [checks, setChecks] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCheck, setEditingCheck] = useState(null);
  const [selectedHost, setSelectedHost] = useState(null);
  const [runningMap, setRunningMap] = useState({});

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsData, checksData, hostsData] = await Promise.all([
        getNetworkOverviewStats(),
        getAllNetworkChecks(),
        getHostNetworkViews(),
      ]);
      setStats(statsData);
      setChecks(checksData?.checks || []);
      setHosts(hostsData?.hosts || []);
    } catch (err) {
      console.error('Failed to load network monitoring data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRunNow = async (e, checkId) => {
    e.stopPropagation();
    setRunningMap((prev) => ({ ...prev, [checkId]: true }));
    try {
      await runNetworkCheckNow(checkId);
      setTimeout(fetchData, 1000);
    } catch (err) {
      console.error('Failed manual network probe:', err);
    } finally {
      setRunningMap((prev) => ({ ...prev, [checkId]: false }));
    }
  };

  const handleDelete = async (e, checkId) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this network check target?')) return;
    try {
      await deleteNetworkCheck(checkId);
      fetchData();
    } catch (err) {
      console.error('Failed to delete network check:', err);
    }
  };

  const handleEdit = (e, check) => {
    e.stopPropagation();
    setEditingCheck(check);
    setDrawerOpen(true);
  };

  const handleCreate = () => {
    setEditingCheck(null);
    setDrawerOpen(true);
  };

  const filteredChecks = checks.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.target.toLowerCase().includes(searchQuery.toLowerCase());

    if (typeFilter === 'ALL') return matchesSearch;
    if (typeFilter === c.type) return matchesSearch;
    if (typeFilter === 'HEALTHY') return matchesSearch && c.last_status === 'HEALTHY';
    if (typeFilter === 'CRITICAL') return matchesSearch && (c.last_status === 'CRITICAL' || c.last_status === 'DEGRADED');

    return matchesSearch;
  });

  const statusBadge = (status) => {
    switch (status) {
      case 'HEALTHY':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1 w-max">
            <CheckCircle size={12} /> HEALTHY
          </span>
        );
      case 'DEGRADED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center gap-1 w-max">
            <AlertTriangle size={12} /> DEGRADED
          </span>
        );
      case 'CRITICAL':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center gap-1 w-max">
            <XCircle size={12} /> CRITICAL
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1 w-max">
            <Activity size={12} /> UNKNOWN
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
              <Network size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Network Monitoring</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Unified observability from Host → Network → Service → Application
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-lg transition-all"
            title="Refresh Data"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
          >
            <Plus size={16} /> Configure Network Target
          </button>
        </div>
      </div>

      {/* KPI Overview Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-8 gap-3">
        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <span className="text-[10px] font-semibold uppercase text-slate-400 tracking-wider">Monitored Hosts</span>
          <div className="text-xl font-bold text-white mt-1 font-mono">{stats?.hosts_monitored || 1}</div>
          <span className="text-[9px] text-slate-500">Node agents</span>
        </div>

        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <span className="text-[10px] font-semibold uppercase text-emerald-400 tracking-wider">Healthy</span>
          <div className="text-xl font-bold text-emerald-400 mt-1 font-mono">{stats?.healthy || 0}</div>
          <span className="text-[9px] text-emerald-500/70">Passing probes</span>
        </div>

        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <span className="text-[10px] font-semibold uppercase text-amber-400 tracking-wider">Degraded</span>
          <div className="text-xl font-bold text-amber-400 mt-1 font-mono">{stats?.degraded || 0}</div>
          <span className="text-[9px] text-amber-500/70">High latency</span>
        </div>

        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <span className="text-[10px] font-semibold uppercase text-rose-400 tracking-wider">Critical</span>
          <div className="text-xl font-bold text-rose-400 mt-1 font-mono">{stats?.critical || 0}</div>
          <span className="text-[9px] text-rose-500/70">Packet loss / Err</span>
        </div>

        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <span className="text-[10px] font-semibold uppercase text-cyan-400 tracking-wider">Avg Latency</span>
          <div className="text-xl font-bold text-cyan-300 mt-1 font-mono">
            {stats?.avg_latency_ms ? `${stats.avg_latency_ms.toFixed(1)} ms` : '--'}
          </div>
          <span className="text-[9px] text-cyan-400/70">RTT duration</span>
        </div>

        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <span className="text-[10px] font-semibold uppercase text-indigo-400 tracking-wider">Packet Loss</span>
          <div className="text-xl font-bold text-indigo-300 mt-1 font-mono">
            {stats?.packet_loss_pct !== undefined ? `${stats.packet_loss_pct.toFixed(1)}%` : '0.0%'}
          </div>
          <span className="text-[9px] text-indigo-400/70">Average loss</span>
        </div>

        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <span className="text-[10px] font-semibold uppercase text-slate-400 tracking-wider">Interfaces</span>
          <div className="text-xl font-bold text-white mt-1 font-mono">{stats?.network_interfaces || 3}</div>
          <span className="text-[9px] text-slate-500">OS NICs</span>
        </div>

        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <span className="text-[10px] font-semibold uppercase text-rose-400 tracking-wider">Failed Checks</span>
          <div className="text-xl font-bold text-rose-400 mt-1 font-mono">{stats?.failed_checks || 0}</div>
          <span className="text-[9px] text-rose-500/70">Breaches</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
        <div className="relative w-full sm:w-80">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search targets by name or host/IP/path..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {['ALL', 'PING', 'TCP', 'DNS', 'HTTP', 'UNIX_SOCKET', 'INTERFACE', 'HEALTHY', 'CRITICAL'].map((f) => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                typeFilter === f
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Network Target Data Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Target Name</th>
                <th className="px-4 py-3">Check Type</th>
                <th className="px-4 py-3">Target Address / Socket</th>
                <th className="px-4 py-3">Measured Latency</th>
                <th className="px-4 py-3">Packet Loss %</th>
                <th className="px-4 py-3">Last Checked</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredChecks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No network targets found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredChecks.map((check) => (
                  <tr key={check.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3">{statusBadge(check.last_status)}</td>
                    <td className="px-4 py-3 font-semibold text-white">{check.name}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-indigo-300 border border-slate-700">
                        {check.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400 max-w-xs truncate">{check.target}</td>
                    <td className="px-4 py-3 font-mono font-bold text-cyan-400">
                      {check.last_latency_ms > 0 ? `${check.last_latency_ms.toFixed(1)} ms` : '--'}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-300">
                      {check.type === 'UNIX_SOCKET' ? 'N/A' : `${check.last_packet_loss_pct.toFixed(1)}%`}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400">
                      {check.last_check_at ? new Date(check.last_check_at).toLocaleTimeString() : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedHost(hosts[0] || { hostname: 'Node-Primary', connectivities: checks })}
                          className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors"
                          title="Host Network View"
                        >
                          <Server size={14} />
                        </button>
                        <button
                          onClick={(e) => handleRunNow(e, check.id)}
                          disabled={runningMap[check.id]}
                          className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                          title="Run Manual Probe"
                        >
                          <Play size={14} className={runningMap[check.id] ? 'animate-spin' : ''} />
                        </button>
                        <button
                          onClick={(e) => handleEdit(e, check)}
                          className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors"
                          title="Edit Target"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, check.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                          title="Delete Target"
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

      {/* Network Drawer & Host Modal */}
      <NetworkCheckDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={fetchData}
        initialCheck={editingCheck}
      />

      <HostNetworkDetailModal
        hostView={selectedHost}
        onClose={() => setSelectedHost(null)}
      />
    </div>
  );
}
