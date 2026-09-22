import React from 'react';
import { Building2, Server, Layers, Cpu, AlertTriangle, ShieldCheck, Activity, Award, AlertCircle } from 'lucide-react';
import { useServerStore } from '../../store/serverStore.jsx';

export default function ExecutiveDashboard({ overview }) {
  const { servers } = useServerStore();

  const totalServers = servers.length || (overview?.total_servers ?? 0);
  const hasData = totalServers > 0 || (overview && (overview.total_servers > 0 || overview.docker_containers > 0));

  if (!hasData) {
    return (
      <div style={{ background: '#161b22', border: '1px dashed #30363d', borderRadius: '12px', padding: '48px 24px', textAlign: 'center', margin: '20px 0' }}>
        <AlertCircle size={40} color="#58a6ff" style={{ margin: '0 auto 12px auto', display: 'block' }} />
        <h3 style={{ color: '#f0f6fc', fontSize: '18px', margin: '0 0 8px 0', fontWeight: 700 }}>No Executive KPI Telemetry</h3>
        <p style={{ color: '#8b949e', fontSize: '13px', maxWidth: '500px', margin: '0 auto', lineHeight: 1.5 }}>
          No active agent nodes or enterprise cluster telemetry detected. Please enroll host agents to populate the executive dashboard.
        </p>
      </div>
    );
  }

  const widgets = [
    { label: 'INFRASTRUCTURE HEALTH', value: overview?.health_pct ? `${overview.health_pct}%` : '100%', color: '#3fb950', icon: Activity, desc: 'Global system health' },
    { label: 'ORGANIZATIONS', value: overview?.organizations_count ?? '1', color: '#58a6ff', icon: Building2, desc: 'Enterprise tenants' },
    { label: 'SERVERS MONITORED', value: String(totalServers), color: '#58a6ff', icon: Server, desc: 'Active agent hosts' },
    { label: 'CONTAINERS', value: (overview?.docker_containers ?? 0).toLocaleString(), color: '#a855f7', icon: Layers, desc: 'Docker container instances' },
    { label: 'KUBERNETES CLUSTERS', value: String(overview?.k8s_clusters ?? 0), color: '#ffa657', icon: Cpu, desc: 'Production K8s clusters' },
    { label: 'CRITICAL ALERTS', value: String(overview?.critical_incidents ?? 0), color: '#f78166', icon: AlertTriangle, desc: 'Requires immediate action' },
    { label: 'SLA COMPLIANCE', value: `${overview?.availability_pct ?? 100}%`, color: '#3fb950', icon: ShieldCheck, desc: 'Monthly uptime rating' },
  ];

  return (
    <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: 0, color: '#f0f6fc', fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Award size={20} color="#58a6ff" />
          Executive KPI Dashboard
        </h3>
        <span style={{ fontSize: '13px', color: '#8b949e' }}>High-level strategic insights, organization scale &amp; operational compliance</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
        {widgets.map((w, idx) => {
          const Icon = w.icon;
          return (
            <div key={idx} style={{
              background: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: '10px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#8b949e', fontSize: '11px', fontWeight: 700 }}>
                <span>{w.label}</span>
                <Icon size={18} color={w.color} />
              </div>

              <div style={{ fontSize: '32px', fontWeight: 800, color: '#f0f6fc', margin: '14px 0 4px 0' }}>
                {w.value}
              </div>

              <div style={{ fontSize: '12px', color: '#8b949e' }}>{w.desc}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
