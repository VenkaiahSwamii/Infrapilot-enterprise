import React, { useState } from 'react';
import { Clock, TrendingUp, TrendingDown, Activity, ArrowRight } from 'lucide-react';
import { generateDualSeriesSVG, computeStatisticalDelta } from './utils/sreHelpers.js';

export default function TimeTravelOverlay({ metric = 'latency_ms' }) {
  const [selectedTimeSpan, setSelectedTimeSpan] = useState('24h');

  // Synthetic baseline & current points
  const currentPoints = [];
  const baselinePoints = [];
  const now = new Date();

  for (let i = 0; i < 25; i++) {
    const t = new Date(now.getTime() - (25 - i) * 60000);
    const baseVal = 18 + Math.sin(i * 0.4) * 6;
    const curVal = baseVal * 2.4 + Math.random() * 8;
    currentPoints.push({ timestamp: t, value: Math.round(curVal * 10) / 10 });
    baselinePoints.push({ timestamp: t, value: Math.round(baseVal * 10) / 10 });
  }

  const stats = computeStatisticalDelta(currentPoints, baselinePoints);
  const svgData = generateDualSeriesSVG(currentPoints, baselinePoints, 560, 140);

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={16} color="#38bdf8" />
          <strong style={{ fontSize: '13px', color: '#f8fafc' }}>
            Time Travel Comparator: Current Window vs Baseline
          </strong>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          {['1h', '6h', '24h', '7d'].map((span) => (
            <button
              key={span}
              onClick={() => setSelectedTimeSpan(span)}
              style={{
                ...styles.timeBtn,
                backgroundColor: selectedTimeSpan === span ? '#0284c7' : '#1e293b',
                color: selectedTimeSpan === span ? '#ffffff' : '#94a3b8',
              }}
            >
              {span}
            </button>
          ))}
        </div>
      </div>

      {/* Statistical Summary Row */}
      <div style={styles.statGrid}>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Current Mean</span>
          <span style={{ ...styles.statVal, color: '#38bdf8' }}>{stats.curMean} ms</span>
          <span style={styles.statSub}>P95: {stats.curP95} ms</span>
        </div>

        <div style={styles.statCard}>
          <span style={styles.statLabel}>Baseline Mean (-{selectedTimeSpan})</span>
          <span style={{ ...styles.statVal, color: '#a855f7' }}>{stats.baseMean} ms</span>
          <span style={styles.statSub}>P95: {stats.baseP95} ms</span>
        </div>

        <div style={styles.statCard}>
          <span style={styles.statLabel}>Shift Delta (Variance)</span>
          <span style={{ ...styles.statVal, color: stats.badgeColor }}>
            {stats.percentageDelta > 0 ? '+' : ''}
            {stats.percentageDelta}%
          </span>
          <span style={{ ...styles.statSub, color: stats.badgeColor, fontWeight: 600 }}>
            {stats.assessment}
          </span>
        </div>
      </div>

      {/* Dual Series Chart */}
      <div style={styles.chartBox}>
        <svg viewBox="0 0 560 140" style={{ width: '100%', height: '140px' }}>
          {/* Grid lines */}
          <line x1="12" y1="20" x2="548" y2="20" stroke="#1e293b" strokeDasharray="3 3" />
          <line x1="12" y1="70" x2="548" y2="70" stroke="#1e293b" strokeDasharray="3 3" />
          <line x1="12" y1="120" x2="548" y2="120" stroke="#1e293b" strokeDasharray="3 3" />

          {/* Baseline Series (Violet Dashed) */}
          <polyline
            points={svgData.baselinePath}
            fill="none"
            stroke="#a855f7"
            strokeWidth="2"
            strokeDasharray="5 3"
          />

          {/* Current Series (Cyan Solid) */}
          <polyline
            points={svgData.currentPath}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>

        <div style={styles.legendRow}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '3px', backgroundColor: '#38bdf8' }} />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Current Window (Today)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '3px', backgroundColor: '#a855f7', borderTop: '1px dashed' }} />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Baseline Window (-{selectedTimeSpan})</span>
          </div>
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
    gap: '14px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
  },
  timeBtn: {
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '10px',
  },
  statCard: {
    backgroundColor: '#0f172a',
    borderRadius: '8px',
    border: '1px solid #1e293b',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  statLabel: {
    fontSize: '10px',
    color: '#64748b',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  statVal: {
    fontSize: '16px',
    fontWeight: 700,
  },
  statSub: {
    fontSize: '10px',
    color: '#94a3b8',
  },
  chartBox: {
    backgroundColor: '#0a0f1d',
    borderRadius: '8px',
    border: '1px solid #1e293b',
    padding: '12px',
  },
  legendRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '20px',
    marginTop: '6px',
  },
};
