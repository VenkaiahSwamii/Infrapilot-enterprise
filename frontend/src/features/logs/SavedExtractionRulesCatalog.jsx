import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  X,
  Sparkles,
  Check,
  Copy,
  Trash2,
  Power,
  Play,
  Plus,
  Search,
  Filter,
  Layers,
  Code2,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Server,
  Database,
  TerminalSquare
} from 'lucide-react';
import { apiClient } from '../../api/client.js';
import { PREBUILT_EXTRACTION_TEMPLATES } from '../../utils/miniSPL.js';

export default function SavedExtractionRulesCatalog({
  isOpen = true,
  onClose,
  onApplyQuery,
  onOpenNewRuleModal,
  embedded = false,
}) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [copiedId, setCopiedId] = useState(null);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'builtin' | 'custom'

  // Fetch saved rules from backend (with fallback to local templates and localStorage)
  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/logs/extraction-rules');
      let backendRules = [];
      if (res.data?.rules && Array.isArray(res.data.rules)) {
        backendRules = res.data.rules;
      }

      // Merge with custom rules in localStorage if any
      const localCustom = JSON.parse(localStorage.getItem('infrapilot_custom_extraction_rules') || '[]');
      const combined = [...backendRules];

      for (const loc of localCustom) {
        if (!combined.some((b) => b.id === loc.id || b.name === loc.name)) {
          combined.push(loc);
        }
      }

      // Fallback if backend returned 0 rules
      if (combined.length === 0) {
        setRules(PREBUILT_EXTRACTION_TEMPLATES);
      } else {
        setRules(combined);
      }
    } catch (err) {
      console.warn('Failed to load rules from backend, using prebuilts & local:', err);
      const localCustom = JSON.parse(localStorage.getItem('infrapilot_custom_extraction_rules') || '[]');
      setRules([...PREBUILT_EXTRACTION_TEMPLATES, ...localCustom]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen || embedded) {
      fetchRules();
    }
  }, [isOpen, embedded]);

  // Toggle enable/disable
  const handleToggleRule = async (rule) => {
    try {
      if (rule.id && typeof rule.id === 'string' && !rule.id.startsWith('local_')) {
        await apiClient.patch(`/logs/extraction-rules/${rule.id}/toggle`);
      }
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isEnabled: !r.isEnabled, is_enabled: !r.is_enabled } : r))
      );
    } catch (err) {
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isEnabled: !r.isEnabled, is_enabled: !r.is_enabled } : r))
      );
    }
  };

  // Delete custom rule
  const handleDeleteRule = async (ruleId) => {
    try {
      if (ruleId && !ruleId.startsWith('local_')) {
        await apiClient.delete(`/logs/extraction-rules/${ruleId}`);
      }
      // Remove from localStorage
      const localCustom = JSON.parse(localStorage.getItem('infrapilot_custom_extraction_rules') || '[]');
      const updated = localCustom.filter((r) => r.id !== ruleId);
      localStorage.setItem('infrapilot_custom_extraction_rules', JSON.stringify(updated));

      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch (err) {
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    }
  };

  // Copy query preset
  const handleCopyQuery = (rule) => {
    const query = rule.queryPreset || rule.query_preset || `extract "${rule.pattern || rule.Pattern}"`;
    navigator.clipboard.writeText(query);
    setCopiedId(rule.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Apply rule to active search
  const handleApplyToSearch = (rule) => {
    const query = rule.queryPreset || rule.query_preset || `extract "${rule.pattern || rule.Pattern}"`;
    if (onApplyQuery) {
      onApplyQuery(query);
    }
    if (onClose) onClose();
  };

  // Categories list
  const categories = useMemo(() => {
    const set = new Set(['ALL']);
    rules.forEach((r) => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set);
  }, [rules]);

  // Filtered rules
  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      const isBuiltin = r.isBuiltin || r.is_builtin || false;
      if (activeTab === 'builtin' && !isBuiltin) return false;
      if (activeTab === 'custom' && isBuiltin) return false;

      if (selectedCategory !== 'ALL' && r.category !== selectedCategory) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = String(r.name || '').toLowerCase().includes(q);
        const matchDesc = String(r.description || '').toLowerCase().includes(q);
        const matchPat = String(r.pattern || '').toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchPat) return false;
      }

      return true;
    });
  }, [rules, activeTab, selectedCategory, searchTerm]);

  if (!isOpen && !embedded) return null;

  const catalogContent = (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: embedded ? '100%' : '860px',
        maxHeight: embedded ? 'none' : '90vh',
        background: 'linear-gradient(180deg, #0f172a 0%, #090d16 100%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '14px',
        boxShadow: embedded ? 'none' : '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 30px rgba(6, 182, 212, 0.15)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          background: 'linear-gradient(90deg, #0f172a 0%, #161e38 100%)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              padding: '8px',
              background: 'rgba(6, 182, 212, 0.15)',
              border: '1px solid rgba(6, 182, 212, 0.35)',
              borderRadius: '10px',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BookOpen size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                Dynamic Extraction Rules Catalog
              </h3>
              <span
                style={{
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: 'rgba(6, 182, 212, 0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(6, 182, 212, 0.35)',
                }}
              >
                {rules.length} Rules
              </span>
            </div>
            <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
              Prebuilt and custom Schema-on-Read parsers applied automatically across log streams.
            </p>
          </div>
        </div>
        {onClose && !embedded && (
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Toolbar & Filter Bar */}
      <div
        style={{
          padding: '12px 20px',
          background: 'rgba(7, 11, 20, 0.8)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        {/* Tabs */}
        <div
          style={{
            background: 'rgba(2, 6, 23, 0.6)',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            gap: '3px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: activeTab === 'all' ? 700 : 500,
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'all' ? '#4f46e5' : 'transparent',
              color: activeTab === 'all' ? '#ffffff' : '#94a3b8',
              transition: 'all 0.2s',
            }}
          >
            All ({rules.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('builtin')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: activeTab === 'builtin' ? 700 : 500,
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'builtin' ? '#4f46e5' : 'transparent',
              color: activeTab === 'builtin' ? '#ffffff' : '#94a3b8',
              transition: 'all 0.2s',
            }}
          >
            Built-in Templates
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: activeTab === 'custom' ? 700 : 500,
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'custom' ? '#4f46e5' : 'transparent',
              color: activeTab === 'custom' ? '#ffffff' : '#94a3b8',
              transition: 'all 0.2s',
            }}
          >
            Custom Rules
          </button>
        </div>

        {/* Search & Category Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, maxWidth: '420px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
              }}
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search templates & fields..."
              style={{
                width: '100%',
                padding: '7px 12px 7px 32px',
                backgroundColor: '#070b14',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#f1f5f9',
                fontFamily: '"Fira Code", monospace',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              backgroundColor: '#070b14',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '7px 12px',
              fontSize: '12px',
              color: '#f1f5f9',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* New Rule Button */}
        {onOpenNewRuleModal && (
          <button
            type="button"
            onClick={() => {
              if (onClose && !embedded) onClose();
              onOpenNewRuleModal();
            }}
            style={{
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              border: 'none',
              color: '#ffffff',
              borderRadius: '8px',
              padding: '7px 14px',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
            }}
          >
            <Plus size={14} />
            <span>New Rule</span>
          </button>
        )}
      </div>

      {/* Rules Grid / List */}
      <div
        style={{
          padding: '20px',
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxHeight: embedded ? '600px' : 'calc(90vh - 180px)',
        }}
      >
        {filteredRules.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
            <Code2 size={40} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#94a3b8' }}>
              No extraction rules matched your query.
            </p>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              Try adjusting the search filter or create a new custom rule.
            </p>
          </div>
        ) : (
          filteredRules.map((rule) => {
            const isEnabled = rule.isEnabled !== false && rule.is_enabled !== false;
            const isBuiltin = rule.isBuiltin || rule.is_builtin;

            return (
              <div
                key={rule.id || rule.name}
                style={{
                  padding: '14px 16px',
                  borderRadius: '10px',
                  background: isEnabled ? 'rgba(15, 23, 42, 0.65)' : 'rgba(10, 15, 29, 0.35)',
                  border: isEnabled ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(255, 255, 255, 0.03)',
                  opacity: isEnabled ? 1 : 0.6,
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                        {rule.name}
                      </span>
                      {isBuiltin ? (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(52, 211, 153, 0.15)',
                            color: '#34d399',
                            border: '1px solid rgba(52, 211, 153, 0.3)',
                          }}
                        >
                          Built-in
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(192, 132, 252, 0.15)',
                            color: '#c084fc',
                            border: '1px solid rgba(192, 132, 252, 0.3)',
                          }}
                        >
                          Custom
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: '10px',
                          fontFamily: 'monospace',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor: '#0f172a',
                          color: '#94a3b8',
                          border: '1px solid #1e293b',
                        }}
                      >
                        {rule.category || 'General'}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontFamily: 'monospace',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(99, 102, 241, 0.15)',
                          color: '#818cf8',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                        }}
                      >
                        {rule.ruleType || rule.rule_type || 'regex'}
                      </span>
                    </div>

                    <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                      {rule.description}
                    </p>

                    {/* Pattern Code Preview */}
                    <div
                      style={{
                        marginTop: '4px',
                        backgroundColor: '#050811',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        fontFamily: '"Fira Code", monospace',
                        fontSize: '11px',
                        color: '#fbbf24',
                        overflowX: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                      }}
                    >
                      <code>{rule.pattern || rule.Pattern}</code>
                    </div>

                    {/* Extracted Fields Pills */}
                    {rule.fields && Array.isArray(rule.fields) && rule.fields.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', paddingTop: '2px' }}>
                        <span style={{ fontSize: '10px', color: '#64748b' }}>Fields:</span>
                        {rule.fields.map((f) => (
                          <span
                            key={f}
                            style={{
                              fontSize: '10px',
                              fontFamily: 'monospace',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(99, 102, 241, 0.15)',
                              color: '#a5b4fc',
                              border: '1px solid rgba(99, 102, 241, 0.3)',
                            }}
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions on right */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleToggleRule(rule)}
                      title={isEnabled ? 'Disable Rule' : 'Enable Rule'}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: isEnabled ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: isEnabled ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                        color: isEnabled ? '#34d399' : '#64748b',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Power size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyQuery(rule)}
                      title="Copy Mini-SPL Query"
                      style={{
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: copiedId === rule.id ? '#34d399' : '#94a3b8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {copiedId === rule.id ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleApplyToSearch(rule)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid rgba(6, 182, 212, 0.4)',
                        background: 'rgba(6, 182, 212, 0.18)',
                        color: '#38bdf8',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Zap size={13} />
                      <span>Apply</span>
                    </button>

                    {!isBuiltin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule.id)}
                        title="Delete Custom Rule"
                        style={{
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#f87171',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '14px 20px',
          backgroundColor: '#070b14',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: '12px', color: '#64748b' }}>
          Active rules are applied dynamically in real-time without modifying raw database storage.
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              color: '#f1f5f9',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              cursor: 'pointer',
            }}
          >
            {embedded ? 'Back to Live Stream' : 'Close'}
          </button>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div style={{ width: '100%' }}>
        {catalogContent}
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      {catalogContent}
    </div>
  );
}

