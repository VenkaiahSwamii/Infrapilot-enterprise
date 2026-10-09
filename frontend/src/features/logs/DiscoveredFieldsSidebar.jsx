import React, { useState } from 'react';
import {
  Layers,
  ChevronRight,
  ChevronDown,
  Hash,
  Type,
  Globe,
  Binary,
  Clock,
  Sparkles,
  BarChart2,
  Filter,
  Plus,
  Zap,
  ArrowRight,
  X
} from 'lucide-react';

export default function DiscoveredFieldsSidebar({
  discoveredFields = [],
  onSelectFieldFilter,
  onAggregateField,
  isOpen = true,
  onToggleOpen
}) {
  const [expandedField, setExpandedField] = useState(null);
  const [searchField, setSearchField] = useState('');

  const toggleExpand = (fieldName) => {
    setExpandedField((prev) => (prev === fieldName ? null : fieldName));
  };

  const filteredFields = discoveredFields.filter((f) =>
    f.field.toLowerCase().includes(searchField.toLowerCase())
  );

  const getFieldIcon = (type) => {
    switch (type) {
      case 'number':
        return <Hash size={12} color="#fbbf24" />;
      case 'ip':
        return <Globe size={12} color="#38bdf8" />;
      case 'boolean':
        return <Binary size={12} color="#c084fc" />;
      case 'timestamp':
        return <Clock size={12} color="#60a5fa" />;
      default:
        return <Type size={12} color="#34d399" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        width: '240px',
        minWidth: '240px',
        background: 'linear-gradient(180deg, #0f172a 0%, #090d16 100%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxHeight: '600px',
        overflow: 'hidden',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={15} color="#818cf8" />
          <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f1f5f9' }}>
            Discovered Fields ({discoveredFields.length})
          </span>
        </div>
        {onToggleOpen && (
          <button
            type="button"
            onClick={onToggleOpen}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Field Search Filter */}
      {discoveredFields.length > 5 && (
        <input
          type="text"
          value={searchField}
          onChange={(e) => setSearchField(e.target.value)}
          placeholder="Filter fields..."
          style={{
            width: '100%',
            padding: '6px 10px',
            backgroundColor: '#050811',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            fontSize: '11px',
            color: '#f1f5f9',
            fontFamily: '"Fira Code", monospace',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      )}

      {/* Fields List */}
      <div
        style={{
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          paddingRight: '2px',
        }}
      >
        {filteredFields.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 8px', color: '#64748b', fontSize: '12px' }}>
            No fields discovered yet.
          </div>
        ) : (
          filteredFields.map((f) => {
            const isExpanded = expandedField === f.field;

            return (
              <div
                key={f.field}
                style={{
                  borderRadius: '8px',
                  border: isExpanded ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                  background: isExpanded ? 'rgba(15, 23, 42, 0.9)' : 'rgba(15, 23, 42, 0.45)',
                  overflow: 'hidden',
                  transition: 'all 0.2s',
                }}
              >
                {/* Field Row Summary */}
                <button
                  type="button"
                  onClick={() => toggleExpand(f.field)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    fontFamily: '"Fira Code", monospace',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#e2e8f0',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '70%', overflow: 'hidden' }}>
                    <span
                      style={{
                        padding: '3px',
                        borderRadius: '4px',
                        backgroundColor: '#070b14',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {getFieldIcon(f.inferredType)}
                    </span>
                    <span style={{ color: isExpanded ? '#818cf8' : '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.field}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b', fontSize: '10px', flexShrink: 0 }}>
                    <span style={{ fontWeight: 700, color: '#94a3b8' }}>{f.distinctCount}</span>
                    {isExpanded ? <ChevronDown size={13} color="#94a3b8" /> : <ChevronRight size={13} color="#64748b" />}
                  </div>
                </button>

                {/* Expanded Details & Top Values */}
                {isExpanded && (
                  <div
                    style={{
                      padding: '8px 10px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      backgroundColor: '#070b14',
                    }}
                  >
                    {/* Coverage bar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
                        <span>Coverage</span>
                        <span style={{ fontFamily: 'monospace', color: '#34d399', fontWeight: 700 }}>{f.coverage}%</span>
                      </div>
                      <div style={{ width: '100%', backgroundColor: '#1e293b', borderRadius: '9999px', height: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${f.coverage}%`,
                            backgroundColor: '#10b981',
                            height: '100%',
                            borderRadius: '9999px',
                            transition: 'all 0.3s',
                          }}
                        />
                      </div>
                    </div>

                    {/* Quick Action: Stats Count */}
                    <div>
                      <button
                        type="button"
                        onClick={() => onAggregateField && onAggregateField(f.field)}
                        style={{
                          width: '100%',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(99, 102, 241, 0.15)',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                          color: '#a5b4fc',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                        }}
                      >
                        <BarChart2 size={11} />
                        <span>Stats Count by {f.field}</span>
                      </button>
                    </div>

                    {/* Top Values List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>
                        Top Values ({f.topValues.length})
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {f.topValues.map((valObj, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() =>
                              onSelectFieldFilter &&
                              onSelectFieldFilter(f.field, valObj.value, f.inferredType)
                            }
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              padding: '4px 6px',
                              backgroundColor: 'rgba(15, 23, 42, 0.7)',
                              border: '1px solid rgba(255, 255, 255, 0.05)',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '10px',
                              fontFamily: '"Fira Code", monospace',
                              cursor: 'pointer',
                              color: '#cbd5e1',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.2)';
                              e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(15, 23, 42, 0.7)';
                              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                            }}
                          >
                            <span style={{ maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {valObj.value}
                            </span>
                            <span style={{ color: '#34d399', fontWeight: 700, fontSize: '9px' }}>
                              {valObj.count} ({valObj.percentage}%)
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

