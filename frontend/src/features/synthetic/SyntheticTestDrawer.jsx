import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, Globe, AlertCircle } from 'lucide-react';
import { createSyntheticTest, updateSyntheticTest } from '../../api/synthetic.js';

export default function SyntheticTestDrawer({ isOpen, onClose, onSaved, initialTest = null }) {
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    method: 'GET',
    headers: '',
    body: '',
    expected_status: 200,
    response_time_threshold_ms: 1000,
    timeout_ms: 5000,
    interval_seconds: 30,
    validation_contains: '',
    enabled: true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (initialTest) {
      setFormData({
        name: initialTest.name || '',
        url: initialTest.url || '',
        method: initialTest.method || 'GET',
        headers: initialTest.headers || '',
        body: initialTest.body || '',
        expected_status: initialTest.expected_status || 200,
        response_time_threshold_ms: initialTest.response_time_threshold_ms || 1000,
        timeout_ms: initialTest.timeout_ms || 5000,
        interval_seconds: initialTest.interval_seconds || 30,
        validation_contains: initialTest.validation_contains || '',
        enabled: initialTest.enabled !== false,
      });
    } else {
      setFormData({
        name: '',
        url: '',
        method: 'GET',
        headers: '',
        body: '',
        expected_status: 200,
        response_time_threshold_ms: 1000,
        timeout_ms: 5000,
        interval_seconds: 30,
        validation_contains: '',
        enabled: true,
      });
    }
    setErrorMessage('');
  }, [initialTest, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');

    const payload = {
      ...formData,
      expected_status: Number(formData.expected_status),
      response_time_threshold_ms: Number(formData.response_time_threshold_ms),
      timeout_ms: Number(formData.timeout_ms),
      interval_seconds: Number(formData.interval_seconds),
    };

    try {
      if (initialTest) {
        await updateSyntheticTest(initialTest.id, payload);
      } else {
        await createSyntheticTest(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to save synthetic test';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="synth-drawer-backdrop">
      <div className="synth-drawer-container">
        {/* Header */}
        <div className="synth-drawer-header">
          <div className="synth-drawer-title-wrap">
            <div className="synth-drawer-icon">
              <Globe size={20} color="#6366f1" />
            </div>
            <div>
              <h3>{initialTest ? 'Edit Synthetic Probe' : 'Create Synthetic Probe'}</h3>
              <p>Automated HTTP endpoint uptime, latency, and response assertions</p>
            </div>
          </div>
          <button onClick={onClose} className="synth-drawer-close-btn">
            <X size={18} />
          </button>
        </div>

        {/* Security Alert Banner */}
        <div className="synth-alert-banner">
          <ShieldAlert size={16} className="amber-icon" />
          <div>
            <strong>SSRF Protection Active:</strong> Probes to cloud metadata (169.254.169.254), private loopbacks, or local broadcast endpoints are blocked.
          </div>
        </div>

        {errorMessage && (
          <div className="synth-error-banner">
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form id="synthetic-form" onSubmit={handleSubmit} className="synth-drawer-form">
          {/* Test Name */}
          <div className="form-group">
            <label>Probe Target Name *</label>
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Auth Gateway Healthcheck"
              value={formData.name}
              onChange={handleChange}
              className="form-input"
            />
          </div>

          {/* URL & Method */}
          <div className="form-row grid-4">
            <div className="form-group col-1">
              <label>Method</label>
              <select name="method" value={formData.method} onChange={handleChange} className="form-select">
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="HEAD">HEAD</option>
              </select>
            </div>
            <div className="form-group col-3">
              <label>Target Endpoint URL *</label>
              <input
                type="url"
                name="url"
                required
                placeholder="https://api.yourdomain.com/health"
                value={formData.url}
                onChange={handleChange}
                className="form-input mono"
              />
            </div>
          </div>

          {/* Interval & Timeout & Expected Status */}
          <div className="form-row grid-3">
            <div className="form-group">
              <label>Check Interval</label>
              <select name="interval_seconds" value={formData.interval_seconds} onChange={handleChange} className="form-select">
                <option value={15}>Every 15s</option>
                <option value={30}>Every 30s</option>
                <option value={60}>Every 1 min</option>
                <option value={300}>Every 5 min</option>
              </select>
            </div>
            <div className="form-group">
              <label>Expected HTTP Status</label>
              <input
                type="number"
                name="expected_status"
                value={formData.expected_status}
                onChange={handleChange}
                className="form-input mono"
              />
            </div>
            <div className="form-group">
              <label>Degraded Threshold (ms)</label>
              <input
                type="number"
                name="response_time_threshold_ms"
                value={formData.response_time_threshold_ms}
                onChange={handleChange}
                className="form-input mono"
              />
            </div>
          </div>

          {/* Timeout & Validation */}
          <div className="form-row grid-2">
            <div className="form-group">
              <label>Timeout Limit (ms)</label>
              <input
                type="number"
                name="timeout_ms"
                value={formData.timeout_ms}
                onChange={handleChange}
                className="form-input mono"
              />
            </div>
            <div className="form-group">
              <label>Body Substring Match (Optional)</label>
              <input
                type="text"
                name="validation_contains"
                placeholder='e.g. "status":"ok"'
                value={formData.validation_contains}
                onChange={handleChange}
                className="form-input mono"
              />
            </div>
          </div>

          {/* Request Headers JSON */}
          <div className="form-group">
            <label>Custom HTTP Headers (JSON string)</label>
            <textarea
              name="headers"
              rows={2}
              placeholder='{"Authorization": "Bearer token123", "X-Custom-Header": "value"}'
              value={formData.headers}
              onChange={handleChange}
              className="form-textarea mono"
            />
          </div>

          {/* Request Body (POST/PUT) */}
          {['POST', 'PUT', 'PATCH'].includes(formData.method) && (
            <div className="form-group">
              <label>HTTP Request Payload Body</label>
              <textarea
                name="body"
                rows={3}
                placeholder='{"ping": true}'
                value={formData.body}
                onChange={handleChange}
                className="form-textarea mono"
              />
            </div>
          )}

          {/* Active Enabled Toggle */}
          <div className="checkbox-row">
            <input
              type="checkbox"
              id="enabled"
              name="enabled"
              checked={formData.enabled}
              onChange={handleChange}
            />
            <label htmlFor="enabled">Enable automated synthetic probe runner</label>
          </div>
        </form>

        {/* Footer */}
        <div className="synth-drawer-footer">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="synthetic-form" disabled={isSubmitting} className="btn-primary">
            {isSubmitting ? 'Saving...' : initialTest ? 'Update Probe' : 'Save & Trigger Probe'}
          </button>
        </div>
      </div>

      <style>{`
        .synth-drawer-backdrop {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          z-index: 9999;
          display: flex;
          justify-content: flex-end;
        }
        .synth-drawer-container {
          width: 100%;
          max-width: 640px;
          height: 100%;
          background: #111827;
          border-left: 1px solid #1f293d;
          display: flex;
          flex-direction: column;
          color: #f1f5f9;
        }
        .synth-drawer-header {
          padding: 18px 24px;
          background: #0b0f19;
          border-bottom: 1px solid #1f293d;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .synth-drawer-title-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .synth-drawer-icon {
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          padding: 8px;
          border-radius: 8px;
        }
        .synth-drawer-title-wrap h3 {
          font-size: 16px;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
        }
        .synth-drawer-title-wrap p {
          font-size: 12px;
          color: #64748b;
          margin: 2px 0 0 0;
        }
        .synth-drawer-close-btn {
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
        }
        .synth-drawer-close-btn:hover { background: #1e293b; color: #ffffff; }

        .synth-alert-banner {
          margin: 16px 24px 0 24px;
          padding: 12px 14px;
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.2);
          border-radius: 8px;
          color: #fcd34d;
          font-size: 12px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        .amber-icon { color: #f59e0b; flex-shrink: 0; margin-top: 1px; }

        .synth-error-banner {
          margin: 12px 24px 0 24px;
          padding: 10px 14px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 8px;
          color: #fca5a5;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .synth-drawer-form {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 18px;
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
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .form-input, .form-select, .form-textarea {
          background: #0b0f19;
          border: 1px solid #1f293d;
          border-radius: 8px;
          padding: 8px 12px;
          color: #f1f5f9;
          font-size: 13px;
          outline: none;
          transition: border-color 0.15s ease;
        }
        .form-input:focus, .form-select:focus, .form-textarea:focus {
          border-color: #6366f1;
        }
        .mono { font-family: monospace; }

        .form-row { display: grid; gap: 12px; }
        .grid-2 { grid-template-columns: 1fr 1fr; }
        .grid-3 { grid-template-columns: 1fr 1fr 1fr; }
        .grid-4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
        .col-1 { grid-column: span 1; }
        .col-3 { grid-column: span 3; }

        .checkbox-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #cbd5e1;
          margin-top: 4px;
        }

        .synth-drawer-footer {
          padding: 16px 24px;
          background: #0b0f19;
          border-top: 1px solid #1f293d;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
        }
        .btn-secondary {
          background: #1e293b;
          border: 1px solid #334155;
          color: #cbd5e1;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-secondary:hover { background: #334155; color: #ffffff; }
        .btn-primary {
          background: #4f46e5;
          border: 1px solid #4338ca;
          color: #ffffff;
          padding: 8px 18px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .btn-primary:hover:not(:disabled) { background: #4338ca; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
