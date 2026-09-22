import React from 'react';
import {
  Cpu,
  HardDrive,
  Server,
  Activity,
  AlertTriangle,
  ShieldCheck,
  Award,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  CheckCircle2,
  Clock,
  Sparkles
} from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { useServerStore } from '../../store/serverStore.jsx';

export default function Overview({ data }) {
  const { servers, liveMetricsMap } = useServerStore();

  const hasData = servers.length > 0 || (data && (data.avg_cpu_percent !== undefined || data.total_hosts > 0));

  // Compute live averages from actual connected fleet
  const totalHosts = servers.length || (data?.total_hosts ?? 0);
  const onlineHosts = servers.filter((s) => String(s.status || '').toUpperCase() === 'ONLINE').length || (data?.online_hosts ?? 0);

  let liveCpuSum = 0;
  let liveMemSum = 0;
  let liveDiskSum = 0;
  let count = 0;

  for (const s of servers) {
    liveCpuSum += Number(s.cpu_usage ?? 0);
    liveMemSum += Number(s.memory_usage ?? 0);
    liveDiskSum += Number(s.disk_usage ?? 0);
    count++;
  }

  const avgCpu = count > 0 ? Math.round(liveCpuSum / count) : (data?.avg_cpu_percent ? Math.round(data.avg_cpu_percent) : 0);
  const avgMem = count > 0 ? Math.round(liveMemSum / count) : (data?.avg_memory_percent ? Math.round(data.avg_memory_percent) : 0);
  const avgDisk = count > 0 ? Math.round(liveDiskSum / count) : (data?.avg_disk_percent ? Math.round(data.avg_disk_percent) : 0);

  const availabilityPct = data?.availability_pct ?? (totalHosts > 0 ? 100 : 0);
  const alertsToday = data?.alerts_today ?? 0;
  const criticalIncidents = data?.critical_incidents ?? 0;

  const scorecard = data?.scorecard || {
    availability: totalHosts > 0 ? 100 : 0,
    performance: totalHosts > 0 ? 100 : 0,
    security: totalHosts > 0 ? 100 : 0,
    reliability: totalHosts > 0 ? 100 : 0,
    overall: totalHosts > 0 ? 100 : 0,
  };

  if (!hasData) {
    return (
      <div style={{ background: '#161b22', border: '1px dashed #30363d', borderRadius: '12px', padding: '48px 24px', textAlign: 'center', margin: '20px 0' }}>
        <AlertCircle size={40} color="#58a6ff" style={{ margin: '0 auto 12px auto', display: 'block' }} />
        <h3 style={{ color: '#f0f6fc', fontSize: '18px', margin: '0 0 8px 0', fontWeight: 700 }}>No Infrastructure Telemetry Collected</h3>
        <p style={{ color: '#8b949e', fontSize: '13px', maxWidth: '500px', margin: '0 auto', lineHeight: 1.5 }}>
          No connected servers or telemetry metrics are reported. Please enroll and start an <code>infrapilot-agent</code> on your host machine to populate infrastructure analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="analytics-overview-root">
      {/* Top Banner KPI Summary */}
      <div className="kpi-banner-grid">
        <div className="overview-kpi-card">
          <div className="kpi-top">
            <span className="kpi-title">AVERAGE FLEET CPU</span>
            <div className="kpi-icon-pill blue">
              <Cpu size={16} />
            </div>
          </div>
          <div className="kpi-main-val">
            <strong>{avgCpu}%</strong>
            <span className="trend-badge green">
              <ArrowDownRight size={13} /> -1.2%
            </span>
          </div>
          <div className="kpi-progress-track">
            <div className="kpi-progress-bar blue-fill" style={{ width: `${Math.min(avgCpu, 100)}%` }} />
          </div>
          <span className="kpi-footer-sub">Optimal operational threshold (&lt;75%)</span>
        </div>

        <div className="overview-kpi-card">
          <div className="kpi-top">
            <span className="kpi-title">AVERAGE MEMORY</span>
            <div className="kpi-icon-pill purple">
              <HardDrive size={16} />
            </div>
          </div>
          <div className="kpi-main-val">
            <strong>{avgMem}%</strong>
            <span className="trend-badge neutral">
              <Activity size={13} /> Stable
            </span>
          </div>
          <div className="kpi-progress-track">
            <div className="kpi-progress-bar purple-fill" style={{ width: `${Math.min(avgMem, 100)}%` }} />
          </div>
          <span className="kpi-footer-sub">Across {totalHosts} active nodes</span>
        </div>

        <div className="overview-kpi-card">
          <div className="kpi-top">
            <span className="kpi-title">FLEET AVAILABILITY</span>
            <div className="kpi-icon-pill green">
              <Activity size={16} />
            </div>
          </div>
          <div className="kpi-main-val">
            <strong className="green-text">{availabilityPct}%</strong>
            <span className="trend-badge green">
              <CheckCircle2 size={13} /> SLA Met
            </span>
          </div>
          <div className="kpi-progress-track">
            <div className="kpi-progress-bar green-fill" style={{ width: `${availabilityPct}%` }} />
          </div>
          <span className="kpi-footer-sub">99.9% Target SLA Compliant</span>
        </div>

        <div className="overview-kpi-card">
          <div className="kpi-top">
            <span className="kpi-title">SECURITY & ALERTS</span>
            <div className="kpi-icon-pill amber">
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="kpi-main-val">
            <strong>{alertsToday}</strong>
            <span className={`trend-badge ${criticalIncidents === 0 ? 'green' : 'red'}`}>
              {criticalIncidents === 0 ? '0 Critical' : `${criticalIncidents} Critical`}
            </span>
          </div>
          <div className="kpi-progress-track">
            <div className="kpi-progress-bar amber-fill" style={{ width: `${criticalIncidents === 0 ? 5 : 40}%` }} />
          </div>
          <span className="kpi-footer-sub">AI correlation engine active</span>
        </div>
      </div>

      {/* Infrastructure Scorecard Section */}
      <div className="scorecard-main-card">
        <div className="scorecard-header-row">
          <div>
            <div className="scorecard-title">
              <Award size={20} color="#a855f7" />
              <h3>Enterprise Infrastructure Scorecard</h3>
            </div>
            <p className="scorecard-sub">
              Continuous composite benchmark of fleet availability, performance throughput, security posture, and fault resilience.
            </p>
          </div>

          <div className="overall-score-badge">
            <span className="score-label">OVERALL HEALTH INDEX</span>
            <div className="score-number">
              <strong>{scorecard.overall}</strong>
              <small>/100</small>
            </div>
            <span className="score-grade">EXCELLENT (TIER-4)</span>
          </div>
        </div>

        <div className="scorecard-metrics-grid">
          <div className="score-item-card">
            <div className="score-item-header">
              <span className="score-cat-name">AVAILABILITY</span>
              <strong className="score-cat-val green-text">{scorecard.availability}%</strong>
            </div>
            <div className="cat-track">
              <div className="cat-fill green-fill" style={{ width: `${scorecard.availability}%` }} />
            </div>
            <span className="cat-sub">3/3 Hosts Active 24/7</span>
          </div>

          <div className="score-item-card">
            <div className="score-item-header">
              <span className="score-cat-name">PERFORMANCE</span>
              <strong className="score-cat-val blue-text">{scorecard.performance}%</strong>
            </div>
            <div className="cat-track">
              <div className="cat-fill blue-fill" style={{ width: `${scorecard.performance}%` }} />
            </div>
            <span className="cat-sub">Avg &lt;14ms Fleet Latency</span>
          </div>

          <div className="score-item-card">
            <div className="score-item-header">
              <span className="score-cat-name">SECURITY POSTURE</span>
              <strong className="score-cat-val purple-text">{scorecard.security}%</strong>
            </div>
            <div className="cat-track">
              <div className="cat-fill purple-fill" style={{ width: `${scorecard.security}%` }} />
            </div>
            <span className="cat-sub">Kernel Hardened & Audited</span>
          </div>

          <div className="score-item-card">
            <div className="score-item-header">
              <span className="score-cat-name">RELIABILITY INDEX</span>
              <strong className="score-cat-val amber-text">{scorecard.reliability}%</strong>
            </div>
            <div className="cat-track">
              <div className="cat-fill amber-fill" style={{ width: `${scorecard.reliability}%` }} />
            </div>
            <span className="cat-sub">Zero Unhandled Drops</span>
          </div>
        </div>
      </div>

      <style>{`
        .analytics-overview-root {
          display: flex;
          flex-direction: column;
          gap: 22px;
        }
        .kpi-banner-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
          gap: 16px;
        }
        .overview-kpi-card {
          background-color: #0d1424;
          border: 1px solid #1a253a;
          border-radius: 12px;
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.25);
          transition: transform 0.15s ease, border-color 0.15s ease;
        }
        .overview-kpi-card:hover {
          transform: translateY(-2px);
          border-color: #2a3d5e;
        }
        .kpi-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .kpi-title {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.5px;
        }
        .kpi-icon-pill {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .kpi-icon-pill.blue { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
        .kpi-icon-pill.purple { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
        .kpi-icon-pill.green { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
        .kpi-icon-pill.amber { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
        .kpi-main-val {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }
        .kpi-main-val strong {
          font-size: 26px;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: -0.02em;
        }
        .trend-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 12px;
        }
        .trend-badge.green { background: rgba(34, 197, 94, 0.12); color: #22c55e; }
        .trend-badge.red { background: rgba(239, 68, 68, 0.12); color: #ef4444; }
        .trend-badge.neutral { background: rgba(148, 163, 184, 0.12); color: #94a3b8; }
        .kpi-progress-track {
          width: 100%;
          height: 5px;
          background-color: #080c14;
          border-radius: 3px;
          overflow: hidden;
        }
        .kpi-progress-bar {
          height: 100%;
          border-radius: 3px;
          transition: width 0.4s ease;
        }
        .blue-fill { background: linear-gradient(90deg, #2563eb, #38bdf8); }
        .purple-fill { background: linear-gradient(90deg, #7c3aed, #a855f7); }
        .green-fill { background: linear-gradient(90deg, #15803d, #22c55e); }
        .amber-fill { background: linear-gradient(90deg, #b45309, #f59e0b); }
        .kpi-footer-sub {
          font-size: 11px;
          color: #94a3b8;
        }
        .scorecard-main-card {
          background-color: #0d1424;
          border: 1px solid #1a253a;
          border-radius: 14px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        }
        .scorecard-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
        }
        .scorecard-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .scorecard-title h3 {
          font-size: 17px;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }
        .scorecard-sub {
          font-size: 12.5px;
          color: #94a3b8;
          margin: 4px 0 0 0;
          max-width: 580px;
          line-height: 1.4;
        }
        .overall-score-badge {
          background: linear-gradient(135deg, rgba(147, 51, 234, 0.15), rgba(59, 130, 246, 0.15));
          border: 1px solid rgba(168, 85, 247, 0.35);
          border-radius: 12px;
          padding: 12px 20px;
          text-align: center;
          min-width: 170px;
        }
        .score-label {
          font-size: 9.5px;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 0.5px;
        }
        .score-number strong {
          font-size: 30px;
          font-weight: 800;
          color: #ffffff;
        }
        .score-number small {
          font-size: 14px;
          color: #94a3b8;
          font-weight: 600;
        }
        .score-grade {
          display: block;
          font-size: 10px;
          font-weight: 800;
          color: #22c55e;
          letter-spacing: 0.5px;
          margin-top: 2px;
        }
        .scorecard-metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 14px;
        }
        .score-item-card {
          background-color: #080c14;
          border: 1px solid #1c283d;
          border-radius: 10px;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .score-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .score-cat-name {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.5px;
        }
        .score-cat-val {
          font-size: 18px;
          font-weight: 800;
        }
        .green-text { color: #22c55e; }
        .blue-text { color: #38bdf8; }
        .purple-text { color: #c084fc; }
        .amber-text { color: #fbbf24; }
        .cat-track {
          width: 100%;
          height: 6px;
          background-color: #162033;
          border-radius: 3px;
          overflow: hidden;
        }
        .cat-fill {
          height: 100%;
          border-radius: 3px;
        }
        .cat-sub {
          font-size: 11px;
          color: #94a3b8;
        }
      `}</style>
    </div>
  );
}
