import React from 'react';
import { Terminal, Copy, Check, X } from 'lucide-react';

export default function LogViewer({ log, onClose }) {
  const [copied, setCopied] = React.useState(false);

  if (!log) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLevelColor = (level) => {
    switch (level?.toUpperCase()) {
      case 'CRITICAL': return '#f78166';
      case 'ERROR': return '#f78166';
      case 'WARN': return '#ffa657';
      case 'INFO': return '#58a6ff';
      default: return '#8b949e';
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', width: '640px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: '#f0f6fc', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px' }}>
            <Terminal size={20} color="#58a6ff" /> Log Details Inspector
          </h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px', marginBottom: '12px' }}>
            <div><span style={{ color: '#8b949e' }}>HOSTNAME:</span> <strong style={{ color: '#f0f6fc' }}>{log.hostname}</strong></div>
            <div><span style={{ color: '#8b949e' }}>PLATFORM:</span> <strong style={{ color: '#58a6ff', textTransform: 'capitalize' }}>{log.platform}</strong></div>
            <div><span style={{ color: '#8b949e' }}>SOURCE:</span> <strong style={{ color: '#a855f7', textTransform: 'uppercase' }}>{log.source}</strong></div>
            <div>
              <span style={{ color: '#8b949e' }}>SEVERITY LEVEL:</span>{' '}
              <span style={{
                padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
                backgroundColor: `${getLevelColor(log.level)}22`, color: getLevelColor(log.level)
              }}>
                {log.level}
              </span>
            </div>
          </div>

          <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '8px' }}>TIMESTAMP: {new Date(log.timestamp).toLocaleString()}</div>
          <div style={{ fontSize: '12px', color: '#8b949e' }}>MACHINE ID: <code>{log.machine_id}</code></div>
        </div>

        <h4 style={{ color: '#f0f6fc', margin: '0 0 8px 0', fontSize: '14px' }}>Log Message Content</h4>
        <pre style={{
          background: '#0d1117',
          border: '1px solid #30363d',
          color: getLevelColor(log.level),
          padding: '14px',
          borderRadius: '8px',
          fontSize: '13px',
          lineHeight: '1.5',
          overflowX: 'auto',
          maxHeight: '220px',
          whiteSpace: 'pre-wrap'
        }}>
          {log.message}
        </pre>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
          <button
            onClick={handleCopy}
            style={{ background: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {copied ? <Check size={16} color="#3fb950" /> : <Copy size={16} />}
            {copied ? 'Copied JSON' : 'Copy JSON'}
          </button>
          <button onClick={onClose} style={{ background: '#238636', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>Close</button>
        </div>
      </div>
    </div>
  );
}
