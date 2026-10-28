import React from 'react';
import { Sliders, CheckCircle2, AlertTriangle, Fingerprint, Plus, Minus, Edit3 } from 'lucide-react';
import { formatConfigDiff } from './utils/sreHelpers.js';

export default function ConfigDriftViewer({
  host = '192.168.1.136',
  component = 'PostgreSQL Database',
  baselineParams = {
    port: 5432,
    max_connections: 100,
    shared_buffers: '4GB',
    ssl_mode: 'require',
    read_replica: '192.168.1.137',
  },
  currentParams = {
    port: 5432,
    max_connections: 20, // Drifted!
    shared_buffers: '4GB',
    ssl_mode: 'require',
    unauthorized_debug: true, // Drifted!
  },
  baselineHash = 'ff53c5a4e9d2',
  currentHash = 'f142fd0c7a98',
}) {
  const diff = formatConfigDiff(baselineParams, currentParams);

  return (
    <div style={styles.card}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sliders size={16} color="#38bdf8" />
          <strong style={{ fontSize: '13px', color: '#f8fafc' }}>
            Configuration Drift Inspector: {component} ({host})
          </strong>
        </div>

        <span
          style={{
            ...styles.badge,
            backgroundColor: diff.totalDrifts > 0 ? '#ef444422' : '#10b98122',
            color: diff.totalDrifts > 0 ? '#ef4444' : '#10b981',
            borderColor: diff.totalDrifts > 0 ? '#ef444444' : '#10b98144',
          }}
        >
          {diff.totalDrifts > 0 ? `CRITICAL DRIFT (${diff.totalDrifts} changes)` : 'Golden Baseline Match'}
        </span>
      </div>

      {/* SHA-256 Fingerprint Row */}
      <div style={styles.fingerprintRow}>
        <div style={styles.fingerprintBox}>
          <Fingerprint size={13} color="#a855f7" />
          <span>Baseline Fingerprint: <code>{baselineHash}</code></span>
        </div>
        <div style={styles.fingerprintBox}>
          <Fingerprint size={13} color="#38bdf8" />
          <span>Active Fingerprint: <code>{currentHash}</code></span>
        </div>
      </div>

      {/* Diff Table */}
      <div style={styles.diffTableWrapper}>
        <table style={styles.diffTable}>
          <thead>
            <tr style={styles.tableHeaderRow}>
              <th style={styles.th}>Type</th>
              <th style={styles.th}>Parameter Key</th>
              <th style={styles.th}>Golden Baseline</th>
              <th style={styles.th}>Active State</th>
            </tr>
          </thead>
          <tbody>
            {diff.modified.map((item, idx) => (
              <tr key={`mod-${idx}`} style={styles.rowModified}>
                <td style={styles.td}>
                  <span style={styles.badgeMod}>
                    <Edit3 size={11} /> MODIFIED
                  </span>
                </td>
                <td style={{ ...styles.td, fontWeight: 600 }}>{item.key}</td>
                <td style={{ ...styles.td, color: '#94a3b8' }}>{String(item.baseVal)}</td>
                <td style={{ ...styles.td, color: '#f59e0b', fontWeight: 700 }}>{String(item.curVal)}</td>
              </tr>
            ))}

            {diff.added.map((item, idx) => (
              <tr key={`add-${idx}`} style={styles.rowAdded}>
                <td style={styles.td}>
                  <span style={styles.badgeAdd}>
                    <Plus size={11} /> ADDED
                  </span>
                </td>
                <td style={{ ...styles.td, fontWeight: 600 }}>{item.key}</td>
                <td style={{ ...styles.td, color: '#64748b' }}>&mdash;</td>
                <td style={{ ...styles.td, color: '#10b981', fontWeight: 700 }}>{String(item.value)}</td>
              </tr>
            ))}

            {diff.removed.map((item, idx) => (
              <tr key={`rem-${idx}`} style={styles.rowRemoved}>
                <td style={styles.td}>
                  <span style={styles.badgeRem}>
                    <Minus size={11} /> REMOVED
                  </span>
                </td>
                <td style={{ ...styles.td, fontWeight: 600 }}>{item.key}</td>
                <td style={{ ...styles.td, color: '#ef4444', fontWeight: 700 }}>{String(item.value)}</td>
                <td style={{ ...styles.td, color: '#64748b' }}>&mdash;</td>
              </tr>
            ))}

            {diff.totalDrifts === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '16px', color: '#10b981', fontSize: '12px' }}>
                  <CheckCircle2 size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                  Zero configuration drift detected. Active state matches golden baseline.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  card: {
    backgroundColor: '#090d16',
    borderRadius: '12px',
    border: '1px solid #1e293b',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
  },
  badge: {
    fontSize: '11px',
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: '6px',
    border: '1px solid',
  },
  fingerprintRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  fingerprintBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#0f172a',
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid #1e293b',
    fontSize: '11px',
    color: '#94a3b8',
  },
  diffTableWrapper: {
    borderRadius: '8px',
    border: '1px solid #1e293b',
    overflow: 'hidden',
  },
  diffTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
  },
  tableHeaderRow: {
    backgroundColor: '#0f172a',
    borderBottom: '1px solid #1e293b',
  },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: '11px',
    color: '#64748b',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid #131d35',
  },
  rowModified: {
    backgroundColor: '#78350f11',
  },
  rowAdded: {
    backgroundColor: '#064e3b11',
  },
  rowRemoved: {
    backgroundColor: '#7f1d1d11',
  },
  badgeMod: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 700,
    backgroundColor: '#f59e0b22',
    color: '#f59e0b',
  },
  badgeAdd: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 700,
    backgroundColor: '#10b98122',
    color: '#10b981',
  },
  badgeRem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 700,
    backgroundColor: '#ef444422',
    color: '#ef4444',
  },
};
