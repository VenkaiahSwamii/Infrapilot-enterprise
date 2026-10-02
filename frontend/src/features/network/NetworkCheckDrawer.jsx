import React, { useState, useEffect } from 'react';
import { X, Network, ShieldAlert, AlertCircle } from 'lucide-react';
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
        target: '8.8.8.8',
        host: '8.8.8.8',
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
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-slate-900 text-slate-100 border-l border-slate-800 shadow-2xl h-full flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
              <Network size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                {initialCheck ? 'Edit Network Target' : 'Configure Network Target'}
              </h2>
              <p className="text-xs text-slate-400">
                Monitor Ping, TCP, DNS, HTTP, Unix Sockets, or Interface status
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {errorMessage && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form id="network-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Target Display Name *</label>
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Primary DB Cluster TCP"
              value={formData.name}
              onChange={handleChange}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Check Type *</label>
              <select
                name="type"
                value={formData.type}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="PING">PING (ICMP / TCP)</option>
                <option value="TCP">TCP Port Connect</option>
                <option value="DNS">DNS Resolution</option>
                <option value="HTTP">HTTP Response</option>
                <option value="UNIX_SOCKET">Unix Domain Socket</option>
                <option value="INTERFACE">Network Interface</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Target String *</label>
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
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* Thresholds */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Degraded Latency Threshold (ms)</label>
              <input
                type="number"
                name="threshold_latency_ms"
                value={formData.threshold_latency_ms}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            {formData.type !== 'UNIX_SOCKET' && formData.type !== 'INTERFACE' && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Critical Packet Loss Threshold (%)</label>
                <input
                  type="number"
                  name="threshold_packet_loss_pct"
                  value={formData.threshold_packet_loss_pct}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Check Interval (Seconds)</label>
              <select
                name="interval_seconds"
                value={formData.interval_seconds}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={60}>1 minute</option>
                <option value={300}>5 minutes</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Probe Timeout (ms)</label>
              <input
                type="number"
                name="timeout_ms"
                value={formData.timeout_ms}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="enabled"
              name="enabled"
              checked={formData.enabled}
              onChange={handleChange}
              className="h-4 w-4 rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="enabled" className="text-xs text-slate-200 cursor-pointer">
              Enable automated network probe background checks
            </label>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="network-form"
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            {isSubmitting ? 'Saving...' : initialCheck ? 'Update Target' : 'Save & Start Monitoring'}
          </button>
        </div>
      </div>
    </div>
  );
}
