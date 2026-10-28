import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Trash2,
  Server,
  ShieldAlert,
  Terminal,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Cpu,
  Lock,
  Flame,
  Globe,
} from 'lucide-react';
import { executeRemoteAgentUninstall } from '../../api/remoteDeploy.js';
import { getMachineId } from '../../utils/machineId.js';

export default function UninstallAgentModal({ isOpen, onClose, agent, onUninstalled }) {
  const safeAgent = agent || {};
  const agentId = safeAgent.id || safeAgent.ID || safeAgent.machine_id || getMachineId(safeAgent);
  const detectedHost = safeAgent.ip_address || safeAgent.ipAddress || safeAgent.IPAddress || safeAgent.hostname || '';

  // Mode selection: 'ssh' (Auto SSH push) or 'manual' (One-liner copy)
  const [activeTab, setActiveTab] = useState('ssh'); // 'ssh' | 'manual'
  const [copiedOs, setCopiedOs] = useState(null);

  // Form Fields
  const [host, setHost] = useState(detectedHost);
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState('root');
  const [authType, setAuthType] = useState('password'); // 'password' | 'key'
  const [password, setPassword] = useState('');
  const [sshKey, setSshKey] = useState('');
  const [sudoPassword, setSudoPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [forceDBOnly, setForceDBOnly] = useState(false);

  // Execution state
  const [uninstalling, setUninstalling] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  const logsEndRef = useRef(null);

  const serverBaseUrl = window.location.origin.includes('5173')
    ? `${window.location.protocol}//${window.location.hostname}:8080`
    : window.location.origin;

  const linuxOneLiner = `curl -fsSL ${serverBaseUrl}/api/v1/agent/uninstall.sh | sudo bash`;
  const windowsOneLiner = `irm ${serverBaseUrl}/api/v1/agent/uninstall.ps1 | iex`;

  // Pre-fill username if known or from common linux setups
  useEffect(() => {
    if (detectedHost) {
      setHost(detectedHost);
    }
    if (safeAgent.hostname && safeAgent.hostname.toLowerCase().includes('luffy')) {
      setUsername('luffy');
    }
  }, [safeAgent, detectedHost]);

  useEffect(() => {
    if (logsEndRef.current && showLogs) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [result?.logs, showLogs]);

  if (!isOpen || !agent) return null;

  const handleCopy = (text, os) => {
    navigator.clipboard.writeText(text);
    setCopiedOs(os);
    setTimeout(() => setCopiedOs(null), 2000);
  };

  const handleExecuteUninstall = async (e) => {
    if (e) e.preventDefault();
    if (!forceDBOnly && activeTab === 'ssh') {
      if (!host.trim()) {
        setError('Host IP is required for remote SSH uninstall.');
        return;
      }
      if (!username.trim()) {
        setError('SSH Username is required for remote SSH uninstall.');
        return;
      }
      if (authType === 'password' && !password.trim()) {
        setError('SSH Password is required for remote SSH uninstall.');
        return;
      }
    }

    setUninstalling(true);
    setError(null);
    setResult(null);

    try {
      const payload = {
        host: host.trim(),
        port: parseInt(port, 10) || 22,
        username: username.trim(),
        auth_type: authType,
        password: password,
        ssh_key: sshKey,
        sudo_password: sudoPassword.trim() || password.trim(),
        force_db_only: forceDBOnly || activeTab === 'manual',
      };

      const res = await executeRemoteAgentUninstall(agentId, payload);
      setResult(res);

      if (res && res.success) {
        if (onUninstalled) {
          onUninstalled();
        }
      } else {
        setError(res?.error || res?.message || 'Remote uninstallation failed.');
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Remote execution error.';
      setError(msg);
      if (err.response?.data?.steps) {
        setResult(err.response.data);
      }
    } finally {
      setUninstalling(false);
    }
  };

  const isCompleteSuccess = result && result.success;

  return (
    <div className="uam-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !uninstalling) onClose(); }}>
      <div className="uam-card">
        {/* Header */}
        <div className="uam-header">
          <div className="uam-header-left">
            <div className="uam-icon-avatar">
              <ShieldAlert size={22} color="#ef4444" />
            </div>
            <div>
              <div className="uam-title-row">
                <h3 className="uam-title">Permanent Host Decommission & Deletion</h3>
                <span className="uam-badge-danger">Destructive Action</span>
              </div>
              <p className="uam-subtitle">
                Target: <strong style={{ color: '#f8fafc' }}>{agent.hostname || agentId}</strong>
                {detectedHost ? ` (${detectedHost})` : ''} • OS: {agent.os || 'Linux'}
              </p>
            </div>
          </div>
          <button
            className="uam-close-btn"
            onClick={onClose}
            disabled={uninstalling}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {/* Warning Note */}
        {!isCompleteSuccess && (
          <div className="uam-warning-banner">
            <AlertCircle size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Service Termination & Permanent Data Purge</strong>
              <p>
                This action stops the <code style={{ color: '#fef08a' }}>infrapilot-agent</code> service, uninstalls agent binaries, removes configuration tokens from <code style={{ color: '#fef08a' }}>/etc/infrapilot</code>, permanently purges metrics, logs, and container histories from the central database, and places a permanent decommission tombstone.
              </p>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="uam-body">
          {error && (
            <div className="uam-error-alert">
              <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Stepper Progress View (Shown during or after execution) */}
          {(uninstalling || result) && (
            <div className="uam-stepper-box">
              <div className="uam-stepper-header">
                <span className="uam-stepper-title">Decommission Workflow Execution</span>
                {uninstalling && (
                  <span className="uam-live-badge">
                    <RefreshCw size={12} className="uam-spin" /> Executing
                  </span>
                )}
                {isCompleteSuccess && (
                  <span className="uam-success-badge">
                    <CheckCircle2 size={12} /> Successfully Decommissioned
                  </span>
                )}
              </div>

              <div className="uam-steps-list">
                {(result?.steps || [
                  { step_id: 1, title: 'SSH Connection & Authentication', status: 'running', details: 'Connecting to target host...' },
                  { step_id: 2, title: 'Stop & Terminate Agent Service', status: 'pending', details: 'Waiting...' },
                  { step_id: 3, title: 'Purge Agent Binaries, Units & Configs', status: 'pending', details: 'Waiting...' },
                  { step_id: 4, title: 'Clean Database Records & Decommission Tombstone', status: 'pending', details: 'Waiting...' },
                ]).map((step, idx) => {
                  let icon = <div className="uam-step-circle-pending">{idx + 1}</div>;
                  let colorClass = 'pending';

                  if (step.status === 'success') {
                    icon = <CheckCircle2 size={16} color="#10b981" />;
                    colorClass = 'success';
                  } else if (step.status === 'running') {
                    icon = <RefreshCw size={15} color="#38bdf8" className="uam-spin" />;
                    colorClass = 'running';
                  } else if (step.status === 'failed') {
                    icon = <AlertCircle size={16} color="#ef4444" />;
                    colorClass = 'failed';
                  } else if (step.status === 'skipped') {
                    icon = <span style={{ fontSize: 11, color: '#64748b' }}>SKIP</span>;
                    colorClass = 'skipped';
                  }

                  return (
                    <div key={step.step_id || idx} className={`uam-step-item ${colorClass}`}>
                      <div className="uam-step-icon-col">{icon}</div>
                      <div className="uam-step-info">
                        <div className="uam-step-title">{step.title}</div>
                        <div className="uam-step-details">{step.details}</div>
                      </div>
                      {step.duration_ms > 0 && (
                        <div className="uam-step-time">{step.duration_ms}ms</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Logs Drawer Toggle */}
              {result?.logs && result.logs.length > 0 && (
                <div className="uam-logs-section">
                  <button
                    type="button"
                    className="uam-logs-toggle-btn"
                    onClick={() => setShowLogs(!showLogs)}
                  >
                    <Terminal size={14} />
                    <span>Execution Console Output ({result.logs.length} lines)</span>
                    {showLogs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {showLogs && (
                    <div className="uam-terminal-box">
                      {result.logs.map((log, i) => (
                        <div key={i} className="uam-terminal-line">
                          {log}
                        </div>
                      ))}
                      <div ref={logsEndRef} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tab Switcher & Interactive Form (Editable before success) */}
          {!isCompleteSuccess && (
            <div className="uam-content-area">
              {/* Top Mode Tabs */}
              <div className="uam-mode-tabs">
                <button
                  type="button"
                  className={`uam-mode-tab ${activeTab === 'ssh' ? 'active' : ''}`}
                  onClick={() => setActiveTab('ssh')}
                  disabled={uninstalling}
                >
                  <Terminal size={14} />
                  <span>1-Click SSH Remote Uninstall</span>
                </button>
                <button
                  type="button"
                  className={`uam-mode-tab ${activeTab === 'manual' ? 'active' : ''}`}
                  onClick={() => setActiveTab('manual')}
                  disabled={uninstalling}
                >
                  <Copy size={14} />
                  <span>Manual One-Liner Commands</span>
                </button>
              </div>

              {activeTab === 'ssh' ? (
                <form onSubmit={handleExecuteUninstall} className="uam-form">
                  {/* Force DB Only Toggle */}
                  <div className="uam-toggle-row">
                    <label className="uam-checkbox-label">
                      <input
                        type="checkbox"
                        checked={forceDBOnly}
                        onChange={(e) => setForceDBOnly(e.target.checked)}
                        disabled={uninstalling}
                      />
                      <span>Target machine is already offline or destroyed? (Force delete from DB only without SSH)</span>
                    </label>
                  </div>

                  {!forceDBOnly && (
                    <>
                      <div className="uam-grid-2">
                        <div className="uam-field">
                          <label className="uam-label">Host IP Address / Hostname</label>
                          <input
                            type="text"
                            className="uam-input"
                            placeholder="e.g. 192.168.1.24"
                            value={host}
                            onChange={(e) => setHost(e.target.value)}
                            disabled={uninstalling}
                            required
                          />
                        </div>
                        <div className="uam-field">
                          <label className="uam-label">SSH Port</label>
                          <input
                            type="number"
                            className="uam-input"
                            placeholder="22"
                            value={port}
                            onChange={(e) => setPort(e.target.value)}
                            disabled={uninstalling}
                          />
                        </div>
                      </div>

                      <div className="uam-grid-2">
                        <div className="uam-field">
                          <label className="uam-label">SSH Username</label>
                          <input
                            type="text"
                            className="uam-input"
                            placeholder="e.g. root or luffy"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            disabled={uninstalling}
                            required
                          />
                        </div>
                        <div className="uam-field">
                          <label className="uam-label">Authentication Type</label>
                          <div className="uam-auth-switch">
                            <button
                              type="button"
                              className={`uam-switch-btn ${authType === 'password' ? 'active' : ''}`}
                              onClick={() => setAuthType('password')}
                              disabled={uninstalling}
                            >
                              Password
                            </button>
                            <button
                              type="button"
                              className={`uam-switch-btn ${authType === 'key' ? 'active' : ''}`}
                              onClick={() => setAuthType('key')}
                              disabled={uninstalling}
                            >
                              SSH Key
                            </button>
                          </div>
                        </div>
                      </div>

                      {authType === 'password' ? (
                        <div className="uam-grid-2">
                          <div className="uam-field">
                            <label className="uam-label">SSH Password</label>
                            <div className="uam-pass-wrapper">
                              <input
                                type={showPassword ? 'text' : 'password'}
                                className="uam-input with-icon"
                                placeholder="Remote user password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={uninstalling}
                                required
                              />
                              <button
                                type="button"
                                className="uam-eye-btn"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                              </button>
                            </div>
                          </div>

                          <div className="uam-field">
                            <label className="uam-label">
                              Sudo Password <span className="uam-hint">(Optional)</span>
                            </label>
                            <input
                              type={showPassword ? 'text' : 'password'}
                              className="uam-input"
                              placeholder="Defaults to SSH Password"
                              value={sudoPassword}
                              onChange={(e) => setSudoPassword(e.target.value)}
                              disabled={uninstalling}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="uam-field">
                          <label className="uam-label">Private SSH Key (PEM or OpenSSH format)</label>
                          <textarea
                            className="uam-textarea"
                            rows={4}
                            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                            value={sshKey}
                            onChange={(e) => setSshKey(e.target.value)}
                            disabled={uninstalling}
                            required
                          />
                        </div>
                      )}
                    </>
                  )}

                  {/* Action Buttons */}
                  <div className="uam-footer">
                    <button
                      type="button"
                      className="uam-cancel-btn"
                      onClick={onClose}
                      disabled={uninstalling}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className={`uam-danger-submit-btn ${forceDBOnly ? 'warning' : ''}`}
                      disabled={uninstalling}
                    >
                      {uninstalling ? (
                        <>
                          <RefreshCw size={15} className="uam-spin" />
                          Decommissioning Host...
                        </>
                      ) : forceDBOnly ? (
                        <>
                          <Trash2 size={15} />
                          Force Purge from Database
                        </>
                      ) : (
                        <>
                          <Trash2 size={15} />
                          Send Uninstall One-Liner via SSH
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="uam-manual-box">
                  <div className="uam-manual-desc">
                    Run the following one-liner command on the target server terminal with root/administrator privileges. It will automatically stop the service, delete agent binaries, wipe configuration tokens, and remove systemd / Windows service registrations.
                  </div>

                  {/* Linux One-Liner Box */}
                  <div className="uam-cmd-card">
                    <div className="uam-cmd-header">
                      <span className="uam-cmd-os">🐧 Linux / macOS One-Liner</span>
                      <button
                        type="button"
                        className="uam-copy-btn"
                        onClick={() => handleCopy(linuxOneLiner, 'linux')}
                      >
                        {copiedOs === 'linux' ? (
                          <>
                            <Check size={13} color="#10b981" />
                            <span style={{ color: '#10b981' }}>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            <span>Copy Command</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="uam-cmd-text">{linuxOneLiner}</pre>
                  </div>

                  {/* Windows One-Liner Box */}
                  <div className="uam-cmd-card">
                    <div className="uam-cmd-header">
                      <span className="uam-cmd-os">🪟 Windows PowerShell One-Liner (Run as Admin)</span>
                      <button
                        type="button"
                        className="uam-copy-btn"
                        onClick={() => handleCopy(windowsOneLiner, 'windows')}
                      >
                        {copiedOs === 'windows' ? (
                          <>
                            <Check size={13} color="#10b981" />
                            <span style={{ color: '#10b981' }}>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            <span>Copy Command</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="uam-cmd-text">{windowsOneLiner}</pre>
                  </div>

                  {/* Footer Action */}
                  <div className="uam-footer">
                    <button
                      type="button"
                      className="uam-cancel-btn"
                      onClick={onClose}
                      disabled={uninstalling}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExecuteUninstall()}
                      className="uam-danger-submit-btn"
                      disabled={uninstalling}
                    >
                      {uninstalling ? (
                        <>
                          <RefreshCw size={15} className="uam-spin" />
                          Purging Database...
                        </>
                      ) : (
                        <>
                          <Trash2 size={15} />
                          Confirm &amp; Purge Host from Database
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Success View */}
          {isCompleteSuccess && (
            <div className="uam-success-actions">
              <button
                type="button"
                className="uam-done-btn"
                onClick={() => {
                  if (onUninstalled) onUninstalled();
                  onClose();
                }}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .uam-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9999;
          background: rgba(3, 7, 18, 0.88);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: uamFade 0.2s ease-out;
        }

        @keyframes uamFade {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }

        .uam-card {
          width: 100%;
          max-width: 680px;
          max-height: 90vh;
          background-color: #0b1120;
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 16px;
          box-shadow: 0 25px 60px -10px rgba(0, 0, 0, 0.9), 0 0 35px rgba(239, 68, 68, 0.08);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          color: #f8fafc;
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
        }

        .uam-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 24px;
          background: rgba(15, 23, 42, 0.7);
          border-bottom: 1px solid rgba(30, 41, 59, 0.8);
        }

        .uam-header-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .uam-icon-avatar {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .uam-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .uam-title {
          font-size: 16.5px;
          font-weight: 700;
          margin: 0;
          color: #f8fafc;
        }

        .uam-badge-danger {
          font-size: 11px;
          font-weight: 600;
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          padding: 2px 8px;
          border-radius: 6px;
          border: 1px solid rgba(239, 68, 68, 0.3);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .uam-subtitle {
          font-size: 13px;
          color: #94a3b8;
          margin: 3px 0 0;
        }

        .uam-close-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 6px;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .uam-close-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
        }

        .uam-warning-banner {
          display: flex;
          gap: 12px;
          background: rgba(245, 158, 11, 0.08);
          border-bottom: 1px solid rgba(245, 158, 11, 0.2);
          padding: 12px 24px;
          color: #fbbf24;
          font-size: 12.5px;
          line-height: 1.5;
        }

        .uam-warning-banner p {
          margin: 2px 0 0;
          color: #cbd5e1;
          font-size: 12px;
        }

        .uam-body {
          padding: 20px 24px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .uam-error-alert {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.35);
          color: #fca5a5;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 13px;
        }

        .uam-mode-tabs {
          display: flex;
          gap: 6px;
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid #1e293b;
          border-radius: 10px;
          padding: 4px;
          margin-bottom: 16px;
        }

        .uam-mode-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 8px 12px;
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 13px;
          font-weight: 600;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .uam-mode-tab.active {
          background: #ef4444;
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
        }

        .uam-manual-box {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .uam-manual-desc {
          font-size: 12.5px;
          color: #94a3b8;
          line-height: 1.5;
        }

        .uam-cmd-card {
          background: rgba(2, 6, 23, 0.6);
          border: 1px solid #1e293b;
          border-radius: 10px;
          padding: 12px 14px;
        }

        .uam-cmd-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .uam-cmd-os {
          font-size: 12px;
          font-weight: 700;
          color: #cbd5e1;
        }

        .uam-copy-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(30, 41, 59, 0.8);
          border: 1px solid #334155;
          color: #f1f5f9;
          font-size: 11.5px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .uam-copy-btn:hover {
          background: #334155;
          border-color: #475569;
        }

        .uam-cmd-text {
          margin: 0;
          background: #020617;
          border: 1px solid #0f172a;
          border-radius: 6px;
          padding: 8px 12px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          color: #38bdf8;
          white-space: pre-wrap;
          word-break: break-all;
        }

        .uam-stepper-box {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(30, 41, 59, 0.9);
          border-radius: 12px;
          padding: 16px;
        }

        .uam-stepper-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .uam-stepper-title {
          font-size: 13.5px;
          font-weight: 600;
          color: #cbd5e1;
        }

        .uam-live-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          color: #38bdf8;
          font-weight: 600;
        }

        .uam-success-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          color: #10b981;
          font-weight: 600;
        }

        .uam-steps-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .uam-step-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          border-radius: 8px;
          background: rgba(2, 6, 23, 0.4);
          border: 1px solid rgba(30, 41, 59, 0.6);
        }

        .uam-step-item.success {
          border-color: rgba(16, 185, 129, 0.25);
          background: rgba(16, 185, 129, 0.04);
        }

        .uam-step-item.running {
          border-color: rgba(56, 189, 248, 0.3);
          background: rgba(56, 189, 248, 0.05);
        }

        .uam-step-item.failed {
          border-color: rgba(239, 68, 68, 0.3);
          background: rgba(239, 68, 68, 0.05);
        }

        .uam-step-circle-pending {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 1px solid #475569;
          color: #94a3b8;
          font-size: 10.5px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .uam-step-icon-col {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
        }

        .uam-step-info {
          flex: 1;
        }

        .uam-step-title {
          font-size: 12.5px;
          font-weight: 600;
          color: #f1f5f9;
        }

        .uam-step-details {
          font-size: 11.5px;
          color: #94a3b8;
          margin-top: 1px;
        }

        .uam-step-time {
          font-size: 11px;
          color: #64748b;
          font-family: monospace;
        }

        .uam-logs-section {
          margin-top: 12px;
          border-top: 1px solid rgba(30, 41, 59, 0.8);
          padding-top: 10px;
        }

        .uam-logs-toggle-btn {
          background: transparent;
          border: none;
          color: #38bdf8;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          padding: 4px 0;
        }

        .uam-logs-toggle-btn:hover {
          text-decoration: underline;
        }

        .uam-terminal-box {
          margin-top: 8px;
          background: #020617;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 10px 14px;
          max-height: 140px;
          overflow-y: auto;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px;
          color: #94a3b8;
          line-height: 1.6;
        }

        .uam-terminal-line {
          white-space: pre-wrap;
          word-break: break-all;
        }

        .uam-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .uam-toggle-row {
          background: rgba(15, 23, 42, 0.4);
          border: 1px solid rgba(51, 65, 85, 0.6);
          padding: 10px 14px;
          border-radius: 10px;
        }

        .uam-checkbox-label {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12.5px;
          color: #e2e8f0;
          cursor: pointer;
        }

        .uam-checkbox-label input[type="checkbox"] {
          width: 16px;
          height: 16px;
          accent-color: #ef4444;
          cursor: pointer;
        }

        .uam-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .uam-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .uam-label {
          font-size: 12.5px;
          font-weight: 600;
          color: #cbd5e1;
        }

        .uam-hint {
          font-size: 11.5px;
          color: #64748b;
          font-weight: 400;
        }

        .uam-input {
          background: rgba(2, 6, 23, 0.7);
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 9px 12px;
          color: #f8fafc;
          font-size: 13px;
          outline: none;
          transition: border-color 0.2s;
        }

        .uam-input:focus {
          border-color: #ef4444;
        }

        .uam-input.with-icon {
          padding-right: 36px;
        }

        .uam-pass-wrapper {
          position: relative;
        }

        .uam-eye-btn {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .uam-eye-btn:hover {
          color: #94a3b8;
        }

        .uam-textarea {
          background: rgba(2, 6, 23, 0.7);
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 9px 12px;
          color: #f8fafc;
          font-size: 12px;
          font-family: monospace;
          outline: none;
          resize: vertical;
        }

        .uam-textarea:focus {
          border-color: #ef4444;
        }

        .uam-auth-switch {
          display: flex;
          background: rgba(2, 6, 23, 0.7);
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 3px;
        }

        .uam-switch-btn {
          flex: 1;
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 0;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .uam-switch-btn.active {
          background: #ef4444;
          color: #ffffff;
        }

        .uam-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 6px;
          padding-top: 14px;
          border-top: 1px solid rgba(30, 41, 59, 0.7);
        }

        .uam-cancel-btn {
          background: rgba(30, 41, 59, 0.6);
          border: 1px solid #334155;
          color: #cbd5e1;
          padding: 9px 18px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .uam-cancel-btn:hover:not(:disabled) {
          background: rgba(51, 65, 85, 0.7);
          color: #ffffff;
        }

        .uam-danger-submit-btn {
          background: #dc2626;
          border: 1px solid #ef4444;
          color: #ffffff;
          padding: 9px 20px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
        }

        .uam-danger-submit-btn:hover:not(:disabled) {
          background: #b91c1c;
        }

        .uam-danger-submit-btn.warning {
          background: #d97706;
          border-color: #f59e0b;
        }

        .uam-danger-submit-btn.warning:hover:not(:disabled) {
          background: #b45309;
        }

        .uam-danger-submit-btn:disabled, .uam-cancel-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .uam-success-actions {
          display: flex;
          justify-content: flex-end;
          padding-top: 10px;
        }

        .uam-done-btn {
          background: #10b981;
          border: none;
          color: #ffffff;
          padding: 9px 26px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .uam-done-btn:hover {
          background: #059669;
        }

        .uam-spin {
          animation: uamSpin 1s linear infinite;
        }

        @keyframes uamSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
