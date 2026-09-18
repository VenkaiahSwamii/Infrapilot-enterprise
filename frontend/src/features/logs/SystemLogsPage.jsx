import React, { useState } from 'react';
import { FileText, Cpu, HardDrive, RefreshCw, Radio } from 'lucide-react';
import FleetTerminal from './FleetTerminal.jsx';

export default function SystemLogsPage() {
  const [logFilter, setLogFilter] = useState('ALL');

  const systemLogs = [
    { id: 1, timestamp: new Date().toISOString(), level: 'INFO', facility: 'kernel', message: 'Linux kernel 5.15.0-88-generic x86_64 initialized. Memory: 16GB total.' },
    { id: 2, timestamp: new Date(Date.now() - 30000).toISOString(), level: 'INFO', facility: 'systemd', message: 'systemd 249.11-0ubuntu3.11 running in system mode (+PAM +AUDIT +SELINUX)' },
    { id: 3, timestamp: new Date(Date.now() - 60000).toISOString(), level: 'WARN', facility: 'disk', message: '[disk] Target mount "auto" -> "C:" / "/" check: 54,800MB free (reactive_threshold: 90.0%)' },
    { id: 4, timestamp: new Date(Date.now() - 90000).toISOString(), level: 'INFO', facility: 'auth', message: 'pam_unix(sshd:session): session opened for user root by (uid=0)' },
    { id: 5, timestamp: new Date(Date.now() - 120000).toISOString(), level: 'INFO', facility: 'memory', message: 'Swap total 2048MB, used 0MB (0.0%). Virtual Memory healthy.' },
  ];

  return (
    <div style={{ padding: '24px 32px', minHeight: '100vh', backgroundColor: '#090d16', color: '#f1f5f9' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'linear-gradient(135deg, #0284c7, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={24} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0 }}>System Logs (OS, Kernel, Auth &amp; Syslog)</h1>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
              Real-time operating system level events, kernel messages, auth sessions &amp; disk/memory facilities
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(34, 197, 94, 0.15)', border: '1px solid #22c55e', color: '#22c55e', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>
          <Radio size={14} className="animate-pulse" /> SYSTEM LOGS LIVE
        </div>
      </div>

      {/* Fleet Terminal Live Stream */}
      <FleetTerminal machineName="SYSTEM LOG STREAM (KERNEL / SYSLOG)" />

      {/* Log Table */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginTop: 0, marginBottom: '16px', color: '#38bdf8' }}>
          Operating System Log Table
        </h3>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b' }}>
              <th style={{ padding: '10px' }}>TIMESTAMP</th>
              <th style={{ padding: '10px' }}>FACILITY</th>
              <th style={{ padding: '10px' }}>LEVEL</th>
              <th style={{ padding: '10px' }}>LOG MESSAGE</th>
            </tr>
          </thead>
          <tbody>
            {systemLogs.map((log) => (
              <tr key={log.id} style={{ borderBottom: '1px solid #161e2e' }}>
                <td style={{ padding: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>{log.timestamp.replace('T', ' ').substring(0, 19)}</td>
                <td style={{ padding: '10px', color: '#38bdf8', fontWeight: 700 }}>{log.facility}</td>
                <td style={{ padding: '10px' }}>
                  <span style={{ background: log.level === 'WARN' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(56, 189, 248, 0.2)', color: log.level === 'WARN' ? '#f59e0b' : '#38bdf8', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 800 }}>
                    {log.level}
                  </span>
                </td>
                <td style={{ padding: '10px', color: '#f1f5f9', fontFamily: 'monospace' }}>{log.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
