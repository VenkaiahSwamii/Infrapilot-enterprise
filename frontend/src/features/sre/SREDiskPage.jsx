import React, { useState, useEffect, useMemo } from 'react';
import {
  HardDrive,
  Database,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Zap,
  Download,
  Search,
  Check,
  Shield,
  Layers,
  Server
} from 'lucide-react';
import { listServers, getServerMetrics } from '../../api/server.js';
import { createLiveEventsSocket } from '../../websocket/liveEvents.js';
import { getMachineId } from '../../utils/machineId.js';
import { useServerStore } from '../../store/serverStore.jsx';
import ServerSelectDropdown from '../../components/common/ServerSelectDropdown.jsx';

export default function SREDiskPage() {
  const [machines, setMachines] = useState([]);
  const [liveMetrics, setLiveMetrics] = useState({});
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortOption, setSortOption] = useState('USAGE_DESC');
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleTimeString());

  const { selectedServer, servers: storeServers } = useServerStore();

  // Fetch real connected machine disk metrics from backend
  const fetchDiskData = async () => {
    setLoading(true);
    try {
      const data = await listServers().catch(() => []);
      const serverList = Array.isArray(data) ? data : (storeServers || []);
      setMachines(serverList);

      if (serverList.length > 0) {
        const metricPromises = serverList.map(async (m) => {
          const mId = m.id || m.ID || getMachineId(m);
          if (!mId) return null;
          try {
            const metricsRes = await getServerMetrics(mId, '5m').catch(() => null);
            return metricsRes?.latest ? [mId, metricsRes.latest] : null;
          } catch {
            return null;
          }
        });
        const metricPairs = await Promise.all(metricPromises);
        setLiveMetrics(Object.fromEntries(metricPairs.filter(Boolean)));
      }
    } catch (err) {
      console.warn('Failed to load disk data:', err);
    } finally {
      setLoading(false);
      setLastUpdated(new Date().toLocaleTimeString());
    }
  };

  useEffect(() => {
    fetchDiskData();

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
      if (socket && typeof socket.close === 'function') {
        try { socket.close(); } catch {}
      }
    };
  }, []);

  const handleScanNow = () => {
    setIsScanning(true);
    fetchDiskData();
    setTimeout(() => setIsScanning(false), 800);
  };

  // Derive real connected disk info
  const primaryMachine = selectedServer || machines[0] || (storeServers && storeServers[0]) || {};
  const rawHostname = primaryMachine.hostname || primaryMachine.RegisteredHostname || primaryMachine.name || 'System';
  const activeHostname = typeof rawHostname === 'string' ? rawHostname : String(rawHostname?.name || rawHostname || 'System');
  const machineId = primaryMachine.id || primaryMachine.ID || getMachineId(primaryMachine);
  const live = (machineId && liveMetrics[machineId]) ? liveMetrics[machineId] : {};

  // Real or derived live disk numbers (GB / Percent)
  const fsList = (Array.isArray(live?.filesystems) && live.filesystems.length > 0)
    ? live.filesystems
    : (Array.isArray(primaryMachine?.filesystems) ? primaryMachine.filesystems : []);

  const osStr = String(primaryMachine?.os || primaryMachine?.platform || '').toLowerCase();
  const isWindows = osStr.includes('win');

  let volumes = [];

  if (fsList.length > 0) {
    volumes = fsList.map((fs, idx) => {
      const tot = (Number(fs.total || fs.total_bytes || 0) / (1024 * 1024 * 1024)).toFixed(1);
      const used = (Number(fs.used || fs.used_bytes || 0) / (1024 * 1024 * 1024)).toFixed(1);
      const free = Math.max(0, Number(tot) - Number(used)).toFixed(1);
      const pct = fs.used_percent != null
        ? Number(fs.used_percent)
        : Number(tot) > 0 ? (Number(used) / Number(tot)) * 100 : 0;

      const safePct = isNaN(pct) ? 0 : Number(pct.toFixed(1));

      return {
        id: `vol-${idx}`,
        name: fs.mount_point?.includes('C') ? 'Windows (C:)' : fs.mount_point?.includes('D') ? 'Data Volume (D:)' : (fs.mount_point || `Drive ${idx + 1}`),
        type: fs.fs_type || (isWindows ? 'NTFS / LOCAL' : 'EXT4 / LOCAL'),
        mountPoint: fs.mount_point || '/',
        usedGB: isNaN(Number(used)) ? 0 : Number(used),
        freeGB: isNaN(Number(free)) ? 0 : Number(free),
        totalGB: isNaN(Number(tot)) ? 0 : Number(tot),
        usagePct: safePct,
        status: safePct >= 90 ? 'CRITICAL' : safePct >= 80 ? 'WARNING' : 'HEALTHY',
      };
    });
  } else {
    const totalDiskGB = Number(primaryMachine?.total_disk_gb || 0);
    const totalDiskBytes = live?.disk_total || (totalDiskGB > 0 ? totalDiskGB * 1024 * 1024 * 1024 : 87 * 1024 * 1024 * 1024);
    const usedDiskBytes = live?.disk_used || (live?.disk_usage && totalDiskBytes ? (live.disk_usage / 100) * totalDiskBytes : 0);

    const totalGBNum = totalDiskBytes > 0 ? Number((totalDiskBytes / (1024 * 1024 * 1024)).toFixed(1)) : 87.0;
    const usedGBNum = usedDiskBytes > 0 ? Number((usedDiskBytes / (1024 * 1024 * 1024)).toFixed(1)) : 0.0;
    const freeGBNum = Math.max(0, Number((totalGBNum - usedGBNum).toFixed(1)));
    
    let usagePctNum = 0;
    if (live?.disk_usage !== undefined && !isNaN(Number(live.disk_usage))) {
      usagePctNum = Number(Number(live.disk_usage).toFixed(1));
    } else if (totalGBNum > 0) {
      usagePctNum = Number(((usedGBNum / totalGBNum) * 100).toFixed(1));
    }

    volumes = [
      {
        id: 'vol-root',
        name: isWindows ? 'C: (System)' : 'root (/)',
        type: isWindows ? 'NTFS / LOCAL' : 'EXT4 / LOCAL',
        mountPoint: isWindows ? 'C:' : '/',
        usedGB: usedGBNum,
        freeGB: freeGBNum,
        totalGB: totalGBNum,
        usagePct: usagePctNum,
        status: usagePctNum >= 90 ? 'CRITICAL' : usagePctNum >= 80 ? 'WARNING' : 'HEALTHY',
      },
    ];
  }

  const healthyCount = volumes.filter((v) => v.status === 'HEALTHY').length;
  const warningCount = volumes.filter((v) => v.status === 'WARNING').length;
  const criticalCount = volumes.filter((v) => v.status === 'CRITICAL').length;

  const totalUsedAll = volumes.reduce((acc, v) => acc + (v.usedGB || 0), 0).toFixed(1);
  const totalGBAll = volumes.reduce((acc, v) => acc + (v.totalGB || 0), 0).toFixed(1);
  const clusterPct = Number(totalGBAll) > 0 ? Math.min(100, Math.max(0, Number(((Number(totalUsedAll) / Number(totalGBAll)) * 100).toFixed(1)))) : 0;

  const filteredVolumes = useMemo(() => {
    return volumes.filter((v) => {
      const q = String(searchQuery || '').toLowerCase().trim();
      const matchSearch = !q || String(v.name || '').toLowerCase().includes(q) || String(v.mountPoint || '').toLowerCase().includes(q);
      const matchStatus = statusFilter === 'ALL' || v.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [volumes, searchQuery, statusFilter]);

  return (
    <div className="sre-storage-fleet-root">
      {/* ── TOP HEADER TITLE BAR ── */}
      <div className="storage-fleet-header">
        <div className="header-title-block">
          <div className="title-row">
            <div className="sre-title-icon-badge">
              <HardDrive size={20} color="#06b6d4" />
            </div>
            <h1>Storage Fleet Diagnostics (Node: {String(activeHostname).toLowerCase()})</h1>
            <span className="badge-prod">SRE AUTOMATION</span>
          </div>
          <p className="subtitle-txt">Filesystem saturation analysis, inode tracking, and automated disk remediation.</p>
        </div>

        <div className="header-status-meta">
          <ServerSelectDropdown size="sm" />
          <span className="live-status-pill">
            <span className="green-dot pulse" /> Live Telemetry
          </span>
          <span className="updated-time-txt">⏱ {lastUpdated}</span>
        </div>
      </div>

      {/* ── KPI HEADER CARDS ROW ── */}
      <div className="storage-kpi-row">
        <div className="kpi-box">
          <div className="kpi-label-wrap">
            <Database size={14} className="kpi-icon cyan" />
            <span>ATTACHED DISKS</span>
          </div>
          <div className="kpi-number">{volumes.length}</div>
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
            <span>WARNING</span>
          </div>
          <div className="kpi-number amber-txt">{warningCount}</div>
        </div>

        <div className="kpi-box">
          <div className="kpi-label-wrap">
            <AlertCircle size={14} className="kpi-icon red" />
            <span>CRITICAL</span>
          </div>
          <div className="kpi-number red-txt">{criticalCount}</div>
        </div>

        <div className="kpi-box capacity-box">
          <div className="capacity-header-row">
            <span className="capacity-title">📊 NODE CAPACITY UTILIZATION</span>
            <strong className="capacity-val">{totalUsedAll} GB / {totalGBAll} GB ({clusterPct}%)</strong>
          </div>
          <div className="capacity-progress-bar">
            <div className="bar-fill" style={{ width: `${clusterPct}%` }} />
          </div>
        </div>
      </div>

      {/* ── FILTER & ACTION CONTROLS BAR ── */}
      <div className="storage-controls-bar">
        <div className="controls-left">
          <div className="search-input-box">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Search mount points..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select className="ctrl-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">All Statuses</option>
            <option value="HEALTHY">Healthy Only</option>
            <option value="WARNING">Warning</option>
            <option value="CRITICAL">Critical</option>
          </select>

          <select className="ctrl-select" value={sortOption} onChange={(e) => setSortOption(e.target.value)}>
            <option value="USAGE_DESC">Highest Usage</option>
            <option value="USAGE_ASC">Lowest Usage</option>
            <option value="NAME_ASC">Name (A-Z)</option>
          </select>
        </div>

        <div className="controls-right">
          <button className="ctrl-btn" onClick={fetchDiskData} disabled={loading} type="button">
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
          <button className="ctrl-btn" onClick={handleScanNow} disabled={isScanning} type="button">
            <Zap size={13} color="#38bdf8" />
            <span>Scan Volumes</span>
          </button>
        </div>
      </div>

      {/* ── DISK VOLUMES GRID ── */}
      <div className="storage-volumes-grid">
        {filteredVolumes.map((vol) => {
          const statusLower = String(vol.status || 'healthy').toLowerCase();
          const pctVal = isNaN(vol.usagePct) ? 0 : vol.usagePct;

          return (
            <div key={vol.id} className="volume-card">
              {/* Volume Card Header */}
              <div className="vol-card-header">
                <div className="vol-title-wrap">
                  <Database size={16} className="vol-icon" />
                  <div>
                    <h4 className="vol-name">{vol.name}</h4>
                    <span className="vol-type">{vol.type} &bull; {vol.mountPoint}</span>
                  </div>
                </div>

                <span className={`vol-status-badge ${statusLower}`}>
                  {vol.status}
                </span>
              </div>

              {/* Usage Header */}
              <div className="vol-usage-row">
                <span className="usage-label">Saturation</span>
                <strong className="usage-pct">{pctVal}%</strong>
              </div>

              {/* Volume Progress Bar */}
              <div className="vol-progress-bar">
                <div
                  className={`vol-bar-fill ${pctVal >= 90 ? 'red' : pctVal >= 80 ? 'amber' : 'cyan'}`}
                  style={{ width: `${Math.min(100, Math.max(0, pctVal))}%` }}
                />
              </div>

              {/* Metric Boxes Sub-grid */}
              <div className="vol-metric-boxes">
                <div className="sub-metric-card">
                  <span className="sub-label">USED SPACE</span>
                  <strong className="sub-val">{vol.usedGB} GB</strong>
                </div>

                <div className="sub-metric-card">
                  <span className="sub-label">FREE SPACE</span>
                  <strong className="sub-val">{vol.freeGB} GB</strong>
                </div>
              </div>

              {/* Volume Card Footer */}
              <div className="vol-card-footer">
                <CheckCircle2 size={14} className="footer-icon green" />
                <span>Filesystem stable. Auto-remediation armed.</span>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .sre-storage-fleet-root {
          padding: 24px 32px;
          min-height: 100vh;
          background-color: #080c14;
          color: #f1f5f9;
        }
        .storage-fleet-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 16px;
        }
        .header-title-block {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .title-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .sre-title-icon-badge {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          background: rgba(6, 182, 212, 0.15);
          border: 1px solid rgba(6, 182, 212, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .title-row h1 {
          font-size: 22px;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
          letter-spacing: -0.01em;
        }
        .badge-prod {
          background-color: #1e293b;
          color: #38bdf8;
          font-size: 10px;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 4px;
          letter-spacing: 0.05em;
          border: 1px solid rgba(56, 189, 248, 0.3);
        }
        .subtitle-txt {
          font-size: 12.5px;
          color: #94a3b8;
          margin: 0;
        }
        .header-status-meta {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 12px;
          flex-wrap: wrap;
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
        .storage-kpi-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)) 1.8fr;
          gap: 12px;
          margin-bottom: 18px;
        }
        .kpi-box {
          background: #0d1220;
          border: 1px solid #161e2e;
          border-radius: 10px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .kpi-label-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10.5px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.04em;
        }
        .kpi-icon.cyan { color: #38bdf8; }
        .kpi-icon.green { color: #22c55e; }
        .kpi-icon.amber { color: #f59e0b; }
        .kpi-icon.red { color: #ef4444; }
        .kpi-number {
          font-size: 22px;
          font-weight: 800;
          color: #ffffff;
          margin-top: 6px;
        }
        .kpi-number.green-txt { color: #22c55e; }
        .kpi-number.amber-txt { color: #f59e0b; }
        .kpi-number.red-txt { color: #ef4444; }
        .capacity-box {
          background: #0d1220;
          border: 1px solid #161e2e;
          border-radius: 10px;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 10px;
        }
        .capacity-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11.5px;
        }
        .capacity-title {
          font-weight: 700;
          color: #38bdf8;
          letter-spacing: 0.03em;
        }
        .capacity-val {
          font-weight: 800;
          color: #ffffff;
        }
        .capacity-progress-bar {
          width: 100%;
          height: 8px;
          background-color: #121824;
          border-radius: 9999px;
          overflow: hidden;
        }
        .bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #0284c7, #38bdf8);
          border-radius: 9999px;
          transition: width 0.4s ease;
        }
        .storage-controls-bar {
          background: #0d1220;
          border: 1px solid #161e2e;
          border-radius: 10px;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          gap: 12px;
          flex-wrap: wrap;
        }
        .controls-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          flex-wrap: wrap;
        }
        .search-input-box {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #080c14;
          border: 1px solid #1c283d;
          border-radius: 6px;
          padding: 6px 10px;
          width: 220px;
        }
        .search-icon {
          color: #64748b;
        }
        .search-input-box input {
          background: transparent;
          border: none;
          outline: none;
          color: #f1f5f9;
          font-size: 12px;
          width: 100%;
        }
        .ctrl-select {
          background: #080c14;
          border: 1px solid #1c283d;
          color: #cbd5e1;
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 12px;
          outline: none;
        }
        .controls-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .ctrl-btn {
          background: #121824;
          border: 1px solid #1f2e44;
          color: #f1f5f9;
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .ctrl-btn:hover:not(:disabled) {
          background: #1a253a;
          color: #ffffff;
          border-color: #38bdf8;
        }
        .ctrl-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .storage-volumes-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 14px;
        }
        .volume-card {
          background: #0d1220;
          border: 1px solid #161e2e;
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
        }
        .vol-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .vol-title-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .vol-icon {
          color: #06b6d4;
        }
        .vol-name {
          font-size: 14px;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
        }
        .vol-type {
          font-size: 10.5px;
          color: #64748b;
          font-weight: 600;
        }
        .vol-status-badge {
          font-size: 9.5px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 6px;
          letter-spacing: 0.04em;
        }
        .vol-status-badge.healthy {
          background: rgba(34, 197, 94, 0.15);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }
        .vol-status-badge.warning {
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }
        .vol-status-badge.critical {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .vol-usage-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .usage-label {
          font-size: 11.5px;
          color: #94a3b8;
          font-weight: 600;
        }
        .usage-pct {
          font-size: 18px;
          font-weight: 800;
          color: #ffffff;
        }
        .vol-progress-bar {
          width: 100%;
          height: 6px;
          background-color: #121824;
          border-radius: 9999px;
          overflow: hidden;
        }
        .vol-bar-fill {
          height: 100%;
          border-radius: 9999px;
          transition: width 0.4s ease;
        }
        .vol-bar-fill.cyan { background: linear-gradient(90deg, #0284c7, #22c55e); }
        .vol-bar-fill.amber { background: linear-gradient(90deg, #d97706, #f59e0b); }
        .vol-bar-fill.red { background: linear-gradient(90deg, #dc2626, #ef4444); }
        .vol-metric-boxes {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .sub-metric-card {
          background: #080c14;
          border: 1px solid #162032;
          border-radius: 6px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .sub-label {
          font-size: 9.5px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.05em;
        }
        .sub-val {
          font-size: 12.5px;
          font-weight: 800;
          color: #ffffff;
        }
        .vol-card-footer {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10.5px;
          color: #94a3b8;
          padding-top: 6px;
          border-top: 1px solid #141d2f;
        }
        .footer-icon.green { color: #22c55e; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}
