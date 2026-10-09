import React from 'react';
import { BarChart3, Filter, X, ArrowRight, Layers, Sparkles } from 'lucide-react';

export default function MiniSPLStatsWidget({ stats, onSelectBucket, onClearFilter, activeDrilldown }) {
  if (!stats || !stats.buckets || stats.buckets.length === 0) return null;

  const { type, field, total, buckets } = stats;

  const getBarColor = (index, pct) => {
    if (pct > 50) return 'linear-gradient(90deg, #ef4444 0%, #f97316 100%)'; // Red to orange
    if (pct > 25) return 'linear-gradient(90deg, #f59e0b 0%, #eab308 100%)'; // Amber to yellow
    if (index === 0) return 'linear-gradient(90deg, #06b6d4 0%, #3b82f6 100%)'; // Cyan to blue
    if (index === 1) return 'linear-gradient(90deg, #8b5cf6 0%, #6366f1 100%)'; // Purple to indigo
    return 'linear-gradient(90deg, #38bdf8 0%, #0284c7 100%)'; // Light blue
  };

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.9) 100%)',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        borderRadius: '10px',
        padding: '14px 18px',
        marginBottom: '14px',
        boxShadow: '0 8px 24px -6px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(12px)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
          paddingBottom: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              background: 'rgba(6, 182, 212, 0.15)',
              border: '1px solid rgba(6, 182, 212, 0.4)',
              color: '#38bdf8',
            }}
          >
            <BarChart3 size={15} />
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc', letterSpacing: '0.02em' }}>
            Mini-SPL Live Aggregation:
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '4px',
              background: 'rgba(56, 189, 248, 0.12)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              fontFamily: 'monospace',
            }}
          >
            {type === 'count' ? `count() by ${field}` : `${type}(${stats.valueField}) by ${field}`}
          </span>
          {total !== undefined && (
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              ({total.toLocaleString()} matching logs)
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {activeDrilldown && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.75rem',
                color: '#f59e0b',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                padding: '2px 8px',
                borderRadius: '4px',
              }}
            >
              <Filter size={12} />
              <span>Drilled: <strong>{activeDrilldown}</strong></span>
              <button
                onClick={() => onSelectBucket(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#f59e0b',
                  cursor: 'pointer',
                  padding: '0 2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Clear drill-down"
              >
                <X size={12} />
              </button>
            </div>
          )}

          <button
            onClick={onClearFilter}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '5px',
              padding: '3px 10px',
              fontSize: '0.72rem',
              color: '#cbd5e1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
              e.currentTarget.style.borderColor = '#ef4444';
              e.currentTarget.style.color = '#fca5a5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
              e.currentTarget.style.color = '#cbd5e1';
            }}
            title="Reset aggregation pipeline"
          >
            <X size={12} /> Reset Pipeline
          </button>
        </div>
      </div>

      {/* Distribution Bars Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {buckets.map((b, idx) => {
          const pct = b.percentage !== undefined ? b.percentage : (total > 0 ? (b.count / total) * 100 : 0);
          const isSelected = activeDrilldown === b.key;

          return (
            <div
              key={`${b.key}-${idx}`}
              onClick={() => onSelectBucket(isSelected ? null : b.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '6px',
                background: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'rgba(15, 23, 42, 0.4)',
                border: isSelected ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.03)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = 'rgba(30, 41, 59, 0.7)';
                  e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.25)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = 'rgba(15, 23, 42, 0.4)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.03)';
                }
              }}
              title="Click to drill down into this bucket"
            >
              {/* Key Label */}
              <div
                style={{
                  width: '240px',
                  minWidth: '180px',
                  fontSize: '0.78rem',
                  fontWeight: 500,
                  color: isSelected ? '#38bdf8' : '#e2e8f0',
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span style={{ color: '#64748b', fontSize: '0.7rem' }}>#{idx + 1}</span>
                <span>{b.key}</span>
              </div>

              {/* Progress Bar Container */}
              <div
                style={{
                  flex: 1,
                  height: '14px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  position: 'relative',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(2, pct)}%`,
                    background: getBarColor(idx, pct),
                    borderRadius: '3px',
                    transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                />
              </div>

              {/* Count & Percentage Badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  minWidth: '110px',
                  justifyContent: 'flex-end',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                }}
              >
                <span style={{ fontWeight: 700, color: '#f1f5f9' }}>
                  {b.count.toLocaleString()}
                </span>
                <span
                  style={{
                    color: pct > 50 ? '#ef4444' : pct > 20 ? '#f59e0b' : '#38bdf8',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                  }}
                >
                  {pct.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Hint */}
      <div
        style={{
          marginTop: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.7rem',
          color: '#64748b',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Sparkles size={11} color="#06b6d4" />
          Tip: Click any row above to isolate and filter live logs in the terminal
        </span>
        <span>Showing top {buckets.length} aggregations</span>
      </div>
    </div>
  );
}
