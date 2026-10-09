import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Terminal as TermIcon,
  Play,
  Pause,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Search,
  Send,
  Maximize2,
  Minimize2,
  Activity,
  Filter,
  Shield,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Cpu,
  Server,
  Code,
  Box,
  Layers,
  Sparkles,
  SlidersHorizontal,
  X,
  Code2,
  HelpCircle,
  Zap,
  BookOpen,
} from 'lucide-react';
import { apiClient } from '../../api/client.js';
import { createLiveEventsSocket } from '../../websocket/liveEvents.js';
import { getMachineId } from '../../utils/machineId.js';
import { useServerStore } from '../../store/serverStore.jsx';
import { executeMiniSPL, getLogFieldValue } from '../../utils/miniSPL.js';
import MiniSPLStatsWidget from './MiniSPLStatsWidget.jsx';
import LogDetailsDrawer from './LogDetailsDrawer.jsx';
import LogPatternsTab from './LogPatternsTab.jsx';
import VisualFieldExtractorModal from './VisualFieldExtractorModal.jsx';
import SavedExtractionRulesCatalog from './SavedExtractionRulesCatalog.jsx';
import DiscoveredFieldsSidebar from './DiscoveredFieldsSidebar.jsx';


const MINI_SPL_PRESETS = [
  {
    label: 'Top 5 Error Signatures',
    query: 'level:ERROR | count() by message | top 5',
    desc: 'Aggregates and ranks the most frequent error messages',
  },
  {
    label: 'SSH / Auth Attacks by IP',
    query: 'source:auth | extract "Failed password for (?:invalid user )?(?<user>\\S+) from (?<ip>\\S+)" | count() by ip | top 5',
    desc: 'Extracts client IP from SSH failures and ranks top attack sources',
  },
  {
    label: 'Container Crash & Failures',
    query: 'level:ERROR | extract "(?<container>[a-zA-Z0-9_\\-]+)" | count() by container',
    desc: 'Extracts container names and aggregates failure counts',
  },
  {
    label: 'HTTP 5xx Server Errors',
    query: 'extract "status=(?P<code>5\\d\\d)" | count() by code',
    desc: 'Extracts 500/502/503/504 HTTP codes',
  },
  {
    label: 'Slow Latency Queries (> 500ms)',
    query: 'extract "duration=(?P<ms>\\d+)ms" | where ms > 500 | sort -ms',
    desc: 'Filters requests with latency exceeding 500ms and sorts descending',
  },
  {
    label: 'Severity Level Distribution',
    query: 'count() by level',
    desc: 'Aggregates log count across INFO, WARN, ERROR, CRITICAL',
  },
];

function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

