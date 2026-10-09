import React, { useEffect, useState, useRef, useMemo } from 'react';
import { 
  FileText, 
  Search, 
  RefreshCw, 
  Play, 
  Pause, 
  Download, 
  Copy, 
  Check, 
  X, 
  Filter, 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  Terminal, 
  LayoutList, 
  Sliders, 
  Clock, 
  ShieldAlert,
  HardDrive,
  Cpu,
  Layers,
  ChevronRight,
  Sparkles,
  TerminalSquare,
  BookOpen
} from 'lucide-react';
import { apiClient } from '../../../api/client.js';
import { useDashboardStore } from '../../../store/dashboardStore.jsx';
import { executeMiniSPL, parseSPLPipeline } from '../../../utils/miniSPL.js';
import MiniSPLStatsWidget from '../../logs/MiniSPLStatsWidget.jsx';
import VisualFieldExtractorModal from '../../logs/VisualFieldExtractorModal.jsx';
import SavedExtractionRulesCatalog from '../../logs/SavedExtractionRulesCatalog.jsx';
import DiscoveredFieldsSidebar from '../../logs/DiscoveredFieldsSidebar.jsx';

export default function LogsTab({ machine }) {
  const machineId = machine?.id || machine?.ID || machine?.Id;
  const { addToast } = useDashboardStore();

  // Logs Dataset
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Mini-SPL Query Engine
  const [splQuery, setSplQuery] = useState('');
  const [activeDrilldown, setActiveDrilldown] = useState(null);

  // Pillar 2: Schema-on-Read states
  const [isExtractorOpen, setIsExtractorOpen] = useState(false);
  const [extractorLogText, setExtractorLogText] = useState('');
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isFieldsSidebarOpen, setIsFieldsSidebarOpen] = useState(true);

  // Live Stream Controls
  const [isLiveStreaming, setIsLiveStreaming] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [tailLimit, setTailLimit] = useState('100');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('ALL'); // 'ALL' | 'CRITICAL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'
  const [selectedSource, setSelectedSource] = useState('ALL'); // 'ALL' | 'system' | 'agent' | 'auth' | 'docker' | 'network' | 'storage' | 'security' | 'kernel'
  const [viewMode, setViewMode] = useState('terminal'); // 'terminal' | 'table'

  // Modals & Selection
  const [selectedLogEntry, setSelectedLogEntry] = useState(null);
  const [copiedLineId, setCopiedLineId] = useState(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const logContainerRef = useRef(null);

  // Fetch machine logs
  const fetchLogs = async (isBackground = false) => {
    if (!machineId) return;
    if (isBackground) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (selectedLevel !== 'ALL') params.append('level', selectedLevel);
      if (selectedSource !== 'ALL') params.append('source', selectedSource);
      if (searchQuery.trim()) params.append('query', searchQuery.trim());
      params.append('limit', tailLimit);

      const response = await apiClient.get(`/machines/${machineId}/logs?${params.toString()}`);
      let logData = [];
      let totalCount = 0;

      if (Array.isArray(response.data)) {
        logData = response.data;
        totalCount = logData.length;
      } else if (response.data?.logs && Array.isArray(response.data.logs)) {
        logData = response.data.logs;
        totalCount = response.data.total || logData.length;
      }

      setLogs(logData);
      setTotal(totalCount);
    } catch (err) {
      console.error('Failed to fetch machine logs:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to load telemetry logs.';
      setError(errMsg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [machineId, selectedLevel, selectedSource, tailLimit]);

  // Live streaming polling interval
  useEffect(() => {
    if (!isLiveStreaming) return;
    const interval = setInterval(() => {
      fetchLogs(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [isLiveStreaming, machineId, selectedLevel, selectedSource, searchQuery, tailLimit]);

  // Auto-scroll to bottom of terminal when logs update
  useEffect(() => {
    if (autoScroll && logContainerRef.current && viewMode === 'terminal') {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll, viewMode]);

  // Mini-SPL Query Pipeline Execution
  const miniSPLResult = useMemo(() => {
    if (!splQuery.trim()) {
      return { logs, stats: null, pipeline: [] };
    }
    return executeMiniSPL(logs, splQuery);
  }, [logs, splQuery]);

  const splPipeline = useMemo(() => parseSPLPipeline(splQuery), [splQuery]);

  // Filtered & Processed Logs
  const processedLogs = useMemo(() => {
    const baseLogs = splQuery.trim() ? (miniSPLResult.logs || []) : logs;
    return baseLogs.filter(item => {
      // Active histogram bucket drilldown
      if (activeDrilldown) {
        const { field, value } = activeDrilldown;
        const itemVal = item[field] ?? item.extracted?.[field];
        if (String(itemVal) !== String(value)) return false;
      }
      if (selectedLevel !== 'ALL' && !String(item.level).toUpperCase().includes(selectedLevel)) {
        return false;
      }
      if (selectedSource !== 'ALL' && !String(item.source).toLowerCase().includes(selectedSource.toLowerCase())) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const msg = String(item.message || '').toLowerCase();
      const src = String(item.source || '').toLowerCase();
      const lvl = String(item.level || '').toLowerCase();
      return msg.includes(q) || src.includes(q) || lvl.includes(q);
    });
  }, [logs, splQuery, miniSPLResult, activeDrilldown, selectedLevel, selectedSource, searchQuery]);

  // Severity Distribution Breakdown
  const stats = useMemo(() => {
    let critical = 0;
    let errorCount = 0;
    let warn = 0;
    let info = 0;
    let debug = 0;

    logs.forEach(l => {
      const lvl = String(l.level || '').toUpperCase();
      if (lvl.includes('CRIT')) critical++;
      else if (lvl.includes('ERR')) errorCount++;
      else if (lvl.includes('WARN')) warn++;
      else if (lvl.includes('DEB')) debug++;
      else info++;
    });

    return { total: logs.length, critical, errorCount, warn, info, debug };
  }, [logs]);

  // Available Sources/Facilities
  const availableSources = useMemo(() => {
    const set = new Set(['system', 'agent', 'auth', 'docker', 'network', 'storage', 'security', 'kernel']);
    logs.forEach(l => {
      if (l.source) set.add(l.source.toLowerCase());
    });
    return Array.from(set);
  }, [logs]);

  const handleCopyLine = (log) => {
    const line = `[${new Date(log.timestamp || log.created_at).toISOString()}] [${log.level}] [${log.source}] ${log.message}`;
    navigator.clipboard.writeText(line);
    setCopiedLineId(log.id || line);
    setTimeout(() => setCopiedLineId(null), 2000);
  };

  const handleCopyAll = () => {
    const allText = processedLogs.map(l => 
      `[${new Date(l.timestamp || l.created_at).toISOString()}] [${l.level}] [${l.source}] ${l.message}`
    ).join('\n');
    navigator.clipboard.writeText(allText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
    addToast('success', 'Logs Copied', `Copied ${processedLogs.length} log lines to clipboard.`);
  };

  const handleDownloadLogs = () => {
    const allText = processedLogs.map(l => 
      `[${new Date(l.timestamp || l.created_at).toISOString()}] [${l.level}] [${l.source}] ${l.message}`
    ).join('\n');
    const blob = new Blob([allText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `logs-${machine?.hostname || 'machine'}-${new Date().toISOString().slice(0,10)}.log`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addToast('success', 'Download Complete', 'Log stream exported successfully.');
  };

  const getLevelStyle = (level) => {
    const lvl = String(level || '').toUpperCase();
    if (lvl.includes('CRIT')) {
      return { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', text: 'CRITICAL' };
    }
    if (lvl.includes('ERR')) {
      return { color: '#f87171', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', text: 'ERROR' };
    }
    if (lvl.includes('WARN')) {
      return { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.1)', border: 'rgba(251, 191, 36, 0.3)', text: 'WARN' };
    }
    if (lvl.includes('DEB')) {
      return { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.1)', border: 'rgba(168, 85, 247, 0.3)', text: 'DEBUG' };
    }
    return { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.1)', border: 'rgba(56, 189, 248, 0.3)', text: 'INFO' };
  };

  return (
    <div className="enterprise-logs-tab" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      
      {/* ========================================================================= */}
      {/* 1. EXECUTIVE LOG METRICS KPI SUMMARY BAR */}
      {/* ========================================================================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px'
      }}>
        {/* Total Captured Logs Card */}
        <div style={{
          backgroundColor: '#0d1220',
          border: '1px solid var(--border-soft)',
          borderRadius: '12px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '6px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Log Ingestion</span>
            <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '2px 8px',
              backgroundColor: isLiveStreaming ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
              border: isLiveStreaming ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(148, 163, 184, 0.4)',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 700,
              color: isLiveStreaming ? '#22c55e' : 'var(--muted)'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isLiveStreaming ? '#22c55e' : '#94a3b8' }} />
              {isLiveStreaming ? 'Live' : 'Paused'}
            </span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9' }}>
            {total} <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500 }}>events</span>
          </div>
        </div>

        {/* Errors & Critical Card */}
        <div 
          onClick={() => setSelectedLevel(selectedLevel === 'ERROR' ? 'ALL' : 'ERROR')}
          style={{
            backgroundColor: '#0d1220',
            border: selectedLevel === 'ERROR' || selectedLevel === 'CRITICAL' ? '1px solid #ef4444' : '1px solid var(--border-soft)',
            borderRadius: '12px',
            padding: '14px 16px',
            borderLeft: '4px solid #ef4444',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' }}>Errors & Faults</span>
            <AlertCircle size={15} color="#ef4444" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9' }}>
            {stats.errorCount + stats.critical}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
            {stats.critical} Critical • {stats.errorCount} Error
          </div>
        </div>

        {/* Warnings Card */}
        <div 
          onClick={() => setSelectedLevel(selectedLevel === 'WARN' ? 'ALL' : 'WARN')}
          style={{
            backgroundColor: '#0d1220',
            border: selectedLevel === 'WARN' ? '1px solid #fbbf24' : '1px solid var(--border-soft)',
            borderRadius: '12px',
            padding: '14px 16px',
            borderLeft: '4px solid #fbbf24',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase' }}>Warnings</span>
            <AlertTriangle size={15} color="#fbbf24" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9' }}>
            {stats.warn}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
            Threshold & transient anomalies
          </div>
        </div>

        {/* Info & Activity Card */}
        <div 
          onClick={() => setSelectedLevel(selectedLevel === 'INFO' ? 'ALL' : 'INFO')}
          style={{
            backgroundColor: '#0d1220',
            border: selectedLevel === 'INFO' ? '1px solid #38bdf8' : '1px solid var(--border-soft)',
            borderRadius: '12px',
            padding: '14px 16px',
            borderLeft: '4px solid #38bdf8',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>System Info</span>
            <Info size={15} color="#38bdf8" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9' }}>
            {stats.info}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
            Service pulses & audit trails
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1.5 MINI-SPL QUERY BAR & DIAGNOSTIC PRESETS */}
      {/* ========================================================================= */}
      <div style={{
        backgroundColor: '#0a0f1d',
        border: '1px solid rgba(6, 182, 212, 0.35)',
        borderRadius: '12px',
        padding: '12px 16px',
        boxShadow: '0 4px 20px rgba(6, 182, 212, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        {/* Main SPL Query Input Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(6, 182, 212, 0.15)',
            border: '1px solid rgba(6, 182, 212, 0.4)',
            borderRadius: '6px',
            padding: '4px 8px',
            color: '#06b6d4',
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '0.05em',
            flexShrink: 0
          }}>
            <Sparkles size={13} />
            <span>MINI-SPL</span>
          </div>

          <div style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            alignItems: 'center'
          }}>
            <input
              type="text"
              value={splQuery}
              onChange={(e) => setSplQuery(e.target.value)}
              placeholder='Mini-SPL pipeline: e.g. error | stats count by source   OR   extract "(?<user>\S+)" | count() by user'
              style={{
                width: '100%',
                height: '34px',
                backgroundColor: '#070a12',
                border: '1px solid #1a253a',
                borderRadius: '6px',
                color: '#38bdf8',
                padding: '0 28px 0 10px',
                fontFamily: '"Fira Code", monospace',
                fontSize: '12px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {splQuery && (
              <button
                onClick={() => {
                  setSplQuery('');
                  setActiveDrilldown(null);
                }}
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '2px'
                }}
                title="Clear query"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Pillar 2 Quick Schema-on-Read Buttons */}
          <button
            type="button"
            onClick={() => setIsFieldsSidebarOpen(!isFieldsSidebarOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: '34px',
              padding: '0 10px',
              borderRadius: '6px',
              backgroundColor: isFieldsSidebarOpen ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.04)',
              border: isFieldsSidebarOpen ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid #1a253a',
              color: isFieldsSidebarOpen ? '#a5b4fc' : '#94a3b8',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
            title="Toggle Discovered Fields Explorer"
          >
            <Layers size={13} />
            <span>Fields</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCatalogOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: '34px',
              padding: '0 10px',
              borderRadius: '6px',
              backgroundColor: 'rgba(99, 102, 241, 0.12)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              color: '#a5b4fc',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
            title="Open Dynamic Extraction Rules Catalog"
          >
            <BookOpen size={13} />
            <span>Catalog</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const sample = processedLogs[0]?.message || logs[0]?.message || '';
              setExtractorLogText(sample);
              setIsExtractorOpen(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: '34px',
              padding: '0 12px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.25))',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              color: '#c084fc',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
            title="Visual 1-Click Schema-on-Read Extractor"
          >
            <Sparkles size={13} />
            <span>Extract</span>
          </button>
        </div>

        {/* Pipeline Chips & Preset Diagnostic Pills */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          {/* Active Pipeline Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Pipeline:</span>
            {splPipeline.length > 0 ? (
              splPipeline.map((stage, idx) => (
                <span
                  key={idx}
                  style={{
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(56, 189, 248, 0.12)',
                    color: '#38bdf8',
                    border: '1px solid rgba(56, 189, 248, 0.25)'
                  }}
                >
                  | {stage.command || stage.raw}
                </span>
              ))
            ) : (
              <span style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic' }}>Pass-through stream</span>
            )}
          </div>

          {/* Preset Diagnostic Query Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Presets:</span>
            {[
              { label: 'Count by Level', q: '* | stats count by level' },
              { label: 'Errors by Source', q: 'where level="ERROR" | stats count by source' },
              { label: 'Critical Stream', q: 'where level="CRITICAL" | sort -timestamp' },
              { label: 'Extract Codes', q: 'extract regex="status_code=(?<code>[0-9]+)" | stats count by code' }
            ].map((preset, pIdx) => (
              <button
                key={pIdx}
                onClick={() => {
                  setSplQuery(preset.q);
                  setActiveDrilldown(null);
                }}
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  color: splQuery === preset.q ? '#06b6d4' : '#94a3b8',
                  border: splQuery === preset.q ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                  fontSize: '11px',
                  cursor: 'pointer',
                  transition: 'all 0.12s'
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mini-SPL Live Interactive Aggregation Widget */}
      {miniSPLResult?.stats && (
        <MiniSPLStatsWidget
          stats={miniSPLResult.stats}
          activeDrilldown={activeDrilldown}
          onSelectBucket={(bucket) => {
            setActiveDrilldown({
              field: miniSPLResult.stats.field,
              value: bucket.key || bucket.value
            });
          }}
          onClearFilter={() => setActiveDrilldown(null)}
        />
      )}

      {/* ========================================================================= */}
      {/* 2. FILTER, SEARCH & STREAMING TOOLBAR */}
      {/* ========================================================================= */}
      <div style={{
        backgroundColor: '#0d1220',
        border: '1px solid var(--border-soft)',
        borderRadius: '12px',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        {/* Severity Level Filter Buttons */}
        <div style={{ display: 'flex', backgroundColor: 'rgba(255, 255, 255, 0.04)', borderRadius: '8px', border: '1px solid var(--border-soft)', padding: '2px' }}>
          {[
            { id: 'ALL', label: 'All', count: logs.length },
            { id: 'CRITICAL', label: 'Critical', count: stats.critical },
            { id: 'ERROR', label: 'Error', count: stats.errorCount },
            { id: 'WARN', label: 'Warn', count: stats.warn },
            { id: 'INFO', label: 'Info', count: stats.info },
            { id: 'DEBUG', label: 'Debug', count: stats.debug }
          ].map(lvl => {
            const isSelected = selectedLevel === lvl.id;
            return (
              <button
                key={lvl.id}
                onClick={() => setSelectedLevel(lvl.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 10px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: isSelected ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                  color: isSelected ? '#06b6d4' : 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: isSelected ? 700 : 500,
                  transition: 'all 0.15s'
                }}
              >
                {lvl.label}
                {lvl.count > 0 && (
                  <span style={{
                    padding: '1px 5px',
                    borderRadius: '8px',
                    backgroundColor: isSelected ? '#06b6d4' : 'rgba(255,255,255,0.06)',
                    color: isSelected ? '#080c14' : 'var(--text)',
                    fontSize: '10px',
                    fontWeight: 700
                  }}>
                    {lvl.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Source Dropdown & Search & Stream Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          
          {/* Facility / Source Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>Source:</span>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              style={{
                height: '30px',
                backgroundColor: '#0a0e17',
                border: '1px solid var(--border-soft)',
                borderRadius: '6px',
                color: '#38bdf8',
                padding: '0 8px',
                fontSize: '12px',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">All Sources</option>
              {availableSources.map(src => (
                <option key={src} value={src}>{src.toUpperCase()}</option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', width: '190px' }}>
            <Search size={13} style={{ position: 'absolute', left: '9px', top: '9px', color: 'var(--muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search logs..."
              style={{
                width: '100%',
                height: '30px',
                backgroundColor: '#0a0e17',
                border: '1px solid var(--border-soft)',
                borderRadius: '6px',
                color: '#f1f5f9',
                padding: '0 24px 0 28px',
                fontSize: '12px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '6px', top: '6px', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Tail Limit Selector */}
          <select
            value={tailLimit}
            onChange={(e) => setTailLimit(e.target.value)}
            style={{
              height: '30px',
              backgroundColor: '#0a0e17',
              border: '1px solid var(--border-soft)',
              borderRadius: '6px',
              color: 'var(--muted)',
              padding: '0 6px',
              fontSize: '11px',
              fontWeight: 600,
              outline: 'none',
              cursor: 'pointer'
            }}
            title="Max lines to load"
          >
            <option value="50">50 lines</option>
            <option value="100">100 lines</option>
            <option value="250">250 lines</option>
            <option value="500">500 lines</option>
          </select>

          {/* Live Play / Pause Button */}
          <button
            onClick={() => setIsLiveStreaming(!isLiveStreaming)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '0 10px',
              height: '30px',
              backgroundColor: isLiveStreaming ? 'rgba(34, 197, 94, 0.12)' : 'rgba(255, 255, 255, 0.05)',
              border: isLiveStreaming ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid var(--border-soft)',
              borderRadius: '6px',
              color: isLiveStreaming ? '#22c55e' : 'var(--text)',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
            title={isLiveStreaming ? 'Pause live stream polling' : 'Resume live stream'}
          >
            {isLiveStreaming ? <Pause size={12} /> : <Play size={12} fill="#22c55e" />}
            {isLiveStreaming ? 'Streaming' : 'Paused'}
          </button>

          {/* Copy All */}
          <button
            onClick={handleCopyAll}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '0 10px',
              height: '30px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-soft)',
              borderRadius: '6px',
              color: copiedAll ? '#34d399' : 'var(--text)',
              fontSize: '11px',
              cursor: 'pointer'
            }}
            title="Copy all filtered logs"
          >
            {copiedAll ? <Check size={12} /> : <Copy size={12} />}
            {copiedAll ? 'Copied' : 'Copy'}
          </button>

          {/* Download */}
          <button
            onClick={handleDownloadLogs}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '0 10px',
              height: '30px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-soft)',
              borderRadius: '6px',
              color: 'var(--text)',
              fontSize: '11px',
              cursor: 'pointer'
            }}
            title="Download log file"
          >
            <Download size={12} />
          </button>

          {/* Refresh */}
          <button
            onClick={() => fetchLogs(true)}
            disabled={refreshing}
            style={{
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-soft)',
              borderRadius: '6px',
              color: 'var(--text)',
              cursor: refreshing ? 'not-allowed' : 'pointer'
            }}
            title="Manual sync"
          >
            <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
          </button>

          {/* View Mode Switcher */}
          <div style={{ display: 'flex', backgroundColor: 'rgba(255, 255, 255, 0.04)', borderRadius: '6px', border: '1px solid var(--border-soft)', padding: '2px' }}>
            <button
              onClick={() => setViewMode('terminal')}
              style={{
                padding: '3px 7px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: viewMode === 'terminal' ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                color: viewMode === 'terminal' ? '#06b6d4' : 'var(--muted)',
                cursor: 'pointer'
              }}
              title="Terminal Stream View"
            >
              <Terminal size={13} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              style={{
                padding: '3px 7px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: viewMode === 'table' ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                color: viewMode === 'table' ? '#06b6d4' : 'var(--muted)',
                cursor: 'pointer'
              }}
              title="Structured Table View"
            >
              <LayoutList size={13} />
            </button>
          </div>

        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. LOG VIEWER CANVAS WITH DISCOVERED FIELDS SIDEBAR */}
      {/* ========================================================================= */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        {/* Discovered Fields Sidebar */}
        {isFieldsSidebarOpen && (
          <DiscoveredFieldsSidebar
            discoveredFields={miniSPLResult?.discoveredFields || []}
            isOpen={isFieldsSidebarOpen}
            onToggleOpen={() => setIsFieldsSidebarOpen(!isFieldsSidebarOpen)}
            onSelectFieldFilter={(field, val, type) => {
              const isNum = type === 'number';
              const filterPart = isNum ? `${field}:${val}` : `${field}:"${val}"`;
              setSplQuery((prev) => (prev ? `${prev} ${filterPart}` : filterPart));
            }}
            onAggregateField={(field) => {
              setSplQuery((prev) => (prev ? `${prev} | stats count by ${field}` : `* | stats count by ${field}`));
            }}
          />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {viewMode === 'terminal' ? (
            <div 
              ref={logContainerRef}
              style={{
                backgroundColor: '#070a11',
                border: '1px solid var(--border-soft)',
                borderRadius: '12px',
                padding: '16px',
                minHeight: '480px',
                maxHeight: '620px',
                overflowY: 'auto',
                fontFamily: '"Fira Code", Menlo, Monaco, Consolas, monospace',
                fontSize: '12px',
                lineHeight: 1.6,
                boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.6)'
              }}
            >
              {loading && logs.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: '#06b6d4', gap: '8px' }}>
                  <RefreshCw size={18} className="spin" />
                  <span>Connecting to host telemetry log buffer...</span>
                </div>
              ) : processedLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px', color: 'var(--muted)' }}>
                  No log entries match the current filter criteria.
                </div>
              ) : (
                processedLogs.map((log, index) => {
                  const lvlStyle = getLevelStyle(log.level);
                  const isCopied = copiedLineId === (log.id || index);
                  const ts = log.timestamp || log.created_at;
                  const formattedTime = ts ? new Date(ts).toISOString().replace('T', ' ').replace('Z', '') : '0000-00-00 00:00:00';

                  return (
                    <div
                      key={log.id || index}
                      onClick={() => setSelectedLogEntry(log)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        padding: '3px 6px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'background-color 0.12s'
                      }}
                      className="terminal-log-row"
                    >
                      {/* Timestamp */}
                      <span style={{ color: '#64748b', userSelect: 'none', flexShrink: 0 }}>
                        {formattedTime}
                      </span>

                      {/* Level Badge */}
                      <span style={{
                        color: lvlStyle.color,
                        fontWeight: 700,
                        minWidth: '55px',
                        flexShrink: 0,
                        userSelect: 'none'
                      }}>
                        [{lvlStyle.text}]
                      </span>

                      {/* Source / Facility */}
                      <span style={{
                        color: '#94a3b8',
                        backgroundColor: 'rgba(255,255,255,0.03)',
                        padding: '0 4px',
                        borderRadius: '3px',
                        fontSize: '11px',
                        flexShrink: 0,
                        userSelect: 'none'
                      }}>
                        [{log.source || 'sys'}]
                      </span>

                      {/* Log Message */}
                      <span style={{ color: '#e2e8f0', flex: 1, wordBreak: 'break-word' }}>
                        {log.message}
                      </span>

                      {/* Quick Extract Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExtractorLogText(log.message || log.text || log.raw_log || '');
                          setIsExtractorOpen(true);
                        }}
                        style={{
                          background: 'rgba(99, 102, 241, 0.15)',
                          border: '1px solid rgba(99, 102, 241, 0.35)',
                          color: '#c084fc',
                          cursor: 'pointer',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 700,
                          flexShrink: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px'
                        }}
                        className="log-extract-btn"
                        title="Extract dynamic field from this log entry"
                      >
                        <Sparkles size={10} />
                        <span>Extract</span>
                      </button>

                      {/* Quick Copy on Hover */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyLine(log);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: isCopied ? '#34d399' : 'var(--muted)',
                          cursor: 'pointer',
                          opacity: 0.4,
                          padding: '2px',
                          flexShrink: 0
                        }}
                        className="log-copy-btn"
                        title="Copy this line"
                      >
                        {isCopied ? <Check size={11} /> : <Copy size={11} />}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* Structured Table Mode */
            <div style={{ backgroundColor: '#0d1220', border: '1px solid var(--border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                    <th style={{ width: '170px', padding: '10px 14px' }}>Timestamp</th>
                    <th style={{ width: '90px', padding: '10px 14px' }}>Level</th>
                    <th style={{ width: '100px', padding: '10px 14px' }}>Source</th>
                    <th style={{ padding: '10px 14px' }}>Message</th>
                    <th style={{ width: '100px', padding: '10px 14px', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {processedLogs.map((log, index) => {
                    const lvlStyle = getLevelStyle(log.level);
                    return (
                      <tr 
                        key={log.id || index}
                        onClick={() => setSelectedLogEntry(log)}
                        style={{ borderBottom: '1px solid var(--border-soft)', cursor: 'pointer' }}
                        className="terminal-log-row"
                      >
                        <td style={{ padding: '10px 14px', color: 'var(--muted)', fontFamily: 'monospace' }}>
                          {new Date(log.timestamp || log.created_at).toLocaleString()}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: lvlStyle.bg,
                            color: lvlStyle.color,
                            border: `1px solid ${lvlStyle.border}`
                          }}>
                            {lvlStyle.text}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#38bdf8', fontFamily: 'monospace' }}>
                          {log.source || 'system'}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#f1f5f9' }}>
                          {log.message}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExtractorLogText(log.message || log.text || log.raw_log || '');
                              setIsExtractorOpen(true);
                            }}
                            style={{
                              background: 'rgba(99, 102, 241, 0.15)',
                              border: '1px solid rgba(99, 102, 241, 0.35)',
                              color: '#c084fc',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px'
                            }}
                            title="Extract dynamic field"
                          >
                            <Sparkles size={10} />
                            <span>Extract</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. BOTTOM STATUS BAR & BUFFER STATS */}
      {/* ========================================================================= */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        backgroundColor: '#0a0e17',
        border: '1px solid var(--border-soft)',
        borderRadius: '8px',
        fontSize: '12px',
        color: 'var(--muted)'
      }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <span>Displaying <strong>{processedLogs.length}</strong> of <strong>{total}</strong> log entries</span>
          <span>Target Buffer: <strong>{tailLimit} lines</strong></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            Auto-scroll to bottom
          </label>
          <span>Host: <strong style={{ color: '#06b6d4' }}>{machine?.hostname || machine?.ip_address || 'Connected Node'}</strong></span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: IN-DEPTH LOG ENTRY DETAILS INSPECTOR */}
      {/* ========================================================================= */}
      {selectedLogEntry && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '24px'
        }}>
          <div style={{
            backgroundColor: '#0d1220',
            border: '1px solid var(--border-soft)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)'
          }}>
            <div style={{
              padding: '16px 20px',
              backgroundColor: '#111827',
              borderBottom: '1px solid var(--border-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={18} color="#06b6d4" />
                <h3 style={{ margin: 0, fontSize: '15px', color: '#f1f5f9', fontWeight: 700 }}>
                  Log Event Inspector
                </h3>
              </div>
              <button 
                onClick={() => setSelectedLogEntry(null)} 
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Event Metadata Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>Timestamp (ISO)</span>
                  <strong style={{ fontSize: '12px', color: '#f1f5f9', fontFamily: 'monospace' }}>
                    {new Date(selectedLogEntry.timestamp || selectedLogEntry.created_at).toISOString()}
                  </strong>
                </div>
                <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>Severity Level</span>
                  <span style={{
                    display: 'inline-block',
                    marginTop: '2px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: getLevelStyle(selectedLogEntry.level).bg,
                    color: getLevelStyle(selectedLogEntry.level).color
                  }}>
                    {selectedLogEntry.level}
                  </span>
                </div>
                <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>Facility / Source</span>
                  <strong style={{ fontSize: '12px', color: '#38bdf8' }}>{selectedLogEntry.source}</strong>
                </div>
                <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>Host / Node</span>
                  <strong style={{ fontSize: '12px', color: '#f1f5f9' }}>{selectedLogEntry.hostname || machine?.hostname || 'Node'}</strong>
                </div>
              </div>

              {/* Message Banner */}
              <div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
                  Payload Message
                </span>
                <div style={{
                  padding: '12px 14px',
                  backgroundColor: '#070a11',
                  border: '1px solid var(--border-soft)',
                  borderRadius: '6px',
                  color: '#e2e8f0',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  lineHeight: 1.5
                }}>
                  {selectedLogEntry.message}
                </div>

                {/* Extract Fields Action Button */}
                <div style={{ marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setExtractorLogText(selectedLogEntry.message || '');
                      setSelectedLogEntry(null);
                      setIsExtractorOpen(true);
                    }}
                    style={{
                      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.25))',
                      border: '1px solid rgba(168, 85, 247, 0.4)',
                      color: '#c084fc',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Sparkles size={12} />
                    <span>Extract Dynamic Fields from This Log</span>
                  </button>
                </div>
              </div>

              {/* Raw JSON */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)' }}>Raw Event JSON</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(selectedLogEntry, null, 2));
                      addToast('success', 'Copied', 'JSON payload copied to clipboard');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#06b6d4',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                  >
                    <Copy size={11} /> Copy JSON
                  </button>
                </div>
                <pre style={{
                  padding: '12px',
                  backgroundColor: '#070a11',
                  borderRadius: '6px',
                  color: '#a5f3fc',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  overflowX: 'auto',
                  maxHeight: '180px',
                  margin: 0
                }}>
                  {JSON.stringify(selectedLogEntry, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Visual Field Extractor Modal (Pillar 2) */}
      <VisualFieldExtractorModal
        isOpen={isExtractorOpen}
        onClose={() => setIsExtractorOpen(false)}
        sampleLogText={extractorLogText}
        logsBuffer={logs}
        onApplyQuery={(q) => {
          setSplQuery((prev) => (prev ? `${prev} | ${q}` : q));
        }}
      />

      {/* Saved Extraction Rules Catalog (Pillar 2) */}
      <SavedExtractionRulesCatalog
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
        onApplyQuery={(q) => {
          setSplQuery((prev) => (prev ? `${prev} | ${q}` : q));
        }}
        onOpenNewRuleModal={() => {
          setExtractorLogText(processedLogs[0]?.message || logs[0]?.message || '');
          setIsExtractorOpen(true);
        }}
      />

      {/* Internal Custom CSS */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
        .terminal-log-row:hover { 
          background-color: rgba(255, 255, 255, 0.05) !important; 
        }
        .terminal-log-row:hover .log-copy-btn,
        .terminal-log-row:hover .log-extract-btn {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
}
