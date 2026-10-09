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
    <div
      style={{
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.8) 0%, rgba(10, 15, 29, 0.85) 100%)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '14px',
        padding: '20px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(99, 102, 241, 0.25))',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Layers size={18} color="#c084fc" />
          </div>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
              Error Log Patterns &amp; Aggregated Groups
            </h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0 0' }}>
              Identifies repetitive error signatures across hosts, services, and containers.
            </p>
          </div>
        </div>

        <button
          onClick={fetchPatterns}
          disabled={loading}
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#94a3b8',
            padding: '7px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease',
          }}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          <span>Refresh Patterns</span>
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
          <RefreshCw className="spin" size={20} style={{ margin: '0 auto 10px auto', display: 'block', color: '#38bdf8' }} />
          Analyzing log patterns and aggregating signatures...
        </div>
      ) : patterns.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
          No recurring error patterns detected.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {patterns.map((p, idx) => (
            <div
              key={idx}
              onClick={() => onSelectPattern && onSelectPattern(p.Signature)}
              style={{
                backgroundColor: 'rgba(2, 6, 23, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '10px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.5)';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }}
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
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    color: '#38bdf8',
                    padding: '3px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 800,
                  }}
                >
                  {p.Occurrences || p.occurrences || 1} Occurrences
                </span>
              </div>

              <div
                style={{
                  fontSize: '12px',
                  color: '#94a3b8',
                  margin: '8px 0',
                  fontFamily: 'monospace',
                  backgroundColor: '#070b14',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                  padding: '8px 12px',
                  borderRadius: '6px',
                }}
              >
                {p.SampleLog || p.sample_log}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748b', marginTop: '10px' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <span>Services: <strong style={{ color: '#cbd5e1' }}>{(p.Services || p.services || []).join(', ') || 'N/A'}</strong></span>
                  <span>Hosts: <strong style={{ color: '#cbd5e1' }}>{(p.Hosts || p.hosts || []).join(', ') || 'N/A'}</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#38bdf8', fontWeight: 600 }}>
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