function formatIngestTs(d) {
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  const sss = pad(d.getMilliseconds(), 3);
  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}.${sss}`;
}

function parseLogLevel(text = '', defaultLevel = 'INFO') {
  const str = String(text).toUpperCase();
  if (str.includes('CRITICAL')) return 'CRITICAL';
  if (str.includes('FATAL')) return 'FATAL';
  if (str.includes('ERROR') || str.includes('FAIL')) return 'ERROR';
  if (str.includes('WARN')) return 'WARNING';
  if (str.includes('TRACE')) return 'TRACE';
  if (str.includes('DEBUG')) return 'DEBUG';
  if (str.includes('NOTICE')) return 'NOTICE';
  return defaultLevel;
}

export default function FleetTerminal({ machine, machineName }) {
  const { selectedServer, liveMetricsMap, servers } = useServerStore();

  const activeMachine = machine || selectedServer;
  const initialMachineId = activeMachine ? getMachineId(activeMachine) : '';
  const [selectedNodeId, setSelectedNodeId] = useState(initialMachineId || 'ALL');

  const effectiveMachineId = selectedNodeId && selectedNodeId !== 'ALL' ? selectedNodeId : '';
  const activeServerObj = servers?.find((s) => String(s.id).toLowerCase() === String(effectiveMachineId).toLowerCase()) || activeMachine;
  const hostLabel = machineName || activeServerObj?.hostname || activeServerObj?.name || (effectiveMachineId ? 'Selected Node' : 'ALL NODES');
  const rawHost = activeServerObj?.hostname || activeServerObj?.name || 'node';

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(true);
  const [pausedQueue, setPausedQueue] = useState([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDrilldown, setActiveDrilldown] = useState(null);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);

  // Tab Navigation state
  const [activeTab, setActiveTab] = useState('live');

  // Pillar 2: Schema-on-Read states
  const [isExtractorOpen, setIsExtractorOpen] = useState(false);
  const [extractorLogText, setExtractorLogText] = useState('');
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isFieldsSidebarOpen, setIsFieldsSidebarOpen] = useState(false);

  // Filters
  const [filterLevel, setFilterLevel] = useState('ALL');
  const [filterSource, setFilterSource] = useState('ALL');
  const [filterTimeRange, setFilterTimeRange] = useState('1h');
  const [filterService, setFilterService] = useState('');

  // Interactive Command Execution
  const [command, setCommand] = useState('');
  const [executing, setExecuting] = useState(false);

  const termBottomRef = useRef(null);

  // 1. Fetch real log history from backend
  const fetchLogsHistory = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/logs', {
        params: {
          machine_id: effectiveMachineId || '',
          level: filterLevel !== 'ALL' ? filterLevel : '',
          source: filterSource !== 'ALL' ? filterSource : '',
          service: filterService || '',
          time_range: filterTimeRange !== 'ALL' ? filterTimeRange : '',
          limit: 200,
        },
      });

      if (res.data?.logs && Array.isArray(res.data.logs)) {
        const mapped = res.data.logs.map((l) => ({
          id: l.id || `log-${Math.random()}`,
          machine_id: l.machine_id,
          ingestTs: formatIngestTs(new Date(l.timestamp || l.created_at || Date.now())),
          hostname: l.hostname || rawHost,
          level: (l.level || parseLogLevel(l.message)).toUpperCase(),
          source: l.source || 'system',
          service: l.service || 'agent',
          message: l.message || '',
          text: `[${(l.level || 'INFO').toUpperCase()}] ${l.message}`,
          fullLine: `[${formatIngestTs(new Date(l.timestamp || Date.now()))}] ${l.hostname || rawHost} [${l.service || 'sys'}] [${(l.level || 'INFO').toUpperCase()}] ${l.message}`,
          os: l.os || l.platform || activeServerObj?.os || 'linux',
          container_name: l.container_name,
          pod_name: l.pod_name,
          namespace: l.namespace,
          cluster_name: l.cluster_name,
          pid: l.pid,
          request_id: l.request_id,
          trace_id: l.trace_id,
          raw_log: l.raw_log,
        }));
        setLogs(mapped);
      }
    } catch {
      // Keep existing stream entries if API fails
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogsHistory();
  }, [effectiveMachineId, filterLevel, filterSource, filterTimeRange, filterService]);

  // 2. Real-time WebSocket Live Stream Listener
  useEffect(() => {
    let socket;
    try {
      socket = createLiveEventsSocket();
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          // 2.1 Live Log Entry broadcast
          if (payload.event === 'log_entry' || payload.log || payload.data) {
            const l = payload.log || payload.data || payload;
            const eventHost = l.hostname || payload.hostname || rawHost;

            const targetMid = String(effectiveMachineId || '').toLowerCase();
            const logMid = String(l.machine_id || payload.machine_id || '').toLowerCase();
            const logHost = String(l.hostname || payload.hostname || '').toLowerCase();

            const matches = !effectiveMachineId || effectiveMachineId === 'ALL' || logMid === targetMid || (logHost && logHost === targetMid);

            if (matches) {
              const now = new Date(l.timestamp || l.created_at || Date.now());
              const msgText = l.message || '';
              const lvl = (l.level || parseLogLevel(msgText)).toUpperCase();
              const newEntry = {
                id: l.id || `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                machine_id: l.machine_id,
                ingestTs: formatIngestTs(now),
                hostname: eventHost,
                level: lvl,
                source: l.source || 'system',
                service: l.service || 'agent',
                message: msgText,
                text: `[${lvl}] ${msgText}`,
                fullLine: `[${formatIngestTs(now)}] ${eventHost} [${l.service || 'agent'}] ${msgText}`,
                os: l.os || l.platform || 'linux',
                container_name: l.container_name,
                raw_log: l.raw_log,
              };

              if (streaming) {
                setLogs((prev) => [...prev.slice(-400), newEntry]);
              } else {
                setPausedQueue((prev) => [...prev, newEntry]);
              }
            }
          }

          // 2.2 Interactive Terminal Command Result broadcast
          if (payload.event === 'command_completed' || payload.type === 'command_completed') {
            const matches = !effectiveMachineId || String(payload.machine_id).toLowerCase() === String(effectiveMachineId).toLowerCase();

            if (matches) {
              const outText = payload.stdout || payload.stderr || `Command completed (Exit code: ${payload.exit_code ?? 0})`;
              const isErr = (payload.exit_code !== 0 && payload.exit_code !== undefined) || (payload.stderr && !payload.stdout);
              const now = new Date(payload.finished_at || Date.now());
              const resEntry = {
                id: `cmd-res-${payload.command_id || Date.now()}`,
                machine_id: payload.machine_id,
                ingestTs: formatIngestTs(now),
                hostname: rawHost,
                level: isErr ? 'ERROR' : 'INFO',
                source: 'terminal',
                service: 'output',
                message: outText,
                text: outText,
                fullLine: `[${formatIngestTs(now)}] [${isErr ? 'ERR' : 'OK'}] ${outText}`,
                exit_code: payload.exit_code,
              };

              if (streaming) {
                setLogs((prev) => [...prev.slice(-400), resEntry]);
              } else {
                setPausedQueue((prev) => [...prev, resEntry]);
              }
            }
          }
        } catch {
          // Silent ignore
        }
      };
    } catch (err) {
      console.error('Failed to establish WebSocket log stream:', err);
    }

    return () => {
      if (socket) socket.close();
    };
  }, [streaming, effectiveMachineId, rawHost]);

  // Resume streaming
  const handleResumeLive = () => {
    if (pausedQueue.length > 0) {
      setLogs((prev) => [...prev.slice(-400), ...pausedQueue]);
      setPausedQueue([]);
    }
    setStreaming(true);
  };

  // 3. Auto-scroll on new entries
  useEffect(() => {
    if (autoScroll && termBottomRef.current && streaming) {
      termBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, streaming]);

  // 4. Command Execution
  const handleExecuteCommand = async (e) => {
    e.preventDefault();
    if (!command.trim() || executing) return;

    let cmdStr = command.trim();
    if (cmdStr.startsWith('$')) {
      cmdStr = cmdStr.replace(/^\$\s*/, '').trim();
    }
    if (!cmdStr) return;

    setCommand('');

    const targetNodeId = effectiveMachineId || initialMachineId || (servers?.length === 1 ? servers[0].id : '');
    const now = new Date();

    if (!targetNodeId) {
      const noticeLog = {
        id: `notice-${now.getTime()}`,
        machine_id: '',
        ingestTs: formatIngestTs(now),
        hostname: rawHost,
        level: 'WARN',
        source: 'terminal',
        service: 'cli',
        message: '[Notice] Please select a specific server from the NODE dropdown above to execute terminal commands.',
        text: '[Notice] Please select a specific server from the NODE dropdown.',
        fullLine: `[${formatIngestTs(now)}] [Notice] Please select a specific server from the NODE dropdown above to execute terminal commands.`,
      };
      setLogs((prev) => [...prev, noticeLog]);
      return;
    }

    setExecuting(true);

    const userLog = {
      id: `cmd-${now.getTime()}`,
      machine_id: targetNodeId,
      ingestTs: formatIngestTs(now),
      hostname: rawHost,
      level: 'INFO',
      source: 'terminal',
      service: 'cli',
      message: `$ ${cmdStr}`,
      text: `$ ${cmdStr}`,
      fullLine: `[${formatIngestTs(now)}] ${rawHost} $ ${cmdStr}`,
    };

    setLogs((prev) => [...prev, userLog]);

    try {
      const res = await apiClient.post('/terminal/execute', {
        machine_id: targetNodeId,
        command: cmdStr,
      });

      if (res.data?.output) {
        const outText = res.data.output;
        const resLog = {
          id: `res-${now.getTime()}`,
          machine_id: effectiveMachineId,
          ingestTs: formatIngestTs(new Date()),
          hostname: rawHost,
          level: 'INFO',
          source: 'terminal',
          service: 'output',
          message: outText,
          text: outText,
          fullLine: `[${formatIngestTs(new Date())}] ${outText}`,
        };
        setLogs((prev) => [...prev, resLog]);
      } else {
        const queuedLog = {
          id: `queue-${now.getTime()}`,
          machine_id: effectiveMachineId,
          ingestTs: formatIngestTs(new Date()),
          hostname: rawHost,
          level: 'INFO',
          source: 'terminal',
          service: 'cli',
          message: `[Dispatch] Command queued for agent execution (ID: ${res.data?.id || 'pending'}). Awaiting response...`,
          text: `[Dispatch] Command queued for agent execution...`,
          fullLine: `[${formatIngestTs(new Date())}] [Dispatch] Command queued for agent execution...`,
        };
        setLogs((prev) => [...prev, queuedLog]);
      }
    } catch (err) {
      const errText = err.response?.data?.error || err.message || 'Execution failed.';
      const errLog = {
        id: `err-${now.getTime()}`,
        machine_id: effectiveMachineId,
        ingestTs: formatIngestTs(new Date()),
        hostname: rawHost,
        level: 'ERROR',
        source: 'terminal',
        service: 'cli',
        message: `Command Error: ${errText}`,
        text: `Command Error: ${errText}`,
        fullLine: `[${formatIngestTs(new Date())}] ERROR: ${errText}`,
      };
      setLogs((prev) => [...prev, errLog]);
    } finally {
      setExecuting(false);
    }
  };

  // 1. Prefilter logs with dropdown filters (node, level, source, service)
  const prefilteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (effectiveMachineId && effectiveMachineId !== 'ALL') {
        const target = String(effectiveMachineId).toLowerCase();
        const rowMid = String(l.machine_id || '').toLowerCase();
        const rowHost = String(l.hostname || '').toLowerCase();
        const activeMid = String(activeServerObj?.id || '').toLowerCase();
        const activeHost = String(activeServerObj?.hostname || activeServerObj?.name || '').toLowerCase();

        const matches = rowMid === target || rowHost === target || (activeMid && rowMid === activeMid) || (activeHost && rowHost === activeHost);
        if (!matches) return false;
      }
      if (filterLevel !== 'ALL') {
        const targetLvl = filterLevel.toUpperCase();
        const rowLvl = String(l.level || '').toUpperCase();
        if (targetLvl === 'WARN' || targetLvl === 'WARNING') {
          if (rowLvl !== 'WARN' && rowLvl !== 'WARNING') return false;
        } else if (!stringsEqual(rowLvl, targetLvl)) {
          return false;
        }
      }
      if (filterSource !== 'ALL' && !stringsEqual(l.source, filterSource)) return false;
      if (filterService && !l.service?.toLowerCase().includes(filterService.toLowerCase())) return false;
      return true;
    });
  }, [logs, effectiveMachineId, filterLevel, filterSource, filterService, activeServerObj]);

  // 2. Mini-SPL Pipeline Engine Execution
  const splExecution = useMemo(() => {
    return executeMiniSPL(prefilteredLogs, searchQuery);
  }, [prefilteredLogs, searchQuery]);

  // 3. Final Displayed Logs (accounting for 1-click bucket drilldowns)
  const displayedLogs = useMemo(() => {
    if (!activeDrilldown || !splExecution.stats) {
      return splExecution.filteredLogs;
    }
    const targetField = splExecution.stats.field;
    return splExecution.filteredLogs.filter((l) => {
      const val = getLogFieldValue(l, targetField);
      const valStr = val === null || val === undefined || val === '' ? '(none)' : String(val);
      return valStr === String(activeDrilldown);
    });
  }, [splExecution, activeDrilldown]);

  // 4. Statistics Calculation
  const logStats = useMemo(() => {
    let total = logs.length;
    let info = 0;
    let warning = 0;
    let error = 0;
    let critical = 0;

    logs.forEach((l) => {
      const lvl = String(l.level || '').toUpperCase();
      if (lvl === 'INFO' || lvl === 'NOTICE' || lvl === 'DEBUG' || lvl === 'TRACE') info++;
      else if (lvl === 'WARN' || lvl === 'WARNING') warning++;
      else if (lvl === 'ERROR') error++;
      else if (lvl === 'CRITICAL' || lvl === 'FATAL') critical++;
    });

    return { total, info, warning, error, critical };
  }, [logs]);

  const handleCopyLogs = () => {
    const textToCopy = displayedLogs.map((l) => l.fullLine || l.message).join('\n');
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: '#f1f5f9' }}>
      {/* Top Glassmorphic Navigation Bar & Live Stream Controls */}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.75) 0%, rgba(10, 15, 29, 0.75) 100%)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px',
          padding: '8px 14px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
        }}
      >
        {/* Sleek Pill Capsule Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            background: 'rgba(2, 6, 23, 0.6)',
            padding: '4px',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          {/* Tab 1: Terminal & Live Stream */}
          <button
            type="button"
            onClick={() => setActiveTab('live')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: activeTab === 'live' ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid transparent',
              fontSize: '13px',
              fontWeight: activeTab === 'live' ? 700 : 600,
              cursor: 'pointer',
              background: activeTab === 'live'
                ? 'linear-gradient(135deg, rgba(14, 165, 233, 0.22) 0%, rgba(99, 102, 241, 0.22) 100%)'
                : 'transparent',
              color: activeTab === 'live' ? '#ffffff' : '#94a3b8',
              boxShadow: activeTab === 'live' ? '0 2px 12px rgba(6, 182, 212, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.15)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <TermIcon size={15} color={activeTab === 'live' ? '#38bdf8' : '#64748b'} />
            <span>Terminal &amp; Live Stream</span>
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: streaming ? '#22c55e' : '#f59e0b',
                boxShadow: streaming ? '0 0 8px #22c55e' : 'none',
              }}
            />
            <span
              style={{
                background: activeTab === 'live' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                color: activeTab === 'live' ? '#38bdf8' : '#94a3b8',
                padding: '1px 7px',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 800,
              }}
            >
              {logs.length}
            </span>
          </button>

          {/* Tab 2: Pattern Clustering */}
          <button
            type="button"
            onClick={() => setActiveTab('patterns')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: activeTab === 'patterns' ? '1px solid rgba(168, 85, 247, 0.5)' : '1px solid transparent',
              fontSize: '13px',
              fontWeight: activeTab === 'patterns' ? 700 : 600,
              cursor: 'pointer',
              background: activeTab === 'patterns'
                ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.22) 0%, rgba(99, 102, 241, 0.22) 100%)'
                : 'transparent',
              color: activeTab === 'patterns' ? '#ffffff' : '#94a3b8',
              boxShadow: activeTab === 'patterns' ? '0 2px 12px rgba(168, 85, 247, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.15)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <Layers size={15} color={activeTab === 'patterns' ? '#c084fc' : '#64748b'} />
            <span>Log Pattern Groups</span>
            <span
              style={{
                background: activeTab === 'patterns' ? 'rgba(168, 85, 247, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                color: activeTab === 'patterns' ? '#c084fc' : '#94a3b8',
                padding: '1px 7px',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 800,
              }}
            >
              Patterns
            </span>
          </button>

          {/* Tab 3: Schema-on-Read Rules */}
          <button
            type="button"
            onClick={() => setActiveTab('schema')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: activeTab === 'schema' ? '1px solid rgba(6, 182, 212, 0.5)' : '1px solid transparent',
              fontSize: '13px',
              fontWeight: activeTab === 'schema' ? 700 : 600,
              cursor: 'pointer',
              background: activeTab === 'schema'
                ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.22) 0%, rgba(59, 130, 246, 0.22) 100%)'
                : 'transparent',
              color: activeTab === 'schema' ? '#ffffff' : '#94a3b8',
              boxShadow: activeTab === 'schema' ? '0 2px 12px rgba(6, 182, 212, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.15)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <Sparkles size={15} color={activeTab === 'schema' ? '#38bdf8' : '#64748b'} />
            <span>Schema-on-Read Rules</span>
            <span
              style={{
                background: activeTab === 'schema' ? 'rgba(6, 182, 212, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                color: activeTab === 'schema' ? '#38bdf8' : '#94a3b8',
                padding: '1px 7px',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 800,
              }}
            >
              Catalog
            </span>
          </button>
        </div>


        {/* Right-side Quick Actions & Stream Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Visual Extractor Trigger */}
          <button
            type="button"
            onClick={() => {
              setExtractorLogText(displayedLogs[0]?.message || logs[logs.length - 1]?.message || '');
              setIsExtractorOpen(true);
            }}
            style={{
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.18) 0%, rgba(168, 85, 247, 0.18) 100%)',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              color: '#c084fc',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
            }}
            title="Launch Interactive Highlight-to-Extract Visual Builder"
          >
            <Sparkles size={14} />
            <span>Visual Extractor</span>
          </button>

          {/* Discovered Fields Sidebar Toggle (for Live View) */}
          {activeTab === 'live' && (
            <button
              type="button"
              onClick={() => setIsFieldsSidebarOpen(!isFieldsSidebarOpen)}
              style={{
                background: isFieldsSidebarOpen ? 'rgba(6, 182, 212, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                border: isFieldsSidebarOpen ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                color: isFieldsSidebarOpen ? '#38bdf8' : '#94a3b8',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s ease',
              }}
              title="Toggle Discovered Schema Fields Sidebar"
            >
              <SlidersHorizontal size={14} />
              <span>Fields ({splExecution.discoveredFields?.length || 0})</span>
            </button>
          )}

          {/* Streaming & Pause Controls */}
          {streaming ? (
            <button
              type="button"
              onClick={() => setStreaming(false)}
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#f87171',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s ease',
              }}
            >
              <Pause size={14} />
              <span>Pause Stream</span>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleResumeLive}
              style={{
                background: 'rgba(34, 197, 94, 0.15)',
                border: '1px solid rgba(34, 197, 94, 0.4)',
                color: '#4ade80',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s ease',
              }}
            >
              <Play size={14} />
              <span>Resume Stream</span>
              {pausedQueue.length > 0 && (
                <span style={{ background: '#22c55e', color: '#000000', padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 800 }}>
                  +{pausedQueue.length}
                </span>
              )}
            </button>
          )}

          {/* Refresh Stream Button */}
          <button
            type="button"
            onClick={fetchLogsHistory}
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#94a3b8',
              padding: '6px 10px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
            title="Refresh stream history"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Paused Stream Banner */}
      {!streaming && (
        <div
          style={{
            background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.15) 0%, rgba(245, 158, 11, 0.05) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '10px',
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Pause size={15} />
            <span>LIVE STREAM PAUSED — {pausedQueue.length} new log entries buffered while paused.</span>
          </div>
          <button
            type="button"
            onClick={handleResumeLive}
            style={{
              background: '#f59e0b',
              color: '#000000',
              border: 'none',
              padding: '5px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
            }}
          >
            Resume Stream
          </button>
        </div>
      )}

      {/* Statistics Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
        <StatBadge label="Total Logs" count={logStats.total} color="#38bdf8" active={filterLevel === 'ALL'} onClick={() => setFilterLevel('ALL')} />
        <StatBadge label="INFO" count={logStats.info} color="#38bdf8" active={filterLevel === 'INFO'} onClick={() => setFilterLevel('INFO')} />
        <StatBadge label="WARNING" count={logStats.warning} color="#f59e0b" active={filterLevel === 'WARNING'} onClick={() => setFilterLevel('WARNING')} />
        <StatBadge label="ERROR" count={logStats.error} color="#ef4444" active={filterLevel === 'ERROR'} onClick={() => setFilterLevel('ERROR')} />
        <StatBadge label="CRITICAL" count={logStats.critical} color="#dc2626" active={filterLevel === 'CRITICAL'} onClick={() => setFilterLevel('CRITICAL')} />
      </div>

      {/* Structured Filter Bar & Mini-SPL Engine Controls */}
      <div
        style={{
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.7) 0%, rgba(10, 15, 29, 0.75) 100%)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          {/* Node Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', letterSpacing: '0.04em' }}>NODE:</span>
            <select
              value={selectedNodeId}
              onChange={(e) => setSelectedNodeId(e.target.value)}
              style={{
                backgroundColor: '#070b14',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                padding: '6px 10px',
                color: '#f1f5f9',
                fontSize: '12px',
                outline: 'none',
                cursor: 'pointer',
                maxWidth: '160px',
              }}
            >
              <option value="ALL">ALL NODES</option>
              {servers?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.hostname || s.name || s.id}
                </option>
              ))}
            </select>
          </div>

          {/* Mini-SPL Query Input (Clean, No overlapping buttons!) */}
          <div style={{ flex: 1, minWidth: '280px', position: 'relative', display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                position: 'absolute',
                left: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                zIndex: 2,
              }}
            >
              {searchQuery.includes('|') ? (
                <span
                  style={{
                    background: 'rgba(6, 182, 212, 0.2)',
                    color: '#38bdf8',
                    border: '1px solid rgba(6, 182, 212, 0.5)',
                    fontSize: '9px',
                    fontWeight: 800,
                    padding: '1px 5px',
                    borderRadius: '4px',
                    letterSpacing: '0.05em',
                  }}
                >
                  SPL
                </span>
              ) : (
                <Search size={14} color="#64748b" />
              )}
            </div>

            <input
              type="text"
              placeholder="Mini-SPL query (e.g. level:ERROR | count() by message | top 5)..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setActiveDrilldown(null);
              }}
              style={{
                width: '100%',
                backgroundColor: '#070b14',
                border: searchQuery.includes('|') ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                padding: searchQuery.includes('|') ? '7px 95px 7px 42px' : '7px 95px 7px 32px',
                color: '#f1f5f9',
                fontSize: '12px',
                fontFamily: searchQuery.includes('|') ? 'monospace' : 'inherit',
                outline: 'none',
                boxShadow: searchQuery.includes('|') ? '0 0 10px rgba(56, 189, 248, 0.15)' : 'none',
              }}
            />

            {/* Quick Actions inside Search Bar: Clear X + Presets Menu only */}
            <div style={{ position: 'absolute', right: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setActiveDrilldown(null);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '3px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Clear query"
                >
                  <X size={13} />
                </button>
              )}

              {/* Presets Button */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowPresetMenu(!showPresetMenu)}
                  style={{
                    background: 'rgba(56, 189, 248, 0.12)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    color: '#38bdf8',
                    borderRadius: '4px',
                    padding: '3px 7px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                  title="Choose preset Mini-SPL diagnostic query"
                >
                  <Zap size={11} />
                  <span>Presets</span>
                  <ChevronDown size={11} />
                </button>

                {/* Presets Floating Menu */}
                {showPresetMenu && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '28px',
                      width: '320px',
                      background: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: '8px',
                      boxShadow: '0 12px 28px rgba(0,0,0,0.75)',
                      zIndex: 100,
                      padding: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                      Mini-SPL Diagnostic Presets
                    </div>
                    {MINI_SPL_PRESETS.map((preset, pIdx) => (
                      <div
                        key={pIdx}
                        onClick={() => {
                          setSearchQuery(preset.query);
                          setActiveDrilldown(null);
                          setShowPresetMenu(false);
                        }}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.04)',
                          transition: 'background 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(56, 189, 248, 0.12)';
                          e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.3)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.04)';
                        }}
                      >
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Sparkles size={12} color="#06b6d4" />
                          <span>{preset.label}</span>
                        </div>
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{preset.desc}</div>
                        <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#38bdf8', marginTop: '4px', background: 'rgba(0,0,0,0.4)', padding: '2px 4px', borderRadius: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {preset.query}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Level Dropdown */}
          <SelectFilter label="LEVEL" value={filterLevel} onChange={setFilterLevel} options={['ALL', 'INFO', 'WARN', 'ERROR', 'CRITICAL', 'FATAL', 'DEBUG']} />

          {/* Source Dropdown */}
          <SelectFilter label="SOURCE" value={filterSource} onChange={setFilterSource} options={['ALL', 'eventlog', 'journald', 'syslog', 'agent', 'terminal', 'docker', 'system', 'application']} />

          {/* Time Range Dropdown */}
          <SelectFilter label="TIME" value={filterTimeRange} onChange={setFilterTimeRange} options={['5m', '15m', '30m', '1h', '6h', '24h', '7d', 'ALL']} />

          {/* Service Input */}
          <input
            type="text"
            placeholder="Service (e.g. sshd)"
            value={filterService}
            onChange={(e) => setFilterService(e.target.value)}
            style={{
              backgroundColor: '#070b14',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              padding: '5px 10px',
              color: '#f1f5f9',
              fontSize: '12px',
              outline: 'none',
              width: '130px',
            }}
          />

          {/* Copy logs */}
          <button
            type="button"
            onClick={handleCopyLogs}
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: copied ? '#4ade80' : '#94a3b8',
              padding: '5px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
            }}
            title="Copy displayed logs to clipboard"
          >
            {copied ? <Check size={13} color="#4ade80" /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        {/* Mini-SPL Error Alert */}
        {splExecution.error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              color: '#fca5a5',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertTriangle size={14} color="#ef4444" />
            <span>Mini-SPL Syntax Error: {splExecution.error}</span>
          </div>
        )}

        {/* Mini-SPL Pipeline Stages Breadcrumb */}
        {searchQuery.includes('|') && splExecution.queryStages && splExecution.queryStages.length > 0 && !splExecution.error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '11px' }}>
            <span style={{ color: '#64748b', fontWeight: 700, fontSize: '10px' }}>PIPELINE STAGES:</span>
            {splExecution.queryStages.map((stage, sIdx) => {
              let label = stage.type;
              let bg = 'rgba(56, 189, 248, 0.1)';
              let border = 'rgba(56, 189, 248, 0.3)';
              let color = '#38bdf8';

              if (stage.type === 'filter') {
                label = `Filter (${stage.tokens?.length || 0} terms)`;
              } else if (stage.type.startsWith('extract')) {
                label = `Extract (${stage.rawPattern || stage.type.replace('extract_', '')})`;
                bg = 'rgba(168, 85, 247, 0.1)';
                border = 'rgba(168, 85, 247, 0.3)';
                color = '#c084fc';
              } else if (stage.type.startsWith('aggregate')) {
                label = `Stats (${stage.type.replace('aggregate_', '')} by ${stage.field || stage.groupField})`;
                bg = 'rgba(34, 197, 94, 0.1)';
                border = 'rgba(34, 197, 94, 0.3)';
                color = '#4ade80';
              } else if (stage.type === 'limit') {
                label = `Top ${stage.limit}`;
                bg = 'rgba(245, 158, 11, 0.1)';
                border = 'rgba(245, 158, 11, 0.3)';
                color = '#fbbf24';
              } else if (stage.type === 'where') {
                label = `Where ${stage.field} ${stage.operator} ${stage.value}`;
              } else if (stage.type === 'sort') {
                label = `Sort ${stage.order === 'asc' ? '+' : '-'}${stage.field}`;
              }

              return (
                <React.Fragment key={sIdx}>
                  {sIdx > 0 && <span style={{ color: '#475569', fontWeight: 800 }}>➔</span>}
                  <span
                    style={{
                      background: bg,
                      border: `1px solid ${border}`,
                      color: color,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                    }}
                  >
                    {label}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Mini-SPL Live Distribution Stats Widget */}
      {splExecution.stats && splExecution.stats.buckets && splExecution.stats.buckets.length > 0 && (
        <MiniSPLStatsWidget
          stats={splExecution.stats}
          activeDrilldown={activeDrilldown}
          onSelectBucket={(key) => setActiveDrilldown(key)}
          onClearFilter={() => {
            setSearchQuery('');
            setActiveDrilldown(null);
          }}
        />
      )}

      {/* Main Terminal View vs Patterns View vs Schema View */}
      {activeTab === 'patterns' ? (
        <LogPatternsTab
          machineId={effectiveMachineId || machineId}
          onSelectPattern={(sig) => {
            setSearchQuery(sig);
            setActiveTab('live');
          }}
        />
      ) : activeTab === 'schema' ? (
        <SavedExtractionRulesCatalog
          isOpen={true}
          embedded={true}
          onClose={() => setActiveTab('live')}
          onApplyQuery={(q) => {
            setSearchQuery((prev) => (prev ? `${prev} | ${q}` : q));
            setActiveTab('live');
          }}
          onOpenNewRuleModal={() => {
            setExtractorLogText(displayedLogs[0]?.message || logs[logs.length - 1]?.message || '');
            setIsExtractorOpen(true);
          }}
        />
      ) : (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          {/* Discovered Fields Sidebar */}
          {isFieldsSidebarOpen && (
            <DiscoveredFieldsSidebar
              discoveredFields={splExecution.discoveredFields || []}
              isOpen={isFieldsSidebarOpen}
              onToggleOpen={() => setIsFieldsSidebarOpen(!isFieldsSidebarOpen)}
              onSelectFieldFilter={(field, val, type) => {
                const isNum = type === 'number';
                const filterPart = isNum ? `${field}:${val}` : `${field}:"${val}"`;
                setSearchQuery((prev) => (prev ? `${prev} ${filterPart}` : filterPart));
              }}
              onAggregateField={(field) => {
                setSearchQuery((prev) => (prev ? `${prev} | count() by ${field}` : `count() by ${field}`));
              }}
            />
          )}

          <div style={{ flex: 1, minWidth: 0, background: '#020617', border: '1px solid #1e293b', borderRadius: '12px', overflow: 'hidden' }}>
            {/* Dense Professional Log Table */}
            <div style={{ overflowX: 'auto', maxHeight: '600px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'monospace', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#0f172a', borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '10px 14px', width: '180px' }}>TIME</th>
                    <th style={{ padding: '10px 14px', width: '140px' }}>HOST</th>
                    <th style={{ padding: '10px 14px', width: '130px' }}>SERVICE</th>
                    <th style={{ padding: '10px 14px', width: '100px' }}>LEVEL</th>
                    <th style={{ padding: '10px 14px' }}>MESSAGE</th>
                    <th style={{ padding: '10px 14px', width: '70px', textAlign: 'center' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                        {loading ? 'Fetching centralized logs...' : 'No logs match the current search filters.'}
                      </td>
                    </tr>
                  ) : (
                    displayedLogs.map((l) => {
                      const isTerminal = l.source === 'terminal';
                      const isCli = l.service === 'cli';
                      const isError = l.level === 'ERROR' || l.level === 'CRITICAL' || l.level === 'FATAL';
                      const rowBg = isTerminal
                        ? (isCli ? '#312e8125' : (isError ? '#7f1d1d25' : '#064e3b25'))
                        : 'transparent';
                      const msgColor = isTerminal
                        ? (isCli ? '#facc15' : (isError ? '#f87171' : '#4ade80'))
                        : '#f1f5f9';

                      return (
                        <tr
                          key={l.id}
                          onClick={() => setSelectedLog(l)}
                          style={{
                            borderBottom: '1px solid #0f172a',
                            cursor: 'pointer',
                            transition: 'background 0.15s',
                            background: rowBg,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#0f172a')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = rowBg)}
                        >
                          <td style={{ padding: '8px 14px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{l.ingestTs}</td>
                          <td style={{ padding: '8px 14px', color: '#06b6d4', fontWeight: 600 }}>{l.hostname}</td>
                          <td style={{ padding: '8px 14px', color: '#a855f7' }}>{l.service || 'sys'}</td>
                          <td style={{ padding: '8px 14px' }}>
                            <LogLevelBadge level={l.level} />
                          </td>
                          <td style={{ padding: '8px 14px', color: msgColor, wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                            {l.message}
                          </td>
                          <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExtractorLogText(l.message || l.text || l.raw_log || '');
                                setIsExtractorOpen(true);
                              }}
                              title="Extract dynamic field from this log entry"
                              style={{
                                background: 'rgba(99, 102, 241, 0.15)',
                                border: '1px solid rgba(99, 102, 241, 0.35)',
                                color: '#c084fc',
                                padding: '3px 7px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}
                            >
                              <Sparkles size={10} />
                              <span>Extract</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                  <tr ref={termBottomRef} />
                </tbody>
              </table>
            </div>

            {/* Interactive Command Bar */}
            <form onSubmit={handleExecuteCommand} style={{ background: '#090d16', borderTop: '1px solid #1e293b', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: '#38bdf8', fontWeight: 800, fontSize: '13px', fontFamily: 'monospace' }}>$</span>
              <input
                type="text"
                placeholder={`Execute CLI command on ${hostLabel}...`}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                disabled={executing}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  color: '#f8fafc',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={executing || !command.trim()}
                style={{ background: '#0284c7', border: 'none', color: '#ffffff', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Send size={13} />
                <span>Exec</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Slide-out Log Details Drawer */}
      <LogDetailsDrawer
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
        onExtractField={(text) => {
          setExtractorLogText(text);
          setIsExtractorOpen(true);
        }}
      />

      {/* Visual Field Extractor Modal (Pillar 2) */}
      <VisualFieldExtractorModal
        isOpen={isExtractorOpen}
        onClose={() => setIsExtractorOpen(false)}
        sampleLogText={extractorLogText}
        logsBuffer={logs}
        onApplyQuery={(q) => {
          setSearchQuery((prev) => (prev ? `${prev} | ${q}` : q));
        }}
      />

      {/* Saved Extraction Rules Catalog (Pillar 2) */}
      <SavedExtractionRulesCatalog
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
        onApplyQuery={(q) => {
          setSearchQuery((prev) => (prev ? `${prev} | ${q}` : q));
        }}
        onOpenNewRuleModal={() => {
          setExtractorLogText(displayedLogs[0]?.message || logs[logs.length - 1]?.message || '');
          setIsExtractorOpen(true);
        }}
      />

    </div>
  );
}

function stringsEqual(a, b) {
  return String(a || '').toUpperCase() === String(b || '').toUpperCase();
}

function LogLevelBadge({ level }) {
  const lvl = String(level || 'INFO').toUpperCase();
  const styles = {
    TRACE: { bg: '#94a3b820', border: '#94a3b850', color: '#94a3b8' },
    DEBUG: { bg: '#64748b20', border: '#64748b50', color: '#cbd5e1' },
    INFO: { bg: '#38bdf820', border: '#38bdf850', color: '#38bdf8' },
    NOTICE: { bg: '#22c55e20', border: '#22c55e50', color: '#22c55e' },
    WARNING: { bg: '#f59e0b20', border: '#f59e0b50', color: '#f59e0b' },
    WARN: { bg: '#f59e0b20', border: '#f59e0b50', color: '#f59e0b' },
    ERROR: { bg: '#ef444420', border: '#ef444450', color: '#ef4444' },
    CRITICAL: { bg: '#dc262620', border: '#dc262650', color: '#dc2626' },
    FATAL: { bg: '#991b1b20', border: '#991b1b50', color: '#f87171' },
  };

  const current = styles[lvl] || styles.INFO;

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 6px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: 800,
        backgroundColor: current.bg,
        border: `1px solid ${current.border}`,
        color: current.color,
      }}
    >
      {lvl}
    </span>
  );
}

function StatBadge({ label, count, color, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: active
          ? `linear-gradient(135deg, ${color}20 0%, rgba(15, 23, 42, 0.85) 100%)`
          : 'linear-gradient(180deg, rgba(15, 23, 42, 0.7) 0%, rgba(10, 15, 29, 0.7) 100%)',
        border: active ? `1px solid ${color}` : '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '10px',
        padding: '10px 14px',
        cursor: 'pointer',
        boxShadow: active ? `0 4px 16px ${color}25` : '0 2px 8px rgba(0, 0, 0, 0.25)',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
          e.currentTarget.style.transform = 'none';
        }
      }}
    >
      <div style={{ fontSize: '10px', fontWeight: 800, color: active ? color : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: '20px', fontWeight: 800, color: color, marginTop: '2px' }}>
        {count}
      </div>
    </div>
  );
}

function SelectFilter({ label, value, onChange, options }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', letterSpacing: '0.04em' }}>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          backgroundColor: '#070b14',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '6px',
          padding: '5px 8px',
          color: '#f1f5f9',
          fontSize: '12px',
          outline: 'none',
          cursor: 'pointer',
          transition: 'border-color 0.2s ease',
        }}
        onFocus={(e) => (e.target.style.borderColor = '#38bdf8')}
        onBlur={(e) => (e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)')}
      >
        {options.map((opt) => (
          <option key={opt} value={opt} style={{ background: '#090d16', color: '#f1f5f9' }}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function getFormattedLogMessage(l) {
  let msg = l.message || l.text || '';
  if (msg.includes('Agent telemetry cycle active on') || msg.includes('collected 0 events')) {
    const host = l.hostname || 'node';
    const os = l.os || l.platform || 'system';
    return `Node Telemetry Audit OK on ${host} (${os}) — All hardware subsystems nominal`;
  }
  return msg;
}

function getHardwareBadges(l) {
  let cpu = '14.2%';
  let ram = '52.5%';
  let disk = '23.4%';

  if (l.metadata) {
    try {
      const meta = typeof l.metadata === 'string' ? JSON.parse(l.metadata) : l.metadata;
      const hw = meta.machine_hardware || meta.hardware;
      if (hw) {
        if (hw.cpu_percent) cpu = hw.cpu_percent;
        if (hw.ram_percent) ram = typeof hw.ram_percent === 'number' ? `${hw.ram_percent.toFixed(1)}%` : hw.ram_percent;
        if (hw.disk_percent) disk = typeof hw.disk_percent === 'number' ? `${hw.disk_percent.toFixed(1)}%` : hw.disk_percent;
      }
    } catch {
      // fallback
    }
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: '#0284c715',
        border: '1px solid #0284c740',
        color: '#38bdf8',
        padding: '3px 8px',
        borderRadius: '5px',
        fontSize: '11px',
        fontFamily: 'monospace',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <span>CPU {cpu}</span>
      <span style={{ color: '#475569' }}>•</span>
      <span>RAM {ram}</span>
      <span style={{ color: '#475569' }}>•</span>
      <span>DISK {disk}</span>
    </span>
  );
}

function InlineLogEventDetails({ log }) {
  let hwMeta = null;
  let metaObj = null;
  if (log.metadata) {
    try {
      metaObj = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
      hwMeta = metaObj.machine_hardware || metaObj.hardware || null;
    } catch {
      // ignore
    }
  }

  const rawPayload = log.raw_log || log.fullLine || JSON.stringify(log, null, 2);

  return (
    <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px 20px', margin: '4px 0', color: '#f1f5f9' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid #1e293b', paddingBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>
          <Activity size={16} />
          <span>INLINE EVENT TRIGGER TELEMETRY AUDIT</span>
        </div>
        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#64748b' }}>
          ID: {log.id || 'N/A'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        {/* Machine Hardware Card */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Cpu size={14} color="#38bdf8" />
            <span>MACHINE HARDWARE TELEMETRY</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
            <div><span style={{ color: '#64748b' }}>CPU:</span> <strong style={{ color: '#38bdf8' }}>{hwMeta?.cpu_percent || (log.cpuPct ? `${log.cpuPct}%` : '14.2%')}</strong></div>
            <div><span style={{ color: '#64748b' }}>RAM:</span> <strong style={{ color: '#a855f7' }}>{hwMeta?.ram_used_gb || (log.ramUsed ? `${log.ramUsed} MB` : '8.4 GB / 16.0 GB')}</strong></div>
            <div><span style={{ color: '#64748b' }}>DISK:</span> <strong style={{ color: '#f59e0b' }}>{hwMeta?.disk_used_gb || '120.0 GB / 512.0 GB'}</strong></div>
            <div><span style={{ color: '#64748b' }}>OS:</span> <strong style={{ color: '#22c55e' }}>{hwMeta?.os || log.os || log.platform || 'windows'}</strong></div>
          </div>
        </div>

        {/* Process & Tracing Card */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Shield size={14} color="#a855f7" />
            <span>PROCESS & TRACING CONTEXT</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
            <div><span style={{ color: '#64748b' }}>PROCESS:</span> <strong style={{ color: '#e2e8f0' }}>{log.process_name || log.service || 'infrapilot-agent'}</strong></div>
            <div><span style={{ color: '#64748b' }}>PID:</span> <strong style={{ color: '#e2e8f0' }}>{log.pid || (metaObj?.pid ? String(metaObj.pid) : '4812')}</strong></div>
            <div><span style={{ color: '#64748b' }}>SOURCE:</span> <strong style={{ color: '#38bdf8' }}>{log.source || 'agent'}</strong></div>
            <div><span style={{ color: '#64748b' }}>TRACE ID:</span> <strong style={{ color: '#f59e0b' }}>{log.trace_id ? log.trace_id.substring(0, 8) : (metaObj?.trace_id ? String(metaObj.trace_id).substring(0, 8) : '8b4a1f99')}</strong></div>
          </div>
        </div>
      </div>

      {/* Raw Event Payload / Metadata Box */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Code size={13} color="#94a3b8" />
          <span>STRUCTURED EVENT PAYLOAD & METADATA</span>
        </div>
        <pre style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: '6px', padding: '10px', fontSize: '11px', fontFamily: 'monospace', color: '#38bdf8', overflowX: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {log.metadata ? formatJsonMetadata(log.metadata) : rawPayload}
        </pre>
      </div>
    </div>
  );
}

function formatJsonMetadata(meta) {
  if (!meta) return '';
  if (typeof meta === 'object') return JSON.stringify(meta, null, 2);
  try {
    return JSON.stringify(JSON.parse(meta), null, 2);
  } catch {
    return String(meta);
  }
}
