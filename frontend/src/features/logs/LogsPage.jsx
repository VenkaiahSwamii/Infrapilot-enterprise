import React, { useState, useEffect } from 'react';
import { FileText, Server, RefreshCw } from 'lucide-react';
import LogsTab from '../machines/tabs/LogsTab.jsx';
import { listServers } from '../../api/server.js';

export default function LogsPage() {
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listServers()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setServers(list);
        if (list.length > 0) {
          setSelectedServer(list[0]);
        } else {
          // Synthetic default host if no machines registered yet
          setSelectedServer({
            id: 'default',
            hostname: 'local-node-01',
            status: 'ONLINE',
          });
        }
      })
      .catch((err) => {
        console.error('Failed to load servers for LogsPage:', err);
        setSelectedServer({
          id: 'default',
          hostname: 'local-node-01',
          status: 'ONLINE',
        });
      })
      .finally(() => setLoading(false));
  }, []);

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

        {/* Server Selector */}
        {servers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Server size={16} color="#94a3b8" />
            <select
              value={selectedServer?.id || ''}
              onChange={(e) => {
                const s = servers.find((item) => String(item.id) === e.target.value);
                if (s) setSelectedServer(s);
              }}
              style={{
                background: '#0f172a',
                color: '#f8fafc',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.hostname || s.name || s.id} ({s.status || 'ONLINE'})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Render LogsTab for the selected host */}
      {selectedServer ? (
        <LogsTab machine={selectedServer} />
      ) : (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
          <RefreshCw className="spin" size={24} style={{ marginBottom: '12px' }} />
          <div>Loading fleet telemetry streams...</div>
        </div>
      )}
    </div>
  );
}
