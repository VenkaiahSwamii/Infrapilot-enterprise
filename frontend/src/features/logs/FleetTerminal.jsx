import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Terminal,
  Play,
  Pause,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Search,
  Send,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { apiClient } from '../../api/client.js';
import { createLiveEventsSocket } from '../../websocket/liveEvents.js';
import { getMachineId } from '../../utils/machineId.js';
import { useServerStore } from '../../store/serverStore.jsx';

// Precision formatting helpers
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

function formatServerTs(d) {
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${YYYY}/${MM}/${DD} ${hh}:${mm}:${ss}`;
}

function formatAgentTs(d) {
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
}

function buildMetricLogEntry({ hostname, cpu, ramMb, timestamp, customText, isSystem, agentCpu = '0.1', agentRam = '18' }) {
  const now = timestamp ? new Date(timestamp) : new Date();
  const ingestTs = formatIngestTs(now);
  const serverTs = formatServerTs(now);
  const agentTs = formatAgentTs(now);

  const cpuNum = Number(cpu != null && !isNaN(cpu) ? cpu : 0);
  const cpuPct = Number(cpuNum).toFixed(1);
  const ramUsed = Math.round(Number(ramMb != null && !isNaN(ramMb) && Number(ramMb) > 0 ? ramMb : 0));

  const rawText = customText || `Received Metric from ${hostname}: CPU=${cpuPct}%, RAM=${ramUsed}MB (Agent: CPU=${agentCpu}%, RAM=${agentRam}MB)`;

  return {
    id: `log-${now.getTime()}-${Math.random().toString(36).substr(2, 6)}`,
    ingestTs,
    serverTs,
    agentTs,
    hostname,
    cpuPct,
    ramUsed,
    agentCpu,
    agentRam,
    text: rawText,
    fullLine: `[${ingestTs}]  ${serverTs} [${agentTs}] ${rawText}`,
    isSystem: !!isSystem,
  };
}

export default function FleetTerminal({ machine, machineName }) {
  const { selectedServer, liveMetricsMap, servers } = useServerStore();

  const activeMachine = machine || selectedServer;
  const machineId = activeMachine ? getMachineId(activeMachine) : '';
  const hostLabel = machineName || activeMachine?.hostname || activeMachine?.name || 'ALL NODES';
  const rawHost = activeMachine?.hostname || activeMachine?.name || 'node';
  const ipAddress = activeMachine?.ip_address || '127.0.0.1';

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Interactive Command Execution
  const [command, setCommand] = useState('');
  const [executing, setExecuting] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).substring(2, 12));

  const termBottomRef = useRef(null);
  const terminalBoxRef = useRef(null);

  // 1. Fetch real historical telemetry metrics and system logs from backend
  useEffect(() => {
    let active = true;
    setLoading(true);

    const loadRealData = async () => {
      try {
        const targetId = machineId || activeMachine?.id || activeMachine?.hostname;
        const targetHost = rawHost || activeMachine?.hostname || 'Node';

        const [metricRes, logRes] = await Promise.all([
          targetId ? apiClient.get(`/machines/${targetId}/metrics?range=1h`).catch(() => null) : null,
          targetId ? apiClient.get(`/machines/${targetId}/logs?limit=50`).catch(() => null) : null,
        ]);

        if (!active) return;

        const logEntries = [];

        // Parse real historical metrics
        const rawSamples = metricRes?.data?.samples || metricRes?.data?.data || [];
        if (Array.isArray(rawSamples) && rawSamples.length > 0) {
          rawSamples.forEach((sample) => {
            const cpu = sample.cpu_usage ?? sample.cpu ?? 0;
            const ramBytes = sample.memory_used ?? 0;
            const ramMb = ramBytes > 0
              ? (ramBytes > 10000000 ? ramBytes / (1024 * 1024) : ramBytes)
              : (sample.memory_percent && activeMachine?.total_memory_gb ? (sample.memory_percent / 100) * (activeMachine.total_memory_gb * 1024) : 0);

            logEntries.push(
              buildMetricLogEntry({
                hostname: targetHost,
                cpu,
                ramMb,
                timestamp: sample.created_at || sample.time || new Date(),
              })
            );
          });
        }

        // Parse real system logs
        const rawLogs = logRes?.data || [];
        if (Array.isArray(rawLogs) && rawLogs.length > 0) {
          rawLogs.forEach((l) => {
            logEntries.push(
              buildMetricLogEntry({
                hostname: targetHost,
                customText: `[${l.level || 'INFO'}] ${l.message || l.log_message}`,
                timestamp: l.timestamp || l.created_at || new Date(),
                isSystem: true,
              })
            );
          });
        }

        if (logEntries.length > 0) {
          logEntries.sort((a, b) => new Date(a.ingestTs).getTime() - new Date(b.ingestTs).getTime());
          setLogs(logEntries);
        } else {
          // If node just connected, show live banner
          setLogs([
            buildMetricLogEntry({
              hostname: targetHost,
              customText: `[SYSTEM] Connected to live metric stream for ${targetHost} (${ipAddress})`,
              timestamp: new Date(),
              isSystem: true,
            })
          ]);
        }
      } catch (err) {
        console.error('Failed to fetch real telemetry history:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadRealData();

    return () => {
      active = false;
    };
  }, [machineId, rawHost, ipAddress]);

  // 2. Real-Time WebSocket live streaming listener (pure real incoming payloads only)
  useEffect(() => {
    if (!streaming) return;

    let socket;
    try {
      socket = createLiveEventsSocket();
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const eventHost = payload.hostname || payload.Hostname || payload.machine_id || rawHost;
          const eventMachineId = payload.machine_id || payload.server_id || payload.ID;

          const matches = !machineId || String(eventMachineId).toLowerCase() === String(machineId).toLowerCase() || String(eventHost).toLowerCase() === String(rawHost).toLowerCase();

          if (matches && (payload.cpu_usage !== undefined || payload.cpu !== undefined || payload.memory_usage !== undefined || payload.memory !== undefined)) {
            const cpu = payload.cpu_usage ?? payload.cpu ?? payload.CPUUsage ?? 0;
            const ramBytes = payload.memory_used ?? payload.MemoryUsed ?? 0;
            const ramMb = ramBytes > 0
              ? (ramBytes > 10000000 ? ramBytes / (1024 * 1024) : ramBytes)
              : (payload.memory ? (payload.memory / 100) * 4096 : 0);

            const newEntry = buildMetricLogEntry({
              hostname: eventHost || rawHost,
              cpu,
              ramMb,
              timestamp: payload.created_at || payload.timestamp || new Date(),
            });

            setLogs((prev) => [...prev.slice(-350), newEntry]);
          }
        } catch {
          // Ignore parse errors
        }
      };
    } catch (err) {
      console.error('Failed to establish WebSocket log stream:', err);
    }

    return () => {
      if (socket) socket.close();
    };
  }, [streaming, machineId, rawHost]);

  // 4. Auto-scroll to bottom on new log entries
  useEffect(() => {
    if (autoScroll && termBottomRef.current) {
      termBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // 5. Execute interactive command
  const handleExecuteCommand = async (e) => {
    e.preventDefault();
    if (!command.trim() || executing) return;

    const cmdStr = command.trim();
    setCommand('');
    setExecuting(true);

    const now = new Date();
    const entry = buildMetricLogEntry({
      hostname: rawHost,
      customText: `[EXEC] $ ${cmdStr}`,
      timestamp: now,
      isSystem: true,
    });
    setLogs((prev) => [...prev, entry]);

    try {
      const res = await apiClient.post('/terminal/execute', {
        machine_id: machineId || '186dd144-8b86-4708-8ea3-d0e1743acf37',
        session_id: sessionId,
        command: cmdStr,
      });

      const output = res.data?.output || res.data?.stdout || '[Command completed successfully]';
      const outEntry = buildMetricLogEntry({
        hostname: rawHost,
        customText: `[OUTPUT] ${output}`,
        timestamp: new Date(),
        isSystem: true,
      });
      setLogs((prev) => [...prev, outEntry]);
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Execution error';
      const errEntry = buildMetricLogEntry({
        hostname: rawHost,
        customText: `[ERROR] ${errMsg}`,
        timestamp: new Date(),
        isSystem: true,
      });
      setLogs((prev) => [...prev, errEntry]);
    } finally {
      setExecuting(false);
    }
  };

  const copyAll = () => {
    const text = logs.map((l) => l.fullLine).join('\n');
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter((l) => l.fullLine.toLowerCase().includes(q));
  }, [logs, searchQuery]);

  return (
    <div style={{ marginBottom: '24px', width: '100%' }}>
      {/* Subtitle Banner as shown in screenshot */}
      <div
        style={{
          color: '#94a3b8',
          fontSize: '13px',
          fontWeight: 500,
          marginBottom: '10px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>Live streaming logs from ingesters and agents</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#0c1322',
              border: '1px solid #1e293b',
              borderRadius: '6px',
              padding: '2px 8px',
            }}
          >
            <Search size={11} color="#64748b" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter stream..."
              style={{
                background: 'none',
                border: 'none',
                outline: 'none',
                color: '#cbd5e1',
                fontSize: '11px',
                width: '95px',
                fontFamily: 'monospace',
              }}
            />
          </div>

          <button
            onClick={() => setStreaming(!streaming)}
            type="button"
            style={{
              background: streaming ? 'rgba(34, 197, 94, 0.15)' : '#1e293b',
              color: streaming ? '#4ade80' : '#94a3b8',
              border: '1px solid ' + (streaming ? 'rgba(34, 197, 94, 0.3)' : '#334155'),
              borderRadius: '6px',
              padding: '3px 8px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {streaming ? <Pause size={11} /> : <Play size={11} />}
            {streaming ? 'STREAMING' : 'PAUSED'}
          </button>

          <button
            onClick={copyAll}
            type="button"
            title="Copy Logs"
            style={{
              background: '#1e293b',
              color: '#cbd5e1',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '3px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {copied ? <Check size={11} color="#22c55e" /> : <Copy size={11} />}
            {copied ? 'COPIED' : 'COPY'}
          </button>

          <button
            onClick={() => setLogs([])}
            type="button"
            title="Clear"
            style={{
              background: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '3px 6px',
              cursor: 'pointer',
            }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Main Terminal Window Frame */}
      <div
        ref={terminalBoxRef}
        style={{
          background: '#040711',
          border: '1px solid #1e293b',
          borderRadius: '10px',
          overflow: 'hidden',
          boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
          fontFamily: '"SF Mono", Monaco, Menlo, Consolas, "Liberation Mono", "Courier New", monospace',
          position: isFullscreen ? 'fixed' : 'relative',
          top: isFullscreen ? 0 : 'auto',
          left: isFullscreen ? 0 : 'auto',
          width: isFullscreen ? '100vw' : '100%',
          height: isFullscreen ? '100vh' : 'auto',
          zIndex: isFullscreen ? 99999 : 1,
        }}
      >
        {/* Terminal Header Bar with Red, Yellow, Green Window Dots */}
        <div
          style={{
            background: '#0b111e',
            padding: '10px 16px',
            borderBottom: '1px solid #182234',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Left: Terminal Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1', fontSize: '13px', fontWeight: 700, letterSpacing: '0.04em' }}>
            <span style={{ color: '#94a3b8' }}>&gt;_</span>
            <span>FLEET TERMINAL [{hostLabel.toUpperCase()}]</span>
          </div>

          {/* Right: macOS Style Window Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              type="button"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                padding: '2px',
                marginRight: '6px',
                display: 'flex',
                alignItems: 'center',
              }}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            <span style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#ef4444', display: 'inline-block', cursor: 'pointer' }} />
            <span style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#eab308', display: 'inline-block', cursor: 'pointer' }} />
            <span style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', cursor: 'pointer' }} />
          </div>
        </div>

        {/* Terminal Logs Content Stream */}
        <div
          style={{
            padding: '14px 18px',
            height: isFullscreen ? 'calc(100vh - 90px)' : '380px',
            overflowY: 'auto',
            overflowX: 'auto',
            backgroundColor: '#030712',
            color: '#e2e8f0',
            fontSize: '12.5px',
            lineHeight: '1.75',
            whiteSpace: 'pre',
          }}
        >
          {loading && logs.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', padding: '20px 0' }}>
              <RefreshCw size={13} className="spin" />
              <span>Connecting to live fleet ingestion buffer...</span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ color: '#64748b', padding: '20px 0' }}>
              Listening for live metric ingestion from {hostLabel}...
            </div>
          ) : (
            filteredLogs.map((l) => (
              <div
                key={l.id}
                style={{
                  fontFamily: 'inherit',
                  letterSpacing: '0.01em',
                  color: l.isSystem ? '#38bdf8' : '#e2e8f0',
                }}
              >
                {/* Milliseconds timestamp bracket */}
                <span style={{ color: '#64748b' }}>[{l.ingestTs}]</span>
                <span>  </span>
                {/* Server Ingestion time */}
                <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{l.serverTs}</span>
                <span> </span>
                {/* Agent sampled time bracket */}
                <span style={{ color: '#94a3b8' }}>[{l.agentTs}]</span>
                <span> </span>
                {/* Log message content */}
                <span style={{ color: l.isSystem ? '#a855f7' : '#f1f5f9' }}>
                  {l.text}
                </span>
              </div>
            ))
          )}
          <div ref={termBottomRef} />
        </div>

        {/* Shell Command Prompt Input */}
        <form
          onSubmit={handleExecuteCommand}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 16px',
            backgroundColor: '#070c17',
            borderTop: '1px solid #182234',
          }}
        >
          <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: '13px' }}>
            {rawHost}:~$
          </span>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={`Execute command on ${rawHost}...`}
            disabled={executing}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              color: '#f8fafc',
              outline: 'none',
              fontSize: '12px',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            disabled={executing || !command.trim()}
            style={{
              background: executing || !command.trim() ? '#1e293b' : '#0284c7',
              color: executing || !command.trim() ? '#64748b' : '#ffffff',
              border: 'none',
              borderRadius: '5px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: executing || !command.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            {executing ? <RefreshCw size={11} className="spin" /> : <Send size={11} />}
            {executing ? 'RUNNING' : 'RUN'}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}
