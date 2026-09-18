import React from 'react';
import { ShieldCheck, Lock, Key, FileCheck, CheckCircle2, Server } from 'lucide-react';
import FleetTerminal from '../logs/FleetTerminal.jsx';
import ServerSelectDropdown from '../../components/common/ServerSelectDropdown.jsx';
import { useServerStore } from '../../store/serverStore.jsx';

export default function SecurityTLSPage() {
  const { selectedServer } = useServerStore();
  const tlsConfig = {
    tls_enabled: true,
    mtls_enabled: true,
    ca_cert: 'certs/ca.crt',
    agent_cert: 'certs/agent.crt',
    agent_key: 'certs/agent.key',
    protocol: 'TLS 1.3 / gRPC mTLS',
    cipher: 'TLS_AES_256_GCM_SHA384',
    certificate_issuer: 'InfraPilot Internal CA Authority v2',
    expiration_days: 342,
  };

  return (
    <div style={{ padding: '24px 32px', minHeight: '100vh', backgroundColor: '#090d16', color: '#f1f5f9' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'linear-gradient(135deg, #1d4ed8, #0284c7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={24} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0 }}>Security &amp; TLS Configuration</h1>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
              Managed `[tls]` parameters from `config.toml` – Certificate validation, mTLS channel security &amp; agent handshake
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>TARGET NODE:</label>
          <ServerSelectDropdown />
        </div>
      </div>

      {/* Live System & Service Log Terminal */}
      <FleetTerminal machine={selectedServer} />

      {/* KPI Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>TLS ENCRYPTION</span>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#22c55e', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={20} /> ENABLED
          </div>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>MUTUAL TLS (mTLS)</span>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#38bdf8', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={20} /> ACTIVE (Port 50051)
          </div>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>CERT EXPIRATION</span>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#f59e0b', marginTop: '6px' }}>
            {tlsConfig.expiration_days} Days Remaining
          </div>
        </div>
      </div>

      {/* Configuration Grid */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginTop: 0, marginBottom: '16px', color: '#38bdf8' }}>
          `[tls]` Active TOML Parameters
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          <div style={{ background: '#090d16', border: '1px solid #1e293b', padding: '16px', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#64748b' }}>ca_cert</div>
            <code style={{ fontSize: '14px', color: '#38bdf8', fontWeight: 700 }}>{tlsConfig.ca_cert}</code>
          </div>
          <div style={{ background: '#090d16', border: '1px solid #1e293b', padding: '16px', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#64748b' }}>agent_cert</div>
            <code style={{ fontSize: '14px', color: '#38bdf8', fontWeight: 700 }}>{tlsConfig.agent_cert}</code>
          </div>
          <div style={{ background: '#090d16', border: '1px solid #1e293b', padding: '16px', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#64748b' }}>agent_key</div>
            <code style={{ fontSize: '14px', color: '#38bdf8', fontWeight: 700 }}>{tlsConfig.agent_key}</code>
          </div>
        </div>
      </div>
    </div>
  );
}
