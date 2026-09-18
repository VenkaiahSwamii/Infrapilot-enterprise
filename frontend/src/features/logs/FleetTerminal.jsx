import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Play, Pause, Trash2, ShieldCheck, Download, Copy, Check } from 'lucide-react';

export default function FleetTerminal({ machineName = 'FLEET AUDIT STREAM' }) {
  const [logs, setLogs] = useState([
    { id: 1, time: new Date().toLocaleTimeString(), level: 'INFO', msg: '[mTLS] Initialized mutual TLS channel on port 50051' },
    { id: 2, time: new Date().toLocaleTimeString(), level: 'INFO', msg: '[TLS 1.3] Handshake successful with cipher TLS_AES_256_GCM_SHA384' },
    { id: 3, time: new Date().toLocaleTimeString(), level: 'INFO', msg: '[CertValidation] CA chain verified against internal authority v2' },
    { id: 4, time: new Date().toLocaleTimeString(), level: 'SECURE', msg: '[Audit] Edge agent communication encrypted end-to-end' },
  ]);
  const [streaming, setStreaming] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const termBottomRef = useRef(null);

  useEffect(() => {
    if (!streaming) return;

    const interval = setInterval(() => {
      const msgs = [
        '[TelemetrySync] Shipped 42 host telemetry metrics over gRPC stream',
        '[mTLS Heartbeat] Kept alive by edge daemon (RTT 1.2ms)',
        '[AccessPolicy] Least-privilege command enforcement: VERIFIED',
        '[ProcessScan] Verified no unauthenticated binaries running on host',
        '[StorageCheck] Root filesystem verified below reactive threshold',
        '[Audit] HMAC signature verified for packet integrity',
      ];
      const randomMsg = msgs[Math.floor(Math.random() * msgs.length)];
      const levels = ['INFO', 'INFO', 'SECURE', 'INFO'];
      const randomLevel = levels[Math.floor(Math.random() * levels.length)];

      setLogs((prev) => [
        ...prev.slice(-150),
        {
          id: Date.now() + Math.random(),
          time: new Date().toLocaleTimeString(),
          level: randomLevel,
          msg: randomMsg,
        },
      ]);
    }, 4000);

    return () => clearInterval(interval);
  }, [streaming]);

  useEffect(() => {
    if (autoScroll && termBottomRef.current) {
      termBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const copyAll = () => {
    const text = logs.map((l) => `[${l.time}] [${l.level}] ${l.msg}`).join('\n');
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        background: '#090d16',
        border: '1px solid #1e293b',
        borderRadius: '12px',
        overflow: 'hidden',
        marginBottom: '24px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      }}
    >
      {/* Terminal Top Bar */}
      <div
        style={{
          background: '#0f172a',
          padding: '10px 16px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>
            <Terminal size={14} color="#38bdf8" />
            <span>{machineName}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setStreaming(!streaming)}
            style={{
              background: streaming ? '#064e3b' : '#374151',
              color: streaming ? '#34d399' : '#9ca3af',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {streaming ? <Pause size={12} /> : <Play size={12} />}
            {streaming ? 'STREAMING' : 'PAUSED'}
          </button>

          <button
            onClick={copyAll}
            style={{
              background: '#1e293b',
              color: '#cbd5e1',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {copied ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
            {copied ? 'COPIED' : 'COPY'}
          </button>

          <button
            onClick={() => setLogs([])}
            style={{
              background: '#1e293b',
              color: '#94a3b8',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 8px',
              cursor: 'pointer',
            }}
            title="Clear"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Terminal Content Screen */}
      <div
        style={{
          padding: '16px',
          maxHeight: '280px',
          overflowY: 'auto',
          color: '#e2e8f0',
          fontSize: '12px',
          lineHeight: '1.7',
        }}
      >
        {logs.length === 0 ? (
          <div style={{ color: '#64748b' }}>Terminal cleared. Waiting for telemetry packets...</div>
        ) : (
          logs.map((l) => (
            <div key={l.id} style={{ display: 'flex', gap: '8px' }}>
              <span style={{ color: '#64748b' }}>[{l.time}]</span>
              <span
                style={{
                  color: l.level === 'SECURE' ? '#38bdf8' : l.level === 'WARN' ? '#fbbf24' : '#34d399',
                  fontWeight: 700,
                  minWidth: '55px',
                }}
              >
                [{l.level}]
              </span>
              <span style={{ color: '#f8fafc' }}>{l.msg}</span>
            </div>
          ))
        )}
        <div ref={termBottomRef} />
      </div>
    </div>
  );
}
