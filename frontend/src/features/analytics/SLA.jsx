import React from 'react';
import { Activity, Clock, ShieldCheck, CheckCircle, AlertCircle } from 'lucide-react';

export default function SLA({ sla }) {
  const hasSLAData = sla && (sla.availability_pct !== undefined || sla.uptime_minutes > 0 || sla.downtime_minutes > 0);

  return (
    <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: 0, color: '#f0f6fc', fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={20} color="#3fb950" />
          Service Level Agreement (SLA) Monitoring
        </h3>
        <span style={{ fontSize: '13px', color: '#8b949e' }}>Real-time uptime tracking, downtime minutes, MTTR, and MTBF metrics</span>
      </div>

      {!hasSLAData ? (
        <div style={{ background: '#0d1117', border: '1px dashed #30363d', borderRadius: '10px', padding: '48px 24px', textAlign: 'center' }}>
          <AlertCircle size={40} color="#3fb950" style={{ margin: '0 auto 12px auto', display: 'block' }} />
          <h4 style={{ color: '#f0f6fc', fontSize: '16px', margin: '0 0 8px 0', fontWeight: 700 }}>No SLA Uptime Telemetry</h4>
          <p style={{ color: '#8b949e', fontSize: '13px', maxWidth: '480px', margin: '0 auto', lineHeight: 1.5 }}>
            SLA metrics require active agent monitoring and uptime tracking. Please connect an <code>infrapilot-agent</code> to monitor uptime percentages and MTTR resolution rates.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
          <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '10px', padding: '20px' }}>
            <div style={{ color: '#8b949e', fontSize: '12px', fontWeight: 600 }}>AVAILABILITY %</div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: '#3fb950', margin: '10px 0 4px 0' }}>
              {sla.availability_pct ?? 100}%
            </div>
            <div style={{ fontSize: '12px', color: '#3fb950', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle size={14} /> Meets Target SLA
            </div>
          </div>

          <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '10px', padding: '20px' }}>
            <div style={{ color: '#8b949e', fontSize: '12px', fontWeight: 600 }}>DOWNTIME</div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: '#ffa657', margin: '10px 0 4px 0' }}>
              {sla.downtime_minutes ?? 0} <span style={{ fontSize: '14px', color: '#8b949e' }}>Minutes</span>
            </div>
            <div style={{ fontSize: '12px', color: '#8b949e' }}>Total outage duration</div>
          </div>

          <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '10px', padding: '20px' }}>
            <div style={{ color: '#8b949e', fontSize: '12px', fontWeight: 600 }}>MTTR (MEAN TIME TO REPAIR)</div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: '#58a6ff', margin: '10px 0 4px 0' }}>
              {sla.mttr_minutes ?? 0} <span style={{ fontSize: '14px', color: '#8b949e' }}>Minutes</span>
            </div>
            <div style={{ fontSize: '12px', color: '#3fb950' }}>Avg resolution speed</div>
          </div>

          <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '10px', padding: '20px' }}>
            <div style={{ color: '#8b949e', fontSize: '12px', fontWeight: 600 }}>MTBF (MEAN TIME BETWEEN FAILURES)</div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: '#a855f7', margin: '10px 0 4px 0' }}>
              {sla.mtbf_days ?? 0} <span style={{ fontSize: '14px', color: '#8b949e' }}>Days</span>
            </div>
            <div style={{ fontSize: '12px', color: '#8b949e' }}>Avg operational stability</div>
          </div>
        </div>
      )}
    </div>
  );
}
