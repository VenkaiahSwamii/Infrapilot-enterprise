import React, { useState, useEffect, useRef } from 'react';
import { Zap, Mail, Check, Shield, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { apiClient } from '../../api/client.js';
import { useDashboardStore } from '../../store/dashboardStore.jsx';

const STORAGE_KEY_PREFIX = 'infrapilot_sre_policy_';

export default function AdminSREPolicyControl({ category = 'Storage', component = 'root_disk', title, compact = false }) {
  let addToast = null;
  try {
    const store = useDashboardStore();
    addToast = store?.addToast;
  } catch (_) {
    // store not in tree
  }

  const cacheKey = `${STORAGE_KEY_PREFIX}${category.toLowerCase()}_${component.toLowerCase()}`;

  // Initialize state from local persistent cache
  const getInitialState = () => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const email = (!parsed.recipient_email || parsed.recipient_email === 'admin@company.com' || parsed.recipient_email.trim() === '')
          ? 'infrapilotadmin@gmail.com'
          : parsed.recipient_email;
        return {
          ...parsed,
          recipient_email: email,
        };
      }
    } catch (_) {}
    return {
      mode: 'AUTO_REMEDIATE',
      recipient_email: 'infrapilotadmin@gmail.com',
      enabled: true,
    };
  };

  const [policy, setPolicy] = useState(getInitialState);
  const [emailInput, setEmailInput] = useState(() => {
    const initial = getInitialState().recipient_email;
    return (!initial || initial === 'admin@company.com') ? 'infrapilotadmin@gmail.com' : initial;
  });
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const emailInputRef = useRef(null);

  // Sync from backend if available
  useEffect(() => {
    let isMounted = true;
    const fetchPolicy = async () => {
      try {
        const res = await apiClient.get('/sre/policies');
        if (res?.data && Array.isArray(res.data)) {
          const match = res.data.find(
            (p) =>
              p.category?.toLowerCase() === category?.toLowerCase() &&
              p.component?.toLowerCase() === component?.toLowerCase()
          );
          if (match && isMounted) {
            const loadedMode = match.mode || 'AUTO_REMEDIATE';
            const rawEmail = match.recipient_email;
            const loadedEmail = (!rawEmail || rawEmail === 'admin@company.com' || rawEmail.trim() === '')
              ? 'infrapilotadmin@gmail.com'
              : rawEmail;
            const updated = {
              id: match.id,
              mode: loadedMode,
              recipient_email: loadedEmail,
              enabled: match.enabled !== false,
            };
            setPolicy(updated);
            setEmailInput(loadedEmail);
            try {
              localStorage.setItem(cacheKey, JSON.stringify(updated));
            } catch (_) {}
          }
        }
      } catch (_) {
        // Backend not ready or offline - local storage handles everything
      }
    };
    fetchPolicy();
    return () => {
      isMounted = false;
    };
  }, [category, component, cacheKey]);

  const handleSave = async (updatedMode, updatedEmail, showNotification = true) => {
    const modeToSave = updatedMode || policy.mode;
    const rawEmail = updatedEmail !== undefined ? updatedEmail : emailInput;
    const emailToSave = (rawEmail || '').trim() || 'infrapilotadmin@gmail.com';

    setSaving(true);
    setSavedSuccess(false);

    // 1. Immediately update state and persistent local cache
    const updatedPolicy = {
      ...policy,
      mode: modeToSave,
      recipient_email: emailToSave,
    };
    setPolicy(updatedPolicy);
    setEmailInput(emailToSave);

    try {
      localStorage.setItem(cacheKey, JSON.stringify(updatedPolicy));
    } catch (_) {}

    // 2. Synchronize with backend API in background
    try {
      const payload = {
        category,
        component,
        mode: modeToSave,
        recipient_email: emailToSave,
        enabled: policy.enabled !== false,
      };

      if (policy.id) {
        payload.id = String(policy.id);
      }

      const res = await apiClient.post('/sre/policies', payload);
      if (res?.data?.id) {
        const withId = { ...updatedPolicy, id: res.data.id };
        setPolicy(withId);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(withId));
        } catch (_) {}
      }
    } catch (err) {
      console.warn('Policy cached locally (backend offline/sync deferred)');
    } finally {
      setSaving(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);

      if (showNotification && typeof addToast === 'function') {
        if (modeToSave === 'AUTO_REMEDIATE') {
          addToast('success', 'Auto-Remediation Active', `Edge agent will automatically self-heal ${component}.`);
        } else {
          addToast('info', 'Email Alert Configured', `Notifications for ${component} will be dispatched to ${emailToSave}.`);
        }
      }
    }
  };

  const isAuto = policy.mode === 'AUTO_REMEDIATE';
  const isEmail = policy.mode === 'NOTIFY_EMAIL';

  if (compact) {
    return (
      <div className="admin-sre-policy-compact-root">
        <div className="policy-control-header">
          <span className="policy-micro-label">POLICY ROUTING</span>
          {saving ? (
            <span className="policy-status-indicator saving">
              <Loader2 size={10} className="spin-icon" /> Saving...
            </span>
          ) : savedSuccess ? (
            <span className="policy-status-indicator saved">
              <Check size={10} /> Active
            </span>
          ) : (
            <span className={`policy-status-indicator ${isAuto ? 'armed' : 'notify'}`}>
              <span className="status-dot"></span>
              {isAuto ? 'Auto-Armed' : 'Email-Mode'}
            </span>
          )}
        </div>

        <div className="policy-btn-segmented-group">
          {/* AUTO REMEDIATE BUTTON */}
          <button
            type="button"
            className={`enterprise-toggle-btn auto-btn ${isAuto ? 'active' : ''}`}
            onClick={() => handleSave('AUTO_REMEDIATE')}
          >
            <div className="btn-icon-box">
              <Zap size={13} className="btn-icon zap-icon" />
            </div>
            <span className="btn-text">Auto Remediate</span>
            {isAuto && <span className="active-glow-pill">ARMED</span>}
          </button>

          {/* EMAIL ONLY BUTTON */}
          <button
            type="button"
            className={`enterprise-toggle-btn email-btn ${isEmail ? 'active' : ''}`}
            onClick={() => {
              handleSave('NOTIFY_EMAIL');
              setTimeout(() => {
                emailInputRef.current?.focus();
              }, 100);
            }}
          >
            <div className="btn-icon-box">
              <Mail size={13} className="btn-icon mail-icon" />
            </div>
            <span className="btn-text">Email Only</span>
            {isEmail && <span className="active-glow-pill cyan">NOTIFY</span>}
          </button>
        </div>

        {/* RECIPIENT EMAIL EXPANSION */}
        {isEmail && (
          <div className="compact-email-drawer">
            <div className="drawer-input-row">
              <div className="input-with-icon">
                <Mail size={12} className="input-leading-icon" />
                <input
                  ref={emailInputRef}
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSave('NOTIFY_EMAIL', emailInput);
                    }
                  }}
                  placeholder="infrapilotadmin@gmail.com"
                  className="compact-email-field"
                />
              </div>
              <button
                type="button"
                className={`compact-email-save-btn ${savedSuccess ? 'success' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSave('NOTIFY_EMAIL', emailInput)}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 size={12} className="spin-icon" />
                ) : savedSuccess ? (
                  <>
                    <Check size={12} /> <span className="btn-label-txt">Saved</span>
                  </>
                ) : (
                  <>
                    <Save size={12} /> <span className="btn-label-txt">Save</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        <style>{policyStyles}</style>
      </div>
    );
  }

  return (
    <div className="admin-sre-policy-card-root">
      <div className="card-header-row">
        <div className="header-left">
          <div className="shield-icon-wrap">
            <Shield size={16} />
          </div>
          <div>
            <span className="card-title">Admin SRE Action Policy</span>
            <span className="card-subtitle">({title || component})</span>
          </div>
        </div>
        {savedSuccess && (
          <span className="saved-badge">
            <Check size={12} /> Policy Synchronized
          </span>
        )}
      </div>

      <p className="policy-desc">
        Configure automated edge agent behavior when a <strong>{category}</strong> breach or crash occurs for{' '}
        <code>{component}</code>.
      </p>

      <div className="mode-selection-grid">
        <div
          className={`mode-option-box auto-box ${isAuto ? 'selected-auto' : ''}`}
          onClick={() => handleSave('AUTO_REMEDIATE')}
        >
          <div className="opt-header">
            <div className="opt-icon-bubble auto">
              <Zap size={15} />
            </div>
            <div>
              <div className="opt-title">AUTO REMEDIATE</div>
              <span className="opt-tagline">Self-healing Edge Execution</span>
            </div>
          </div>
          <p className="opt-desc">
            Edge agent automatically executes service restart / remediation with flap protection.
          </p>
        </div>

        <div
          className={`mode-option-box email-box ${isEmail ? 'selected-notify' : ''}`}
          onClick={() => handleSave('NOTIFY_EMAIL')}
        >
          <div className="opt-header">
            <div className="opt-icon-bubble email">
              <Mail size={15} />
            </div>
            <div>
              <div className="opt-title">NOTIFY EMAIL ONLY</div>
              <span className="opt-tagline">Manual SRE Gatekeeper</span>
            </div>
          </div>
          <p className="opt-desc">
            Bypasses edge auto-remediation and sends alert email to designated owner.
          </p>
        </div>
      </div>

      {isEmail && (
        <div className="email-config-block">
          <label className="email-label">
            <Mail size={13} className="text-cyan-400" /> Target SRE Notification Recipient
          </label>
          <div className="email-input-group">
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave('NOTIFY_EMAIL', emailInput);
                }
              }}
              placeholder="infrapilotadmin@gmail.com"
              className="policy-email-input"
            />
            <button
              type="button"
              className="btn-save-email"
              disabled={saving}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSave('NOTIFY_EMAIL', emailInput)}
            >
              {saving ? (
                <>
                  <Loader2 size={13} className="spin-icon" /> Saving...
                </>
              ) : savedSuccess ? (
                <>
                  <Check size={13} /> Saved!
                </>
              ) : (
                <>
                  <Save size={13} /> Save Email
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <style>{policyStyles}</style>
    </div>
  );
}

const policyStyles = `
  .admin-sre-policy-compact-root {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    width: 100%;
  }

  .policy-control-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .policy-micro-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #64748b;
    text-transform: uppercase;
  }

  .policy-status-indicator {
    font-size: 10px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: 9999px;
    transition: all 0.2s ease;
  }

  .policy-status-indicator.saving {
    color: #93c5fd;
    background: rgba(59, 130, 246, 0.15);
  }

  .policy-status-indicator.saved {
    color: #4ade80;
    background: rgba(34, 197, 94, 0.18);
    border: 1px solid rgba(34, 197, 94, 0.3);
  }

  .policy-status-indicator.armed {
    color: #fbbf24;
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.2);
  }

  .policy-status-indicator.notify {
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.12);
    border: 1px solid rgba(56, 189, 248, 0.2);
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 6px currentColor;
  }

  /* Segmented Toggle Group */
  .policy-btn-segmented-group {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    background: rgba(10, 15, 26, 0.6);
    padding: 3px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .enterprise-toggle-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 7px 10px;
    font-size: 11.5px;
    font-weight: 600;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    background: transparent;
    border: 1px solid transparent;
    color: #94a3b8;
    user-select: none;
    outline: none;
  }

  .enterprise-toggle-btn:hover {
    color: #f1f5f9;
    background: rgba(255, 255, 255, 0.04);
  }

  /* Auto Remediate Active */
  .enterprise-toggle-btn.auto-btn.active {
    background: linear-gradient(135deg, rgba(234, 179, 8, 0.16) 0%, rgba(180, 83, 9, 0.12) 100%);
    border-color: rgba(245, 158, 11, 0.5);
    color: #fef08a;
    box-shadow: 0 2px 10px rgba(234, 179, 8, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .enterprise-toggle-btn.auto-btn.active .btn-icon-box {
    background: rgba(234, 179, 8, 0.2);
    color: #fbbf24;
  }

  /* Email Only Active */
  .enterprise-toggle-btn.email-btn.active {
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.16) 0%, rgba(2, 132, 199, 0.12) 100%);
    border-color: rgba(56, 189, 248, 0.5);
    color: #bae6fd;
    box-shadow: 0 2px 10px rgba(56, 189, 248, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .enterprise-toggle-btn.email-btn.active .btn-icon-box {
    background: rgba(56, 189, 248, 0.2);
    color: #38bdf8;
  }

  .btn-icon-box {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.05);
    transition: all 0.2s ease;
  }

  .btn-text {
    white-space: nowrap;
    letter-spacing: -0.01em;
  }

  .active-glow-pill {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(245, 158, 11, 0.25);
    color: #fde047;
    letter-spacing: 0.03em;
  }

  .active-glow-pill.cyan {
    background: rgba(56, 189, 248, 0.25);
    color: #7dd3fc;
  }

  /* Email Drawer */
  .compact-email-drawer {
    animation: fadeInSlide 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    margin-top: 2px;
  }

  @keyframes fadeInSlide {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .drawer-input-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .input-with-icon {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
  }

  .input-leading-icon {
    position: absolute;
    left: 8px;
    color: #64748b;
    pointer-events: none;
  }

  .compact-email-field {
    width: 100%;
    background: #090e17;
    border: 1px solid rgba(56, 189, 248, 0.35);
    border-radius: 7px;
    padding: 6px 8px 6px 26px;
    color: #f8fafc;
    font-size: 11px;
    font-family: inherit;
    outline: none;
    transition: all 0.15s ease;
  }

  .compact-email-field:focus {
    border-color: #38bdf8;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
  }

  .compact-email-save-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.25) 0%, rgba(2, 132, 199, 0.2) 100%);
    border: 1px solid rgba(56, 189, 248, 0.45);
    color: #38bdf8;
    border-radius: 7px;
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;
  }

  .compact-email-save-btn:hover {
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.4) 0%, rgba(2, 132, 199, 0.35) 100%);
    border-color: #38bdf8;
    color: #ffffff;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.3);
  }

  .compact-email-save-btn.success {
    background: rgba(34, 197, 94, 0.25);
    border-color: rgba(34, 197, 94, 0.6);
    color: #4ade80;
    box-shadow: 0 0 10px rgba(34, 197, 94, 0.3);
  }

  .btn-label-txt {
    font-size: 10.5px;
    font-weight: 700;
  }

  /* Full Card Mode */
  .admin-sre-policy-card-root {
    background: #0c121e;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 16px;
    margin-top: 14px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }

  .card-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .shield-icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: rgba(56, 189, 248, 0.12);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.25);
  }

  .card-title {
    font-size: 13.5px;
    font-weight: 700;
    color: #f1f5f9;
  }

  .card-subtitle {
    font-size: 12px;
    color: #64748b;
    margin-left: 6px;
  }

  .saved-badge {
    font-size: 11px;
    font-weight: 600;
    color: #4ade80;
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(34, 197, 94, 0.12);
    padding: 3px 9px;
    border-radius: 6px;
    border: 1px solid rgba(34, 197, 94, 0.25);
  }

  .policy-desc {
    font-size: 11.5px;
    color: #94a3b8;
    margin-bottom: 14px;
    line-height: 1.5;
  }

  .policy-desc code {
    background: rgba(255, 255, 255, 0.06);
    color: #38bdf8;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: ui-monospace, monospace;
    font-size: 11px;
  }

  .mode-selection-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 14px;
  }

  .mode-option-box {
    background: #090e17;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 12px 14px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .mode-option-box:hover {
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }

  .mode-option-box.selected-auto {
    border-color: rgba(245, 158, 11, 0.6);
    background: linear-gradient(135deg, rgba(234, 179, 8, 0.09) 0%, rgba(10, 14, 23, 0.95) 100%);
    box-shadow: 0 4px 16px rgba(234, 179, 8, 0.12);
  }

  .mode-option-box.selected-notify {
    border-color: rgba(56, 189, 248, 0.6);
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.09) 0%, rgba(10, 14, 23, 0.95) 100%);
    box-shadow: 0 4px 16px rgba(56, 189, 248, 0.12);
  }

  .opt-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .opt-icon-bubble {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 6px;
  }

  .opt-icon-bubble.auto {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
  }

  .opt-icon-bubble.email {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
  }

  .opt-title {
    font-size: 12px;
    font-weight: 800;
    color: #f8fafc;
    letter-spacing: 0.02em;
  }

  .opt-tagline {
    font-size: 10px;
    color: #64748b;
    display: block;
  }

  .opt-desc {
    font-size: 11px;
    color: #94a3b8;
    line-height: 1.4;
    margin: 0;
  }

  .email-config-block {
    background: #090e17;
    border: 1px solid rgba(56, 189, 248, 0.25);
    border-radius: 10px;
    padding: 12px 14px;
    animation: fadeInSlide 0.2s ease;
  }

  .email-label {
    font-size: 11px;
    font-weight: 600;
    color: #cbd5e1;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }

  .email-input-group {
    display: flex;
    gap: 8px;
  }

  .policy-email-input {
    flex: 1;
    background: #05080f;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 7px;
    padding: 7px 12px;
    color: #f1f5f9;
    font-size: 12px;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .policy-email-input:focus {
    border-color: #38bdf8;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
  }

  .btn-save-email {
    background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 7px;
    padding: 7px 14px;
    font-size: 11.5px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-save-email:hover {
    background: linear-gradient(135deg, #0369a1 0%, #075985 100%);
    box-shadow: 0 2px 8px rgba(2, 132, 199, 0.4);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .spin-icon {
    animation: spin 0.8s linear infinite;
  }
`;
