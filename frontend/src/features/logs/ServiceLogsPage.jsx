import React from 'react';
import { Zap, Server, Activity, Radio, CheckCircle2 } from 'lucide-react';
import FleetTerminal from './FleetTerminal.jsx';

export default function ServiceLogsPage() {
  const serviceLogs = [
    { id: 1, service: 'ssh.service', status: 'ACTIVE', p95: '12.4ms', restarts: 0, lastEvent: 'Health check PASSED. Accept list active.' },
    { id: 2, service: 'cron.service', status: 'ACTIVE', p95: '4.1ms', restarts: 0, lastEvent: 'Scheduled execution clean.' },
    { id: 3, service: 'systemd-journald.service', status: 'ACTIVE', p95: '2.8ms', restarts: 0, lastEvent: 'Log buffer rotation OK.' },
    { id: 4, service: 'postgresql.service', status: 'MONITORED', p95: '18.2ms', restarts: 0, lastEvent: 'Database connection pool active.' },
    { id: 5, service: 'http.service', status: 'ACTIVE', p95: '22.0ms', restarts: 0, lastEvent: 'HTTP probe 200 OK.' },
  ];

  return (
    <div style={{ padding: '24px 32px', minHeight: '100vh', backgroundColor: '#090d16', color: '#f1f5f9' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'linear-gradient(135deg, #eab308, #ca8a04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={24} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0 }}>Service Logs (Daemons &amp; Whitelisted Services)</h1>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
              Dedicated logs &amp; health telemetry streams for services configured in `[services].accept_list` and `[latency].accept_list`
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(234, 179, 8, 0.15)', border: '1px solid #eab308', color: '#eab308', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>
          <Radio size={14} className="animate-pulse" /> SERVICE LOGS LIVE
        </div>
      </div>

      {/* Fleet Terminal Live Stream */}
      <FleetTerminal machineName="SERVICE LOG STREAM (ACCEPT LIST SERVICES)" />

      {/* Service Status Table */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginTop: 0, marginBottom: '16px', color: '#eab308' }}>
          Service Daemon Log Telemetry Table
        </h3>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b' }}>
              <th style={{ padding: '10px' }}>SERVICE DAEMON</th>
              <th style={{ padding: '10px' }}>STATUS</th>
              <th style={{ padding: '10px' }}>P95 PROBE LATENCY</th>
              <th style={{ padding: '10px' }}>RESTARTS (60s)</th>
              <th style={{ padding: '10px' }}>LAST SERVICE EVENT</th>
            </tr>
          </thead>
          <tbody>
            {serviceLogs.map((svc) => (
              <tr key={svc.id} style={{ borderBottom: '1px solid #161e2e' }}>
                <td style={{ padding: '10px', color: '#f1f5f9', fontWeight: 700, fontFamily: 'monospace' }}>{svc.service}</td>
                <td style={{ padding: '10px' }}>
                  <span style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 800 }}>
                    {svc.status}
                  </span>
                </td>
                <td style={{ padding: '10px', color: '#38bdf8', fontWeight: 700 }}>{svc.p95}</td>
                <td style={{ padding: '10px', color: '#94a3b8' }}>{svc.restarts} / 3 max</td>
                <td style={{ padding: '10px', color: '#cbd5e1' }}>{svc.lastEvent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
