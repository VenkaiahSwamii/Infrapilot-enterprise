import React from 'react';
import { Eye } from 'lucide-react';

export default function LogsTable({ logs, onSelectLog }) {
  const list = logs || [];

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
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #30363d', color: '#8b949e' }}>
            <th style={{ padding: '12px' }}>TIMESTAMP</th>
            <th style={{ padding: '12px' }}>SEVERITY</th>
            <th style={{ padding: '12px' }}>SOURCE</th>
            <th style={{ padding: '12px' }}>HOSTNAME</th>
            <th style={{ padding: '12px' }}>MESSAGE</th>
            <th style={{ padding: '12px', textAlign: 'right' }}>ACTION</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr>
              <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: '#8b949e', fontStyle: 'italic' }}>
                No log entries matched your filter parameters.
              </td>
            </tr>
          ) : (
            list.map((log) => (
              <tr key={log.id} style={{ borderBottom: '1px solid #21262d', color: '#c9d1d9' }}>
                <td style={{ padding: '12px', color: '#8b949e', whiteSpace: 'nowrap', fontSize: '12px' }}>
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td style={{ padding: '12px' }}>
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: `${getLevelColor(log.level)}22`,
                    color: getLevelColor(log.level),
                  }}>
                    {log.level}
                  </span>
                </td>
                <td style={{ padding: '12px', textTransform: 'uppercase', color: '#a855f7', fontWeight: 600 }}>
                  {log.source}
                </td>
                <td style={{ padding: '12px', fontWeight: 600, color: '#f0f6fc' }}>
                  {log.hostname || 'system'}
                </td>
                <td style={{ padding: '12px', color: '#c9d1d9', maxWidth: '420px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                  {log.message}
                </td>
                <td style={{ padding: '12px', textAlign: 'right' }}>
                  <button
                    onClick={() => onSelectLog(log)}
                    style={{ background: '#21262d', color: '#58a6ff', border: '1px solid #30363d', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Eye size={14} /> Inspect
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
