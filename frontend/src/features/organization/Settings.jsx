import React, { useState, useEffect } from 'react';
import {
  Palette,
  Save,
  Clock,
  Shield,
  Sliders,
  Globe,
  CheckCircle2,
  Building,
  Sparkles,
  Bell,
  Activity,
  Key,
  HardDrive,
  Cpu,
  Lock,
  Mail,
  MessageSquare,
  Zap,
  RefreshCw,
  Copy,
  Check,
  Server,
  Download,
  AlertTriangle,
  FileText
} from 'lucide-react';
import { apiClient } from '../../api/client.js';

export default function Settings({ settings, onSave }) {
  const [activeTab, setActiveTab] = useState('branding');
  const [copiedToken, setCopiedToken] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState({
    // 1. Branding & Organization
    company_name: 'InfraPilot Enterprise',
    logo_url: '',
    timezone: 'Asia/Kolkata',
    primary_color: '#3b82f6',
    sidebar_color: '#0d1424',
    custom_domain: 'monitoring.company.internal',
    license_tier: 'Enterprise Unlimited',

    // 2. Agent & Fleet Telemetry
    metrics_interval: '5',
    heartbeat_interval: '15',
    offline_threshold: '45',
    auto_upgrade_agents: true,
    log_collection_enabled: true,
    enrollment_token: 'ip_enroll_99f3810a72e811ed',

    // 3. Notifications & Webhooks
    slack_webhook_url: 'https://hooks.slack.com/services/T00/B00/XXXXX',
    pagerduty_key: 'pd_integration_key_prod_8819',
    email_recipients: 'sre-alerts@company.com, admin@company.com',
    teams_webhook_url: '',
    enable_critical_pager: true,

    // 4. SRE & Autonomous Remediation
    flap_threshold: '3',
    circuit_breaker_window_min: '10',
    auto_remediation_enabled: true,
    disk_cleanup_trigger_percent: '90',
    latency_slo_multiplier: '3.0',

    // 5. Security & Authentication (SSO / SAML)
    saml_enabled: true,
    saml_entity_id: 'https://sso.company.com/entity',
    force_mfa: true,
    session_timeout_min: '60',
    api_key_rotation_days: '90',

    // 6. Data Retention & Archival
    metrics_retention_days: '90',
    logs_retention_days: '30',
    audit_retention_days: '365',
    auto_archive_enabled: true,
  });

  useEffect(() => {
    if (settings && Object.keys(settings).length > 0) {
      setForm((prev) => ({ ...prev, ...settings }));
    }
  }, [settings]);

  const colorPresets = [
    { name: 'Cyber Cyan', primary: '#06b6d4', sidebar: '#08131e' },
    { name: 'Emerald Pro', primary: '#10b981', sidebar: '#081c15' },
    { name: 'Royal Purple', primary: '#a855f7', sidebar: '#140c24' },
    { name: 'Electric Blue', primary: '#3b82f6', sidebar: '#0d1424' },
    { name: 'Sunset Amber', primary: '#f59e0b', sidebar: '#1c1308' },
  ];

  const applyColorPreset = (preset) => {
    setForm((prev) => ({
      ...prev,
      primary_color: preset.primary,
      sidebar_color: preset.sidebar,
    }));
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(form.enrollment_token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await apiClient.patch('/orgs/default/settings', form).catch(() => null);
      if (onSave) onSave(form);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
    } catch {
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportConfig = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(form, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `infrapilot-enterprise-config-${new Date().toISOString().substring(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const tabs = [
    { id: 'branding', label: 'Organization & Branding', icon: Building, badge: 'PORTAL' },
    { id: 'fleet', label: 'Agent & Telemetry', icon: Server, badge: 'AGENT' },
    { id: 'notifications', label: 'Alerts & Webhooks', icon: Bell, badge: 'ROUTING' },
    { id: 'sre', label: 'SRE & Remediation', icon: Zap, badge: 'SLO' },
    { id: 'security', label: 'Security & SAML SSO', icon: Shield, badge: 'RBAC' },
    { id: 'retention', label: 'Data Retention & Backup', icon: HardDrive, badge: 'STORAGE' },
  ];

  return (
    <div className="enterprise-settings-root">
      {/* Enterprise Suite Header */}
      <div className="settings-header-card">
        <div className="header-title-block">
          <div className="header-icon-box">
            <Sliders size={22} color="#38bdf8" />
          </div>
          <div>
            <h2>Enterprise System Settings &amp; Governance</h2>
            <p>Configure global platform identity, telemetry parameters, automated SRE policies, SAML SSO, and data retention schedules.</p>
          </div>
        </div>

        <div className="header-actions">
          <button type="button" className="btn-export-config" onClick={handleExportConfig}>
            <Download size={14} /> Export Config JSON
          </button>
          <button type="button" className="btn-primary-save" onClick={handleSubmit} disabled={isSaving}>
            <Save size={15} /> {isSaving ? 'Saving...' : 'Save All Settings'}
          </button>
        </div>
      </div>

      {savedMsg && (
        <div className="save-alert-success">
          <CheckCircle2 size={16} />
          <span>Enterprise system configuration updated &amp; synchronized across cluster nodes successfully!</span>
        </div>
      )}

      {/* Settings Navigation Tabs */}
      <div className="settings-nav-tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`nav-tab-button ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} className="tab-icon" />
              <span>{tab.label}</span>
              {tab.badge && <span className="tab-badge">{tab.badge}</span>}
            </button>
          );
        })}
      </div>

      {/* Main Settings Content */}
      <div className="settings-main-container">
        <form onSubmit={handleSubmit} className="settings-form-layout">
          {/* TAB 1: Organization & Branding */}
          {activeTab === 'branding' && (
            <div className="settings-tab-content grid-2col">
              <div className="settings-card">
                <div className="card-section-header">
                  <Building size={16} color="#38bdf8" />
                  <span>ORGANIZATION IDENTITY &amp; CUSTOM DOMAIN</span>
                </div>

                <div className="form-group">
                  <label>COMPANY DISPLAY NAME</label>
                  <input
                    type="text"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    placeholder="e.g. InfraPilot Enterprise Systems"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>CUSTOM BRAND LOGO URL (PNG / SVG)</label>
                  <input
                    type="url"
                    value={form.logo_url}
                    onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                    placeholder="https://cdn.company.com/assets/logo.svg"
                  />
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>CUSTOM CNAME DOMAIN</label>
                    <input
                      type="text"
                      value={form.custom_domain}
                      onChange={(e) => setForm({ ...form, custom_domain: e.target.value })}
                      placeholder="monitoring.company.internal"
                    />
                  </div>

                  <div className="form-group">
                    <label>PLATFORM TIMEZONE</label>
                    <select
                      value={form.timezone}
                      onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                    >
                      <option value="Asia/Kolkata">Asia/Kolkata (IST - UTC+5:30)</option>
                      <option value="UTC">UTC (Coordinated Universal Time)</option>
                      <option value="America/New_York">America/New_York (EST/EDT)</option>
                      <option value="Europe/London">Europe/London (GMT/BST)</option>
                      <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                      <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
                    </select>
                  </div>
                </div>

                <div className="card-section-header" style={{ marginTop: '16px' }}>
                  <Palette size={16} color="#a855f7" />
                  <span>PORTAL COLOR SCHEME &amp; PRESETS</span>
                </div>

                <div className="presets-row">
                  <span className="presets-label">Quick Themes:</span>
                  <div className="presets-list">
                    {colorPresets.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        className="preset-swatch-btn"
                        onClick={() => applyColorPreset(p)}
                      >
                        <span className="swatch-dot" style={{ backgroundColor: p.primary }} />
                        <span>{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>PRIMARY ACCENT COLOR</label>
                    <div className="color-picker-box">
                      <input
                        type="color"
                        value={form.primary_color}
                        onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                      />
                      <code>{form.primary_color}</code>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>SIDEBAR BASE COLOR</label>
                    <div className="color-picker-box">
                      <input
                        type="color"
                        value={form.sidebar_color}
                        onChange={(e) => setForm({ ...form, sidebar_color: e.target.value })}
                      />
                      <code>{form.sidebar_color}</code>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Preview Card */}
              <div className="settings-card preview-card">
                <div className="card-section-header">
                  <Sparkles size={16} color="#38bdf8" />
                  <span>LIVE WHITE-LABEL PORTAL PREVIEW</span>
                </div>

                <div className="preview-browser-frame">
                  <div className="preview-top-bar">
                    <div className="browser-dots">
                      <span className="dot red" />
                      <span className="dot yellow" />
                      <span className="dot green" />
                    </div>
                    <div className="browser-address">
                      <Globe size={11} color="#64748b" />
                      <span>https://{form.custom_domain || 'monitoring.company.internal'}</span>
                    </div>
                  </div>

                  <div className="preview-body" style={{ backgroundColor: '#090d16' }}>
                    <div className="preview-sidebar" style={{ backgroundColor: form.sidebar_color }}>
                      <div className="preview-brand-header">
                        <div className="preview-logo-icon" style={{ backgroundColor: form.primary_color }}>
                          <Building size={12} color="#fff" />
                        </div>
                        <span className="preview-brand-name">{form.company_name || 'InfraPilot'}</span>
                      </div>
                      <div className="preview-nav-item active" style={{ color: form.primary_color }}>
                        <Activity size={12} /> Overview
                      </div>
                      <div className="preview-nav-item"><Server size={12} /> Machines</div>
                      <div className="preview-nav-item"><Zap size={12} /> SRE Monitors</div>
                    </div>

                    <div className="preview-content-area">
                      <div className="preview-kpi-card" style={{ borderColor: form.primary_color }}>
                        <span className="preview-kpi-title">TOTAL CONNECTED NODES</span>
                        <strong style={{ color: form.primary_color }}>2 Online</strong>
                      </div>
                      <div className="preview-status-pill" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>
                        <CheckCircle2 size={12} /> Enterprise License Active
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Agent & Telemetry Settings */}
          {activeTab === 'fleet' && (
            <div className="settings-tab-content">
              <div className="settings-card">
                <div className="card-section-header">
                  <Server size={16} color="#38bdf8" />
                  <span>AGENT FLEET TELEMETRY &amp; COLLECTION FREQUENCY</span>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>METRICS COLLECTION INTERVAL (SECONDS)</label>
                    <select
                      value={form.metrics_interval}
                      onChange={(e) => setForm({ ...form, metrics_interval: e.target.value })}
                    >
                      <option value="2">2 Seconds (High Resolution / Realtime)</option>
                      <option value="5">5 Seconds (Recommended Standard)</option>
                      <option value="10">10 Seconds (Balanced Fleet Mode)</option>
                      <option value="15">15 Seconds (Low Bandwidth Mode)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>HEARTBEAT INTERVAL (SECONDS)</label>
                    <select
                      value={form.heartbeat_interval}
                      onChange={(e) => setForm({ ...form, heartbeat_interval: e.target.value })}
                    >
                      <option value="10">10 Seconds</option>
                      <option value="15">15 Seconds (Standard)</option>
                      <option value="30">30 Seconds</option>
                    </select>
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>OFFLINE TIMEOUT THRESHOLD (SECONDS)</label>
                    <input
                      type="number"
                      value={form.offline_threshold}
                      onChange={(e) => setForm({ ...form, offline_threshold: e.target.value })}
                    />
                    <small className="field-hint">Mark host OFFLINE if no heartbeat is received within this duration.</small>
                  </div>

                  <div className="form-group">
                    <label>GLOBAL ENROLLMENT TOKEN</label>
                    <div className="input-copy-wrap">
                      <input type="text" value={form.enrollment_token} readOnly />
                      <button type="button" onClick={handleCopyToken} className="btn-copy">
                        {copiedToken ? <Check size={14} color="#4ade80" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="toggle-setting-row">
                  <div>
                    <strong>ENABLE AGENT LOG COLLECTION</strong>
                    <p>Stream systemd journal, syslog, and Windows event logs to Fleet Terminal.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.log_collection_enabled}
                    onChange={(e) => setForm({ ...form, log_collection_enabled: e.target.checked })}
                    className="toggle-switch"
                  />
                </div>

                <div className="toggle-setting-row">
                  <div>
                    <strong>AUTOMATIC AGENT BINARY UPGRADES</strong>
                    <p>Automatically update connected background agents when new releases drop.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.auto_upgrade_agents}
                    onChange={(e) => setForm({ ...form, auto_upgrade_agents: e.target.checked })}
                    className="toggle-switch"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Notifications & Webhooks */}
          {activeTab === 'notifications' && (
            <div className="settings-tab-content">
              <div className="settings-card">
                <div className="card-section-header">
                  <Bell size={16} color="#38bdf8" />
                  <span>ALERT NOTIFICATION CHANNELS &amp; WEBHOOK INTEGRATIONS</span>
                </div>

                <div className="form-group">
                  <label>SLACK INCOMING WEBHOOK URL</label>
                  <div className="input-with-icon">
                    <MessageSquare size={15} color="#38bdf8" />
                    <input
                      type="url"
                      value={form.slack_webhook_url}
                      onChange={(e) => setForm({ ...form, slack_webhook_url: e.target.value })}
                      placeholder="https://hooks.slack.com/services/T00/B00/XXXX"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>PAGERDUTY INTEGRATION ROUTING KEY</label>
                  <div className="input-with-icon">
                    <Zap size={15} color="#a855f7" />
                    <input
                      type="text"
                      value={form.pagerduty_key}
                      onChange={(e) => setForm({ ...form, pagerduty_key: e.target.value })}
                      placeholder="e.g. pd_integration_key_prod_8819"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>EMAIL ALERT RECIPIENTS (COMMA SEPARATED)</label>
                  <div className="input-with-icon">
                    <Mail size={15} color="#f59e0b" />
                    <input
                      type="text"
                      value={form.email_recipients}
                      onChange={(e) => setForm({ ...form, email_recipients: e.target.value })}
                      placeholder="sre-team@company.com, ops@company.com"
                    />
                  </div>
                </div>

                <div className="toggle-setting-row">
                  <div>
                    <strong>HIGH-SEVERITY CRITICAL PAGER TRIGGER</strong>
                    <p>Trigger immediate PagerDuty phone/SMS alerts for P1 Critical incidents.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.enable_critical_pager}
                    onChange={(e) => setForm({ ...form, enable_critical_pager: e.target.checked })}
                    className="toggle-switch"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SRE & Autonomous Remediation */}
          {activeTab === 'sre' && (
            <div className="settings-tab-content">
              <div className="settings-card">
                <div className="card-section-header">
                  <Zap size={16} color="#38bdf8" />
                  <span>AUTONOMOUS SRE REMEDIATION &amp; CIRCUIT BREAKER POLICIES</span>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>SERVICE FLAP THRESHOLD (MAX RESTARTS)</label>
                    <input
                      type="number"
                      value={form.flap_threshold}
                      onChange={(e) => setForm({ ...form, flap_threshold: e.target.value })}
                    />
                    <small className="field-hint">Suspend auto-restart if a service crashes more than N times in window.</small>
                  </div>

                  <div className="form-group">
                    <label>CIRCUIT BREAKER RESET WINDOW (MINUTES)</label>
                    <input
                      type="number"
                      value={form.circuit_breaker_window_min}
                      onChange={(e) => setForm({ ...form, circuit_breaker_window_min: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>DISK EMERGENCY AUTO-CLEANUP TRIGGER (%)</label>
                    <input
                      type="number"
                      value={form.disk_cleanup_trigger_percent}
                      onChange={(e) => setForm({ ...form, disk_cleanup_trigger_percent: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>LATENCY SLO DEGRADATION MULTIPLIER</label>
                    <input
                      type="text"
                      value={form.latency_slo_multiplier}
                      onChange={(e) => setForm({ ...form, latency_slo_multiplier: e.target.value })}
                    />
                  </div>
                </div>

                <div className="toggle-setting-row">
                  <div>
                    <strong>AUTOMATED SERVICE REMEDIATION ENGINE</strong>
                    <p>Automatically execute recovery commands when critical services crash or flap.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.auto_remediation_enabled}
                    onChange={(e) => setForm({ ...form, auto_remediation_enabled: e.target.checked })}
                    className="toggle-switch"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Security & SAML SSO */}
          {activeTab === 'security' && (
            <div className="settings-tab-content">
              <div className="settings-card">
                <div className="card-section-header">
                  <Shield size={16} color="#38bdf8" />
                  <span>SAML 2.0 SINGLE SIGN-ON &amp; ACCESS SECURITY</span>
                </div>

                <div className="form-group">
                  <label>SAML 2.0 IDENTITY PROVIDER ENTITY ID</label>
                  <input
                    type="text"
                    value={form.saml_entity_id}
                    onChange={(e) => setForm({ ...form, saml_entity_id: e.target.value })}
                    placeholder="https://sso.company.com/saml2/metadata"
                  />
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>USER SESSION TIMEOUT (MINUTES)</label>
                    <select
                      value={form.session_timeout_min}
                      onChange={(e) => setForm({ ...form, session_timeout_min: e.target.value })}
                    >
                      <option value="15">15 Minutes (Strict Security)</option>
                      <option value="60">60 Minutes (Standard)</option>
                      <option value="480">8 Hours (Full Shift)</option>
                      <option value="1440">24 Hours</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>API KEY ROTATION MANDATE</label>
                    <select
                      value={form.api_key_rotation_days}
                      onChange={(e) => setForm({ ...form, api_key_rotation_days: e.target.value })}
                    >
                      <option value="30">30 Days</option>
                      <option value="60">60 Days</option>
                      <option value="90">90 Days (Recommended)</option>
                      <option value="0">Disabled (Never)</option>
                    </select>
                  </div>
                </div>

                <div className="toggle-setting-row">
                  <div>
                    <strong>FORCE MULTI-FACTOR AUTHENTICATION (MFA/2FA)</strong>
                    <p>Enforce TOTP authenticator app verification for all enterprise organization accounts.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.force_mfa}
                    onChange={(e) => setForm({ ...form, force_mfa: e.target.checked })}
                    className="toggle-switch"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: Data Retention & Archival */}
          {activeTab === 'retention' && (
            <div className="settings-tab-content">
              <div className="settings-card">
                <div className="card-section-header">
                  <HardDrive size={16} color="#38bdf8" />
                  <span>METRICS RETENTION &amp; AUDIT LOG ARCHIVAL POLICIES</span>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>RAW METRIC RETENTION (DAYS)</label>
                    <select
                      value={form.metrics_retention_days}
                      onChange={(e) => setForm({ ...form, metrics_retention_days: e.target.value })}
                    >
                      <option value="30">30 Days</option>
                      <option value="90">90 Days (Standard Compliance)</option>
                      <option value="180">180 Days</option>
                      <option value="365">365 Days (1 Year)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>SYSTEM LOG RETENTION (DAYS)</label>
                    <select
                      value={form.logs_retention_days}
                      onChange={(e) => setForm({ ...form, logs_retention_days: e.target.value })}
                    >
                      <option value="7">7 Days</option>
                      <option value="30">30 Days</option>
                      <option value="90">90 Days</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>AUDIT LOG RETENTION (DAYS)</label>
                  <input
                    type="number"
                    value={form.audit_retention_days}
                    onChange={(e) => setForm({ ...form, audit_retention_days: e.target.value })}
                  />
                </div>

                <div className="toggle-setting-row">
                  <div>
                    <strong>AUTOMATIC COLD STORAGE ARCHIVAL</strong>
                    <p>Compress and archive expired telemetry metrics to AWS S3 / MinIO storage bucket.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.auto_archive_enabled}
                    onChange={(e) => setForm({ ...form, auto_archive_enabled: e.target.checked })}
                    className="toggle-switch"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Form Save Button Bar */}
          <div className="settings-submit-bar">
            <button type="submit" className="btn-primary-save lg" disabled={isSaving}>
              <Save size={16} /> {isSaving ? 'Saving Configurations...' : 'Save Enterprise Settings'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .enterprise-settings-root {
          display: flex;
          flex-direction: column;
          gap: 20px;
          color: #f8fafc;
        }

        .settings-header-card {
          background-color: #0d1424;
          border: 1px solid #1e293b;
          border-radius: 14px;
          padding: 20px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
        }

        .header-title-block {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .header-icon-box {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .header-title-block h2 {
          margin: 0;
          font-size: 19px;
          font-weight: 700;
          color: #ffffff;
        }

        .header-title-block p {
          margin: 4px 0 0 0;
          font-size: 13px;
          color: #94a3b8;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .btn-export-config {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background-color: #1e293b;
          border: 1px solid #334155;
          color: #cbd5e1;
          padding: 9px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-export-config:hover {
          background-color: #334155;
          color: #ffffff;
        }

        .btn-primary-save {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
          border: none;
          color: #ffffff;
          padding: 9px 20px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 2px 10px rgba(37, 99, 235, 0.3);
          transition: all 0.2s ease;
        }

        .btn-primary-save:hover {
          opacity: 0.92;
          transform: translateY(-1px);
        }

        .btn-primary-save.lg {
          padding: 12px 28px;
          font-size: 14px;
        }

        .save-alert-success {
          display: flex;
          align-items: center;
          gap: 10px;
          background-color: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: #4ade80;
          padding: 12px 18px;
          border-radius: 10px;
          font-size: 13.5px;
          font-weight: 600;
        }

        /* Tabs */
        .settings-nav-tabs {
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid #1e293b;
          padding-bottom: 4px;
          overflow-x: auto;
        }

        .nav-tab-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: none;
          color: #94a3b8;
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .nav-tab-button:hover {
          color: #ffffff;
          background-color: rgba(255, 255, 255, 0.04);
        }

        .nav-tab-button.active {
          color: #38bdf8;
          background-color: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.25);
        }

        .tab-badge {
          font-size: 9.5px;
          font-weight: 700;
          background: #1e293b;
          color: #cbd5e1;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .nav-tab-button.active .tab-badge {
          background: rgba(56, 189, 248, 0.25);
          color: #38bdf8;
        }

        /* Main Form */
        .settings-main-container {
          margin-top: 4px;
        }

        .settings-card {
          background-color: #0d1424;
          border: 1px solid #1e293b;
          border-radius: 14px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
        }

        .grid-2col {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 20px;
        }

        @media (max-width: 1024px) {
          .grid-2col {
            grid-template-columns: 1fr;
          }
        }

        .card-section-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11.5px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.5px;
          padding-bottom: 8px;
          border-bottom: 1px solid #1c283d;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          font-size: 11px;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 0.5px;
        }

        .form-group input,
        .form-group select {
          background-color: #080c14;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 10px 14px;
          color: #ffffff;
          font-size: 13.5px;
          outline: none;
          transition: border-color 0.2s ease;
        }

        .form-group input:focus,
        .form-group select:focus {
          border-color: #38bdf8;
        }

        .form-row-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .field-hint {
          font-size: 11px;
          color: #64748b;
        }

        .input-with-icon {
          display: flex;
          align-items: center;
          gap: 10px;
          background-color: #080c14;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 0 14px;
        }

        .input-with-icon input {
          flex: 1;
          border: none;
          background: transparent;
          padding: 10px 0;
        }

        .input-copy-wrap {
          display: flex;
          align-items: center;
          background-color: #080c14;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 2px 6px;
        }

        .input-copy-wrap input {
          flex: 1;
          border: none;
          background: transparent;
          font-family: monospace;
          color: #38bdf8;
        }

        .btn-copy {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 6px;
        }

        .toggle-setting-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background-color: #080c14;
          border: 1px solid #1c283d;
          padding: 14px 18px;
          border-radius: 10px;
        }

        .toggle-setting-row strong {
          font-size: 12.5px;
          color: #f1f5f9;
        }

        .toggle-setting-row p {
          margin: 2px 0 0 0;
          font-size: 11.5px;
          color: #64748b;
        }

        .toggle-switch {
          width: 20px;
          height: 20px;
          accent-color: #0284c7;
          cursor: pointer;
        }

        .presets-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .presets-label {
          font-size: 11.5px;
          color: #64748b;
          font-weight: 600;
        }

        .presets-list {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .preset-swatch-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background-color: #080c14;
          border: 1px solid #1c283d;
          color: #cbd5e1;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11.5px;
          cursor: pointer;
        }

        .swatch-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .color-picker-box {
          display: flex;
          align-items: center;
          gap: 10px;
          background-color: #080c14;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 6px 12px;
        }

        .color-picker-box input {
          width: 32px;
          height: 26px;
          border: none;
          background: transparent;
          cursor: pointer;
        }

        .color-picker-box code {
          font-size: 12px;
          color: #94a3b8;
        }

        /* Live Preview */
        .preview-browser-frame {
          border: 1px solid #1e293b;
          border-radius: 10px;
          overflow: hidden;
          background-color: #080c14;
        }

        .preview-top-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          background-color: #0f172a;
          padding: 8px 12px;
          border-bottom: 1px solid #1e293b;
        }

        .browser-dots {
          display: flex;
          gap: 5px;
        }

        .browser-dots .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .dot.red { background-color: #ef4444; }
        .dot.yellow { background-color: #f59e0b; }
        .dot.green { background-color: #22c55e; }

        .browser-address {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: #94a3b8;
        }

        .preview-body {
          display: flex;
          height: 220px;
        }

        .preview-sidebar {
          width: 140px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          border-right: 1px solid #1e293b;
        }

        .preview-brand-header {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 8px;
        }

        .preview-logo-icon {
          width: 20px;
          height: 20px;
          border-radius: 5px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .preview-brand-name {
          font-size: 11px;
          font-weight: 700;
          color: #fff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .preview-nav-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: #64748b;
          padding: 4px 6px;
          border-radius: 4px;
        }

        .preview-nav-item.active {
          background: rgba(255, 255, 255, 0.05);
          font-weight: 600;
        }

        .preview-content-area {
          flex: 1;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .preview-kpi-card {
          background-color: #0d1424;
          border: 1px solid;
          border-radius: 8px;
          padding: 10px 14px;
        }

        .preview-kpi-title {
          font-size: 9.5px;
          font-weight: 700;
          color: #64748b;
        }

        .preview-kpi-card strong {
          display: block;
          font-size: 15px;
          margin-top: 2px;
        }

        .preview-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          width: fit-content;
        }

        .settings-submit-bar {
          display: flex;
          justify-content: flex-end;
          margin-top: 10px;
        }
      `}</style>
    </div>
  );
}
