import React, { useEffect, useState } from 'react';
import { getMachineStorage } from '../../../api/machines.js';
import { HardDrive, Server, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function StorageTab({ machine }) {
  const [filesystems, setFilesystems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!machine?.id) {
      setLoading(false);
      return;
    }
    getMachineStorage(machine.id)
      .then((rows) => {
        const latest = Array.isArray(rows) ? rows[0] : null;
        const rawFilesystems = latest?.filesystems || latest?.filesystems_json;
        if (rawFilesystems) {
          const parsed = typeof rawFilesystems === 'string' ? JSON.parse(rawFilesystems) : rawFilesystems;
          if (Array.isArray(parsed) && parsed.length > 0) {
            setFilesystems(parsed);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [machine?.id]);

  const ignoredPrefixes = ['/sys', '/proc', '/dev', '/run', '/snap', '/mnt/wsl', '/usr/lib/wsl', '/init'];
  const ignoredFSTypes = ['tmpfs', 'devtmpfs', 'sysfs', 'proc', 'procfs', 'cgroup', 'cgroup2', 'squashfs', 'snapfuse', 'overlay', 'none'];

  const activeDrives = filesystems.filter((fs) => {
    const m = (fs.mount_point || fs.MountPoint || '').toLowerCase();
    const t = (fs.fs_type || fs.FSType || '').toLowerCase();
    if (ignoredFSTypes.includes(t)) return false;
    if (ignoredPrefixes.some((p) => m.startsWith(p))) return false;
    return true;
  });

  const totalBytes = activeDrives.reduce((acc, fs) => acc + (Number(fs.total || fs.total_bytes) || 0), 0);
  const usedBytes = activeDrives.reduce((acc, fs) => acc + (Number(fs.used || fs.used_bytes) || 0), 0);
  const freeBytes = totalBytes > usedBytes ? totalBytes - usedBytes : 0;
  const aggregatePct = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

  const formatGB = (bytes) => (Number(bytes) > 0 ? (Number(bytes) / (1024 * 1024 * 1024)).toFixed(0) : '0');

  return (
    <div className="storage-tab-root">
      {/* Aggregate Overview Card */}
      <div className="storage-aggregate-card">
        <div className="agg-left">
          <Server size={20} color="#3b82f6" />
          <div>
            <h3 className="agg-title">Total Physical Storage</h3>
            <span className="agg-sub">Aggregate capacity across all mounted physical partitions</span>
          </div>
        </div>
        <div className="agg-stats">
          <div className="agg-stat">
            <span className="lbl">Used</span>
            <span className="val red-text">{formatGB(usedBytes)} GB</span>
          </div>
          <div className="agg-stat">
            <span className="lbl">Free</span>
            <span className="val green-text">{formatGB(freeBytes)} GB</span>
          </div>
          <div className="agg-stat">
            <span className="lbl">Total</span>
            <span className="val">{formatGB(totalBytes)} GB</span>
          </div>
          <div className="agg-stat">
            <span className="lbl">Utilization</span>
            <span className={`val ${aggregatePct > 80 ? 'red-text' : aggregatePct > 60 ? 'yellow-text' : 'green-text'}`}>
              {aggregatePct.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Section: Devices & Drives */}
      <div className="drives-section-title">
        <HardDrive size={16} color="#06b6d4" />
        <h2>Devices and Drives ({activeDrives.length})</h2>
      </div>

      {activeDrives.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', backgroundColor: '#0d1424', borderRadius: '8px', border: '1px solid #1a253a' }}>
          No physical storage devices reported for this machine.
        </div>
      ) : (
        <div className="drives-grid">
          {activeDrives.map((fs) => {
            const usedPct = fs.used_percent != null
              ? Number(fs.used_percent)
              : fs.total > 0
              ? (Number(fs.used) / Number(fs.total)) * 100
              : 0;
            const isCritical = usedPct > 85;
            const isWarning = usedPct > 70 && !isCritical;
            const driveLabel = fs.name || `${fs.mount_point?.includes('C') ? 'Windows' : 'Volume'} (${fs.mount_point || '/'})`;
            const freeGB = formatGB(fs.free != null ? fs.free : (fs.total - fs.used));
            const totalGB = formatGB(fs.total);
            const usedGB = formatGB(fs.used);

            return (
              <div className="drive-card" key={fs.mount_point || driveLabel}>
                <div className="drive-head">
                  <div className="drive-title-box">
                    <div className={`drive-icon-badge ${isCritical ? 'crit' : ''}`}>
                      <HardDrive size={18} />
                    </div>
                    <div>
                      <h3 className="drive-name">{driveLabel}</h3>
                      <span className="drive-fs">{fs.fs_type || 'Partition'}</span>
                    </div>
                  </div>
                  <div className="drive-status-badge">
                    {isCritical ? (
                      <span className="badge-crit"><AlertTriangle size={11} /> Low Space</span>
                    ) : (
                      <span className="badge-ok"><CheckCircle2 size={11} /> Healthy</span>
                    )}
                  </div>
                </div>

                <div className="drive-progress-wrap">
                  <div
                    className={`drive-progress-bar ${isCritical ? 'crit' : isWarning ? 'warn' : 'ok'}`}
                    style={{ width: `${Math.min(usedPct, 100)}%` }}
                  />
                </div>

                <div className="drive-details-row">
                  <span className="free-text"><strong>{freeGB} GB</strong> free of {totalGB} GB</span>
                  <span className="pct-text">{usedPct.toFixed(1)}% full ({usedGB} GB used)</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .storage-tab-root {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .storage-aggregate-card {
          background-color: #0d1424;
          border: 1px solid #1a253a;
          border-radius: 8px;
          padding: 16px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
        }
        .agg-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .agg-title {
          font-size: 14px;
          font-weight: 600;
          color: #f8fafc;
          margin: 0;
        }
        .agg-sub {
          font-size: 11.5px;
          color: #94a3b8;
        }
        .agg-stats {
          display: flex;
          align-items: center;
          gap: 24px;
        }
        .agg-stat {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .agg-stat .lbl {
          font-size: 11px;
          color: #94a3b8;
          text-transform: uppercase;
        }
        .agg-stat .val {
          font-size: 15px;
          font-weight: 700;
          color: #f8fafc;
        }
        .drives-section-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .drives-section-title h2 {
          font-size: 13.5px;
          font-weight: 600;
          color: #cbd5e1;
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .drives-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 14px;
        }
        .drive-card {
          background-color: #0d1424;
          border: 1px solid #1a253a;
          border-radius: 8px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .drive-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .drive-title-box {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .drive-icon-badge {
          width: 34px;
          height: 34px;
          border-radius: 6px;
          background-color: #162238;
          color: #38bdf8;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .drive-icon-badge.crit {
          background-color: rgba(239, 68, 68, 0.15);
          color: #ef4444;
        }
        .drive-name {
          font-size: 13.5px;
          font-weight: 600;
          color: #f8fafc;
          margin: 0;
        }
        .drive-fs {
          font-size: 11px;
          color: #94a3b8;
        }
        .badge-crit {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10.5px;
          font-weight: 600;
          padding: 2px 7px;
          border-radius: 4px;
          background-color: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .badge-ok {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10.5px;
          font-weight: 600;
          padding: 2px 7px;
          border-radius: 4px;
          background-color: rgba(34, 197, 94, 0.15);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }
        .drive-progress-wrap {
          width: 100%;
          height: 8px;
          background-color: #162238;
          border-radius: 4px;
          overflow: hidden;
        }
        .drive-progress-bar {
          height: 100%;
          border-radius: 4px;
          transition: width 0.4s ease;
        }
        .drive-progress-bar.ok {
          background: linear-gradient(90deg, #3b82f6, #06b6d4);
        }
        .drive-progress-bar.warn {
          background: linear-gradient(90deg, #f59e0b, #eab308);
        }
        .drive-progress-bar.crit {
          background: linear-gradient(90deg, #ef4444, #f87171);
        }
        .drive-details-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11.5px;
          color: #cbd5e1;
        }
        .free-text strong {
          color: #f8fafc;
        }
        .pct-text {
          color: #94a3b8;
        }
        .red-text { color: #ef4444 !important; }
        .yellow-text { color: #f59e0b !important; }
        .green-text { color: #22c55e !important; }
      `}</style>
    </div>
  );
}
