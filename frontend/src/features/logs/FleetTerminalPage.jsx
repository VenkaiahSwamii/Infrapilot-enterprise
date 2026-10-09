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
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0284c7 0%, #6366f1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(2, 132, 199, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
            }}
          >
            <Terminal size={22} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: '#f8fafc' }}>
              Fleet Terminal &amp; Live Audit Stream
            </h1>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '2px 0 0 0' }}>
              Live telemetry, system logs, pattern grouping, and Schema-on-Read dynamic extraction scoped to your infrastructure fleet.
            </p>
          </div>
        </div>

        {/* Server Dropdown Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', letterSpacing: '0.06em' }}>
            ACTIVE HOST:
          </label>
          <ServerSelectDropdown />
        </div>
      </div>

      {/* Terminal View Scoped to Selected Server */}
      <FleetTerminal machine={selectedServer} />

      {/* Auxiliary Status Cards Displaying Selected Server Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginTop: '20px' }}>
        <div
          style={{
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.75) 0%, rgba(10, 15, 29, 0.8) 100%)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '18px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em' }}>
            <Activity size={16} color="#38bdf8" />
            <span>CHANNEL STATUS</span>
          </div>
          <div
            style={{
              fontSize: '17px',
              fontWeight: 800,
              color: isOnline ? '#22c55e' : '#ef4444',
              marginTop: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: isOnline ? '#22c55e' : '#ef4444',
                boxShadow: isOnline ? '0 0 10px rgba(34, 197, 94, 0.6)' : 'none',
              }}
            />
            {isOnline ? 'mTLS STREAM HEALTHY' : 'CHANNEL OFFLINE'}
          </div>
          <span style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'block' }}>
            {hostname} ({ipAddress}) • Port 50051
          </span>
        </div>

        <div
          style={{
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.75) 0%, rgba(10, 15, 29, 0.8) 100%)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '18px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em' }}>
            <Cpu size={16} color="#f59e0b" />
            <span>AGENT RUNTIME</span>
          </div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: '#f8fafc', marginTop: '8px' }}>
            InfraPilot v1.1.0 ({os.toUpperCase()})
          </div>
          <span style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'block' }}>
            Last heart-beat: {selectedServer?.last_seen || 'Just now'}
          </span>
        </div>

        <div
          style={{
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.75) 0%, rgba(10, 15, 29, 0.8) 100%)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '18px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em' }}>
            <Shield size={16} color="#a855f7" />
            <span>NODE TELEMETRY</span>
          </div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: '#c084fc', marginTop: '8px' }}>
            {cpu}% CPU • {ram}% RAM
          </div>
          <span style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'block' }}>
            Latency: {live.latency_ms ? `${Number(live.latency_ms).toFixed(1)}ms` : '1.2ms'}
          </span>
        </div>
      </div>
    </div>
  );
}
