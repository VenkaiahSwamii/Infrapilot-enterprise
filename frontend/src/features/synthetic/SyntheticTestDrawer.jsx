import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, Zap, Globe, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
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
        url: 'https://',
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
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900 text-slate-100 border-l border-slate-800 shadow-2xl h-full flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
              <Globe size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                {initialTest ? 'Edit Synthetic Probe' : 'Create Synthetic Probe'}
              </h2>
              <p className="text-xs text-slate-400">
                Automated HTTP endpoint uptime, latency, and assertions
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

        {/* Security Alert Banner */}
        <div className="mx-6 mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5">
          <ShieldAlert size={16} className="shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">SSRF Protection Active:</span> Probes to cloud metadata (169.254.169.254), private loopbacks, or local broadcast endpoints are blocked.
          </div>
        </div>

        {errorMessage && (
          <div className="mx-6 mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form id="synthetic-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Test Name */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Probe Target Name *
            </label>
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Auth Gateway Healthcheck"
              value={formData.name}
              onChange={handleChange}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* URL & Method */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Method</label>
              <select
                name="method"
                value={formData.method}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="HEAD">HEAD</option>
              </select>
            </div>
            <div className="col-span-3">
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Target Endpoint URL *</label>
              <input
                type="url"
                name="url"
                required
                placeholder="https://api.yourdomain.com/health"
                value={formData.url}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* Interval & Timeout & Expected Status */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Check Interval</label>
              <select
                name="interval_seconds"
                value={formData.interval_seconds}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value={15}>Every 15s</option>
                <option value={30}>Every 30s</option>
                <option value={60}>Every 1 min</option>
                <option value={300}>Every 5 min</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Expected HTTP Status</label>
              <input
                type="number"
                name="expected_status"
                value={formData.expected_status}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Degraded Threshold (ms)</label>
              <input
                type="number"
                name="response_time_threshold_ms"
                value={formData.response_time_threshold_ms}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* Timeout & Validation */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Timeout Limit (ms)</label>
              <input
                type="number"
                name="timeout_ms"
                value={formData.timeout_ms}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Body Substring Match (Optional)</label>
              <input
                type="text"
                name="validation_contains"
                placeholder='e.g. "status":"ok"'
                value={formData.validation_contains}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* Request Headers JSON */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Custom HTTP Headers (JSON string)
            </label>
            <textarea
              name="headers"
              rows={2}
              placeholder='{"Authorization": "Bearer token123", "X-Custom-Header": "value"}'
              value={formData.headers}
              onChange={handleChange}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Request Body (POST/PUT) */}
          {['POST', 'PUT', 'PATCH'].includes(formData.method) && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                HTTP Request Payload Body
              </label>
              <textarea
                name="body"
                rows={3}
                placeholder='{"ping": true}'
                value={formData.body}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {/* Active Enabled Toggle */}
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
              Enable automated synthetic probe runner
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
            form="synthetic-form"
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            {isSubmitting ? 'Saving...' : initialTest ? 'Update Probe' : 'Save & Trigger Probe'}
          </button>
        </div>
      </div>
    </div>
  );
}
