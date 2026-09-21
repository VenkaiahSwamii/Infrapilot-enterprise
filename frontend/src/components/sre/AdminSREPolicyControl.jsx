import React, { useState, useEffect } from 'react';
import { Zap, Mail, Check, Shield, Save, AlertCircle } from 'lucide-react';
import { apiClient } from '../../api/client.js';

export default function AdminSREPolicyControl({ category, component, title, compact = false }) {
  const [policy, setPolicy] = useState({
    mode: 'AUTO_REMEDIATE',
    recipient_email: 'admin@company.com',
    enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

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
            setPolicy({
              id: match.id,
              mode: match.mode || 'AUTO_REMEDIATE',
              recipient_email: match.recipient_email || 'admin@company.com',
              enabled: match.enabled !== false,
            });
          }
        }
      } catch (err) {
        console.error('Failed to load SRE action policy', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchPolicy();
    return () => {
      isMounted = false;
    };
  }, [category, component]);

  const handleSave = async (updatedMode, updatedEmail) => {
    const modeToSave = updatedMode || policy.mode;
    const emailToSave = updatedEmail !== undefined ? updatedEmail : policy.recipient_email;

    setSaving(true);
    setSavedSuccess(false);
    try {
      const payload = {
        id: policy.id,
        category,
        component,
        mode: modeToSave,
        recipient_email: emailToSave,
        enabled: policy.enabled,
      };
      const res = await apiClient.post('/sre/policies', payload);
      if (res?.data) {
        setPolicy({
          id: res.data.id,
          mode: res.data.mode || modeToSave,
          recipient_email: res.data.recipient_email || emailToSave,
          enabled: res.data.enabled !== false,
        });
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 2500);
      }
    } catch (err) {
      console.error('Failed to save SRE policy', err);
    } finally {
      setSaving(false);
    }
  };

  if (compact) {
    return (
      <div className="admin-sre-policy-compact">
        <div className="policy-mode-btn-group">
          <button
            type="button"
            className={`mode-pill ${policy.mode === 'AUTO_REMEDIATE' ? 'active-auto' : ''}`}
            onClick={() => {
              setPolicy((prev) => ({ ...prev, mode: 'AUTO_REMEDIATE' }));
              handleSave('AUTO_REMEDIATE');
            }}
            title="Auto Remediate: Edge Agent automatically executes remediation"
          >
            <Zap size={11} /> Auto Remediate
          </button>
          <button
            type="button"
            className={`mode-pill ${policy.mode === 'NOTIFY_EMAIL' ? 'active-notify' : ''}`}
            onClick={() => {
              setPolicy((prev) => ({ ...prev, mode: 'NOTIFY_EMAIL' }));
              handleSave('NOTIFY_EMAIL');
            }}
            title="Notify Email: Skip auto remediation and dispatch email to recipient"
          >
            <Mail size={11} /> Email Only
          </button>
        </div>

        {policy.mode === 'NOTIFY_EMAIL' && (
          <div className="email-input-wrapper">
            <input
              type="email"
              value={policy.recipient_email}
              onChange={(e) => setPolicy((prev) => ({ ...prev, recipient_email: e.target.value }))}
              onBlur={() => handleSave()}
              placeholder="recipient@company.com"
              className="compact-email-input"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="admin-sre-policy-card">
      <div className="card-header-row">
        <div className="header-left">
          <Shield size={16} className="text-cyan-400" />
          <span className="card-title">Admin SRE Action Policy ({title || component})</span>
        </div>
        {savedSuccess && (
          <span className="saved-badge">
            <Check size={12} /> Policy Saved
          </span>
        )}
      </div>

      <p className="policy-desc">
        Configure automated edge agent behavior when a <strong>{category}</strong> breach or crash occurs for{' '}
        <code>{component}</code>.
      </p>

      <div className="mode-selection-grid">
        <div
          className={`mode-option-box ${policy.mode === 'AUTO_REMEDIATE' ? 'selected-auto' : ''}`}
          onClick={() => {
            setPolicy((prev) => ({ ...prev, mode: 'AUTO_REMEDIATE' }));
            handleSave('AUTO_REMEDIATE');
          }}
        >
          <div className="opt-header">
            <Zap size={14} className="opt-icon yellow" />
            <span className="opt-title">AUTO REMEDIATE</span>
          </div>
          <p className="opt-desc">
            Edge agent automatically executes service restart / remediation with 2-restart flap protection.
          </p>
        </div>

        <div
          className={`mode-option-box ${policy.mode === 'NOTIFY_EMAIL' ? 'selected-notify' : ''}`}
          onClick={() => {
            setPolicy((prev) => ({ ...prev, mode: 'NOTIFY_EMAIL' }));
            handleSave('NOTIFY_EMAIL');
          }}
        >
          <div className="opt-header">
            <Mail size={14} className="opt-icon cyan" />
            <span className="opt-title">NOTIFY EMAIL ONLY</span>
          </div>
          <p className="opt-desc">
            Bypasses edge auto-remediation and sends alert email to designated owner. Manual UI action available.
          </p>
        </div>
      </div>

      {policy.mode === 'NOTIFY_EMAIL' && (
        <div className="email-config-block">
          <label className="email-label">Recipient Email Address:</label>
          <div className="email-input-group">
            <input
              type="email"
              value={policy.recipient_email}
              onChange={(e) => setPolicy((prev) => ({ ...prev, recipient_email: e.target.value }))}
              placeholder="e.g. devops-team@company.com"
              className="policy-email-input"
            />
            <button
              type="button"
              className="btn-save-email"
              disabled={saving}
              onClick={() => handleSave()}
            >
              <Save size={13} /> {saving ? 'Saving...' : 'Save Email'}
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .admin-sre-policy-card {
          background: #0d1322;
          border: 1px solid #1e293d;
          border-radius: 12px;
          padding: 16px;
          margin-top: 14px;
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
          gap: 8px;
        }
        .card-title {
          font-size: 13px;
          font-weight: 700;
          color: #f1f5f9;
        }
        .saved-badge {
          font-size: 11px;
          font-weight: 600;
          color: #22c55e;
          display: flex;
          align-items: center;
          gap: 4px;
          background: rgba(34, 197, 94, 0.1);
          padding: 2px 8px;
          border-radius: 4px;
        }
        .policy-desc {
          font-size: 11px;
          color: #94a3b8;
          margin-bottom: 12px;
          line-height: 1.4;
        }
        .policy-desc code {
          background: #1e293b;
          color: #38bdf8;
          padding: 2px 5px;
          border-radius: 4px;
        }
        .mode-selection-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 12px;
        }
        .mode-option-box {
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 8px;
          padding: 10px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .mode-option-box:hover {
          border-color: #38bdf8;
        }
        .mode-option-box.selected-auto {
          border-color: #eab308;
          background: rgba(234, 179, 8, 0.08);
        }
        .mode-option-box.selected-notify {
          border-color: #38bdf8;
          background: rgba(56, 189, 248, 0.08);
        }
        .opt-header {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 4px;
        }
        .opt-title {
          font-size: 11px;
          font-weight: 800;
          color: #f8fafc;
        }
        .opt-desc {
          font-size: 10px;
          color: #64748b;
          line-height: 1.3;
        }
        .email-config-block {
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 8px;
          padding: 10px 12px;
        }
        .email-label {
          font-size: 11px;
          font-weight: 600;
          color: #cbd5e1;
          display: block;
          margin-bottom: 6px;
        }
        .email-input-group {
          display: flex;
          gap: 8px;
        }
        .policy-email-input {
          flex: 1;
          background: #090d16;
          border: 1px solid #1f293d;
          border-radius: 6px;
          padding: 6px 10px;
          color: #f1f5f9;
          font-size: 11px;
          outline: none;
        }
        .policy-email-input:focus {
          border-color: #38bdf8;
        }
        .btn-save-email {
          background: #0284c7;
          color: #ffffff;
          border: none;
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 11px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 5px;
          cursor: pointer;
        }
        .btn-save-email:hover {
          background: #0369a1;
        }
        .admin-sre-policy-compact {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px dashed #1e293b;
        }
        .policy-mode-btn-group {
          display: flex;
          gap: 6px;
        }
        .mode-pill {
          flex: 1;
          background: #111827;
          border: 1px solid #1f293d;
          color: #94a3b8;
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 10px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          cursor: pointer;
        }
        .mode-pill.active-auto {
          background: rgba(234, 179, 8, 0.15);
          border-color: #eab308;
          color: #eab308;
        }
        .mode-pill.active-notify {
          background: rgba(56, 189, 248, 0.15);
          border-color: #38bdf8;
          color: #38bdf8;
        }
        .compact-email-input {
          width: 100%;
          background: #090d16;
          border: 1px solid #1f293d;
          border-radius: 6px;
          padding: 4px 8px;
          color: #f1f5f9;
          font-size: 10px;
          outline: none;
        }
      `}</style>
    </div>
  );
}
