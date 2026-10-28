import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle,
  Clock,
  Filter,
  RefreshCw,
  Search,
  XCircle,
  Sparkles,
  ShieldAlert,
  Server,
  Zap,
  Activity,
  ChevronDown,
  ChevronRight,
  Download,
  Trash2,
  Plus,
  Play,
  Copy,
  Check,
  Cpu,
  HardDrive,
  Database,
  Radio,
  Sliders,
  ExternalLink,
  ShieldCheck,
  Edit3,
} from 'lucide-react';
import { useAlertStore } from '../../store/alertStore.jsx';
import { useDashboardStore } from '../../store/dashboardStore.jsx';
import {
  aiAnalyzeAlert,
  remediateAlert,
  listAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  toggleAlertRule,
  seedAlertRulePresets,
} from '../../api/alerts.js';
import { useRBAC } from '../../hooks/useRBAC.js';

const SEVERITY_CONFIG = {
  critical: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', label: 'P1 CRITICAL', icon: XCircle },
  p1: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', label: 'P1 CRITICAL', icon: XCircle },
  major: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', border: '#f97316', label: 'P2 MAJOR', icon: AlertTriangle },
  p2: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', border: '#f97316', label: 'P2 MAJOR', icon: AlertTriangle },
  warning: { color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)', border: '#eab308', label: 'P3 WARNING', icon: AlertTriangle },
  p3: { color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)', border: '#eab308', label: 'P3 WARNING', icon: AlertTriangle },
  info: { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', border: '#06b6d4', label: 'P4 INFO', icon: Bell },
  p4: { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', border: '#06b6d4', label: 'P4 INFO', icon: Bell },
};

export default function AlertsPage() {
  const navigate = useNavigate();
  const { isOperator } = useRBAC();
  const {
    alerts,
    stats,
    activeCount,
    criticalCount,
    loading,
    error,
    fetchAlerts,
    fetchStats,
    acknowledgeAlert,
    resolveAlert,
    silenceAlert,
    bulkAcknowledge,
    bulkResolve,
    purgeResolved,
  } = useAlertStore();

  const { addToast } = useDashboardStore();

  // Top-Level Navigation Mode: 'alerts' vs 'rules'
  const [activeView, setActiveView] = useState('alerts'); // 'alerts' | 'rules'
  const [rulesSearch, setRulesSearch] = useState('');

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState('active'); // active, critical, warning, acknowledged, resolved, silenced
  const [sourceFilter, setSourceFilter] = useState('all'); // all, rules, events
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedMachine, setSelectedMachine] = useState('all');
  const [refreshInterval, setRefreshInterval] = useState('10s');
  const [selectedAlertIds, setSelectedAlertIds] = useState(new Set());

  // AI & Remediation Drawer State
  const [activeAIModal, setActiveAIModal] = useState(null); // alert object
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [remediating, setRemediating] = useState(false);
  const [remediationResult, setRemediationResult] = useState(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [resolutionNoteInput, setResolutionNoteInput] = useState('');

  // Alert Rules State
  const [rules, setRules] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [seedingPresets, setSeedingPresets] = useState(false);
  const [showCreateRuleModal, setShowCreateRuleModal] = useState(false);
  const [showEditRuleModal, setShowEditRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [newRule, setNewRule] = useState({
    name: '',
    metric: 'cpu_usage',
    operator: '>',
    threshold: 90,
    value: 90,
    severity: 'critical',
    target_scope: 'all',
    target_machine_id: '',
    target_os: '',
    consecutive_breaches: 2,
  });

  // Load alert rules
  const fetchRules = useCallback(async () => {
    try {
      setRulesLoading(true);
      const data = await listAlertRules();
      setRules(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    } finally {
      setRulesLoading(false);
    }
  }, []);

  // Fetch rules on initial mount
  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  useEffect(() => {
    if (activeView === 'rules') {
      fetchRules();
    }
  }, [activeView, fetchRules]);

  // Filtered Rules
  const filteredRules = useMemo(() => {
    if (!rulesSearch.trim()) return rules;
    const q = rulesSearch.toLowerCase();
    return rules.filter((r) => {
      const name = (r.name || '').toLowerCase();
      const metric = (r.metric || '').toLowerCase();
      const scope = (r.target_scope || '').toLowerCase();
      const sev = (r.severity || '').toLowerCase();
      return name.includes(q) || metric.includes(q) || scope.includes(q) || sev.includes(q);
    });
  }, [rules, rulesSearch]);

  // Auto-refresh interval
  useEffect(() => {
    if (refreshInterval === 'off') return;
    const ms = refreshInterval === '5s' ? 5000 : refreshInterval === '10s' ? 10000 : 30000;
    const timer = setInterval(() => {
      fetchAlerts({ status: 'all', limit: 300 });
    }, ms);
    return () => clearInterval(timer);
  }, [refreshInterval, statusFilter, fetchAlerts]);

  // Unique machines for filtering
  const machineList = useMemo(() => {
    const map = new Map();
    alerts.forEach((a) => {
      const id = a.machine_id || a.MachineID;
      const name = a.hostname || a.machine_name || 'Machine ' + (id ? String(id).slice(0, 6) : '');
      if (id && !map.has(id)) {
        map.set(id, name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [alerts]);

  // Filtered Alert List
  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      const st = (a.status || 'open').toLowerCase();
      const sev = (a.severity || 'info').toLowerCase();
      const pri = (a.priority || '').toUpperCase();
      const cat = (a.category || a.type || '').toLowerCase();
      const mId = a.machine_id || a.MachineID;

      // Source / Origin filter: 'all' | 'rules' | 'events'
      const isEvent = (a.source || '').toUpperCase() === 'EVENT' || (a.origin || '').toLowerCase() === 'event';
      if (sourceFilter === 'events' && !isEvent) return false;
      if (sourceFilter === 'rules' && isEvent) return false;

      // Status filter
      if (statusFilter === 'active') {
        if (st !== 'open' && st !== 'active') return false;
      } else if (statusFilter === 'critical') {
        if ((st !== 'open' && st !== 'active') || (sev !== 'critical' && pri !== 'P1')) return false;
      } else if (statusFilter === 'warning') {
        if ((st !== 'open' && st !== 'active') || (sev !== 'warning' && sev !== 'major' && pri !== 'P2' && pri !== 'P3')) return false;
      } else if (statusFilter === 'acknowledged') {
        if (st !== 'acknowledged') return false;
      } else if (statusFilter === 'resolved') {
        if (st !== 'resolved') return false;
      } else if (statusFilter === 'silenced') {
        if (st !== 'silenced') return false;
      }

      // Severity dropdown
      if (severityFilter !== 'all') {
        if (sev !== severityFilter.toLowerCase()) return false;
      }

      // Category filter
      if (categoryFilter !== 'all') {
        if (!cat.includes(categoryFilter.toLowerCase())) return false;
      }

      // Machine filter
      if (selectedMachine !== 'all') {
        if (String(mId) !== String(selectedMachine)) return false;
      }

      // Text search
      if (search.trim()) {
        const q = search.toLowerCase();
        const msg = (a.message || a.description || a.title || '').toLowerCase();
        const host = (a.hostname || a.machine_name || '').toLowerCase();
        const component = (a.component || '').toLowerCase();
        if (!msg.includes(q) && !host.includes(q) && !component.includes(q) && !cat.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [alerts, statusFilter, sourceFilter, severityFilter, categoryFilter, selectedMachine, search]);

  // Bulk selection helpers
  const handleToggleSelect = (id) => {
    setSelectedAlertIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    if (selectedAlertIds.size === filteredAlerts.length) {
      setSelectedAlertIds(new Set());
    } else {
      setSelectedAlertIds(new Set(filteredAlerts.map((a) => a.id || a.ID)));
    }
  };

  // Bulk Actions
  const handleBulkAck = async () => {
    try {
      const ids = Array.from(selectedAlertIds);
      await bulkAcknowledge(ids);
      addToast('success', 'Acknowledged', `${ids.length} alerts acknowledged`);
      setSelectedAlertIds(new Set());
    } catch (err) {
      addToast('error', 'Failed', err.message);
    }
  };

  const handleBulkResolve = async () => {
    try {
      const ids = Array.from(selectedAlertIds);
      await bulkResolve(ids);
      addToast('success', 'Resolved', `${ids.length} alerts resolved`);
      setSelectedAlertIds(new Set());
    } catch (err) {
      addToast('error', 'Failed', err.message);
    }
  };

  // AI Analysis Trigger
  const handleOpenAIAnalysis = async (alert) => {
    setActiveAIModal(alert);
    setAiAnalysis(null);
    setRemediationResult(null);
    setResolutionNoteInput('');
    setAiLoading(true);
    try {
      const res = await aiAnalyzeAlert(alert.id || alert.ID);
      setAiAnalysis(res);
    } catch (err) {
      console.error(err);
    } finally {
      setAiLoading(false);
    }
  };

  // Trigger Remediation
  const handleTriggerRemediation = async (alertId) => {
    try {
      setRemediating(true);
      const res = await remediateAlert(alertId);
      setRemediationResult(res);
      addToast('success', 'Remediation Dispatched', 'Auto-healing job started');
    } catch (err) {
      addToast('error', 'Remediation Error', err.message);
    } finally {
      setRemediating(false);
    }
  };

  // Metric Unit helper
  const getMetricUnit = (metric) => {
    const m = (metric || '').toLowerCase();
    if (m.includes('cpu_temp') || m.includes('temperature')) return '°C';
    if (m.includes('cpu') || m.includes('memory') || m.includes('disk') || m.includes('packet')) return '%';
    if (m.includes('latency')) return 'ms';
    if (m.includes('mbps')) return 'MB/s';
    if (m.includes('bps')) return 'B/s';
    return '';
  };

  // Create Rule Handler
  const handleCreateRuleSubmit = async (e) => {
    e.preventDefault();
    try {
      const parsed = parseFloat(newRule.threshold);
      const val = isNaN(parsed) ? 0 : parsed;
      const payload = {
        ...newRule,
        threshold: val,
        value: val,
      };
      await createAlertRule('default', payload);
      addToast('success', 'Rule Created', `Rule "${newRule.name}" created successfully`);
      setShowCreateRuleModal(false);
      setNewRule({
        name: '',
        metric: 'cpu_usage',
        operator: '>',
        threshold: 90,
        value: 90,
        severity: 'critical',
        target_scope: 'all',
        target_machine_id: '',
        target_os: '',
        consecutive_breaches: 2,
      });
      fetchRules();
    } catch (err) {
      addToast('error', 'Creation Failed', err.message);
    }
  };

  // Toggle Rule Status
  const handleToggleRule = async (rule) => {
    const id = rule.id || rule.ID;
    const currentState = rule.is_enabled !== false;
    const targetState = !currentState;
    try {
      await toggleAlertRule('default', id, targetState);
      addToast('success', targetState ? 'Rule Enabled' : 'Rule Disabled', `Rule "${rule.name}" is now ${targetState ? 'enabled' : 'disabled'}`);
      setRules((prev) => prev.map((r) => ((r.id || r.ID) === id ? { ...r, is_enabled: targetState } : r)));
    } catch (err) {
      addToast('error', 'Toggle Failed', err.message);
    }
  };

  // Seed Default Presets
  const handleSeedPresets = async () => {
    try {
      setSeedingPresets(true);
      await seedAlertRulePresets('default');
      addToast('success', 'Presets Loaded', 'Standard enterprise alert rule presets have been loaded');
      fetchRules();
    } catch (err) {
      addToast('error', 'Preset Error', err.message);
    } finally {
      setSeedingPresets(false);
    }
  };

  // Edit Rule Handlers
  const handleEditRuleClick = (rule) => {
    setEditingRule({
      id: rule.id || rule.ID,
      name: rule.name || '',
      metric: rule.metric || 'cpu_usage',
      operator: rule.operator || '>',
      threshold: rule.threshold !== undefined ? rule.threshold : (rule.value !== undefined ? rule.value : 90),
      severity: rule.severity || 'critical',
      target_scope: rule.target_scope || 'all',
      target_machine_id: rule.target_machine_id || '',
      target_os: rule.target_os || '',
      consecutive_breaches: rule.consecutive_breaches || 2,
    });
    setShowEditRuleModal(true);
  };

  const handleUpdateRuleSubmit = async (e) => {
    e.preventDefault();
    if (!editingRule) return;
    try {
      const parsed = parseFloat(editingRule.threshold);
      const val = isNaN(parsed) ? 0 : parsed;
      const payload = {
        ...editingRule,
        threshold: val,
        value: val,
      };
      await updateAlertRule('default', editingRule.id, payload);
      addToast('success', 'Rule Updated', `Rule "${editingRule.name}" updated successfully`);
      setShowEditRuleModal(false);
      setEditingRule(null);
      fetchRules();
    } catch (err) {
      addToast('error', 'Update Failed', err.message);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['ID', 'Title', 'Severity', 'Status', 'Machine', 'Metric Value', 'Threshold', 'Created At'];
    const rows = filteredAlerts.map((a) => [
      a.id || a.ID,
      `"${(a.title || a.message || '').replace(/"/g, '""')}"`,
      a.severity,
      a.status,
      a.hostname || a.machine_name || 'Host',
      a.metric_value || '',
      a.threshold || '',
      a.created_at || a.createdAt || '',
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `infrapilot_alerts_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast('info', 'Exported', 'Alerts exported as CSV');
  };

  const getSeverityObj = (severity) => {
    const s = (severity || 'info').toLowerCase();
    return SEVERITY_CONFIG[s] || SEVERITY_CONFIG.info;
  };

  return (
    <div className="enterprise-alerts-container">
      {/* ── 1. HEADER ROW ── */}
      <div className="alerts-main-header">
        <div className="header-left-title">
          <div className="title-icon-badge">
            <ShieldAlert size={24} color="#ffffff" />
          </div>
          <div>
            <div className="title-row">
              <h1>Alerts Command Center</h1>
              <span className="live-status-chip">
                <span className="pulsing-emerald-dot" /> LIVE OBSERVABILITY
              </span>
            </div>
            <p className="subtitle-text">
              Real-time multi-host anomaly detection, incident correlation & autonomous AI remediation
            </p>
          </div>
        </div>

        <div className="header-right-actions">
          {activeView === 'alerts' ? (
            <>
              {/* Refresh Selector */}
              <div className="refresh-control-pill">
                <RefreshCw size={13} className={loading ? 'spin' : ''} />
                <select value={refreshInterval} onChange={(e) => setRefreshInterval(e.target.value)}>
                  <option value="5s">Auto 5s</option>
                  <option value="10s">Auto 10s</option>
                  <option value="30s">Auto 30s</option>
                  <option value="off">Manual</option>
                </select>
              </div>

              <button
                className="action-btn secondary"
                onClick={() => fetchAlerts({ status: 'all', limit: 300 })}
                disabled={loading}
                title="Refresh All Alerts"
              >
                <RefreshCw size={14} className={loading ? 'spin' : ''} />
                <span>Sync</span>
              </button>

              <button className="action-btn secondary" onClick={handleExportCSV} title="Export CSV">
                <Download size={14} />
                <span>Export CSV</span>
              </button>

              <button
                className="action-btn secondary danger"
                onClick={async () => {
                  if (window.confirm('Purge all resolved alerts from database history?')) {
                    await purgeResolved();
                    addToast('info', 'Purged', 'Resolved alerts purged.');
                  }
                }}
                title="Clean up resolved historical alerts"
              >
                <Trash2 size={14} />
                <span>Purge Resolved</span>
              </button>

              <button
                className="action-btn primary"
                onClick={() => setShowCreateRuleModal(true)}
                title="Create Custom Alert Rule"
              >
                <Plus size={15} />
                <span>New Alert Rule</span>
              </button>
            </>
          ) : (
            <>
              <button
                className="action-btn secondary"
                onClick={fetchRules}
                disabled={rulesLoading}
                title="Refresh Alert Rules"
              >
                <RefreshCw size={14} className={rulesLoading ? 'spin' : ''} />
                <span>Sync Rules</span>
              </button>

              <button
                className="action-btn secondary"
                onClick={handleSeedPresets}
                disabled={seedingPresets}
                title="Load Standard Enterprise Presets"
              >
                <Sparkles size={14} color="#38bdf8" />
                <span>{seedingPresets ? 'Seeding...' : 'Load Default Presets'}</span>
              </button>

              <button
                className="action-btn primary"
                onClick={() => setShowCreateRuleModal(true)}
                title="Create Custom Alert Rule"
              >
                <Plus size={15} />
                <span>Create Rule</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── 2. SEGMENTED VIEW SWITCHER ── */}
      <div className="segmented-view-container">
        <button
          className={`segmented-view-tab ${activeView === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveView('alerts')}
        >
          <Bell size={16} />
          <span>Fired Alerts & Incidents</span>
          <span className="view-pill red">{activeCount}</span>
        </button>

        <button
          className={`segmented-view-tab ${activeView === 'rules' ? 'active' : ''}`}
          onClick={() => {
            setActiveView('rules');
            fetchRules();
          }}
        >
          <Sliders size={16} />
          <span>Alert Rules & Policies</span>
          <span className="view-pill blue">{rules.length}</span>
        </button>
      </div>

      {/* ── 3. EXECUTIVE KPI CARDS (4 Essential Metrics) ── */}
      <div className="alerts-kpi-grid four-cards">
        <div
          className={`kpi-card ${activeView === 'alerts' && statusFilter === 'active' ? 'active-border' : ''}`}
          onClick={() => {
            setActiveView('alerts');
            setStatusFilter('active');
          }}
        >
          <div className="kpi-icon-wrap blue">
            <Bell size={20} color="#38bdf8" />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Active Alerts</span>
            <div className="kpi-value-row">
              <span className="kpi-value">{activeCount}</span>
              <span className="kpi-tag blue">Live</span>
            </div>
            <span className="kpi-sub">Across connected infrastructure</span>
          </div>
        </div>

        <div
          className={`kpi-card crit-glow ${activeView === 'alerts' && statusFilter === 'critical' ? 'active-border' : ''}`}
          onClick={() => {
            setActiveView('alerts');
            setStatusFilter('critical');
          }}
        >
          <div className="kpi-icon-wrap red">
            <XCircle size={20} color="#ef4444" />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Critical (P1)</span>
            <div className="kpi-value-row">
              <span className="kpi-value red-text">{criticalCount}</span>
              {criticalCount > 0 && <span className="kpi-tag red pulse">Requires Action</span>}
            </div>
            <span className="kpi-sub">Service breach thresholds</span>
          </div>
        </div>

        <div
          className={`kpi-card ${activeView === 'alerts' && statusFilter === 'warning' ? 'active-border' : ''}`}
          onClick={() => {
            setActiveView('alerts');
            setStatusFilter('warning');
          }}
        >
          <div className="kpi-icon-wrap yellow">
            <AlertTriangle size={20} color="#f59e0b" />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Major & Warnings</span>
            <div className="kpi-value-row">
              <span className="kpi-value yellow-text">
                {(stats.major_p2 || 0) + (stats.warning_p3 || 0)}
              </span>
              <span className="kpi-tag yellow">P2/P3</span>
            </div>
            <span className="kpi-sub">High utilization warnings</span>
          </div>
        </div>

        <div
          className={`kpi-card ${activeView === 'rules' ? 'active-border' : ''}`}
          onClick={() => {
            setActiveView('rules');
            fetchRules();
          }}
        >
          <div className="kpi-icon-wrap purple">
            <Sliders size={20} color="#c084fc" />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Configured Rules</span>
            <div className="kpi-value-row">
              <span className="kpi-value purple-text">{rules.length}</span>
              <span className="kpi-tag purple">
                {rules.filter((r) => r.is_enabled !== false).length} Active
              </span>
            </div>
            <span className="kpi-sub">Click to manage rule policies</span>
          </div>
        </div>
      </div>

      {/* ── 4. FILTER TABS & TOOLBAR (ALERTS VIEW ONLY) ── */}
      {activeView === 'alerts' && (
        <div className="alerts-controls-panel">
          <div className="panel-top-row">
            {/* Status Tabs */}
            <div className="status-tabs-list">
              <button
                className={`status-tab-btn ${statusFilter === 'active' ? 'active' : ''}`}
                onClick={() => setStatusFilter('active')}
              >
                <span>Active</span>
                <span className="tab-pill red">{activeCount}</span>
              </button>

              <button
                className={`status-tab-btn ${statusFilter === 'critical' ? 'active' : ''}`}
                onClick={() => setStatusFilter('critical')}
              >
                <span>Critical (P1)</span>
                <span className="tab-pill red">{criticalCount}</span>
              </button>

              <button
                className={`status-tab-btn ${statusFilter === 'warning' ? 'active' : ''}`}
                onClick={() => setStatusFilter('warning')}
              >
                <span>Major & Warnings</span>
                <span className="tab-pill yellow">{(stats.major_p2 || 0) + (stats.warning_p3 || 0)}</span>
              </button>

              <button
                className={`status-tab-btn ${statusFilter === 'acknowledged' ? 'active' : ''}`}
                onClick={() => setStatusFilter('acknowledged')}
              >
                <span>Acknowledged</span>
                <span className="tab-pill cyan">{stats.acknowledged || 0}</span>
              </button>

              <button
                className={`status-tab-btn ${statusFilter === 'resolved' ? 'active' : ''}`}
                onClick={() => setStatusFilter('resolved')}
              >
                <span>Resolved</span>
                <span className="tab-pill gray">{stats.total_resolved || 0}</span>
              </button>

              <button
                className={`status-tab-btn ${statusFilter === 'silenced' ? 'active' : ''}`}
                onClick={() => setStatusFilter('silenced')}
              >
                <span>Silenced</span>
                <span className="tab-pill muted">{stats.silenced || 0}</span>
              </button>
            </div>

            {/* Origin Filter (All / Metric Rules / System Events) */}
            <div className="source-filter-toggle">
              <button
                className={`source-toggle-btn ${sourceFilter === 'all' ? 'active' : ''}`}
                onClick={() => setSourceFilter('all')}
                title="Show all alerts (metric breaches and system events)"
                type="button"
              >
                All Alerts
              </button>
              <button
                className={`source-toggle-btn ${sourceFilter === 'rules' ? 'active' : ''}`}
                onClick={() => setSourceFilter('rules')}
                title="Filter alerts triggered by metric threshold rules"
                type="button"
              >
                <Sliders size={12} />
                <span>Metric Rules</span>
              </button>
              <button
                className={`source-toggle-btn ${sourceFilter === 'events' ? 'active' : ''}`}
                onClick={() => setSourceFilter('events')}
                title="Filter alerts triggered by discrete system, container, and SRE events"
                type="button"
              >
                <Zap size={12} color="#f59e0b" />
                <span>System Events</span>
                {stats.event_alerts > 0 && <span className="tab-pill amber">{stats.event_alerts}</span>}
              </button>
            </div>
          </div>

          <div className="panel-bottom-row">
            {/* Search Input */}
            <div className="alerts-search-box">
              <Search size={15} color="#64748b" />
              <input
                type="text"
                placeholder="Search alerts by title, machine, process, or metric..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button className="clear-search-btn" onClick={() => setSearch('')}>
                  ×
                </button>
              )}
            </div>

            {/* Machine Filter Dropdown */}
            <div className="filter-select-wrap">
              <Server size={14} color="#94a3b8" />
              <select value={selectedMachine} onChange={(e) => setSelectedMachine(e.target.value)}>
                <option value="all">All Machines</option>
                {machineList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} color="#64748b" />
            </div>

            {/* Severity Filter Dropdown */}
            <div className="filter-select-wrap">
              <Filter size={14} color="#94a3b8" />
              <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
                <option value="all">All Severities</option>
                <option value="critical">Critical (P1)</option>
                <option value="major">Major (P2)</option>
                <option value="warning">Warning (P3)</option>
                <option value="info">Info (P4)</option>
              </select>
              <ChevronDown size={12} color="#64748b" />
            </div>
          </div>
        </div>
      )}

      {/* ── 5. BULK ACTION BANNER ── */}
      {isOperator && selectedAlertIds.size > 0 && activeView === 'alerts' && (
        <div className="bulk-actions-floating-bar">
          <div className="bulk-left-info">
            <span className="selected-count-badge">{selectedAlertIds.size}</span>
            <span className="selected-text">alerts selected</span>
          </div>

          <div className="bulk-btn-group">
            <button className="bulk-btn-action" onClick={handleBulkAck}>
              <ShieldCheck size={14} />
              <span>Acknowledge Selected</span>
            </button>

            <button className="bulk-btn-action success" onClick={handleBulkResolve}>
              <CheckCircle size={14} />
              <span>Resolve Selected</span>
            </button>

            <button
              className="bulk-btn-action muted"
              onClick={() => {
                selectedAlertIds.forEach((id) => silenceAlert(id, 60, 'Bulk silenced'));
                setSelectedAlertIds(new Set());
                addToast('info', 'Silenced', 'Selected alerts silenced for 1 hour');
              }}
            >
              <BellOff size={14} />
              <span>Silence (1 Hour)</span>
            </button>

            <button className="bulk-btn-cancel" onClick={() => setSelectedAlertIds(new Set())}>
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* ── 6. MAIN CONTENT VIEW ── */}
      {activeView === 'rules' ? (
        /* ── RULES TAB VIEW ── */
        <div className="alert-rules-manager-card">
          <div className="rules-header">
            <div>
              <h3>Configured Alert Rules & Policies</h3>
              <p>Automated threshold evaluation engine rules for CPU, Memory, Disk, Network and Telemetry</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="action-btn secondary"
                onClick={handleSeedPresets}
                disabled={seedingPresets}
                title="Seed standard production enterprise alert rules"
              >
                <Sparkles size={14} color="#38bdf8" />
                <span>{seedingPresets ? 'Seeding...' : 'Load Default Presets'}</span>
              </button>
              <button className="action-btn primary" onClick={() => setShowCreateRuleModal(true)}>
                <Plus size={15} />
                <span>Create Rule</span>
              </button>
            </div>
          </div>

          <div className="rules-toolbar-row">
            <div className="rules-search-box">
              <Search size={15} color="#64748b" />
              <input
                type="text"
                placeholder="Search rules by name, metric, or scope..."
                value={rulesSearch}
                onChange={(e) => setRulesSearch(e.target.value)}
              />
              {rulesSearch && (
                <button className="clear-search-btn" onClick={() => setRulesSearch('')}>
                  ×
                </button>
              )}
            </div>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              Showing {filteredRules.length} of {rules.length} configured rules
            </span>
          </div>

          <div className="rules-table-wrap">
            <table className="rules-table">
              <thead>
                <tr>
                  <th>RULE NAME</th>
                  <th>METRIC</th>
                  <th>CONDITION</th>
                  <th>TARGET SCOPE</th>
                  <th>SEVERITY</th>
                  <th>STATUS</th>
                  <th style={{ textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredRules && filteredRules.length > 0 ? (
                  filteredRules.map((r) => {
                    const ruleId = r.id || r.ID;
                    const scopeType = (r.target_scope || 'all').toLowerCase();
                    let scopeLabel = 'All Machines (Global)';
                    if (scopeType === 'os') {
                      scopeLabel = `${(r.target_os || 'OS').toUpperCase()} Only`;
                    } else if (scopeType === 'machine' || scopeType === 'server') {
                      const matched = machineList.find((m) => m.id === r.target_machine_id);
                      scopeLabel = matched ? matched.name : `Machine (${String(r.target_machine_id || '').slice(0, 8)}...)`;
                    }

                    return (
                      <tr key={ruleId}>
                        <td className="rule-name-cell">
                          <strong>{r.name}</strong>
                          {r.consecutive_breaches && r.consecutive_breaches > 1 && (
                            <span className="breach-window-hint">{r.consecutive_breaches} checks window</span>
                          )}
                        </td>
                        <td>
                          <span className="metric-tag">{r.metric}</span>
                        </td>
                        <td>
                          <span className="condition-pill">
                            {r.operator || '>'} {r.threshold !== undefined ? r.threshold : r.value}
                            {getMetricUnit(r.metric)}
                          </span>
                        </td>
                        <td>
                          <span className={`scope-badge ${scopeType}`}>
                            {scopeLabel}
                          </span>
                        </td>
                        <td>
                          <span
                            className="severity-pill-table"
                            style={{
                              color: getSeverityObj(r.severity).color,
                              backgroundColor: getSeverityObj(r.severity).bg,
                            }}
                          >
                            {(r.severity || 'Critical').toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <div className="rule-toggle-wrapper">
                            <button
                              type="button"
                              className={`rule-toggle-switch ${r.is_enabled !== false ? 'active' : ''}`}
                              onClick={() => handleToggleRule(r)}
                              title={r.is_enabled !== false ? 'Click to disable rule' : 'Click to enable rule'}
                            >
                              <span className="toggle-thumb" />
                            </button>
                            <span className={`status-dot-indicator ${r.is_enabled !== false ? 'green' : 'gray'}`}>
                              {r.is_enabled !== false ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="rule-action-btns">
                            <button
                              className="rule-action-btn edit"
                              onClick={() => handleEditRuleClick(r)}
                              title="Edit rule parameters"
                            >
                              <Edit3 size={14} color="#38bdf8" />
                            </button>
                            <button
                              className="rule-action-btn delete"
                              onClick={async () => {
                                if (window.confirm(`Delete alert rule "${r.name}"?`)) {
                                  await deleteAlertRule('default', ruleId);
                                  addToast('info', 'Deleted', 'Alert rule deleted');
                                  fetchRules();
                                }
                              }}
                              title="Delete rule"
                            >
                              <Trash2 size={14} color="#ef4444" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '36px 20px', color: '#64748b' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <Sliders size={28} color="#475569" />
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#94a3b8' }}>
                          {rulesSearch ? 'No alert rules match your search filter.' : 'No custom alert rules configured yet.'}
                        </span>
                        {!rulesSearch && (
                          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                            <button className="action-btn secondary" onClick={handleSeedPresets} disabled={seedingPresets}>
                              <Sparkles size={14} color="#38bdf8" />
                              <span>{seedingPresets ? 'Seeding...' : 'Load Default Presets'}</span>
                            </button>
                            <button className="action-btn primary" onClick={() => setShowCreateRuleModal(true)}>
                              <Plus size={14} />
                              <span>Create Custom Rule</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── ALERTS FEED VIEW ── */
        <div className="alerts-feed-container">
          {/* Table Header Row */}
          <div className="alerts-feed-header-row">
            <div className="th-checkbox">
              <input
                type="checkbox"
                checked={filteredAlerts.length > 0 && selectedAlertIds.size === filteredAlerts.length}
                onChange={handleSelectAllFiltered}
              />
            </div>
            <div className="th-severity">SEVERITY / PRIORITY</div>
            <div className="th-alert-info">ALERT DESCRIPTION & ANOMALY</div>
            <div className="th-machine">AFFECTED MACHINE</div>
            <div className="th-metric">TRIGGER VALUE</div>
            <div className="th-status">STATUS</div>
            <div className="th-time">TRIGGERED</div>
            <div className="th-actions">ACTIONS</div>
          </div>

          {loading ? (
            <div className="alerts-loading-state">
              <div className="enterprise-spinner" />
              <span>Streaming infrastructure telemetry & alert signals...</span>
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="alerts-empty-state">
              <div className="empty-icon-shield">
                <CheckCircle size={48} color="#22c55e" />
              </div>
              <h3>Zero Anomalies Detected</h3>
              <p>All host metrics, services, and containers are operating within configured healthy baseline.</p>
              <button
                className="action-btn secondary"
                onClick={() => {
                  setStatusFilter('all');
                  setCategoryFilter('all');
                  setSearch('');
                  setSelectedMachine('all');
                }}
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="alerts-cards-list">
              {filteredAlerts.map((a) => {
                const aId = a.id || a.ID;
                const isSelected = selectedAlertIds.has(aId);
                const sevObj = getSeverityObj(a.severity);
                const SevIcon = sevObj.icon;
                const isCritical = (a.severity || '').toLowerCase() === 'critical' || a.priority === 'P1';
                const status = (a.status || 'OPEN').toUpperCase();
                const isResolved = status === 'RESOLVED';
                const isAck = status === 'ACKNOWLEDGED';
                const isSilenced = status === 'SILENCED';

                const timeFormatted = a.created_at
                  ? new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : '';
                const dateFormatted = a.created_at ? new Date(a.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';

                return (
                  <div
                    key={aId}
                    className={`enterprise-alert-row ${isCritical && !isResolved ? 'row-critical' : ''} ${isSelected ? 'row-selected' : ''} ${isResolved ? 'row-resolved' : ''}`}
                  >
                    {/* Checkbox */}
                    <div className="row-cell-checkbox">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(aId)}
                      />
                    </div>

                    {/* Severity Pill */}
                    <div className="row-cell-severity">
                      <div
                        className="severity-badge-pill"
                        style={{
                          color: sevObj.color,
                          backgroundColor: sevObj.bg,
                          borderColor: sevObj.border,
                        }}
                      >
                        <SevIcon size={13} color={sevObj.color} />
                        <span>{a.priority || sevObj.label}</span>
                      </div>
                    </div>

                    {/* Alert Info / Title & Category */}
                    <div className="row-cell-info">
                      <div className="alert-title-main">
                        <strong>{a.title || a.message || 'Infrastructure Anomaly Detected'}</strong>
                        {a.category && <span className="category-tag">{a.category}</span>}
                        {((a.source || '').toUpperCase() === 'EVENT' || (a.origin || '').toLowerCase() === 'event') && (
                          <span className="category-tag event-origin-tag" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                            ⚡ SYSTEM EVENT
                          </span>
                        )}
                        {String(a.message || a.title || '').includes('FLAPPING') && (
                          <span className="category-tag" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '1px solid #f59e0b' }}>
                            FLAPPING_LOOP_DETECTED
                          </span>
                        )}
                        {String(a.message || a.title || '').includes('CROSS-COMPONENT') && (
                          <span className="category-tag" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid #ef4444' }}>
                            CROSS-COMPONENT ROOT CAUSE
                          </span>
                        )}
                      </div>
                      <div className="alert-desc-sub">
                        {a.message || a.description || 'Threshold breached on monitored component.'}
                      </div>
                    </div>


                    {/* Affected Machine */}
                    <div className="row-cell-machine">
                      <div className="machine-pill" onClick={() => navigate('/infrastructure')}>
                        <Server size={13} color="#38bdf8" />
                        <span className="machine-host-text">{a.hostname || a.machine_name || 'Production Node'}</span>
                      </div>
                      {a.ip_address && <span className="machine-ip-sub">{a.ip_address}</span>}
                    </div>

                    {/* Trigger Value vs Threshold */}
                    <div className="row-cell-metric">
                      {((a.source || '').toUpperCase() === 'EVENT' || (a.origin || '').toLowerCase() === 'event') ? (
                        <div className="metric-spike-badge event-badge" style={{ background: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                          <span className="metric-val" style={{ color: '#fbbf24' }}>Event #{Number(a.metric_value || 1).toFixed(0)}</span>
                        </div>
                      ) : a.metric_value ? (
                        <div className="metric-spike-badge">
                          <span className="metric-val">{Number(a.metric_value).toFixed(1)}%</span>
                          {a.threshold ? <span className="metric-thresh">/{a.threshold}%</span> : null}
                        </div>
                      ) : (
                        <span className="metric-na">—</span>
                      )}
                    </div>

                    {/* Status Pill */}
                    <div className="row-cell-status">
                      {isResolved ? (
                        <span className="status-badge-chip resolved">Resolved</span>
                      ) : isAck ? (
                        <span className="status-badge-chip ack">
                          Ack'd {a.acknowledged_by ? `by ${a.acknowledged_by}` : ''}
                        </span>
                      ) : isSilenced ? (
                        <span className="status-badge-chip silenced">Silenced</span>
                      ) : (
                        <span className="status-badge-chip active pulse">Active</span>
                      )}
                    </div>

                    {/* Timestamp */}
                    <div className="row-cell-time">
                      <span className="time-primary">{timeFormatted}</span>
                      <span className="time-secondary">{dateFormatted}</span>
                    </div>

                    {/* Action Buttons */}
                    <div className="row-cell-actions">
                      {/* AI Root Cause Button */}
                      <button
                        className="btn-ai-diagnose"
                        onClick={() => handleOpenAIAnalysis(a)}
                        title="Instant AI Root Cause & Remediation"
                      >
                        <Sparkles size={13} />
                        <span>AI Fix</span>
                      </button>

                      {/* Acknowledge, Resolve, Silence Controls */}
                      {isOperator && (
                        <>
                          {!isResolved && !isAck && (
                            <button
                              className="btn-quick-ack"
                              onClick={async () => {
                                try {
                                  await acknowledgeAlert(aId);
                                  addToast('success', 'Acknowledged', 'Alert acknowledged');
                                } catch (err) {
                                  addToast('error', 'Failed', err.message);
                                }
                              }}
                              title="Acknowledge Alert"
                            >
                              ACK
                            </button>
                          )}

                          {!isResolved && (
                            <button
                              className="btn-quick-resolve"
                              onClick={async () => {
                                try {
                                  await resolveAlert(aId);
                                  addToast('success', 'Resolved', 'Alert resolved');
                                } catch (err) {
                                  addToast('error', 'Failed', err.message);
                                }
                              }}
                              title="Mark Resolved"
                            >
                              <Check size={14} />
                            </button>
                          )}

                          {!isResolved && !isSilenced && (
                            <button
                              className="btn-quick-silence"
                              onClick={async () => {
                                try {
                                  await silenceAlert(aId, 60, 'Operator snoozed');
                                  addToast('info', 'Silenced', 'Alert silenced for 1h');
                                } catch (err) {
                                  addToast('error', 'Failed', err.message);
                                }
                              }}
                              title="Silence for 1 Hour"
                            >
                              <BellOff size={13} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 6. AI ROOT CAUSE & REMEDIATION MODAL / DRAWER ── */}
      {activeAIModal && (
        <div className="ai-modal-overlay" onClick={() => setActiveAIModal(null)}>
          <div className="ai-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="ai-modal-header">
              <div className="ai-modal-title-row">
                <div className="ai-sparkle-icon-box">
                  <Sparkles size={20} color="#a855f7" />
                </div>
                <div>
                  <h3>Autonomous AI Root Cause Analysis & Auto-Heal</h3>
                  <span className="ai-modal-subtitle">
                    {activeAIModal.title || activeAIModal.message} • Host: {activeAIModal.hostname || 'Node'}
                  </span>
                </div>
              </div>
              <button className="ai-modal-close" onClick={() => setActiveAIModal(null)}>
                ×
              </button>
            </div>

            <div className="ai-modal-body">
              {aiLoading ? (
                <div className="ai-analyzing-state">
                  <div className="enterprise-spinner purple" />
                  <h4>Analyzing kernel telemetry, stack traces & metric spikes...</h4>
                  <p>Correlating system calls, memory allocations, and Docker runtime events</p>
                </div>
              ) : aiAnalysis ? (
                <div className="ai-results-grid">
                  {/* Diagnosis Card */}
                  <div className="ai-section-card">
                    <div className="card-header-with-badge">
                      <div className="header-icon-title">
                        <Zap size={16} color="#eab308" />
                        <strong>Root Cause Diagnosis</strong>
                      </div>
                      <span className="ai-confidence-pill">
                        {aiAnalysis.confidence_percent || 96}% AI Confidence
                      </span>
                    </div>
                    <p className="ai-diagnosis-text">{aiAnalysis.root_cause}</p>
                  </div>

                  {/* Blast Radius Card */}
                  <div className="ai-section-card">
                    <div className="header-icon-title">
                      <Radio size={16} color="#ef4444" />
                      <strong>Blast Radius & Affected Services</strong>
                    </div>
                    <p className="ai-blast-text">{aiAnalysis.blast_radius}</p>
                  </div>

                  {/* Suggested Bash Command */}
                  {aiAnalysis.suggested_command && (
                    <div className="ai-section-card terminal-card">
                      <div className="header-icon-title">
                        <Play size={15} color="#38bdf8" />
                        <strong>Recommended Remediation Command</strong>
                      </div>
                      <div className="code-block-container">
                        <code>{aiAnalysis.suggested_command}</code>
                        <button
                          className="copy-btn"
                          onClick={() => {
                            navigator.clipboard.writeText(aiAnalysis.suggested_command);
                            setCopiedCmd(true);
                            setTimeout(() => setCopiedCmd(false), 2000);
                          }}
                        >
                          {copiedCmd ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
                          <span>{copiedCmd ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Remediation Action Section */}
                  <div className="ai-actions-footer-bar">
                    <button
                      className="btn-trigger-remediation"
                      onClick={() => handleTriggerRemediation(activeAIModal.id || activeAIModal.ID)}
                      disabled={remediating}
                    >
                      <Zap size={16} />
                      <span>{remediating ? 'Executing Runbook...' : 'Trigger Automated Auto-Heal'}</span>
                    </button>

                    <button
                      className="btn-manual-resolve"
                      onClick={async () => {
                        await resolveAlert(
                          activeAIModal.id || activeAIModal.ID,
                          resolutionNoteInput || 'Resolved with AI Diagnostics recommendation'
                        );
                        addToast('success', 'Resolved', 'Alert marked as resolved');
                        setActiveAIModal(null);
                      }}
                    >
                      <CheckCircle size={15} />
                      <span>Mark Alert Resolved</span>
                    </button>
                  </div>

                  {remediationResult && (
                    <div className="remediation-success-box">
                      <CheckCircle size={16} color="#22c55e" />
                      <span>{remediationResult.message || 'Auto-healing command executed successfully!'}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="ai-error-state">
                  <AlertTriangle size={32} color="#f59e0b" />
                  <p>Unable to generate deep AI diagnosis at this time. Standard runbook available.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 7. CREATE ALERT RULE MODAL ── */}
      {showCreateRuleModal && (
        <div className="ai-modal-overlay" onClick={() => setShowCreateRuleModal(false)}>
          <div className="rule-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="ai-modal-header">
              <h3>Create Custom Alert Rule</h3>
              <button className="ai-modal-close" onClick={() => setShowCreateRuleModal(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleCreateRuleSubmit} className="rule-form">
              <div className="form-group">
                <label>Rule Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Critical High Memory Spike"
                  value={newRule.name}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Metric to Monitor</label>
                <select
                  value={newRule.metric}
                  onChange={(e) => setNewRule({ ...newRule, metric: e.target.value })}
                >
                  <option value="cpu_usage">CPU Utilization (%)</option>
                  <option value="memory_percent">Memory Usage (%)</option>
                  <option value="disk_percent">Disk Storage Used (%)</option>
                  <option value="latency_ms">Network Latency (ms)</option>
                  <option value="packet_loss">Network Packet Loss (%)</option>
                  <option value="upload_mbps">Upload Bandwidth (MB/s)</option>
                  <option value="download_mbps">Download Bandwidth (MB/s)</option>
                  <option value="cpu_temperature">CPU Temperature (°C)</option>
                </select>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Condition / Operator</label>
                  <select
                    value={newRule.operator}
                    onChange={(e) => setNewRule({ ...newRule, operator: e.target.value })}
                  >
                    <option value=">">&gt; (Greater than)</option>
                    <option value=">=">&gt;= (Greater or equal)</option>
                    <option value="<">&lt; (Less than)</option>
                    <option value="<=">&lt;= (Less or equal)</option>
                    <option value="==">== (Equals)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Threshold Value</label>
                  <div className="threshold-input-wrapper">
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="e.g. 90"
                      value={newRule.threshold === '' ? '' : newRule.threshold}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setNewRule({ ...newRule, threshold: raw, value: raw });
                      }}
                      className="threshold-number-input"
                    />
                    <span className="metric-unit-badge">{getMetricUnit(newRule.metric)}</span>
                  </div>
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Target Scope</label>
                  <select
                    value={newRule.target_scope}
                    onChange={(e) => setNewRule({ ...newRule, target_scope: e.target.value })}
                  >
                    <option value="all">All Machines (Global)</option>
                    <option value="os">Specific Operating System</option>
                    <option value="machine">Specific Single Server</option>
                  </select>
                </div>

                {newRule.target_scope === 'os' ? (
                  <div className="form-group">
                    <label>Target OS</label>
                    <select
                      value={newRule.target_os}
                      onChange={(e) => setNewRule({ ...newRule, target_os: e.target.value })}
                    >
                      <option value="linux">Linux Hosts</option>
                      <option value="windows">Windows Hosts</option>
                      <option value="darwin">macOS Hosts</option>
                    </select>
                  </div>
                ) : newRule.target_scope === 'machine' ? (
                  <div className="form-group">
                    <label>Target Machine</label>
                    <select
                      value={newRule.target_machine_id}
                      onChange={(e) => setNewRule({ ...newRule, target_machine_id: e.target.value })}
                    >
                      <option value="">Select a server...</option>
                      {machineList.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="form-group">
                    <label>Sustained Window (Checks)</label>
                    <select
                      value={newRule.consecutive_breaches}
                      onChange={(e) => setNewRule({ ...newRule, consecutive_breaches: parseInt(e.target.value, 10) || 2 })}
                    >
                      <option value={1}>1 Check (Immediate Trigger)</option>
                      <option value={2}>2 Consecutive Checks (Recommended)</option>
                      <option value={3}>3 Consecutive Checks (Dampened)</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Severity Level</label>
                <select
                  value={newRule.severity}
                  onChange={(e) => setNewRule({ ...newRule, severity: e.target.value })}
                >
                  <option value="critical">Critical (P1)</option>
                  <option value="major">Major (P2)</option>
                  <option value="warning">Warning (P3)</option>
                  <option value="info">Info (P4)</option>
                </select>
              </div>

              <div className="modal-footer-btn-row">
                <button
                  type="button"
                  className="action-btn secondary"
                  onClick={() => setShowCreateRuleModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="action-btn primary">
                  Create Alert Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 8. EDIT ALERT RULE MODAL ── */}
      {showEditRuleModal && editingRule && (
        <div className="ai-modal-overlay" onClick={() => setShowEditRuleModal(false)}>
          <div className="rule-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="ai-modal-header">
              <h3>Edit Alert Rule</h3>
              <button className="ai-modal-close" onClick={() => setShowEditRuleModal(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleUpdateRuleSubmit} className="rule-form">
              <div className="form-group">
                <label>Rule Name</label>
                <input
                  type="text"
                  required
                  value={editingRule.name}
                  onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Metric to Monitor</label>
                <select
                  value={editingRule.metric}
                  onChange={(e) => setEditingRule({ ...editingRule, metric: e.target.value })}
                >
                  <option value="cpu_usage">CPU Utilization (%)</option>
                  <option value="memory_percent">Memory Usage (%)</option>
                  <option value="disk_percent">Disk Storage Used (%)</option>
                  <option value="latency_ms">Network Latency (ms)</option>
                  <option value="packet_loss">Network Packet Loss (%)</option>
                  <option value="upload_mbps">Upload Bandwidth (MB/s)</option>
                  <option value="download_mbps">Download Bandwidth (MB/s)</option>
                  <option value="cpu_temperature">CPU Temperature (°C)</option>
                </select>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Condition / Operator</label>
                  <select
                    value={editingRule.operator}
                    onChange={(e) => setEditingRule({ ...editingRule, operator: e.target.value })}
                  >
                    <option value=">">&gt; (Greater than)</option>
                    <option value=">=">&gt;= (Greater or equal)</option>
                    <option value="<">&lt; (Less than)</option>
                    <option value="<=">&lt;= (Less or equal)</option>
                    <option value="==">== (Equals)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Threshold Value</label>
                  <div className="threshold-input-wrapper">
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="e.g. 90"
                      value={editingRule.threshold === '' ? '' : editingRule.threshold}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setEditingRule({ ...editingRule, threshold: raw, value: raw });
                      }}
                      className="threshold-number-input"
                    />
                    <span className="metric-unit-badge">{getMetricUnit(editingRule.metric)}</span>
                  </div>
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Target Scope</label>
                  <select
                    value={editingRule.target_scope}
                    onChange={(e) => setEditingRule({ ...editingRule, target_scope: e.target.value })}
                  >
                    <option value="all">All Machines (Global)</option>
                    <option value="os">Specific Operating System</option>
                    <option value="machine">Specific Single Server</option>
                  </select>
                </div>

                {editingRule.target_scope === 'os' ? (
                  <div className="form-group">
                    <label>Target OS</label>
                    <select
                      value={editingRule.target_os}
                      onChange={(e) => setEditingRule({ ...editingRule, target_os: e.target.value })}
                    >
                      <option value="linux">Linux Hosts</option>
                      <option value="windows">Windows Hosts</option>
                      <option value="darwin">macOS Hosts</option>
                    </select>
                  </div>
                ) : editingRule.target_scope === 'machine' ? (
                  <div className="form-group">
                    <label>Target Machine</label>
                    <select
                      value={editingRule.target_machine_id || ''}
                      onChange={(e) => setEditingRule({ ...editingRule, target_machine_id: e.target.value })}
                    >
                      <option value="">Select a server...</option>
                      {machineList.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="form-group">
                    <label>Sustained Window (Checks)</label>
                    <select
                      value={editingRule.consecutive_breaches || 2}
                      onChange={(e) => setEditingRule({ ...editingRule, consecutive_breaches: parseInt(e.target.value, 10) || 2 })}
                    >
                      <option value={1}>1 Check (Immediate Trigger)</option>
                      <option value={2}>2 Consecutive Checks (Recommended)</option>
                      <option value={3}>3 Consecutive Checks (Dampened)</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Severity Level</label>
                <select
                  value={editingRule.severity}
                  onChange={(e) => setEditingRule({ ...editingRule, severity: e.target.value })}
                >
                  <option value="critical">Critical (P1)</option>
                  <option value="major">Major (P2)</option>
                  <option value="warning">Warning (P3)</option>
                  <option value="info">Info (P4)</option>
                </select>
              </div>

              <div className="modal-footer-btn-row">
                <button
                  type="button"
                  className="action-btn secondary"
                  onClick={() => setShowEditRuleModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="action-btn primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 8. COMPONENT STYLES ── */}
      <style>{`
        .enterprise-alerts-container {
          padding: 24px 30px;
          max-width: 1600px;
          margin: 0 auto;
          color: #f1f5f9;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          user-select: none;
        }

        /* 1. Header */
        .alerts-main-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 22px;
          flex-wrap: wrap;
          gap: 16px;
        }
        .header-left-title {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .title-icon-badge {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(135deg, #dc2626, #991b1b);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 16px rgba(220, 38, 38, 0.4);
        }
        .title-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .title-row h1 {
          font-size: 22px;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
          letter-spacing: -0.02em;
        }
        .live-status-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.25);
          color: #4ade80;
          font-size: 10px;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 6px;
          letter-spacing: 0.05em;
        }
        .pulsing-emerald-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: #22c55e;
          box-shadow: 0 0 8px #22c55e;
        }
        .subtitle-text {
          font-size: 12px;
          color: #64748b;
          margin: 3px 0 0 0;
        }

        .header-right-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .refresh-control-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #121824;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 6px 10px;
          color: #94a3b8;
          font-size: 12px;
        }
        .refresh-control-pill select {
          background: transparent;
          border: none;
          outline: none;
          color: #f1f5f9;
          font-size: 12px;
          cursor: pointer;
        }
        .action-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 14px;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          border: none;
        }
        .action-btn.primary {
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
        }
        .action-btn.primary:hover {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
        }
        .action-btn.secondary {
          background: #121824;
          border: 1px solid #1e293b;
          color: #cbd5e1;
        }
        .action-btn.secondary:hover {
          background: #1e293b;
          color: #ffffff;
        }
        .action-btn.secondary.danger:hover {
          background: rgba(239, 68, 68, 0.15);
          border-color: #ef4444;
          color: #fca5a5;
        }

        /* 2. KPI Cards Grid */
        .alerts-kpi-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 14px;
          margin-bottom: 20px;
        }
        @media (max-width: 1300px) {
          .alerts-kpi-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 768px) {
          .alerts-kpi-grid { grid-template-columns: repeat(2, 1fr); }
        }
        .kpi-card {
          background: #0f172a;
          border: 1px solid #1e293b;
          border-radius: 12px;
          padding: 14px;
          display: flex;
          align-items: flex-start;
          gap: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .kpi-card:hover {
          border-color: #334155;
          transform: translateY(-2px);
          background: #131d31;
        }
        .kpi-card.active-border {
          border-color: #3b82f6;
          box-shadow: 0 0 14px rgba(59, 130, 246, 0.2);
        }
        .kpi-card.crit-glow {
          box-shadow: 0 0 10px rgba(239, 68, 68, 0.08);
        }
        .kpi-icon-wrap {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .kpi-icon-wrap.blue { background: rgba(56, 189, 248, 0.12); }
        .kpi-icon-wrap.red { background: rgba(239, 68, 68, 0.15); }
        .kpi-icon-wrap.yellow { background: rgba(245, 158, 11, 0.12); }
        .kpi-icon-wrap.cyan { background: rgba(6, 182, 212, 0.12); }
        .kpi-icon-wrap.green { background: rgba(34, 197, 94, 0.12); }
        .kpi-icon-wrap.purple { background: rgba(168, 85, 247, 0.12); }

        .kpi-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .kpi-label {
          font-size: 11px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .kpi-value-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 3px 0 2px 0;
        }
        .kpi-value {
          font-size: 20px;
          font-weight: 800;
          color: #ffffff;
        }
        .kpi-value.red-text { color: #f87171; }
        .kpi-value.yellow-text { color: #fbbf24; }
        .kpi-value.cyan-text { color: #38bdf8; }
        .kpi-value.green-text { color: #4ade80; }
        .kpi-value.purple-text { color: #c084fc; }
        .kpi-tag {
          font-size: 9.5px;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 4px;
        }
        .kpi-tag.blue { background: rgba(56, 189, 248, 0.2); color: #38bdf8; }
        .kpi-tag.red { background: rgba(239, 68, 68, 0.25); color: #f87171; }
        .kpi-tag.yellow { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
        .kpi-tag.cyan { background: rgba(6, 182, 212, 0.2); color: #38bdf8; }
        .kpi-tag.green { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
        .kpi-tag.purple { background: rgba(168, 85, 247, 0.2); color: #c084fc; }
        .kpi-sub {
          font-size: 10px;
          color: #64748b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* 3. Controls Panel */
        .alerts-controls-panel {
          background: #0f172a;
          border: 1px solid #1e293b;
          border-radius: 12px;
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 16px;
        }
        .panel-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          overflow-x: auto;
        }
        .status-tabs-list {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .status-tab-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: transparent;
          border: 1px solid transparent;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .status-tab-btn:hover {
          background: #1e293b;
          color: #ffffff;
        }
        .status-tab-btn.active {
          background: #1e293b;
          border-color: #334155;
          color: #ffffff;
        }
        .tab-pill {
          font-size: 10px;
          font-weight: 800;
          padding: 1px 6px;
          border-radius: 10px;
        }
        .tab-pill.red { background: #ef4444; color: #ffffff; }
        .tab-pill.yellow { background: #f59e0b; color: #0f172a; }
        .tab-pill.cyan { background: #06b6d4; color: #0f172a; }
        .tab-pill.gray { background: #334155; color: #cbd5e1; }
        .tab-pill.muted { background: #1e293b; color: #64748b; }

        .panel-bottom-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .alerts-search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #090d16;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 7px 12px;
          flex: 1;
          min-width: 260px;
        }
        .alerts-search-box input {
          background: transparent;
          border: none;
          outline: none;
          color: #ffffff;
          font-size: 12.5px;
          width: 100%;
        }
        .clear-search-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 16px;
          cursor: pointer;
        }
        .category-pill-group {
          display: flex;
          align-items: center;
          gap: 4px;
          overflow-x: auto;
        }
        .category-pill {
          background: #090d16;
          border: 1px solid #1e293b;
          color: #94a3b8;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .category-pill:hover {
          color: #ffffff;
          border-color: #334155;
        }
        .category-pill.active {
          background: #2563eb;
          border-color: #2563eb;
          color: #ffffff;
        }
        .filter-select-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #090d16;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 6px 10px;
        }
        .filter-select-wrap select {
          background: transparent;
          border: none;
          outline: none;
          color: #cbd5e1;
          font-size: 12px;
          cursor: pointer;
        }

        /* 4. Bulk Action Floating Bar */
        .bulk-actions-floating-bar {
          background: linear-gradient(135deg, #1e293b, #0f172a);
          border: 1px solid #3b82f6;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
          border-radius: 10px;
          padding: 10px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
          animation: slideDown 0.15s ease-out;
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .bulk-left-info {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .selected-count-badge {
          background: #3b82f6;
          color: #ffffff;
          font-size: 11px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 10px;
        }
        .selected-text {
          font-size: 13px;
          font-weight: 600;
          color: #f1f5f9;
        }
        .bulk-btn-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .bulk-btn-action {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: #1e293b;
          border: 1px solid #334155;
          color: #e2e8f0;
          border-radius: 6px;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .bulk-btn-action:hover { background: #334155; }
        .bulk-btn-action.success {
          background: rgba(34, 197, 94, 0.15);
          border-color: rgba(34, 197, 94, 0.4);
          color: #4ade80;
        }
        .bulk-btn-action.success:hover {
          background: #22c55e;
          color: #0f172a;
        }
        .bulk-btn-action.muted { color: #94a3b8; }
        .bulk-btn-cancel {
          background: transparent;
          border: none;
          color: #64748b;
          font-size: 11.5px;
          cursor: pointer;
          padding: 4px 8px;
        }
        .bulk-btn-cancel:hover { color: #e2e8f0; }

        /* 5. Alerts Table / Feed */
        .alerts-feed-container {
          background: #0f172a;
          border: 1px solid #1e293b;
          border-radius: 12px;
          overflow: hidden;
        }
        .alerts-feed-header-row {
          display: grid;
          grid-template-columns: 36px 120px 1fr 180px 110px 110px 100px 170px;
          gap: 12px;
          padding: 10px 16px;
          background: #090d16;
          border-bottom: 1px solid #1e293b;
          font-size: 10.5px;
          font-weight: 800;
          color: #64748b;
          letter-spacing: 0.05em;
          align-items: center;
        }
        @media (max-width: 1100px) {
          .alerts-feed-header-row { display: none; }
        }

        .alerts-cards-list {
          display: flex;
          flex-direction: column;
        }
        .enterprise-alert-row {
          display: grid;
          grid-template-columns: 36px 120px 1fr 180px 110px 110px 100px 170px;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid #162032;
          align-items: center;
          transition: background 0.15s ease;
          background: #0f172a;
        }
        @media (max-width: 1100px) {
          .enterprise-alert-row {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
          }
        }
        .enterprise-alert-row:hover {
          background: #141d33;
        }
        .enterprise-alert-row.row-critical {
          border-left: 3px solid #ef4444;
          background: rgba(239, 68, 68, 0.02);
        }
        .enterprise-alert-row.row-selected {
          background: rgba(59, 130, 246, 0.08);
        }
        .enterprise-alert-row.row-resolved {
          opacity: 0.65;
        }

        .severity-badge-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.03em;
          border: 1px solid transparent;
        }
        .row-cell-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .alert-title-main {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #f8fafc;
          font-size: 13px;
          font-weight: 700;
        }
        .category-tag {
          font-size: 9.5px;
          font-weight: 700;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.25);
          padding: 1px 6px;
          border-radius: 4px;
        }
        .alert-desc-sub {
          font-size: 11.5px;
          color: #94a3b8;
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .row-cell-machine {
          display: flex;
          flex-direction: column;
        }
        .machine-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #38bdf8;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .machine-pill:hover { text-decoration: underline; }
        .machine-ip-sub {
          font-size: 10.5px;
          color: #64748b;
          margin-top: 1px;
        }

        .metric-spike-badge {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #f87171;
          padding: 2px 6px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
        }
        .metric-thresh {
          color: #94a3b8;
          font-size: 10px;
        }
        .metric-na { color: #64748b; }

        .status-badge-chip {
          display: inline-flex;
          align-items: center;
          font-size: 10.5px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 4px;
        }
        .status-badge-chip.active {
          background: rgba(239, 68, 68, 0.2);
          color: #f87171;
        }
        .status-badge-chip.ack {
          background: rgba(6, 182, 212, 0.2);
          color: #38bdf8;
        }
        .status-badge-chip.resolved {
          background: rgba(34, 197, 94, 0.2);
          color: #4ade80;
        }
        .status-badge-chip.silenced {
          background: #1e293b;
          color: #94a3b8;
        }

        .row-cell-time {
          display: flex;
          flex-direction: column;
        }
        .time-primary {
          font-size: 11.5px;
          font-weight: 600;
          color: #cbd5e1;
        }
        .time-secondary {
          font-size: 10px;
          color: #64748b;
        }

        .row-cell-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .btn-ai-diagnose {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(147, 51, 234, 0.25));
          border: 1px solid rgba(168, 85, 247, 0.5);
          color: #c084fc;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 9px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .btn-ai-diagnose:hover {
          background: #9333ea;
          color: #ffffff;
          box-shadow: 0 0 10px rgba(168, 85, 247, 0.5);
        }
        .btn-quick-ack {
          background: rgba(6, 182, 212, 0.12);
          border: 1px solid rgba(6, 182, 212, 0.3);
          color: #38bdf8;
          font-size: 10.5px;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 6px;
          cursor: pointer;
        }
        .btn-quick-ack:hover { background: #06b6d4; color: #0f172a; }
        .btn-quick-resolve {
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: #4ade80;
          padding: 4px 7px;
          border-radius: 6px;
          cursor: pointer;
        }
        .btn-quick-resolve:hover { background: #22c55e; color: #0f172a; }
        .btn-quick-silence {
          background: transparent;
          border: 1px solid #334155;
          color: #94a3b8;
          padding: 4px 6px;
          border-radius: 6px;
          cursor: pointer;
        }
        .btn-quick-silence:hover { color: #ffffff; background: #1e293b; }

        /* States */
        .alerts-loading-state,
        .alerts-empty-state {
          padding: 60px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: #94a3b8;
          text-align: center;
        }
        .empty-icon-shield {
          width: 70px;
          height: 70px;
          border-radius: 50%;
          background: rgba(34, 197, 94, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .alerts-empty-state h3 {
          margin: 0;
          color: #f1f5f9;
          font-size: 18px;
        }
        .alerts-empty-state p {
          margin: 0;
          color: #64748b;
          font-size: 13px;
          max-width: 450px;
        }
        .enterprise-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #1e293b;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        .enterprise-spinner.purple {
          border-top-color: #a855f7;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* 6. AI Modal */
        .ai-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .ai-modal-content {
          width: 680px;
          max-width: 95vw;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 16px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(168, 85, 247, 0.15);
          overflow: hidden;
          animation: scaleUp 0.15s ease-out;
        }
        .rule-modal-content {
          width: 560px;
          max-width: 95vw;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 16px;
          overflow: hidden;
          animation: scaleUp 0.15s ease-out;
        }
        @keyframes scaleUp {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        .ai-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: #131d31;
          border-bottom: 1px solid #1e293b;
        }
        .ai-modal-title-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .ai-sparkle-icon-box {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: rgba(168, 85, 247, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ai-modal-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 800;
          color: #f8fafc;
        }
        .ai-modal-subtitle {
          font-size: 11.5px;
          color: #94a3b8;
        }
        .ai-modal-close {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 22px;
          cursor: pointer;
        }
        .ai-modal-close:hover { color: #ffffff; }
        .ai-modal-body {
          padding: 20px;
          max-height: 75vh;
          overflow-y: auto;
        }

        .ai-results-grid {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .ai-section-card {
          background: #131d31;
          border: 1px solid #1e293b;
          border-radius: 10px;
          padding: 14px;
        }
        .card-header-with-badge {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .header-icon-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 700;
          color: #f1f5f9;
        }
        .ai-confidence-pill {
          background: rgba(168, 85, 247, 0.2);
          border: 1px solid rgba(168, 85, 247, 0.4);
          color: #c084fc;
          font-size: 10.5px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 10px;
        }
        .ai-diagnosis-text {
          font-size: 13px;
          color: #e2e8f0;
          line-height: 1.5;
          margin: 0;
        }
        .ai-blast-text {
          font-size: 12.5px;
          color: #94a3b8;
          line-height: 1.4;
          margin: 6px 0 0 0;
        }
        .code-block-container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #090d16;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 8px 12px;
          margin-top: 8px;
        }
        .code-block-container code {
          color: #38bdf8;
          font-family: 'Courier New', monospace;
          font-size: 12px;
        }
        .copy-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          background: #1e293b;
          border: 1px solid #334155;
          color: #cbd5e1;
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 5px;
          cursor: pointer;
        }
        .copy-btn:hover { background: #334155; color: #ffffff; }

        .ai-actions-footer-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 8px;
        }
        .btn-trigger-remediation {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: linear-gradient(135deg, #9333ea, #7e22ce);
          border: none;
          color: #ffffff;
          font-size: 13px;
          font-weight: 700;
          padding: 10px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
          box-shadow: 0 4px 14px rgba(147, 51, 234, 0.4);
        }
        .btn-trigger-remediation:hover {
          background: linear-gradient(135deg, #a855f7, #9333ea);
        }
        .btn-manual-resolve {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(34, 197, 94, 0.15);
          border: 1px solid rgba(34, 197, 94, 0.4);
          color: #4ade80;
          font-size: 13px;
          font-weight: 600;
          padding: 10px 16px;
          border-radius: 8px;
          cursor: pointer;
        }
        .btn-manual-resolve:hover {
          background: #22c55e;
          color: #0f172a;
        }
        .remediation-success-box {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(34, 197, 94, 0.15);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: #4ade80;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 600;
        }
        .ai-analyzing-state {
          padding: 40px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          text-align: center;
        }
        .ai-analyzing-state h4 {
          margin: 0;
          color: #f1f5f9;
          font-size: 15px;
        }
        .ai-analyzing-state p {
          margin: 0;
          color: #64748b;
          font-size: 12px;
        }

        /* 7. Rules Tab Styles */
        .alert-rules-manager-card {
          background: #0f172a;
          border: 1px solid #1e293b;
          border-radius: 12px;
          padding: 20px;
        }
        .rules-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .rules-header h3 {
          margin: 0;
          font-size: 16px;
          color: #f1f5f9;
        }
        .rules-header p {
          margin: 4px 0 0 0;
          font-size: 12px;
          color: #64748b;
        }
        .rules-table {
          width: 100%;
          border-collapse: collapse;
        }
        .rules-table th {
          text-align: left;
          padding: 10px 14px;
          background: #090d16;
          color: #64748b;
          font-size: 10.5px;
          font-weight: 800;
          letter-spacing: 0.05em;
          border-bottom: 1px solid #1e293b;
        }
        .rules-table td {
          padding: 12px 14px;
          border-bottom: 1px solid #162032;
          font-size: 12.5px;
        }
        .rule-name-cell strong {
          color: #f8fafc;
        }
        .metric-tag {
          background: #1e293b;
          color: #38bdf8;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
        }
        .condition-pill {
          color: #f59e0b;
          font-weight: 700;
        }
        .severity-pill-table {
          font-size: 10px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 6px;
        }
        .status-dot-indicator {
          font-size: 11px;
          font-weight: 600;
        }
        .status-dot-indicator.green { color: #4ade80; }
        .status-dot-indicator.gray { color: #64748b; }
        
        .rule-toggle-wrapper {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .rule-toggle-switch {
          position: relative;
          width: 36px;
          height: 20px;
          border-radius: 9999px;
          background: #334155;
          border: none;
          cursor: pointer;
          transition: background-color 0.2s ease;
          padding: 2px;
          display: flex;
          align-items: center;
        }
        .rule-toggle-switch.active {
          background: #10b981;
        }
        .rule-toggle-switch .toggle-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
          transition: transform 0.2s ease;
          transform: translateX(0);
        }
        .rule-toggle-switch.active .toggle-thumb {
          transform: translateX(16px);
        }

        .scope-badge {
          display: inline-block;
          font-size: 10.5px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 6px;
          background: rgba(56, 189, 248, 0.12);
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.3);
        }
        .scope-badge.os {
          background: rgba(168, 85, 247, 0.12);
          color: #c084fc;
          border-color: rgba(168, 85, 247, 0.3);
        }
        .scope-badge.machine {
          background: rgba(234, 179, 8, 0.12);
          color: #facc15;
          border-color: rgba(234, 179, 8, 0.3);
        }

        .breach-window-hint {
          display: block;
          font-size: 10px;
          color: #94a3b8;
          font-weight: 500;
          margin-top: 2px;
        }

        .threshold-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
        }
        .threshold-input-wrapper input.threshold-number-input {
          width: 100% !important;
          min-width: 0 !important;
          box-sizing: border-box !important;
          height: 38px !important;
          padding-left: 12px !important;
          padding-right: 48px !important;
          font-size: 13.5px !important;
          font-weight: 600 !important;
          color: #ffffff !important;
          background: #090d16 !important;
          border: 1px solid #1e293b !important;
          border-radius: 8px !important;
          outline: none !important;
        }
        .threshold-input-wrapper input.threshold-number-input:focus {
          border-color: #3b82f6 !important;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2) !important;
        }

        .metric-unit-badge {
          position: absolute;
          right: 10px;
          color: #38bdf8;
          font-size: 11px;
          font-weight: 700;
          pointer-events: none;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.25);
          padding: 2px 7px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .rule-action-btns {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
        }
        .rule-action-btn {
          background: transparent;
          border: 1px solid #1e293b;
          cursor: pointer;
          padding: 5px 7px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }
        .rule-action-btn.edit:hover {
          background: rgba(56, 189, 248, 0.15);
          border-color: rgba(56, 189, 248, 0.4);
        }
        .rule-action-btn.delete:hover {
          background: rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.4);
        }

        .rule-del-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
        }
        .rule-del-btn:hover { background: rgba(239, 68, 68, 0.15); }

        /* Forms */
        .rule-form {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-group label {
          font-size: 12px;
          font-weight: 600;
          color: #94a3b8;
        }
        .form-group input,
        .form-group select {
          background: #090d16;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 8px 12px;
          color: #ffffff;
          font-size: 13px;
          outline: none;
        }
        .form-row-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .condition-input-group {
          display: flex;
          gap: 6px;
        }
        .source-filter-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 3px;
        }
        .source-toggle-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 11.5px;
          font-weight: 600;
          padding: 5px 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .source-toggle-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.05);
        }
        .source-toggle-btn.active {
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.3);
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.1);
        }
        .tab-pill.amber {
          background: rgba(245, 158, 11, 0.2);
          color: #fbbf24;
          border: 1px solid rgba(245, 158, 11, 0.4);
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 999px;
          font-weight: 700;
        }
        .event-origin-tag {
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.3px;
        }

        /* Segmented View Switcher */
        .segmented-view-container {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #090d16;
          border: 1px solid #1e293b;
          border-radius: 12px;
          padding: 5px;
          margin-bottom: 20px;
          width: fit-content;
        }
        .segmented-view-tab {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: 1px solid transparent;
          color: #94a3b8;
          font-size: 13px;
          font-weight: 700;
          padding: 8px 18px;
          border-radius: 9px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .segmented-view-tab:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.04);
        }
        .segmented-view-tab.active {
          background: #1e293b;
          color: #ffffff;
          border-color: #334155;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        .view-pill {
          font-size: 10.5px;
          font-weight: 800;
          padding: 1px 7px;
          border-radius: 10px;
        }
        .view-pill.red {
          background: #ef4444;
          color: #ffffff;
        }
        .view-pill.blue {
          background: #0284c7;
          color: #ffffff;
        }

        /* 4-Card KPI Grid */
        .alerts-kpi-grid.four-cards {
          grid-template-columns: repeat(4, 1fr);
        }
        @media (max-width: 1100px) {
          .alerts-kpi-grid.four-cards {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 640px) {
          .alerts-kpi-grid.four-cards {
            grid-template-columns: 1fr;
          }
        }

        /* Rules Toolbar */
        .rules-toolbar-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .rules-search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #090d16;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 7px 12px;
          flex: 1;
          max-width: 420px;
        }
        .rules-search-box input {
          background: transparent;
          border: none;
          outline: none;
          color: #ffffff;
          font-size: 12.5px;
          width: 100%;
        }
      `}</style>
    </div>
  );
}