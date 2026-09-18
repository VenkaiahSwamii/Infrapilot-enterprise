import React, { useEffect, useState, useMemo } from 'react';
import { Layers, Activity, RefreshCw, Server, AlertTriangle, ShieldCheck, Play, Square, FileText } from 'lucide-react';
import { listServers } from '../api/server.js';
import { getDockerContainers, getDockerOverview } from '../api/docker.js';
import { useDashboardStore } from '../store/dashboardStore.jsx';
import ServerSelectDropdown from '../components/common/ServerSelectDropdown.jsx';

export default function DockerPage() {
  const [servers, setServers] = useState([]);
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedServerId, setSelectedServerId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { addToast } = useDashboardStore();

  const fetchDockerData = async () => {
    setLoading(true);
    setError('');
    try {
      const serverList = await listServers();
      setServers(serverList);

      const onlineServers = serverList.filter(
        s => String(s.status || '').toUpperCase() === 'ONLINE'
      );

      const allContainers = [];
      
      // Fetch docker containers in parallel for all online servers
      await Promise.all(
        onlineServers.map(async (server) => {
          const sId = server.id || server.ID || server.Id || server.machine_id;
          try {
            const data = await getDockerContainers(sId);
            if (Array.isArray(data)) {
              allContainers.push(
                ...data.map(container => ({
                  ...container,
                  hostServerName: server.hostname || 'Unknown',
                  hostServerId: sId,
                }))
              );
            }
          } catch (err) {
            console.log(`No Docker daemon running or accessible on server ${server.hostname}`);
          }
        })
      );

      setContainers(allContainers);
    } catch (err) {
      setError(err.message || 'Failed to retrieve Docker information.');
      addToast('critical', 'Docker Sync Failed', err.message || 'Unable to contact docker nodes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDockerData();
  }, []);

  const stats = useMemo(() => {
    const total = containers.length;
    const running = containers.filter(c => {
      const state = String(c.state || c.State || c.status || '').toLowerCase();
      return state === 'running' || state.includes('up');
    }).length;
    const stopped = total - running;
    
    // Check if status contains "exit" or "failed"
    const failed = containers.filter(c => {
      const status = String(c.status || '').toLowerCase();
      return status.includes('exit (1') || status.includes('dead') || status.includes('failed');
    }).length;

    return { total, running, stopped, failed };
  }, [containers]);

  // Filtered list
  const filteredContainers = useMemo(() => {
    return containers.filter(c => {
      if (selectedServerId !== 'all' && String(c.hostServerId) !== String(selectedServerId)) {
        return false;
      }
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const name = String(c.names || c.Names || c.name || '').toLowerCase();
      const image = String(c.image || c.Image || '').toLowerCase();
      const server = String(c.hostServerName || '').toLowerCase();
      return name.includes(q) || image.includes(q) || server.includes(q);
    });
  }, [containers, selectedServerId, searchQuery]);

  return (
    <div className="docker-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Layers size={26} color="#06b6d4" />
            Central Docker Monitoring
          </h1>
          <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
            Live status of container instances across your infrastructure fleet.
          </p>
        </div>
        <button
          className="refresh-btn"
          onClick={fetchDockerData}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            backgroundColor: '#1f2e44',
            color: '#f1f5f9',
            border: '1px solid #2e3f5a',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh Telemetry'}
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div className="docker-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="kpi-card" style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', padding: '20px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Containers</span>
          <strong style={{ display: 'block', fontSize: '28px', fontWeight: 800, color: '#f1f5f9', marginTop: '6px' }}>{stats.total}</strong>
        </div>
        <div className="kpi-card" style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', padding: '20px', borderLeft: '3px solid #22c55e' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Running</span>
          <strong style={{ display: 'block', fontSize: '28px', fontWeight: 800, color: '#f1f5f9', marginTop: '6px' }}>{stats.running}</strong>
        </div>
        <div className="kpi-card" style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', padding: '20px', borderLeft: '3px solid #f59e0b' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stopped</span>
          <strong style={{ display: 'block', fontSize: '28px', fontWeight: 800, color: '#f1f5f9', marginTop: '6px' }}>{stats.stopped}</strong>
        </div>
        <div className="kpi-card" style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', padding: '20px', borderLeft: '3px solid #ef4444' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Failed / Dead</span>
          <strong style={{ display: 'block', fontSize: '28px', fontWeight: 800, color: '#f1f5f9', marginTop: '6px' }}>{stats.failed}</strong>
        </div>
      </div>

      {/* Toolbar Filter */}
      <div className="docker-toolbar" style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div className="search-box" style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '8px', padding: '8px 12px', flex: 1, minWidth: '240px' }}>
          <Activity size={16} color="#64748b" />
          <input
            type="text"
            placeholder="Search containers by name, image, host..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ background: 'none', border: 'none', color: '#f1f5f9', outline: 'none', width: '100%', fontSize: '13px' }}
          />
        </div>

        <ServerSelectDropdown
          value={selectedServerId}
          onChange={(sId) => setSelectedServerId(sId)}
          showAll={true}
          allLabel="All Servers"
        />
      </div>

      {/* Containers Table */}
      <div className="table-wrapper" style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', overflow: 'hidden' }}>
        {filteredContainers.length === 0 ? (
          <div className="empty-state" style={{ textAlign: 'center', padding: '60px 24px', color: '#64748b' }}>
            <Layers size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <strong>No active containers found</strong>
            <p style={{ fontSize: '12px', marginTop: '4px' }}>Verify docker is running on your agents and telemetry is connected.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#080c14', borderBottom: '1px solid #1f2e44', color: '#64748b' }}>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>Container</th>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>Image</th>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>Host Server</th>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>CPU / Memory</th>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredContainers.map((container, idx) => {
                const state = String(container.state || container.State || container.status || '').toLowerCase();
                const isUp = state === 'running' || state.includes('up');
                
                // CPU/Memory formatting
                const cpu = container.cpu_stats || container.CpuPercent || container.cpu_percent || 0;
                const mem = container.memory_stats || container.MemUsage || container.memory_usage || 0;

                return (
                  <tr key={container.id || idx} style={{ borderBottom: '1px solid rgba(31, 46, 68, 0.5)', color: '#cbd5e1' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#f1f5f9' }}>
                      {container.names || container.Names || container.name || 'unnamed'}
                    </td>
                    <td style={{ padding: '14px 16px', fontFamily: 'monospace', color: '#64748b' }}>
                      {container.image || container.Image || '--'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Server size={12} color="#06b6d4" />
                        {container.hostServerName}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: isUp ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          color: isUp ? '#22c55e' : '#ef4444',
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: isUp ? '#22c55e' : '#ef4444' }} />
                        {container.status || state}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {isUp ? (
                        <span>
                          {typeof cpu === 'number' ? `${cpu.toFixed(1)}%` : cpu} / {typeof mem === 'number' ? `${mem.toFixed(1)}MB` : mem}
                        </span>
                      ) : (
                        <span style={{ color: '#64748b' }}>--</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#64748b' }}>
                      {container.created || container.Created || '--'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}
