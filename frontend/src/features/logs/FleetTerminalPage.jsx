import React from 'react';
import { Terminal, Shield, Cpu, Activity, HardDrive } from 'lucide-react';
import FleetTerminal from './FleetTerminal.jsx';

export default function FleetTerminalPage() {
  return (
    <div style={{ padding: '24px 32px', minHeight: '100vh', backgroundColor: '#090d16', color: '#f1f5f9' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #0284c7, #0369a1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Terminal size={22} color="#ffffff" />
        </div>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0 }}>Fleet Terminal &amp; Live Audit Stream</h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
            Unified real-time telemetry stream across all monitored enterprise instances and edge daemons.
          </p>
        </div>
      </div>

      {/* Terminal View */}
      <FleetTerminal machineName="GLOBAL FLEET OBSERVABILITY STREAM" />

      {/* Auxiliary Status Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>
            <Activity size={16} color="#38bdf8" />
            <span>CHANNEL STATUS</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#22c55e', marginTop: '8px' }}>
            mTLS STREAM HEALTHY
          </div>
          <span style={{ fontSize: '12px', color: '#64748b' }}>gRPC port 50051 synchronized</span>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>
            <Cpu size={16} color="#f59e0b" />
            <span>AGENT RUNTIME</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#f8fafc', marginTop: '8px' }}>
            InfraPilot v1.1.0
          </div>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Native execution mode</span>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>
            <Shield size={16} color="#a855f7" />
            <span>SECURITY AUDIT</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#a855f7', marginTop: '8px' }}>
            100% PASSING
          </div>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Zero privilege escalation alerts</span>
        </div>
      </div>
    </div>
  );
}
