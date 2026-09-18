import React from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import LogsTab from '../machines/tabs/LogsTab.jsx';
import ServerSelectDropdown from '../../components/common/ServerSelectDropdown.jsx';
import { useServerStore } from '../../store/serverStore.jsx';

export default function LogsPage() {
  const { selectedServer, servers, loading } = useServerStore();

  const activeServer = selectedServer || (servers.length > 0 ? servers[0] : {
    id: 'default',
    hostname: 'local-node-01',
    status: 'ONLINE',
  });

  return (
    <div style={{ padding: '24px 32px', minHeight: '100vh', backgroundColor: '#090d16', color: '#f1f5f9' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
            }}
          >
            <FileText size={22} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0 }}>Centralized Log Explorer</h1>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
              Query, filter, and stream system, kernel, Docker, and agent telemetry logs across your fleet.
            </p>
          </div>
        </div>

        {/* Universal Server Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>SELECTED HOST:</label>
          <ServerSelectDropdown />
        </div>
      </div>

      {/* Render LogsTab for the selected host */}
      {activeServer ? (
        <LogsTab machine={activeServer} />
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
          <RefreshCw className="spin" size={24} style={{ marginBottom: '12px' }} />
          <div>Loading fleet telemetry streams...</div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
          <div>No active machines available. Please enroll or connect an agent.</div>
        </div>
      )}
    </div>
  );
}
