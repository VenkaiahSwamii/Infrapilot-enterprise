import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Sparkles,
  X,
  Check,
  Play,
  Save,
  Code2,
  HelpCircle,
  Layers,
  Search,
  Filter,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ArrowRight,
  Database
} from 'lucide-react';
import { synthesizeRegexFromSelection, normalizeRegexNamedGroups } from '../../utils/miniSPL.js';
import { apiClient } from '../../api/client.js';

export default function VisualFieldExtractorModal({
  isOpen,
  onClose,
  sampleLogText = '',
  logsBuffer = [],
  onApplyQuery,
  onRuleSaved
}) {
  const [logText, setLogText] = useState(sampleLogText || '');
  const [selectedText, setSelectedText] = useState('');
  const [selectionRange, setSelectionRange] = useState({ start: 0, end: 0 });
  const [fieldName, setFieldName] = useState('extracted_field');
  const [inferredType, setInferredType] = useState('string');
  const [customRegex, setCustomRegex] = useState('');
  const [isManualRegex, setIsManualRegex] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [ruleScope, setRuleScope] = useState('all'); // 'all' | 'service' | 'source'

  const logDisplayRef = useRef(null);

  // Sync incoming log text
  useEffect(() => {
    if (sampleLogText) {
      setLogText(sampleLogText);
      setSelectedText('');
      setSelectionRange({ start: 0, end: 0 });
      setCustomRegex('');
      setIsManualRegex(false);
      setSaveSuccess(false);
    }
  }, [sampleLogText, isOpen]);

  // Handle text selection inside the preview block
  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const rawSelected = selection.toString().trim();
    if (!rawSelected) return;

    const fullStr = logText;
    const idx = fullStr.indexOf(rawSelected);
    if (idx !== -1) {
      setSelectedText(rawSelected);
      setSelectionRange({ start: idx, end: idx + rawSelected.length });

      // Auto synthesize regex
      const synth = synthesizeRegexFromSelection(fullStr, rawSelected, fieldName, {
        startIndex: idx,
        endIndex: idx + rawSelected.length
      });

      if (synth.isValid) {
        setCustomRegex(synth.regexPattern);
        if (synth.cleanFieldName && synth.cleanFieldName !== 'field') {
          setFieldName(synth.cleanFieldName);
        }
        setInferredType(synth.inferredType);
        setIsManualRegex(false);
      }
    }
  };

  // Re-synthesize when field name or inferred type changes
  const handleFieldNameChange = (newName) => {
    const clean = newName.replace(/[^a-zA-Z0-9_]/g, '_');
    setFieldName(clean);
    if (selectedText && !isManualRegex) {
      const synth = synthesizeRegexFromSelection(logText, selectedText, clean, {
        startIndex: selectionRange.start,
        endIndex: selectionRange.end,
        inferredType
      });
      if (synth.isValid) {
        setCustomRegex(synth.regexPattern);
      }
    }
  };

  // Live matching preview across active buffer
  const matchEvaluation = useMemo(() => {
    if (!customRegex.trim()) {
      return { matchesCount: 0, totalCount: logsBuffer.length, matchPercentage: 0, sampleMatches: [] };
    }

    try {
      const normalized = normalizeRegexNamedGroups(customRegex);
      const rx = new RegExp(normalized, 'i');
      const total = logsBuffer.length || 1;
      let matchedCount = 0;
      const samples = [];

      for (const item of logsBuffer) {
        const text = String(item.message || item.text || item.raw_log || '');
        const m = rx.exec(text);
        if (m) {
          matchedCount++;
          if (samples.length < 5) {
            samples.push({
              log: text,
              extractedValue: m.groups?.[fieldName] || (m.length > 1 ? m[1] : m[0]),
              hostname: item.hostname || 'node',
              level: item.level || 'INFO'
            });
          }
        }
      }

      const matchPercentage = Math.round((matchedCount / total) * 100);
      return { matchesCount: matchedCount, totalCount: total, matchPercentage, sampleMatches: samples, isValidRegex: true };
    } catch (err) {
      return { matchesCount: 0, totalCount: logsBuffer.length, matchPercentage: 0, sampleMatches: [], isValidRegex: false, error: err.message };
    }
  }, [customRegex, fieldName, logsBuffer]);

  // Insert extraction stage into search query
  const handleInsertQuery = () => {
    if (!customRegex.trim()) return;
    const escapedQuery = `extract "${customRegex.replace(/"/g, '\\"')}"`;
    if (onApplyQuery) {
      onApplyQuery(escapedQuery);
    }
    onClose();
  };

  // Save extraction rule to backend database & local registry
  const handleSaveRule = async () => {
    if (!customRegex.trim() || !fieldName.trim()) return;
    setSavingRule(true);
    setSaveSuccess(false);

    const payload = {
      name: `Extract ${fieldName}`,
      description: `Auto-generated Schema-on-Read rule for field '${fieldName}'`,
      category: 'Dynamic',
      rule_type: 'regex',
      pattern: customRegex,
      field_names: fieldName,
      sample_log: logText,
      source: ruleScope === 'source' ? (sampleLogText ? 'auth' : 'all') : 'all',
      service: ruleScope === 'service' ? 'custom' : 'all',
      is_enabled: true
    };

    try {
      // 1. Save to Backend API
      await apiClient.post('/logs/extraction-rules', payload);
      setSaveSuccess(true);
      if (onRuleSaved) onRuleSaved(payload);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1200);
    } catch (err) {
      console.warn('Backend rule persistence fallback to localStorage:', err);
      // Fallback: save to LocalStorage
      try {
        const local = JSON.parse(localStorage.getItem('infrapilot_custom_extraction_rules') || '[]');
        local.push({ ...payload, id: `local_${Date.now()}` });
        localStorage.setItem('infrapilot_custom_extraction_rules', JSON.stringify(local));
        setSaveSuccess(true);
        if (onRuleSaved) onRuleSaved(payload);
        setTimeout(() => {
          setSaveSuccess(false);
          onClose();
        }, 1200);
      } catch (e) {
        console.error('Failed to save rule locally:', e);
      }
    } finally {
      setSavingRule(false);
    }
  };

  if (!isOpen) return null;

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
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          background: 'linear-gradient(180deg, #0f172a 0%, #090d16 100%)',
          border: '1px solid rgba(99, 102, 241, 0.35)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 30px rgba(99, 102, 241, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            background: 'linear-gradient(90deg, #0f172a 0%, #1e1b4b 100%)',
            borderBottom: '1px solid rgba(99, 102, 241, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                padding: '8px',
                background: 'rgba(99, 102, 241, 0.2)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                borderRadius: '10px',
                color: '#a5b4fc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                  Visual Field Extractor
                </h3>
                <span
                  style={{
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    backgroundColor: 'rgba(99, 102, 241, 0.2)',
                    color: '#c7d2fe',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                  }}
                >
                  Pillar 2 Schema-on-Read
                </span>
              </div>
              <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                Highlight text in the log sample below to automatically synthesize named regular expressions.
              </p>
            </div>
          </div>
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
        </div>

        {/* Content Body */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            flex: 1,
          }}
        >
          {/* Step 1: Interactive Log Text Selection Canvas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: 'rgba(99, 102, 241, 0.25)',
                    color: '#a5b4fc',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    fontWeight: 800,
                  }}
                >
                  1
                </span>
                Sample Log Line (Highlight text to extract)
              </span>
              {selectedText && (
                <span style={{ color: '#34d399', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'none', fontWeight: 500 }}>
                  <Check size={14} /> Selected: <strong style={{ color: '#6ee7b7' }}>"{selectedText}"</strong>
                </span>
              )}
            </div>

            <div
              ref={logDisplayRef}
              onMouseUp={handleTextSelection}
              style={{
                padding: '12px 16px',
                backgroundColor: '#050811',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                fontFamily: '"Fira Code", monospace, Consolas',
                fontSize: '12px',
                color: '#e2e8f0',
                lineHeight: 1.6,
                cursor: 'text',
                userSelect: 'text',
                minHeight: '48px',
                wordBreak: 'break-all',
              }}
            >
              {logText}
            </div>
            <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
              💡 Tip: Click and drag over any IP, UUID, status code, latency metric, or keyword in the text above.
            </p>
          </div>

          {/* Step 2: Field Naming & Inferred Type */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: 'rgba(99, 102, 241, 0.25)',
                    color: '#a5b4fc',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    fontWeight: 800,
                  }}
                >
                  2
                </span>
                Target Field Name
              </label>
              <input
                type="text"
                value={fieldName}
                onChange={(e) => handleFieldNameChange(e.target.value)}
                placeholder="e.g. client_ip, status_code, duration_ms"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  backgroundColor: '#050811',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontFamily: '"Fira Code", monospace',
                  color: '#818cf8',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
                Inferred Type
              </label>
              <select
                value={inferredType}
                onChange={(e) => setInferredType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  backgroundColor: '#050811',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#e2e8f0',
                  outline: 'none',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
              >
                <option value="string">String (Text)</option>
                <option value="number">Number (Metric)</option>
                <option value="ip">IPv4 / IPv6</option>
                <option value="uuid">UUID / ID</option>
                <option value="timestamp">Timestamp</option>
              </select>
            </div>
          </div>

          {/* Step 3: Synthesized Regular Expression */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: 'rgba(99, 102, 241, 0.25)',
                    color: '#a5b4fc',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    fontWeight: 800,
                  }}
                >
                  3
                </span>
                Synthesized Named Regex Pattern
              </span>
              <button
                type="button"
                onClick={() => setIsManualRegex(!isManualRegex)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#818cf8',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                {isManualRegex ? 'Auto-Synthesize' : 'Edit Regex Manually'}
              </button>
            </div>

            <textarea
              rows={2}
              value={customRegex}
              onChange={(e) => {
                setCustomRegex(e.target.value);
                setIsManualRegex(true);
              }}
              placeholder='e.g. status=(?<status_code>\d+)'
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: '#050811',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                fontFamily: '"Fira Code", monospace',
                fontSize: '12px',
                color: '#fbbf24',
                outline: 'none',
                resize: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Live Buffer Match Rate & Samples Preview */}
          <div
            style={{
              padding: '14px 16px',
              backgroundColor: 'rgba(5, 8, 17, 0.7)',
              border: '1px solid #1e293b',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: matchEvaluation.matchesCount > 0 ? '#34d399' : '#64748b',
                    boxShadow: matchEvaluation.matchesCount > 0 ? '0 0 8px #34d399' : 'none',
                  }}
                />
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>Live Buffer Match Preview</span>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: '#0f172a',
                  color: '#94a3b8',
                  border: '1px solid #1e293b',
                }}
              >
                Matches: <strong style={{ color: '#34d399' }}>{matchEvaluation.matchesCount}</strong> / {matchEvaluation.totalCount} ({matchEvaluation.matchPercentage}%)
              </span>
            </div>

            {/* Sample extracted badges */}
            {matchEvaluation.sampleMatches.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {matchEvaluation.sampleMatches.slice(0, 3).map((sample, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      backgroundColor: 'rgba(15, 23, 42, 0.8)',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #1e293b',
                      fontFamily: 'monospace',
                    }}
                  >
                    <span style={{ color: '#94a3b8', maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sample.log}
                    </span>
                    <span
                      style={{
                        color: '#34d399',
                        fontWeight: 700,
                        backgroundColor: 'rgba(52, 211, 153, 0.15)',
                        border: '1px solid rgba(52, 211, 153, 0.3)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                      }}
                    >
                      {fieldName}: {sample.extractedValue}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
                No logs match the current pattern. Select a valid substring or refine the regex.
              </p>
            )}
          </div>

        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: '#070b14',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <button
              type="button"
              onClick={handleSaveRule}
              disabled={savingRule || !customRegex.trim() || matchEvaluation.matchesCount === 0}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: savingRule || !customRegex.trim() || matchEvaluation.matchesCount === 0 ? 'not-allowed' : 'pointer',
                opacity: savingRule || !customRegex.trim() || matchEvaluation.matchesCount === 0 ? 0.5 : 1,
                background: saveSuccess
                  ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                  : 'rgba(255, 255, 255, 0.06)',
                color: saveSuccess ? '#ffffff' : '#e2e8f0',
                border: saveSuccess ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                transition: 'all 0.2s',
              }}
            >
              {saveSuccess ? (
                <>
                  <CheckCircle2 size={16} color="#ffffff" />
                  <span>Saved to Catalog!</span>
                </>
              ) : (
                <>
                  <Save size={16} color="#818cf8" />
                  <span>Save Rule to Catalog</span>
                </>
              )}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#94a3b8',
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleInsertQuery}
              disabled={!customRegex.trim()}
              style={{
                padding: '8px 18px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                cursor: !customRegex.trim() ? 'not-allowed' : 'pointer',
                opacity: !customRegex.trim() ? 0.5 : 1,
                transition: 'all 0.2s',
              }}
            >
              <Zap size={15} />
              <span>Apply to Mini-SPL Search</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

