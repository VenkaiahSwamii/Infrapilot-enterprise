import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Terminal, Play, Server, AlertTriangle, Cpu, Clock, RefreshCw } from 'lucide-react';
import { listServers } from '../api/server.js';
import { apiClient } from '../api/client.js';
import { useDashboardStore } from '../store/dashboardStore.jsx';
import { useServerStore } from '../store/serverStore.jsx';
import { getMachineId } from '../utils/machineId.js';
import ServerSelectDropdown from '../components/common/ServerSelectDropdown.jsx';

export default function TerminalPage() {
  const [searchParams] = useSearchParams();
  const targetMachineId = searchParams.get('machine_id') || searchParams.get('serverId') || searchParams.get('id') || '';

  const [servers, setServers] = useState([]);
  const [selectedServerId, setSelectedServerId] = useState(targetMachineId);
  const [command, setCommand] = useState('');
  const [sessionID] = useState(() => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
  const [history, setHistory] = useState([]);
  const [executing, setExecuting] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const { addToast } = useDashboardStore();
  const consoleBottomRef = useRef(null);

  // 1. Fetch servers list
  useEffect(() => {
    listServers()
      .then(list => {
        const serverList = Array.isArray(list) ? list : [];
        setServers(serverList);

        if (targetMachineId) {
          const match = serverList.find(s =>
            (s.id && String(s.id).toLowerCase() === targetMachineId.toLowerCase()) ||
            (s.hostname && String(s.hostname).toLowerCase() === targetMachineId.toLowerCase()) ||
            getMachineId(s) === getMachineId(targetMachineId)
          );
          if (match) {
            setSelectedServerId(match.id || match.ID || match.machine_id);
          } else {
            // Target host not yet in server list, add synthetic host option
            const syntheticHost = {
              id: targetMachineId,
              hostname: targetMachineId,
              ip_address: 'Target Host',
              status: 'ONLINE',
            };
            setServers(prev => [syntheticHost, ...prev]);
            setSelectedServerId(targetMachineId);
          }
        } else if (serverList.length > 0) {
          const firstId = serverList[0].id || serverList[0].ID || serverList[0].machine_id;
          setSelectedServerId(firstId);
        }
      })
      .catch(err => {
        console.error('Failed to retrieve servers for terminal:', err);
        if (targetMachineId) {
          const syntheticHost = {
            id: targetMachineId,
            hostname: targetMachineId,
            ip_address: 'Target Host',
            status: 'ONLINE',
          };
          setServers([syntheticHost]);
          setSelectedServerId(targetMachineId);
        }
      });
  }, [targetMachineId]);

  // 2. Load command history for selected server
  const loadHistory = async (serverId) => {
    if (!serverId) return;
    setLoadingHistory(true);
    try {
      const res = await apiClient.get(`/terminal/commands?machine_id=${serverId}`);
      if (Array.isArray(res.data)) {
        setHistory(res.data);
      }
    } catch (err) {
      console.error('Failed to load command history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (selectedServerId) {
      loadHistory(selectedServerId);
      
      // Auto-poll history every 3 seconds to see if running commands finished
      const interval = setInterval(() => {
        loadHistory(selectedServerId);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedServerId]);

  // Scroll terminal to bottom when history updates
  useEffect(() => {
    consoleBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // 3. Execute command
  const handleExecute = async (e) => {
    e.preventDefault();
    if (!selectedServerId || !command.trim()) return;

    setExecuting(true);
    const cmdStr = command;
    setCommand('');

    try {
      const res = await apiClient.post('/terminal/execute', {
        machine_id: selectedServerId,
        session_id: sessionID,
        command: cmdStr,
      });

      addToast('success', 'Command Dispatched', 'Queued command on agent execution queue.');
      
      // Instantly refresh list
      loadHistory(selectedServerId);
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Execution error';
      addToast('critical', 'Command Blocked', errMsg);
      
      // Insert simulated local failure to console
      setHistory(prev => [
        {
          ID: Math.random().toString(),
          Command: cmdStr,
          Status: 'BLOCKED',
          Output: `[SECURITY] ${errMsg}`,
          CreatedAt: new Date().toISOString(),
        },
        ...prev
      ]);
    } finally {
      setExecuting(false);
    }
  };

  const selectedServer = useMemo(() => {
    return servers.find(s => String(s.id || s.ID || s.machine_id) === String(selectedServerId));
  }, [servers, selectedServerId]);

  // We reverse history so we show the oldest at the top and newest at the bottom of the CLI scroll
  const sortedHistory = useMemo(() => {
    return [...history].reverse();
  }, [history]);

  return (
    <div className="terminal-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Terminal size={26} color="#06b6d4" />
            Interactive Terminal Command Execution
          </h1>
          <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
            Execute secure shell commands directly on target machines. Restricted by audit policies.
          </p>
        </div>

        {/* Server Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>TARGET SERVER:</label>
          <ServerSelectDropdown
            value={selectedServerId}
            onChange={(sId) => setSelectedServerId(sId)}
          />
        </div>
      </div>

      {servers.length === 0 ? (
        <div className="empty-state" style={{ textAlign: 'center', padding: '80px 24px', backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', color: '#64748b' }}>
          <AlertTriangle size={48} color="#f59e0b" style={{ marginBottom: '16px' }} />
          <strong>No Online Monitored Servers Available</strong>
          <p style={{ fontSize: '12px', marginTop: '4px' }}>Ensure at least one agent is running, active, and reporting an online state.</p>
        </div>
      ) : (
        <div className="terminal-container" style={{ display: 'grid', gridTemplateRows: '1fr auto', height: 'calc(100vh - 200px)', backgroundColor: '#080c14', border: '1px solid #1f2e44', borderRadius: '12px', overflow: 'hidden' }}>
          
          {/* Output Display Console */}
          <div className="console-display" style={{ padding: '20px', overflowY: 'auto', fontFamily: '"JetBrains Mono", monospace', fontSize: '13px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            <div className="console-welcome" style={{ color: '#64748b', fontSize: '12px', borderBottom: '1px solid #1f2e44', paddingBottom: '12px' }}>
              <div>// CONNECTED TO SERVER: {selectedServer?.hostname} ({selectedServer?.ip_address})</div>
              <div>// SESSION ID: {sessionID}</div>
              <div>// WARNING: All commands are logged to audit ledger. Blocked commands trigger warnings.</div>
            </div>

            {sortedHistory.map((cmd) => {
              const dateStr = new Date(cmd.created_at || cmd.CreatedAt).toLocaleTimeString();
              const statusStr = String(cmd.status || cmd.Status).toUpperCase();
              
              let statusColor = '#94a3b8'; // default
              if (statusStr === 'PENDING') statusColor = '#f59e0b';
              else if (statusStr === 'RUNNING') statusColor = '#3b82f6';
              else if (statusStr === 'COMPLETED' || statusStr === 'SUCCESS') statusColor = '#22c55e';
              else if (statusStr === 'FAILED' || statusStr === 'BLOCKED') statusColor = '#ef4444';

              return (
                <div key={cmd.id || cmd.ID} className="console-item" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div className="console-input-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#06b6d4', fontWeight: 700 }}>$</span>
                    <span style={{ color: '#f1f5f9' }}>{cmd.command || cmd.Command}</span>
                    <span style={{ fontSize: '10px', color: '#64748b', marginLeft: 'auto' }}>{dateStr}</span>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: statusColor, padding: '2px 6px', borderRadius: '4px', border: `1px solid ${statusColor}`, textTransform: 'uppercase' }}>
                      {statusStr}
                    </span>
                  </div>

                  {/* Standard output / error output */}
                  {(cmd.output || cmd.Output || cmd.stdout || cmd.stdout === '') && (
                    <pre style={{ margin: 0, padding: '10px 14px', backgroundColor: 'rgba(31, 46, 68, 0.2)', borderLeft: '3px solid #1f2e44', borderRadius: '4px', color: statusStr === 'FAILED' || statusStr === 'BLOCKED' ? '#fca5a5' : '#a7f3d0', whiteSpace: 'pre-wrap', overflowX: 'auto', fontSize: '12px', lineHeight: '1.5' }}>
                      {cmd.output || cmd.Output || cmd.stdout || '[Command executed with no output]'}
                    </pre>
                  )}
                </div>
              );
            })}

            <div ref={consoleBottomRef} />
          </div>

          {/* Input Prompt bar */}
          <form onSubmit={handleExecute} className="console-input-bar" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', backgroundColor: '#0d1220', borderTop: '1px solid #1f2e44' }}>
            <span style={{ color: '#06b6d4', fontFamily: 'monospace', fontWeight: 700, fontSize: '16px' }}>$</span>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder='Type shell command (e.g. "ls -la", "systemctl status docker", "df -h") and press enter...'
              disabled={executing}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                color: '#f1f5f9',
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '13px',
                outline: 'none',
              }}
              autoFocus
            />
            <button
              type="submit"
              disabled={executing || !command.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                backgroundColor: executing || !command.trim() ? '#1f2e44' : '#06b6d4',
                color: executing || !command.trim() ? '#64748b' : '#080c14',
                border: 'none',
                borderRadius: '6px',
                cursor: executing || !command.trim() ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 700,
                transition: 'opacity 0.2s',
              }}
            >
              {executing ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
              Execute
            </button>
          </form>

        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}
