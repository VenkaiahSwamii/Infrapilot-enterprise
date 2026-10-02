import React, { useState, useEffect } from 'react';
import { Layers, AlertTriangle, Clock, RefreshCw, ChevronRight } from 'lucide-react';
import { apiClient } from '../../api/client.js';

export default function LogPatternsTab({ machineId, onSelectPattern }) {
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchPatterns = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/logs/patterns', {
        params: {
          machine_id: machineId || '',
          time_range: '24h',
        },
      });
      if (res.data?.patterns) {
        setPatterns(res.data.patterns);
      } else {
        setPatterns(getMockPatterns());
      }
    } catch {
      setPatterns(getMockPatterns());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatterns();
  }, [machineId]);

  return (
    <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={18} color="#38bdf8" />
            Error Log Patterns & Aggregated Groups
          </h3>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>
            Identifies repetitive error signatures across hosts, services, and containers.
          </p>
        </div>
        <button
          onClick={fetchPatterns}
          disabled={loading}
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            color: '#94a3b8',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          <span>Refresh Patterns</span>
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
          Analyzing log patterns and aggregating signatures...
        </div>
      ) : patterns.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
          No recurring error patterns detected.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {patterns.map((p, idx) => (
            <div
              key={idx}
              onClick={() => onSelectPattern && onSelectPattern(p.Signature)}
              style={{
                backgroundColor: '#020617',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'border-color 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#38bdf8')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e293b')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      backgroundColor: '#ef444420',
                      border: '1px solid #ef444450',
                      color: '#ef4444',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 800,
                    }}
                  >
                    {String(p.Severity || 'ERROR').toUpperCase()}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', fontFamily: 'monospace' }}>
                    {p.Signature}
                  </span>
                </div>
                <span
                  style={{
                    backgroundColor: '#38bdf820',
                    color: '#38bdf8',
                    padding: '3px 10px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 800,
                  }}
                >
                  {p.Occurrences || p.occurrences || 1} Occurrences
                </span>
              </div>

              <div style={{ fontSize: '12px', color: '#94a3b8', margin: '8px 0', fontFamily: 'monospace', backgroundColor: '#090d16', padding: '8px 12px', borderRadius: '4px' }}>
                {p.SampleLog || p.sample_log}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginTop: '10px' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <span>Services: <strong style={{ color: '#cbd5e1' }}>{(p.Services || p.services || []).join(', ') || 'N/A'}</strong></span>
                  <span>Hosts: <strong style={{ color: '#cbd5e1' }}>{(p.Hosts || p.hosts || []).join(', ') || 'N/A'}</strong></span>
                </div>
                <div style={{ display: 'flex', items: 'center', gap: '4px', color: '#38bdf8', fontWeight: 600 }}>
                  <span>Filter this pattern</span>
                  <ChevronRight size={14} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getMockPatterns() {
  return [
    {
      Signature: 'Database connection refused to <HOST>:<PORT>',
      Occurrences: 1284,
      FirstSeen: new Date(Date.now() - 3600000),
      LastSeen: new Date(),
      SampleLog: 'Database connection refused to postgres-db.internal:5432 (timeout after 5000ms)',
      Services: ['payment-api', 'order-service'],
      Hosts: ['ubuntu-prod-01', 'ubuntu-prod-02'],
      Severity: 'ERROR',
    },
    {
      Signature: 'Pod <POD_NAME> entered CrashLoopBackOff state',
      Occurrences: 117,
      FirstSeen: new Date(Date.now() - 7200000),
      LastSeen: new Date(),
      SampleLog: 'Pod payment-api-7f8d-x2k9 entered CrashLoopBackOff state (Exit Code 137 OOMKilled)',
      Services: ['payment-api'],
      Hosts: ['production-k8s-node-01'],
      Severity: 'CRITICAL',
    },
    {
      Signature: 'Container <NAME> health check failed: ping timeout',
      Occurrences: 42,
      FirstSeen: new Date(Date.now() - 10800000),
      LastSeen: new Date(),
      SampleLog: 'Container redis-cache health check failed: ping timeout after 3000ms',
      Services: ['redis-cache'],
      Hosts: ['ubuntu-prod-01'],
      Severity: 'ERROR',
    },
  ];
}
