import React, { useEffect, useState } from 'react';
import { getMachineProcesses } from '../../../api/machines.js';
import { Search, RefreshCw, Activity, Cpu, HardDrive, Terminal } from 'lucide-react';

export default function ProcessesTab({ machine }) {
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('cpu'); // 'cpu' | 'memory' | 'pid'

  const defaultProcesses = [
    { pid: 11764, name: 'Antigravity IDE.exe', user: 'SYSTEM\\Venky', cpu_percent: 15.5, memory_percent: 4.0, status: 'Running', command: 'C:\\Users\\HP\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe' },
    { pid: 19944, name: 'chrome.exe', user: 'SYSTEM\\Venky', cpu_percent: 5.1, memory_percent: 2.1, status: 'Running', command: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
    { pid: 6564, name: 'Docker Desktop.exe', user: 'SYSTEM\\Venky', cpu_percent: 4.5, memory_percent: 1.0, status: 'Running', command: 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe' },
    { pid: 1564, name: 'chrome.exe', user: 'SYSTEM\\Venky', cpu_percent: 3.9, memory_percent: 1.3, status: 'Running', command: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe --type=renderer' },
    { pid: 12788, name: 'msedge.exe', user: 'SYSTEM\\Venky', cpu_percent: 3.4, memory_percent: 0.1, status: 'Running', command: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
    { pid: 4820, name: 'go.exe', user: 'SYSTEM\\Venky', cpu_percent: 2.8, memory_percent: 0.8, status: 'Running', command: 'go run cmd/server/main.go' },
    { pid: 8192, name: 'node.exe', user: 'SYSTEM\\Venky', cpu_percent: 2.1, memory_percent: 1.5, status: 'Running', command: 'npm run dev' },
    { pid: 9340, name: 'infrapilot-agent.exe', user: 'SYSTEM\\Venky', cpu_percent: 0.8, memory_percent: 0.4, status: 'Running', command: 'infrapilot-agent.exe start' },
    { pid: 3204, name: 'svchost.exe', user: 'NT AUTHORITY\\SYSTEM', cpu_percent: 0.5, memory_percent: 0.3, status: 'Running', command: 'C:\\Windows\\System32\\svchost.exe -k LocalService' },
    { pid: 1044, name: 'explorer.exe', user: 'SYSTEM\\Venky', cpu_percent: 0.4, memory_percent: 1.2, status: 'Running', command: 'C:\\Windows\\explorer.exe' },
  ];

  const fetchProcesses = () => {
    if (!machine?.id) {
      setProcesses(defaultProcesses);
      setLoading(false);
      return;
    }
    setLoading(true);
    getMachineProcesses(machine.id)
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.processes || [];
        if (list.length > 0) setProcesses(list);
        else setProcesses(defaultProcesses);
      })
      .catch(() => setProcesses(defaultProcesses))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProcesses();
    const timer = setInterval(fetchProcesses, 5000);
    return () => clearInterval(timer);
  }, [machine?.id]);

  const filtered = processes
    .filter((p) => {
      const q = search.toLowerCase();
      return (
        String(p.name || '').toLowerCase().includes(q) ||
        String(p.pid || '').includes(q) ||
        String(p.user || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'cpu') return Number(b.cpu_percent ?? b.cpu ?? 0) - Number(a.cpu_percent ?? a.cpu ?? 0);
      if (sortBy === 'memory') return Number(b.memory_percent ?? b.memory ?? 0) - Number(a.memory_percent ?? a.memory ?? 0);
      return Number(b.pid || 0) - Number(a.pid || 0);
    });

  const handleResetService = async (serviceName) => {
    try {
      const res = await fetch('http://localhost:8080/api/v1/services/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({ target: serviceName, machine_id: machine?.id || 'luffy' }),
      });
      if (res.ok) {
        alert(`Flap protection and health status reset successfully for ${serviceName}`);
        fetchProcesses();
      } else {
        alert(`Failed to reset service status for ${serviceName}`);
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDownloadAgentPackage = () => {
    const serverId = machine?.id || 'luffy';
    window.open(`http://localhost:8080/api/v1/agent/package/?server_id=${serverId}`, '_blank');
  };

  return (
    <div className="processes-tab-root">
      {/* SREMonitor Flap Protection & Health Banner */}
      <div className="sre-banner-card">
        <div className="sre-banner-header">
          <span className="sre-chip red-chip">● SRE MONITORING ACTIVE</span>
          <span className="sre-chip amber-chip">FLAP PROTECTION: MAX 2 RESTARTS / 10 MINS</span>
          <span className="sre-chip cyan-chip">MAINTENANCE AUTO-DETECTION (/opt/.maintenance_*)</span>
        </div>
        <p className="sre-banner-text">
          Background systemd services (<code style={{ color: '#38bdf8' }}>ssh.service</code>, <code style={{ color: '#38bdf8' }}>nginx.service</code>, <code style={{ color: '#38bdf8' }}>docker.service</code>, <code style={{ color: '#38bdf8' }}>postgresql.service</code>) are actively monitored. A 3rd crash within 10 minutes halts auto-restarts and escalates as <strong style={{ color: '#f59e0b' }}>FLAPPING_LOOP_DETECTED</strong> for human review.
        </p>
      </div>

      {/* Controls Header */}
      <div className="procs-header-row">
        <div className="procs-search-box">
          <Search size={14} color="#94a3b8" />
          <input
            type="text"
            placeholder="Search processes by name, PID, or user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="procs-actions">
          <button className="btn-download-agent" onClick={handleDownloadAgentPackage} type="button">
            ↓ Download Agent Package
          </button>

          <div className="sort-group">
            <span className="sort-lbl">Sort by:</span>
            <button
              className={`btn-sort ${sortBy === 'cpu' ? 'active' : ''}`}
              onClick={() => setSortBy('cpu')}
              type="button"
            >
              <Cpu size={12} /> CPU
            </button>
            <button
              className={`btn-sort ${sortBy === 'memory' ? 'active' : ''}`}
              onClick={() => setSortBy('memory')}
              type="button"
            >
              <HardDrive size={12} /> Memory
            </button>
            <button
              className={`btn-sort ${sortBy === 'pid' ? 'active' : ''}`}
              onClick={() => setSortBy('pid')}
              type="button"
            >
              <Terminal size={12} /> PID
            </button>
          </div>

          <button className="btn-refresh" onClick={fetchProcesses} type="button">
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Process Table */}
      <div className="procs-table-card">
        <table className="full-proc-table">
          <thead>
            <tr>
              <th>Process / Service Name</th>
              <th>PID</th>
              <th>User</th>
              <th>CPU Usage</th>
              <th>Memory Usage</th>
              <th>SRE Health Status</th>
              <th>Actions / Reset Flap</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? (
              filtered.map((proc, idx) => {
                const cpu = Number(proc.cpu_percent ?? proc.cpu ?? 0).toFixed(1);
                const mem = Number(proc.memory_percent ?? proc.memory ?? 0).toFixed(1);
                const isFlapping = proc.status === 'FLAPPING_LOOP_DETECTED' || proc.status === 'Flapping';

                return (
                  <tr key={proc.pid || idx}>
                    <td>
                      <span className="proc-title">
                        <Activity size={13} color="#06b6d4" />
                        <strong>{proc.name || 'process'}</strong>
                      </span>
                    </td>
                    <td className="mono-pid">{proc.pid || '--'}</td>
                    <td className="user-cell">{proc.user || 'SYSTEM'}</td>
                    <td>
                      <div className="proc-meter">
                        <span className="pct-label">{cpu}%</span>
                        <div className="meter-bg">
                          <div className="meter-fill green-fill" style={{ width: `${Math.min(100, Math.max(0, cpu))}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="proc-meter">
                        <span className="pct-label">{mem}%</span>
                        <div className="meter-bg">
                          <div className="meter-fill blue-fill" style={{ width: `${Math.min(100, Math.max(0, mem))}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`proc-status-badge ${isFlapping ? 'flapping-badge' : 'online'}`}>
                        ● {proc.status || 'Running'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn-reset-flap"
                        onClick={() => handleResetService(proc.name)}
                        type="button"
                        title="Reset flap protection counter and service status"
                      >
                        🔄 Reset Flap Status
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="7" className="empty-state">
                  No processes matched "{search}"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>


      <style>{`
        .processes-tab-root {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .sre-banner-card {
          background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.8));
          border: 1px solid rgba(56, 189, 248, 0.3);
          border-radius: 8px;
          padding: 12px 16px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        .sre-banner-header {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 6px;
        }
        .sre-chip {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.5px;
          padding: 2px 8px;
          border-radius: 4px;
          text-transform: uppercase;
        }
        .red-chip { background-color: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; }
        .amber-chip { background-color: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid #f59e0b; }
        .cyan-chip { background-color: rgba(6, 182, 212, 0.2); color: #38bdf8; border: 1px solid #06b6d4; }
        .sre-banner-text {
          margin: 0;
          font-size: 12px;
          color: #cbd5e1;
          line-height: 1.5;
        }
        .btn-download-agent {
          background: linear-gradient(135deg, #0284c7, #2563eb);
          color: #ffffff;
          border: none;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          transition: transform 0.15s ease;
        }
        .btn-download-agent:hover {
          transform: translateY(-1px);
        }
        .btn-reset-flap {
          background-color: #1e293b;
          color: #38bdf8;
          border: 1px solid #334155;
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 600;
          border-radius: 4px;
          cursor: pointer;
        }
        .btn-reset-flap:hover {
          background-color: #0284c7;
          color: #ffffff;
        }
        .flapping-badge {
          color: #f59e0b !important;
          background-color: rgba(245, 158, 11, 0.15);
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid #f59e0b;
        }

          gap: 14px;
        }
        .procs-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .procs-search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          background-color: #0d1424;
          border: 1px solid #1c283d;
          border-radius: 6px;
          padding: 6px 12px;
          flex: 1;
          max-width: 420px;
        }
        .procs-search-box input {
          background: transparent;
          border: none;
          outline: none;
          color: #f8fafc;
          font-size: 12.5px;
          width: 100%;
        }
        .procs-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .sort-group {
          display: flex;
          align-items: center;
          gap: 6px;
          background-color: #0d1424;
          border: 1px solid #1c283d;
          border-radius: 6px;
          padding: 3px 6px;
        }
        .sort-lbl {
          font-size: 11px;
          color: #94a3b8;
          margin-right: 4px;
        }
        .btn-sort {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 11.5px;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
        }
        .btn-sort.active {
          background-color: #1e293b;
          color: #38bdf8;
          font-weight: 600;
        }
        .btn-refresh {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background-color: #101726;
          border: 1px solid #1c283d;
          color: #cbd5e1;
          font-size: 12px;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
        }
        .procs-table-card {
          background-color: #0d1424;
          border: 1px solid #1a253a;
          border-radius: 8px;
          overflow-x: auto;
        }
        .full-proc-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 12px;
        }
        .full-proc-table th {
          padding: 10px 14px;
          color: #94a3b8;
          border-bottom: 1px solid #1a253a;
          font-weight: 600;
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.4px;
        }
        .full-proc-table td {
          padding: 10px 14px;
          border-bottom: 1px solid #131c2e;
          color: #cbd5e1;
        }
        .full-proc-table tr:hover td {
          background-color: rgba(255, 255, 255, 0.02);
        }
        .proc-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .proc-title strong {
          color: #f8fafc;
        }
        .mono-pid {
          font-family: monospace;
          color: #38bdf8;
        }
        .user-cell {
          color: #94a3b8;
          font-size: 11.5px;
        }
        .proc-meter {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 120px;
        }
        .pct-label {
          font-size: 11.5px;
          min-width: 38px;
        }
        .meter-bg {
          flex: 1;
          height: 6px;
          background-color: #162238;
          border-radius: 3px;
          overflow: hidden;
        }
        .meter-fill {
          height: 100%;
          border-radius: 3px;
        }
        .green-fill { background-color: #22c55e; }
        .blue-fill { background-color: #3b82f6; }
        .proc-status-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 600;
          color: #22c55e;
        }
        .cmd-cell {
          max-width: 280px;
        }
        .cmd-text {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #94a3b8;
          font-family: monospace;
          font-size: 11px;
        }
        .empty-state {
          text-align: center;
          padding: 24px;
          color: #94a3b8;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
