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
  Layers,
  Activity,
  Filter,
  Shield,
  Clock,
  AlertTriangle,
  ChevronDown
} from 'lucide-react';
import { apiClient } from '../../api/client.js';
import { createLiveEventsSocket } from '../../websocket/liveEvents.js';
import { getMachineId } from '../../utils/machineId.js';
import { useServerStore } from '../../store/serverStore.jsx';
import LogDetailsDrawer from './LogDetailsDrawer.jsx';
import LogPatternsTab from './LogPatternsTab.jsx';

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
  const machineId = activeMachine ? getMachineId(activeMachine) : '';
  const hostLabel = machineName || activeMachine?.hostname || activeMachine?.name || 'ALL NODES';
  const rawHost = activeMachine?.hostname || activeMachine?.name || 'node';

  const [activeTab, setActiveTab] = useState('live'); // 'live' | 'patterns'
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(true);
  const [pausedQueue, setPausedQueue] = useState([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

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
          machine_id: machineId || '',
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
          ingestTs: formatIngestTs(new Date(l.timestamp || l.created_at || Date.now())),
          hostname: l.hostname || rawHost,
          level: (l.level || parseLogLevel(l.message)).toUpperCase(),
          source: l.source || 'system',
          service: l.service || 'systemd',
          message: l.message || '',
          text: `[${(l.level || 'INFO').toUpperCase()}] ${l.message}`,
          fullLine: `[${formatIngestTs(new Date(l.timestamp || Date.now()))}] ${l.hostname || rawHost} [${l.service || 'sys'}] [${(l.level || 'INFO').toUpperCase()}] ${l.message}`,
          os: l.os || l.platform || activeMachine?.os || 'linux',
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
  }, [machineId, filterLevel, filterSource, filterTimeRange, filterService]);

  // 2. Real-time WebSocket Live Stream Listener
  useEffect(() => {
    let socket;
    try {
      socket = createLiveEventsSocket();
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.event === 'log_entry' || payload.log || payload.cpu_usage !== undefined || payload.message) {
            const l = payload.log || payload;
            const eventHost = l.hostname || payload.hostname || rawHost;

            const matches = !machineId || String(l.machine_id || payload.machine_id).toLowerCase() === String(machineId).toLowerCase();

            if (matches) {
              const now = new Date(l.timestamp || l.created_at || Date.now());
              const msgText = l.message || (payload.cpu_usage !== undefined ? `Telemetry: CPU=${payload.cpu_usage}%, RAM=${payload.memory_percent || 0}%` : 'Log stream event');
              const newEntry = {
                id: l.id || `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                ingestTs: formatIngestTs(now),
                hostname: eventHost,
                level: (l.level || parseLogLevel(msgText)).toUpperCase(),
                source: l.source || 'system',
                service: l.service || 'agent',
                message: msgText,
                text: `[${(l.level || parseLogLevel(msgText)).toUpperCase()}] ${msgText}`,
                fullLine: `[${formatIngestTs(now)}] ${eventHost} [${l.service || 'agent'}] ${msgText}`,
              };

              if (streaming) {
                setLogs((prev) => [...prev.slice(-400), newEntry]);
              } else {
                setPausedQueue((prev) => [...prev, newEntry]);
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
  }, [streaming, machineId, rawHost]);

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

    const cmdStr = command.trim();
    setCommand('');
    setExecuting(true);

    const now = new Date();
    const userLog = {
      id: `cmd-${now.getTime()}`,
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
        machine_id: machineId,
        command: cmdStr,
      });

      const outText = res.data?.output || res.data?.message || 'Command executed successfully.';
      const resLog = {
        id: `res-${now.getTime()}`,
        ingestTs: formatIngestTs(new Date()),
        hostname: rawHost,
        level: 'INFO',
        source: 'terminal',
        service: 'cli',
        message: outText,
        text: outText,
        fullLine: `[${formatIngestTs(new Date())}] ${outText}`,
      };
      setLogs((prev) => [...prev, resLog]);
    } catch (err) {
      const errText = err.response?.data?.error || err.message || 'Execution failed.';
      const errLog = {
        id: `err-${now.getTime()}`,
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

  // Filtered Logs Calculation
  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (filterLevel !== 'ALL' && !stringsEqual(l.level, filterLevel)) return false;
      if (filterSource !== 'ALL' && !stringsEqual(l.source, filterSource)) return false;
      if (filterService && !l.service?.toLowerCase().includes(filterService.toLowerCase())) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesMsg = l.message?.toLowerCase().includes(q);
        const matchesHost = l.hostname?.toLowerCase().includes(q);
        const matchesSvc = l.service?.toLowerCase().includes(q);
        if (!matchesMsg && !matchesHost && !matchesSvc) return false;
      }
      return true;
    });
  }, [logs, filterLevel, filterSource, filterService, searchQuery]);

  // Statistics Calculation
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
    const textToCopy = filteredLogs.map((l) => l.fullLine || l.message).join('\n');
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: '#f1f5f9' }}>
      {/* Top Controls & View Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        {/* Tab Buttons */}
        <div style={{ display: 'flex', gap: '4px', background: '#0f172a', padding: '4px', borderRadius: '8px', border: '1px solid #1e293b' }}>
          <button
            onClick={() => setActiveTab('live')}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              background: activeTab === 'live' ? '#0284c7' : 'transparent',
              color: activeTab === 'live' ? '#ffffff' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <TermIcon size={15} />
            <span>Terminal &amp; Live Stream</span>
          </button>
          <button
            onClick={() => setActiveTab('patterns')}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              background: activeTab === 'patterns' ? '#0284c7' : 'transparent',
              color: activeTab === 'patterns' ? '#ffffff' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Layers size={15} />
            <span>Log Pattern Groups</span>
          </button>
        </div>

        {/* Streaming & Pause Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {streaming ? (
            <button
              onClick={() => setStreaming(false)}
              style={{
                background: '#ef444420',
                border: '1px solid #ef444450',
                color: '#ef4444',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Pause size={14} />
              <span>Pause Live</span>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />
            </button>
          ) : (
            <button
              onClick={handleResumeLive}
              style={{
                background: '#22c55e20',
                border: '1px solid #22c55e50',
                color: '#22c55e',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Play size={14} />
              <span>Resume Live</span>
              {pausedQueue.length > 0 && (
                <span style={{ background: '#22c55e', color: '#000000', padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 800 }}>
                  +{pausedQueue.length} new
                </span>
              )}
            </button>
          )}

          <button
            onClick={fetchLogsHistory}
            style={{ background: '#0f172a', border: '1px solid #1e293b', color: '#94a3b8', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Paused Stream Banner */}
      {!streaming && (
        <div style={{ background: '#f59e0b15', border: '1px solid #f59e0b40', borderRadius: '8px', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Pause size={15} />
            <span>LIVE STREAM PAUSED — {pausedQueue.length} new log entries buffered while paused.</span>
          </div>
          <button
            onClick={handleResumeLive}
            style={{ background: '#f59e0b', color: '#000000', border: 'none', padding: '4px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
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

      {/* Structured Filter Bar */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
        {/* Search Field */}
        <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
          <Search size={14} color="#64748b" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search log messages, services, hosts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: '#020617',
              border: '1px solid #1e293b',
              borderRadius: '6px',
              padding: '6px 12px 6px 32px',
              color: '#f1f5f9',
              fontSize: '12px',
              outline: 'none',
            }}
          />
        </div>

        {/* Level Dropdown */}
        <SelectFilter label="LEVEL" value={filterLevel} onChange={setFilterLevel} options={['ALL', 'INFO', 'WARNING', 'ERROR', 'CRITICAL', 'FATAL', 'DEBUG']} />

        {/* Source Dropdown */}
        <SelectFilter label="SOURCE" value={filterSource} onChange={setFilterSource} options={['ALL', 'system', 'syslog', 'eventlog', 'docker', 'kubernetes', 'security', 'application']} />

        {/* Time Range Dropdown */}
        <SelectFilter label="TIME RANGE" value={filterTimeRange} onChange={setFilterTimeRange} options={['5m', '15m', '30m', '1h', '6h', '24h', '7d', 'ALL']} />

        {/* Service Input */}
        <input
          type="text"
          placeholder="Filter Service (e.g. nginx)"
          value={filterService}
          onChange={(e) => setFilterService(e.target.value)}
          style={{
            backgroundColor: '#020617',
            border: '1px solid #1e293b',
            borderRadius: '6px',
            padding: '6px 10px',
            color: '#f1f5f9',
            fontSize: '12px',
            outline: 'none',
            width: '160px',
          }}
        />

        <button
          onClick={handleCopyLogs}
          style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          {copied ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      {/* Main Terminal View vs Patterns View */}
      {activeTab === 'patterns' ? (
        <LogPatternsTab machineId={machineId} onSelectPattern={(sig) => { setSearchQuery(sig); setActiveTab('live'); }} />
      ) : (
        <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: '12px', overflow: 'hidden' }}>
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
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                      {loading ? 'Fetching centralized logs...' : 'No logs match the current search filters.'}
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((l) => (
                    <tr
                      key={l.id}
                      onClick={() => setSelectedLog(l)}
                      style={{
                        borderBottom: '1px solid #0f172a',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#0f172a')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '8px 14px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{l.ingestTs}</td>
                      <td style={{ padding: '8px 14px', color: '#e2e8f0', fontWeight: 600 }}>{l.hostname}</td>
                      <td style={{ padding: '8px 14px', color: '#38bdf8' }}>{l.service || 'sys'}</td>
                      <td style={{ padding: '8px 14px' }}>
                        <LogLevelBadge level={l.level} />
                      </td>
                      <td style={{ padding: '8px 14px', color: '#f1f5f9', wordBreak: 'break-word' }}>{l.message}</td>
                    </tr>
                  ))
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
      )}

      {/* Slide-out Log Details Drawer */}
      <LogDetailsDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
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
        background: active ? `${color}20` : '#0f172a',
        border: `1px solid ${active ? color : '#1e293b'}`,
        borderRadius: '8px',
        padding: '10px 14px',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 800, color: color, marginTop: '2px' }}>{count}</div>
    </div>
  );
}

function SelectFilter({ label, value, onChange, options }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          backgroundColor: '#020617',
          border: '1px solid #1e293b',
          borderRadius: '6px',
          padding: '4px 8px',
          color: '#f1f5f9',
          fontSize: '12px',
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
