import React, { useState, useEffect } from 'react';
import { X, Network, ShieldAlert, AlertCircle, Play } from 'lucide-react';
import { createNetworkCheck, updateNetworkCheck } from '../../api/network.js';

export default function NetworkCheckDrawer({ isOpen, onClose, onSaved, initialCheck = null }) {
  const [formData, setFormData] = useState({
    name: '',
    type: 'PING',
    target: '',
    host: '',
    port: 80,
    url: '',
    interface_name: '',
    interval_seconds: 30,
    timeout_ms: 5000,
    threshold_latency_ms: 200,
    threshold_packet_loss_pct: 5,
    enabled: true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (initialCheck) {
      setFormData({
        name: initialCheck.name || '',
        type: initialCheck.type || 'PING',
        target: initialCheck.target || '',
        host: initialCheck.host || '',
        port: initialCheck.port || 80,
        url: initialCheck.url || '',
        interface_name: initialCheck.interface_name || '',
        interval_seconds: initialCheck.interval_seconds || 30,
        timeout_ms: initialCheck.timeout_ms || 5000,
        threshold_latency_ms: initialCheck.threshold_latency_ms || 200,
        threshold_packet_loss_pct: initialCheck.threshold_packet_loss_pct !== undefined ? initialCheck.threshold_packet_loss_pct : 5,
        enabled: initialCheck.enabled !== false,
      });
    } else {
      setFormData({
        name: '',
        type: 'PING',
        target: '',
        host: '',
        port: 80,
        url: '',
        interface_name: '',
        interval_seconds: 30,
        timeout_ms: 5000,
        threshold_latency_ms: 200,
        threshold_packet_loss_pct: 5,
        enabled: true,
      });
    }
    setErrorMessage('');
  }, [initialCheck, isOpen]);

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
      port: Number(formData.port),
      interval_seconds: Number(formData.interval_seconds),
      timeout_ms: Number(formData.timeout_ms),
      threshold_latency_ms: Number(formData.threshold_latency_ms),
      threshold_packet_loss_pct: Number(formData.threshold_packet_loss_pct),
    };

    try {
      if (initialCheck) {
        await updateNetworkCheck(initialCheck.id, payload);
      } else {
        await createNetworkCheck(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to save network check';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="sre-drawer-backdrop">
      <div className="sre-drawer-container">
        {/* Header */}
        <div className="sre-drawer-header">
          <div className="sre-drawer-title-wrap">
            <div className="sre-drawer-icon">
              <Network size={20} color="#38bdf8" />
            </div>
            <div>
              <h3>{initialCheck ? 'Edit Network Target' : 'Configure Network Target'}</h3>
              <p>Monitor Ping, TCP, DNS, HTTP, Unix Sockets, or Interface throughput</p>
            </div>
          </div>
          <button onClick={onClose} className="sre-drawer-close-btn">
            <X size={18} />
          </button>
        </div>

        {errorMessage && (
          <div className="sre-drawer-error">
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form id="network-check-form" onSubmit={handleSubmit} className="sre-drawer-body">
          <div className="sre-form-group">
            <label>Target Display Name *</label>
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Primary DB Cluster TCP"
              value={formData.name}
              onChange={handleChange}
            />
          </div>

          <div className="sre-form-row col-3">
            <div className="sre-form-group">
              <label>Check Type *</label>
              <select name="type" value={formData.type} onChange={handleChange}>
                <option value="PING">PING (ICMP / TCP)</option>
                <option value="TCP">TCP Port Connect</option>
                <option value="DNS">DNS Resolution</option>
                <option value="HTTP">HTTP Response</option>
                <option value="UNIX_SOCKET">Unix Domain Socket</option>
                <option value="INTERFACE">Network Interface</option>
              </select>
            </div>

            <div className="sre-form-group span-2">
              <label>Target Address / Path *</label>
              <input
                type="text"
                name="target"
                required
                placeholder={
                  formData.type === 'PING'
                    ? '10.10.20.1'
                    : formData.type === 'TCP'
                    ? '10.10.20.20:5432'
                    : formData.type === 'UNIX_SOCKET'
                    ? '/var/run/docker.sock'
                    : formData.type === 'INTERFACE'
                    ? 'eth0'
                    : 'api.example.com'
                }
                value={formData.target}
                onChange={handleChange}
                className="mono-inp"
              />
            </div>
          </div>

          {/* Thresholds */}
          <div className="sre-form-row col-2">
            <div className="sre-form-group">
              <label>Degraded Threshold (ms)</label>
              <input
                type="number"
                name="threshold_latency_ms"
                value={formData.threshold_latency_ms}
                onChange={handleChange}
                className="mono-inp"
              />
            </div>

            {formData.type !== 'UNIX_SOCKET' && formData.type !== 'INTERFACE' && (
              <div className="sre-form-group">
                <label>Packet Loss Threshold (%)</label>
                <input
                  type="number"
                  name="threshold_packet_loss_pct"
                  value={formData.threshold_packet_loss_pct}
                  onChange={handleChange}
                  className="mono-inp"
                />
              </div>
            )}
          </div>

          <div className="sre-form-row col-2">
            <div className="sre-form-group">
              <label>Interval (Seconds)</label>
              <select name="interval_seconds" value={formData.interval_seconds} onChange={handleChange}>
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={60}>1 minute</option>
                <option value={300}>5 minutes</option>
              </select>
            </div>
            <div className="sre-form-group">
              <label>Timeout Limit (ms)</label>
              <input
                type="number"
                name="timeout_ms"
                value={formData.timeout_ms}
                onChange={handleChange}
                className="mono-inp"
              />
            </div>
          </div>

          <div className="sre-checkbox-group">
            <input
              type="checkbox"
              id="enabled"
              name="enabled"
              checked={formData.enabled}
              onChange={handleChange}
            />
            <label htmlFor="enabled">Enable automated background network probe execution</label>
          </div>
        </form>

        {/* Footer */}
        <div className="sre-drawer-footer">
          <button type="button" onClick={onClose} className="sre-btn-secondary">
            Cancel
          </button>
          <button type="submit" form="network-check-form" disabled={isSubmitting} className="sre-btn-primary">
            {isSubmitting ? 'Saving...' : initialCheck ? 'Update Target' : 'Save & Start Monitoring'}
          </button>
        </div>
      </div>

      <style>{`
        .sre-drawer-backdrop {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          z-index: 999;
          display: flex;
          justify-content: flex-end;
        }
        .sre-drawer-container {
          width: 100%;
          max-width: 520px;
          background: #111827;
          border-left: 1px solid #1f293d;
          display: flex;
          flex-direction: column;
          height: 100%;
          color: #f1f5f9;
        }
        .sre-drawer-header {
          padding: 18px 24px;
          background: #0b0f19;
          border-bottom: 1px solid #1f293d;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .sre-drawer-title-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .sre-drawer-icon {
          background: rgba(56, 189, 248, 0.1);
          border: 1px solid rgba(56, 189, 248, 0.2);
          padding: 8px;
          border-radius: 8px;
        }
        .sre-drawer-title-wrap h3 {
          font-size: 16px;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
        }
        .sre-drawer-title-wrap p {
          font-size: 12px;
          color: #64748b;
          margin: 2px 0 0 0;
        }
        .sre-drawer-close-btn {
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
        }
        .sre-drawer-close-btn:hover { background: #1e293b; color: #ffffff; }

        .sre-drawer-error {
          margin: 16px 24px 0 24px;
          padding: 12px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          color: #fca5a5;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .sre-drawer-body {
          padding: 24px;
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .sre-form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .sre-form-group label {
          font-size: 11px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .sre-form-group input, .sre-form-group select {
          background: #0b0f19;
          border: 1px solid #1f293d;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 13px;
          color: #f1f5f9;
          outline: none;
        }
        .sre-form-group input:focus, .sre-form-group select:focus {
          border-color: #38bdf8;
        }
        .mono-inp { font-family: monospace; }

        .sre-form-row {
          display: grid;
          gap: 12px;
        }
        .sre-form-row.col-2 { grid-template-columns: 1fr 1fr; }
        .sre-form-row.col-3 { grid-template-columns: 1fr 1fr 1fr; }
        .span-2 { grid-column: span 2; }

        .sre-checkbox-group {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 8px;
        }
        .sre-checkbox-group input { accent-color: #38bdf8; cursor: pointer; }
        .sre-checkbox-group label { font-size: 12px; color: #cbd5e1; cursor: pointer; }

        .sre-drawer-footer {
          padding: 16px 24px;
          background: #0b0f19;
          border-top: 1px solid #1f293d;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
        }
        .sre-btn-secondary {
          background: #1e293b;
          border: 1px solid #334155;
          color: #94a3b8;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .sre-btn-secondary:hover { background: #334155; color: #ffffff; }

        .sre-btn-primary {
          background: #0284c7;
          border: none;
          color: #ffffff;
          padding: 8px 18px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .sre-btn-primary:hover { background: #0369a1; }
        .sre-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
