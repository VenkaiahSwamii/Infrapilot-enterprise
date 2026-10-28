import React, { useState } from 'react';
import { ShieldCheck, Flame, AlertOctagon, CheckCircle2, Clock } from 'lucide-react';
import { formatBurnRateAlert } from './utils/sreHelpers.js';

export default function SROMultiBurnGauge({
  targetSLO = 0.999,
  currentBurnRate = 14.8,
  windowHours = 1.0,
  remainingBudgetPct = 82.5,
  timeToExhaustHours = 54.2,
}) {
  const alertInfo = formatBurnRateAlert(currentBurnRate);

  return (
    <div style={styles.card}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Flame size={16} color={alertInfo.color} />
          <strong style={{ fontSize: '13px', color: '#f8fafc' }}>
            Google SRE Error Budget & Multi-Burn-Rate Gauge
          </strong>
        </div>
        <span
          style={{
            ...styles.alertBadge,
            backgroundColor: `${alertInfo.color}22`,
            color: alertInfo.color,
            borderColor: `${alertInfo.color}55`,
          }}
        >
          {alertInfo.level}
        </span>
      </div>

      {/* Burn Rate & Budget Bar Grid */}
      <div style={styles.grid}>
        {/* Burn Multiplier Card */}
        <div style={styles.burnCard}>
          <span style={styles.metricLabel}>1-Hour Burn Rate Multiplier</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '26px', fontWeight: 800, color: alertInfo.color }}>
              {currentBurnRate}x
            </span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              (Threshold: 14.4x)
            </span>
          </div>
          <span style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '4px' }}>
            {alertInfo.description}
          </span>
        </div>

        {/* Remaining Budget Card */}
        <div style={styles.burnCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={styles.metricLabel}>Remaining 30-Day Budget</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>
              {remainingBudgetPct}%
            </span>
          </div>

          {/* Progress Bar */}
          <div style={styles.barBg}>
            <div
              style={{
                ...styles.barFill,
                width: `${Math.min(Math.max(remainingBudgetPct, 0), 100)}%`,
                backgroundColor: remainingBudgetPct < 20 ? '#ef4444' : remainingBudgetPct < 50 ? '#f59e0b' : '#10b981',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
            <Clock size={12} color="#94a3b8" />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Time-to-exhaustion: <strong>{timeToExhaustHours > 0 ? `${timeToExhaustHours} hours` : 'Safe'}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Multi-Window Policy Reference Table */}
      <div style={styles.policyRow}>
        <div style={styles.policyItem}>
          <span style={{ color: '#ef4444', fontWeight: 700 }}>14.4x (1h)</span>
          <span>Consumes 2% budget &rarr; Page</span>
        </div>
        <div style={styles.policyItem}>
          <span style={{ color: '#f59e0b', fontWeight: 700 }}>6.0x (6h)</span>
          <span>Consumes 5% budget &rarr; Page</span>
        </div>
        <div style={styles.policyItem}>
          <span style={{ color: '#38bdf8', fontWeight: 700 }}>1.0x (3d)</span>
          <span>Consumes 10% budget &rarr; Ticket</span>
        </div>
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
  alertBadge: {
    fontSize: '11px',
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: '6px',
    border: '1px solid',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '12px',
  },
  burnCard: {
    backgroundColor: '#0f172a',
    borderRadius: '8px',
    border: '1px solid #1e293b',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  metricLabel: {
    fontSize: '11px',
    color: '#64748b',
    fontWeight: 600,
    textTransform: 'uppercase',
    marginBottom: '2px',
  },
  barBg: {
    width: '100%',
    height: '8px',
    backgroundColor: '#1e293b',
    borderRadius: '4px',
    overflow: 'hidden',
    marginTop: '6px',
  },
  barFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  policyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderRadius: '8px',
    border: '1px solid #1e293b',
    padding: '8px 12px',
    fontSize: '11px',
    color: '#94a3b8',
    flexWrap: 'wrap',
    gap: '10px',
  },
  policyItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
};
