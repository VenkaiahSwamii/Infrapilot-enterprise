import React from 'react';
import { Terminal, Shield, Cpu, Activity, HardDrive, Radio, CheckCircle2 } from 'lucide-react';
import FleetTerminal from './FleetTerminal.jsx';
import ServerSelectDropdown from '../../components/common/ServerSelectDropdown.jsx';
import { useServerStore } from '../../store/serverStore.jsx';
import { getMachineId } from '../../utils/machineId.js';

export default function FleetTerminalPage() {
  const { selectedServer, liveMetricsMap } = useServerStore();

  const machineId = selectedServer ? getMachineId(selectedServer) : '';
  const live = (machineId && liveMetricsMap[machineId]) || {};
  const isOnline = selectedServer
    ? String(selectedServer.status || '').toUpperCase() === 'ONLINE' || selectedServer.online === true
    : false;

  const hostname = selectedServer?.hostname || selectedServer?.name || 'Local Node';
  const ipAddress = selectedServer?.ip_address || '127.0.0.1';
  const os = selectedServer?.os || selectedServer?.platform || 'linux';
  const cpu = Math.round(Number(live.cpu_usage ?? selectedServer?.cpu_usage ?? 0));
  const ram = Math.round(Number(live.memory_usage ?? selectedServer?.memory_usage ?? 0));

  return (
    <div style={{ padding: '24px 32px', minHeight: '100vh', backgroundColor: '#090d16', color: '#f1f5f9' }}>
      {/* Header with Title and Universal Server Dropdown */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #0284c7, #0369a1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
            }}
          >
            <Terminal size={22} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0 }}>Fleet Terminal &amp; Live Audit Stream</h1>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
              Live telemetry, system logs, and secure shell execution scoped to your chosen infrastructure node.
            </p>
          </div>
        </div>

        {/* Server Dropdown Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em' }}>
            ACTIVE HOST:
          </label>
          <ServerSelectDropdown />
        </div>
      </div>

      {/* Terminal View Scoped to Selected Server */}
      <FleetTerminal machine={selectedServer} />

      {/* Auxiliary Status Cards Displaying Selected Server Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>
            <Activity size={16} color="#38bdf8" />
            <span>CHANNEL STATUS</span>
          </div>
          <div
            style={{
              fontSize: '18px',
              fontWeight: 800,
              color: isOnline ? '#22c55e' : '#ef4444',
              marginTop: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: isOnline ? '#22c55e' : '#ef4444',
              }}
            />
            {isOnline ? 'mTLS STREAM HEALTHY' : 'CHANNEL OFFLINE'}
          </div>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            {hostname} ({ipAddress}) • Port 50051
          </span>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>
            <Cpu size={16} color="#f59e0b" />
            <span>AGENT RUNTIME</span>
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#f8fafc', marginTop: '8px' }}>
            InfraPilot v1.1.0 ({os.toUpperCase()})
          </div>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Last heart-beat: {selectedServer?.last_seen || 'Just now'}
          </span>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>
            <Shield size={16} color="#a855f7" />
            <span>NODE TELEMETRY</span>
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#a855f7', marginTop: '8px' }}>
            {cpu}% CPU • {ram}% RAM
          </div>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Latency: {live.latency_ms ? `${Number(live.latency_ms).toFixed(1)}ms` : '1.2ms'}
          </span>
        </div>
      </div>
    </div>
  );
}
