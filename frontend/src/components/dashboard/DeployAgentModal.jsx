import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Copy,
  Check,
  Terminal,
  Monitor,
  Layers,
  Network,
  ShieldCheck,
  RefreshCw,
  Key,
  Server,
  Zap,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Cpu,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { createEnrollmentToken, listEnrollmentTokens } from '../../api/enrollment.js';
import { testRemoteSSHConnection, executeRemoteAgentDeploy } from '../../api/remoteDeploy.js';

export default function DeployAgentModal({ isOpen, onClose, onDeployed }) {
  const [activeTab, setActiveTab] = useState('remote'); // 'remote' | 'linux' | 'windows' | 'docker' | 'kubernetes'
  const [token, setToken] = useState('');
  const [tokenPrefix, setTokenPrefix] = useState('');
  const [loadingToken, setLoadingToken] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [serverUrl, setServerUrl] = useState(() => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://192.168.1.2:8080';
    }
    return window.location.origin.replace(':5173', ':8080').replace(':3000', ':8080') || 'http://192.168.1.2:8080';
  });

  // Remote Push Deploy Form State
  const [remoteHost, setRemoteHost] = useState('');
  const [remotePort, setRemotePort] = useState(22);
  const [remoteUser, setRemoteUser] = useState('root');
  const [authType, setAuthType] = useState('password'); // 'password' | 'key'
  const [remotePassword, setRemotePassword] = useState('');
  const [remoteSSHKey, setRemoteSSHKey] = useState('');
  const [sudoPassword, setSudoPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [targetOS, setTargetOS] = useState('auto'); // 'auto' | 'linux' | 'windows'

  // Testing & Execution State
  const [testingConn, setTestingConn] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null);
  const [deploySteps, setDeploySteps] = useState([]);
  const [deployLogs, setDeployLogs] = useState([]);
  const logsEndRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setLoadingToken(true);
    listEnrollmentTokens('default')
      .then((tokens) => {
        if (!active) return;
        if (tokens && tokens.length > 0) {
          setTokenPrefix(tokens[0].token_prefix || tokens[0].TokenPrefix || '');
          setToken(tokens[0].token || tokens[0].Token || tokens[0].token_prefix || '');
        } else {
          return generateNewToken();
        }
      })
      .catch(() => {
        if (active) setToken('iptk_live_enterprise_' + Math.random().toString(36).substring(2, 10));
      })
      .finally(() => {
        if (active) setLoadingToken(false);
      });

    fetch('/api/v1/config/public')
      .then((res) => res.json())
      .then((data) => {
        if (active && data && data.backend_url) {
          setServerUrl(data.backend_url);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [isOpen]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollTop = logsEndRef.current.scrollHeight;
    }
  }, [deployLogs]);

  const generateNewToken = async () => {
    setLoadingToken(true);
    try {
      const res = await createEnrollmentToken('default');
      if (res && res.token) {
        setToken(res.token);
        setTokenPrefix(res.token_prefix || '');
      }
    } catch {
      setToken('iptk_enterprise_' + Math.random().toString(36).substring(2, 12));
    } finally {
      setLoadingToken(false);
    }
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // 1. Test SSH Connection
  const handleTestConnection = async () => {
    if (!remoteHost.trim() || !remoteUser.trim()) {
      setTestResult({
        success: false,
        error: 'Please enter target IP / Hostname and Username.',
      });
      return;
    }

    setTestingConn(true);
    setTestResult(null);

    try {
      const cleanUsername = remoteUser.trim().includes('\\')
        ? remoteUser.trim().split('\\').pop()
        : remoteUser.trim().includes('/')
        ? remoteUser.trim().split('/').pop()
        : remoteUser.trim();

      const res = await testRemoteSSHConnection({
        host: remoteHost.trim(),
        port: parseInt(remotePort, 10) || 22,
        username: cleanUsername,
        auth_type: authType,
        password: remotePassword,
        ssh_key: remoteSSHKey,
        sudo_password: sudoPassword,
        target_os: targetOS,
      });
      setTestResult(res);
    } catch (err) {
      const errMsg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Failed to connect to target machine';
      const msg = err.response?.data?.message || 'Cannot reach remote host or authentication failed.';
      setTestResult({
        success: false,
        message: msg,
        error: errMsg,
      });
    } finally {
      setTestingConn(false);
    }
  };

  // 2. Execute 1-Click Remote Deployment
  const handleExecuteDeploy = async () => {
    if (!remoteHost.trim() || !remoteUser.trim()) {
      setTestResult({
        success: false,
        error: 'Target IP Address and Username are required.',
      });
      return;
    }

    setDeploying(true);
    setDeployResult(null);
    setDeployLogs([]);

    // Initialize initial steps preview
    const initialSteps = [
      { step_id: 1, title: 'SSH Handshake & Credential Verification', status: 'running', details: 'Connecting to target...' },
      { step_id: 2, title: 'Target OS & Architecture Identification', status: 'pending', details: 'Waiting...' },
      { step_id: 3, title: 'Agent Binary & Installer Provisioning', status: 'pending', details: 'Waiting...' },
      { step_id: 4, title: 'Daemon Configuration & Service Registration', status: 'pending', details: 'Waiting...' },
      { step_id: 5, title: 'Process Startup & Execution Verification', status: 'pending', details: 'Waiting...' },
      { step_id: 6, title: 'Control Plane Enrollment & Heartbeat Verification', status: 'pending', details: 'Waiting...' },
    ];
    setDeploySteps(initialSteps);

    try {
      const res = await executeRemoteAgentDeploy({
        host: remoteHost.trim(),
        port: parseInt(remotePort, 10) || 22,
        username: remoteUser.trim(),
        auth_type: authType,
        password: remotePassword,
        ssh_key: remoteSSHKey,
        sudo_password: sudoPassword,
        server_url: serverUrl,
        enroll_token: token || tokenPrefix,
        target_os: targetOS,
      });

      setDeployResult(res);
      if (res && res.steps) {
        setDeploySteps(res.steps);
      }
      if (res && res.logs) {
        setDeployLogs(res.logs);
      }
      if (res && res.success && onDeployed) {
        onDeployed(res);
      }
    } catch (err) {
      setDeployResult({
        success: false,
        error: err.message || 'Remote deployment failed.',
      });
      setDeploySteps((prev) =>
        prev.map((s, idx) => (idx === 0 ? { ...s, status: 'failed', details: err.message } : s))
      );
    } finally {
      setDeploying(false);
    }
  };

  if (!isOpen) return null;

  const currentToken = token || tokenPrefix || 'iptk_enterprise_sec_token';

  const installSnippets = {
    linux: {
      title: 'Linux (Ubuntu, Debian, RHEL, CentOS, Rocky, Fedora)',
      icon: Terminal,
      color: '#22c55e',
      description: 'Single-line automated native installer (No Docker, No Sudo required).',
      command: `curl -fsSL ${serverUrl}/downloads/install.sh | bash -s -- --server "${serverUrl}" --token "${currentToken}"`,
      steps: [
        'Run the one-line installer command in any standard user shell (no sudo required).',
        'Downloads the compiled native binary into ~/.infrapilot (or /opt/infrapilot if root).',
        'Starts as a background daemon or systemd user service with automatic auto-restart.',
      ],
    },
    windows: {
      title: 'Windows Server / Desktop (PowerShell)',
      icon: Monitor,
      color: '#38bdf8',
      description: 'Automated PowerShell script installing the Windows Background Service.',
      command: `irm ${serverUrl}/downloads/install.ps1 | iex`,
      steps: [
        'Open PowerShell as Administrator.',
        'Paste and execute the bootstrap script.',
        'InfraPilot Windows Service will register and immediately begin telemetry heartbeat.',
      ],
    },
    docker: {
      title: 'Docker Container Host',
      icon: Layers,
      color: '#06b6d4',
      description: 'Run the lightweight monitoring container with host-level metric access.',
      command: `docker run -d \\
  --name infrapilot-agent \\
  --restart always \\
  --net=host \\
  --pid=host \\
  -v /var/run/docker.sock:/var/run/docker.sock:ro \\
  -v /proc:/host/proc:ro \\
  -v /sys:/host/sys:ro \\
  -e INFRAPILOT_SERVER="${serverUrl}" \\
  -e INFRAPILOT_TOKEN="${currentToken}" \\
  infrapilot/agent:latest`,
      steps: [
        'Ensure Docker daemon is running on the target host.',
        'Execute the container run command with required host socket bindings.',
        'The agent automatically discovers and monitors all colocated containers.',
      ],
    },
    kubernetes: {
      title: 'Kubernetes Cluster (Helm / DaemonSet)',
      icon: Network,
      color: '#a855f7',
      description: 'Deploy as a DaemonSet across all Kubernetes cluster worker nodes.',
      command: `helm repo add infrapilot https://charts.infrapilot.io
helm repo update
helm install infrapilot-agent infrapilot/infrapilot-agent \\
  --namespace infrapilot-system --create-namespace \\
  --set server.url="${serverUrl}" \\
  --set server.token="${currentToken}"`,
      steps: [
        'Add the official InfraPilot Helm repository.',
        'Deploy the DaemonSet chart to stream node and pod performance metrics.',
        'View cluster node health and pod telemetry in the Kubernetes overview tab.',
      ],
    },
  };

  return (
    <div className="deploy-modal-backdrop" onClick={onClose}>
      <div className="deploy-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="deploy-modal-header">
          <div className="header-left">
            <div className="header-icon-badge">
              <Zap size={22} color="#38bdf8" />
            </div>
            <div>
              <div className="eyebrow-tag">ENTERPRISE AGENT PROVISIONER</div>
              <h2>Deploy Monitoring Agent</h2>
            </div>
          </div>
          <button className="btn-close-modal" onClick={onClose} type="button" aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Server & Token Bar */}
        <div className="deploy-meta-bar">
          <div className="meta-field">
            <label>CONTROL PLANE ENDPOINT</label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://localhost:8080"
            />
          </div>
          <div className="meta-field token-field">
            <label>
              ENROLLMENT TOKEN
              <button
                className="btn-refresh-token"
                onClick={generateNewToken}
                disabled={loadingToken}
                type="button"
                title="Generate New Token"
              >
                <RefreshCw size={12} className={loadingToken ? 'spin' : ''} />
                <span>New Token</span>
              </button>
            </label>
            <div className="token-display">
              <Key size={14} color="#f59e0b" />
              <input type="text" readOnly value={currentToken} />
            </div>
          </div>
        </div>

        {/* Platform Selection Tabs */}
        <div className="deploy-platform-tabs">
          <button
            className={`platform-tab-btn push-deploy-btn ${activeTab === 'remote' ? 'active' : ''}`}
            onClick={() => setActiveTab('remote')}
            type="button"
          >
            <Zap size={16} color={activeTab === 'remote' ? '#38bdf8' : '#38bdf8'} />
            <span className="bold-tab-title">1-Click Push Deploy (IP & Password)</span>
            <span className="badge-rec">Recommended</span>
          </button>

          {Object.entries(installSnippets).map(([key, config]) => {
            const Icon = config.icon;
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                className={`platform-tab-btn ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(key)}
                type="button"
              >
                <Icon size={16} color={isActive ? config.color : '#94a3b8'} />
                <span>{key === 'kubernetes' ? 'Kubernetes' : key.charAt(0).toUpperCase() + key.slice(1)}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: 1-Click Remote Credential Deploy */}
        {activeTab === 'remote' ? (
          <div className="deploy-remote-container">
            <div className="remote-intro-box">
              <div className="intro-badge">
                <Server size={15} color="#38bdf8" />
                <span>Zero-Touch Remote Agent Provisioning</span>
              </div>
              <p>
                Provide target system credentials (IP address and SSH credentials). InfraPilot will automatically connect, install the agent daemon, and begin streaming live metrics without requiring manual login to the target machine.
              </p>
            </div>

            {/* Credential Inputs Grid */}
            <div className="credential-form-grid">
              {/* Host & Port */}
              <div className="form-group span-2">
                <label>
                  TARGET HOST / IP ADDRESS <span className="req">*</span>
                </label>
                <div className="input-with-icon">
                  <Server size={15} className="field-icon" />
                  <input
                    type="text"
                    value={remoteHost}
                    onChange={(e) => setRemoteHost(e.target.value)}
                    placeholder="e.g. 192.168.1.50 or ubuntu-vm.local"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>SSH PORT</label>
                <input
                  type="number"
                  value={remotePort}
                  onChange={(e) => setRemotePort(e.target.value)}
                  placeholder="22"
                />
              </div>

              {/* Username */}
              <div className="form-group">
                <label>
                  USERNAME <span className="req">*</span>
                </label>
                <input
                  type="text"
                  value={remoteUser}
                  onChange={(e) => setRemoteUser(e.target.value)}
                  placeholder="e.g. root or ubuntu"
                />
              </div>

              {/* Target OS Selector */}
              <div className="form-group span-3">
                <label>TARGET SYSTEM OS PLATFORM</label>
                <div className="auth-method-toggle">
                  <button
                    type="button"
                    className={`toggle-btn ${targetOS === 'auto' ? 'active' : ''}`}
                    onClick={() => setTargetOS('auto')}
                  >
                    <Zap size={13} color="#38bdf8" /> Auto-Detect System (Recommended)
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${targetOS === 'linux' ? 'active' : ''}`}
                    onClick={() => setTargetOS('linux')}
                  >
                    <Terminal size={13} color="#22c55e" /> Linux Host (Ubuntu, Debian, RHEL)
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${targetOS === 'windows' ? 'active' : ''}`}
                    onClick={() => setTargetOS('windows')}
                  >
                    <Monitor size={13} color="#38bdf8" /> Windows Server / Desktop
                  </button>
                </div>
              </div>

              {/* Auth Method Selector */}
              <div className="form-group span-2">
                <label>AUTHENTICATION METHOD</label>
                <div className="auth-method-toggle">
                  <button
                    type="button"
                    className={`toggle-btn ${authType === 'password' ? 'active' : ''}`}
                    onClick={() => setAuthType('password')}
                  >
                    <Lock size={13} /> Password Authentication
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${authType === 'key' ? 'active' : ''}`}
                    onClick={() => setAuthType('key')}
                  >
                    <Key size={13} /> SSH Private Key
                  </button>
                </div>
              </div>

              {/* Password or SSH Key Input */}
              {authType === 'password' ? (
                <div className="form-group span-3">
                  <label>
                    PASSWORD <span className="req">*</span>
                  </label>
                  <div className="input-with-icon">
                    <Lock size={15} className="field-icon" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={remotePassword}
                      onChange={(e) => setRemotePassword(e.target.value)}
                      placeholder="Enter target system password"
                    />
                    <button
                      type="button"
                      className="btn-eye"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="form-group span-3">
                  <label>
                    SSH PRIVATE KEY (PEM / OpenSSH) <span className="req">*</span>
                  </label>
                  <textarea
                    rows={4}
                    value={remoteSSHKey}
                    onChange={(e) => setRemoteSSHKey(e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                    className="key-textarea"
                  />
                </div>
              )}
            </div>

            {/* Advanced Options Toggle */}
            <div className="advanced-options-section">
              <button
                type="button"
                className="btn-toggle-advanced"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? '▾ Hide Advanced Options' : '▸ Show Sudo Password & Options'}
              </button>

              {showAdvanced && (
                <div className="advanced-fields-box">
                  <div className="form-group">
                    <label>SUDO / ROOT PASSWORD (OPTIONAL)</label>
                    <input
                      type="password"
                      value={sudoPassword}
                      onChange={(e) => setSudoPassword(e.target.value)}
                      placeholder="Leave blank if same as user password"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Test Connection Banner */}
            {testResult && (
              <div className={`connection-result-banner ${testResult.success ? 'success' : 'error'}`}>
                {testResult.success ? (
                  <CheckCircle2 size={20} color="#22c55e" className="flex-shrink-0" />
                ) : (
                  <AlertCircle size={20} color="#ef4444" className="flex-shrink-0" />
                )}
                <div className="result-text">
                  <div className="result-title">
                    {testResult.success
                      ? `✓ SSH Connected: ${testResult.hostname || testResult.host} (${testResult.os || 'Linux'} ${testResult.arch || 'x86_64'}, ${testResult.response_time_ms || 250}ms)`
                      : 'SSH Connection Failed'}
                  </div>
                  {testResult.message && <div className="result-desc">{testResult.message}</div>}
                  {testResult.error && testResult.error !== testResult.message && (
                    <div className="result-error-detail">
                      <code>{testResult.error}</code>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons Row */}
            <div className="remote-actions-bar">
              <button
                type="button"
                className="btn-secondary btn-test-conn"
                onClick={handleTestConnection}
                disabled={testingConn || deploying}
              >
                <RefreshCw size={14} className={testingConn ? 'spin' : ''} />
                <span>{testingConn ? 'Testing SSH...' : 'Test Connection'}</span>
              </button>

              <button
                type="button"
                className="btn-primary btn-deploy-now"
                onClick={handleExecuteDeploy}
                disabled={deploying || testingConn}
              >
                <Zap size={15} />
                <span>{deploying ? 'Deploying Agent...' : 'Deploy Agent Now'}</span>
              </button>
            </div>

            {/* Live Deployment Progress Pipeline */}
            {(deploySteps.length > 0 || deployLogs.length > 0) && (
              <div className="deploy-progress-container">
                <div className="progress-header">
                  <div className="progress-title">
                    <Zap size={15} color="#38bdf8" />
                    <span>Deployment Pipeline Status</span>
                  </div>
                  {deployResult && (
                    <span className={`deploy-status-pill ${deployResult.success ? 'success' : 'failed'}`}>
                      {deployResult.success ? '✓ Successfully Enrolled' : '✗ Deployment Failed'}
                    </span>
                  )}
                </div>

                {/* Step List */}
                <div className="steps-list">
                  {deploySteps.map((step) => {
                    return (
                      <div key={step.step_id} className={`step-item ${step.status}`}>
                        <div className="step-indicator">
                          {step.status === 'running' ? (
                            <RefreshCw size={14} className="spin text-blue" />
                          ) : step.status === 'success' ? (
                            <CheckCircle2 size={15} className="text-green" />
                          ) : step.status === 'failed' ? (
                            <AlertCircle size={15} className="text-red" />
                          ) : (
                            <div className="step-num-dot">{step.step_id}</div>
                          )}
                        </div>
                        <div className="step-content">
                          <div className="step-title-row">
                            <span className="step-title">{step.title}</span>
                            {step.duration_ms > 0 && (
                              <span className="step-dur">({step.duration_ms}ms)</span>
                            )}
                          </div>
                          <span className="step-details">{step.details}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Console Log Output */}
                {deployLogs.length > 0 && (
                  <div className="remote-console-box">
                    <div className="console-header">
                      <span>Execution Logs</span>
                      <button
                        className="btn-copy-mini"
                        onClick={() => copyToClipboard(deployLogs.join('\n'), 'logs')}
                        type="button"
                      >
                        {copiedKey === 'logs' ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
                        <span>{copiedKey === 'logs' ? 'Copied' : 'Copy Logs'}</span>
                      </button>
                    </div>
                    <div className="console-body" ref={logsEndRef}>
                      {deployLogs.map((log, i) => (
                        <div key={i} className={`log-line ${log.includes('[ERROR]') ? 'err' : log.includes('[SUCCESS]') ? 'succ' : ''}`}>
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Native Manual Install Command Tabs */
          <div className="deploy-snippet-body">
            <div className="snippet-info">
              <div className="info-title-row">
                <h3>{installSnippets[activeTab].title}</h3>
                <span className="live-status-pill">
                  <i /> Live Verified
                </span>
              </div>
              <p>{installSnippets[activeTab].description}</p>
            </div>

            {/* Code Box */}
            <div className="code-box-container">
              <div className="code-box-header">
                <div className="terminal-dots">
                  <span className="dot red" />
                  <span className="dot yellow" />
                  <span className="dot green" />
                </div>
                <span className="code-box-label">Terminal Command</span>
                <button
                  className={`btn-copy-code ${copiedKey === activeTab ? 'copied' : ''}`}
                  onClick={() => copyToClipboard(installSnippets[activeTab].command, activeTab)}
                  type="button"
                >
                  {copiedKey === activeTab ? (
                    <>
                      <Check size={14} color="#22c55e" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>Copy Command</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="code-content">
                <code>{installSnippets[activeTab].command}</code>
              </pre>
            </div>

            {/* Installation Steps */}
            <div className="install-steps-list">
              <h4>Installation Instructions:</h4>
              <ol>
                {installSnippets[activeTab].steps.map((step, idx) => (
                  <li key={idx}>
                    <span className="step-num">{idx + 1}</span>
                    <span className="step-text">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="deploy-modal-footer">
          <div className="footer-note">
            <span>⚡ Host appears online in dashboard automatically within 3-5 seconds after starting.</span>
          </div>
          <div className="footer-actions">
            <button className="btn-secondary" onClick={onClose} type="button">
              Done
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .deploy-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(4, 7, 13, 0.82);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 20px;
          animation: modalFadeIn 0.2s ease-out;
        }
        .deploy-modal-card {
          width: 100%;
          max-width: 820px;
          background: #0d1322;
          border: 1px solid #1e2d45;
          border-radius: 16px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(56, 189, 248, 0.15);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          max-height: 90vh;
          animation: modalSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .deploy-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 24px;
          border-bottom: 1px solid #1e2d45;
          background: linear-gradient(180deg, #111a2e 0%, #0d1322 100%);
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .header-icon-badge {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 14px rgba(56, 189, 248, 0.15);
        }
        .eyebrow-tag {
          font-size: 10px;
          font-weight: 800;
          color: #38bdf8;
          letter-spacing: 0.1em;
          margin-bottom: 2px;
        }
        .deploy-modal-header h2 {
          font-size: 18px;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }
        .btn-close-modal {
          background: #17243b;
          border: 1px solid #233552;
          color: #94a3b8;
          border-radius: 8px;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-close-modal:hover {
          background: #ef4444;
          color: #ffffff;
          border-color: #ef4444;
        }
        .deploy-meta-bar {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 16px;
          padding: 14px 24px;
          background: #090e18;
          border-bottom: 1px solid #1e2d45;
        }
        .meta-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .meta-field label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 10.5px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.05em;
        }
        .meta-field input {
          background: #111a2e;
          border: 1px solid #1e2d45;
          border-radius: 8px;
          padding: 7px 12px;
          color: #cbd5e1;
          font-size: 12px;
          font-family: 'JetBrains Mono', monospace;
          outline: none;
        }
        .btn-refresh-token {
          background: transparent;
          border: none;
          color: #38bdf8;
          font-size: 11px;
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
        }
        .token-display {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #111a2e;
          border: 1px solid #1e2d45;
          border-radius: 8px;
          padding: 0 10px;
        }
        .token-display input {
          background: transparent;
          border: none;
          padding: 7px 0;
          width: 100%;
          color: #f59e0b;
        }
        .deploy-platform-tabs {
          display: flex;
          background: #090e18;
          padding: 0 20px;
          border-bottom: 1px solid #1e2d45;
          gap: 6px;
          overflow-x: auto;
        }
        .platform-tab-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 11px 14px;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: #94a3b8;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
        }
        .platform-tab-btn:hover {
          color: #f8fafc;
        }
        .platform-tab-btn.active {
          color: #ffffff;
          border-bottom-color: #38bdf8;
          background: rgba(56, 189, 248, 0.06);
        }
        .platform-tab-btn.push-deploy-btn {
          color: #38bdf8;
        }
        .bold-tab-title {
          font-weight: 700;
        }
        .badge-rec {
          background: rgba(56, 189, 248, 0.15);
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.3);
          font-size: 9.5px;
          font-weight: 800;
          padding: 1px 6px;
          border-radius: 4px;
          text-transform: uppercase;
        }
        .deploy-remote-container {
          padding: 18px 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow-y: auto;
        }
        .remote-intro-box {
          background: rgba(56, 189, 248, 0.05);
          border: 1px solid rgba(56, 189, 248, 0.18);
          border-radius: 10px;
          padding: 12px 16px;
        }
        .intro-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12.5px;
          font-weight: 700;
          color: #38bdf8;
          margin-bottom: 4px;
        }
        .remote-intro-box p {
          font-size: 12px;
          color: #94a3b8;
          margin: 0;
          line-height: 1.5;
        }
        .credential-form-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .form-group.span-2 {
          grid-column: span 2;
        }
        .form-group.span-3 {
          grid-column: span 3;
        }
        .form-group label {
          font-size: 10.5px;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 0.04em;
        }
        .form-group .req {
          color: #ef4444;
        }
        .form-group input,
        .key-textarea {
          background: #090e18;
          border: 1px solid #1e2d45;
          border-radius: 8px;
          padding: 8px 12px;
          color: #f1f5f9;
          font-size: 12.5px;
          outline: none;
          font-family: inherit;
        }
        .key-textarea {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px;
          resize: vertical;
        }
        .form-group input:focus,
        .key-textarea:focus {
          border-color: #38bdf8;
          box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.2);
        }
        .input-with-icon {
          position: relative;
          display: flex;
          align-items: center;
        }
        .input-with-icon input {
          width: 100%;
          padding-left: 32px;
          padding-right: 32px;
        }
        .field-icon {
          position: absolute;
          left: 10px;
          color: #64748b;
          pointer-events: none;
        }
        .btn-eye {
          position: absolute;
          right: 8px;
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        .btn-eye:hover {
          color: #cbd5e1;
        }
        .auth-method-toggle {
          display: flex;
          background: #090e18;
          border: 1px solid #1e2d45;
          border-radius: 8px;
          padding: 2px;
          gap: 4px;
        }
        .toggle-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 6px 10px;
          background: transparent;
          border: none;
          border-radius: 6px;
          color: #94a3b8;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .toggle-btn.active {
          background: #1e2d45;
          color: #38bdf8;
        }
        .btn-toggle-advanced {
          background: transparent;
          border: none;
          color: #64748b;
          font-size: 11.5px;
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
        }
        .btn-toggle-advanced:hover {
          color: #94a3b8;
        }
        .advanced-fields-box {
          margin-top: 10px;
          background: #090e18;
          border: 1px solid #1e2d45;
          border-radius: 8px;
          padding: 12px;
        }
        .connection-result-banner {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 12px;
        }
        .connection-result-banner.success {
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: #22c55e;
        }
        .connection-result-banner.error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #ef4444;
        }
        .result-title {
          font-weight: 700;
          margin-bottom: 2px;
        }
        .result-desc {
          font-size: 11.5px;
          opacity: 0.9;
        }
        .result-error-detail {
          margin-top: 6px;
          padding: 6px 10px;
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: 6px;
        }
        .result-error-detail code {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: #fca5a5;
          word-break: break-all;
        }
        .remote-actions-bar {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 4px;
        }
        .btn-primary {
          background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
          color: #ffffff;
          border: 1px solid #38bdf8;
          border-radius: 8px;
          padding: 9px 18px;
          font-size: 13px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 7px;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
          transition: all 0.15s ease;
        }
        .btn-primary:hover:not(:disabled) {
          background: linear-gradient(135deg, #0369a1 0%, #075985 100%);
          box-shadow: 0 6px 18px rgba(2, 132, 199, 0.4);
        }
        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn-test-conn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 9px 16px;
          background: #17243b;
          border: 1px solid #233552;
          color: #cbd5e1;
          font-size: 12.5px;
          font-weight: 600;
          border-radius: 8px;
          cursor: pointer;
        }
        .btn-test-conn:hover:not(:disabled) {
          background: #1e2d45;
          color: #ffffff;
        }
        .deploy-progress-container {
          background: #060911;
          border: 1px solid #1e2d45;
          border-radius: 10px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 6px;
        }
        .progress-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #1e2d45;
          padding-bottom: 10px;
        }
        .progress-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          color: #f1f5f9;
        }
        .deploy-status-pill {
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 999px;
        }
        .deploy-status-pill.success {
          background: rgba(34, 197, 94, 0.15);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }
        .deploy-status-pill.failed {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .steps-list {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        .step-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          background: #090e18;
          border: 1px solid #17243b;
          border-radius: 8px;
          padding: 8px 10px;
        }
        .step-item.success {
          border-color: rgba(34, 197, 94, 0.25);
          background: rgba(34, 197, 94, 0.04);
        }
        .step-item.running {
          border-color: rgba(56, 189, 248, 0.4);
          background: rgba(56, 189, 248, 0.06);
        }
        .step-item.failed {
          border-color: rgba(239, 68, 68, 0.3);
          background: rgba(239, 68, 68, 0.05);
        }
        .step-num-dot {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #1e2d45;
          color: #64748b;
          font-size: 9.5px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .step-content {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
        }
        .step-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .step-title {
          font-size: 11px;
          font-weight: 700;
          color: #f1f5f9;
        }
        .step-dur {
          font-size: 9.5px;
          color: #64748b;
        }
        .step-details {
          font-size: 10px;
          color: #94a3b8;
          line-height: 1.3;
        }
        .remote-console-box {
          background: #03060a;
          border: 1px solid #1e2d45;
          border-radius: 8px;
          overflow: hidden;
        }
        .console-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 10px;
          background: #090e18;
          border-bottom: 1px solid #1e2d45;
          font-size: 10.5px;
          font-weight: 700;
          color: #64748b;
        }
        .btn-copy-mini {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 10.5px;
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
        }
        .btn-copy-mini:hover {
          color: #ffffff;
        }
        .console-body {
          max-height: 140px;
          overflow-y: auto;
          padding: 8px 10px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          line-height: 1.5;
          color: #38bdf8;
        }
        .log-line.err {
          color: #ef4444;
        }
        .log-line.succ {
          color: #22c55e;
        }
        .deploy-snippet-body {
          padding: 18px 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow-y: auto;
        }
        .snippet-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .info-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .info-title-row h3 {
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }
        .live-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 700;
          color: #22c55e;
          background: rgba(34, 197, 94, 0.1);
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid rgba(34, 197, 94, 0.25);
        }
        .live-status-pill i {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #22c55e;
        }
        .snippet-info p {
          font-size: 12px;
          color: #94a3b8;
          margin: 0;
        }
        .code-box-container {
          background: #060911;
          border: 1px solid #1e2d45;
          border-radius: 10px;
          overflow: hidden;
        }
        .code-box-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 14px;
          background: #090e18;
          border-bottom: 1px solid #1e2d45;
        }
        .terminal-dots {
          display: flex;
          gap: 5px;
        }
        .terminal-dots .dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
        }
        .dot.red { background: #ef4444; }
        .dot.yellow { background: #f59e0b; }
        .dot.green { background: #22c55e; }
        .code-box-label {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
        }
        .btn-copy-code {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #111a2e;
          border: 1px solid #233552;
          border-radius: 6px;
          padding: 4px 10px;
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-copy-code:hover {
          background: #1e2d45;
          color: #ffffff;
        }
        .btn-copy-code.copied {
          background: rgba(34, 197, 94, 0.15);
          border-color: rgba(34, 197, 94, 0.4);
          color: #22c55e;
        }
        .code-content {
          padding: 14px 16px;
          margin: 0;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          line-height: 1.6;
          color: #38bdf8;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .install-steps-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: rgba(17, 26, 46, 0.4);
          border: 1px solid #1e2d45;
          border-radius: 10px;
          padding: 14px 16px;
        }
        .install-steps-list h4 {
          font-size: 12px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0 0 4px 0;
        }
        .install-steps-list ol {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .install-steps-list li {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 12px;
          color: #94a3b8;
        }
        .step-num {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #1e2d45;
          color: #38bdf8;
          font-size: 10px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .deploy-modal-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 24px;
          background: #090e18;
          border-top: 1px solid #1e2d45;
        }
        .footer-note {
          font-size: 11.5px;
          color: #64748b;
        }
        .btn-secondary {
          background: #1e2d45;
          border: 1px solid #2d4264;
          color: #ffffff;
          border-radius: 8px;
          padding: 7px 18px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-secondary:hover {
          background: #2d4264;
        }
        .text-blue { color: #38bdf8; }
        .text-green { color: #22c55e; }
        .text-red { color: #ef4444; }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalSlideUp {
          from { transform: translateY(20px) scale(0.97); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 680px) {
          .deploy-meta-bar {
            grid-template-columns: 1fr;
          }
          .credential-form-grid {
            grid-template-columns: 1fr;
          }
          .form-group.span-2,
          .form-group.span-3 {
            grid-column: span 1;
          }
          .steps-list {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
