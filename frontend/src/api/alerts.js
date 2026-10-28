import { apiGet, apiPost, apiDelete, apiPatch } from './client.js';

export function listAlerts(params = {}) {
  const query = new URLSearchParams();
  if (params.status) query.append('status', params.status);
  if (params.severity) query.append('severity', params.severity);
  if (params.category) query.append('category', params.category);
  if (params.machine_id) query.append('machine_id', params.machine_id);
  if (params.search) query.append('search', params.search);
  if (params.source) query.append('source', params.source);
  if (params.origin) query.append('origin', params.origin);
  if (params.limit) query.append('limit', params.limit);
  if (params.offset) query.append('offset', params.offset);

  const qs = query.toString();
  return apiGet(`/alerts${qs ? `?${qs}` : ''}`);
}

export function ingestEvent(eventData) {
  return apiPost('/events/ingest', eventData);
}

export function getAlertStats() {
  return apiGet('/alerts/stats');
}

export function acknowledgeAlert(alertId) {
  return apiPost(`/alerts/${alertId}/ack`);
}

export function resolveAlert(alertId, resolutionNote = 'Resolved manually by operator') {
  return apiPost(`/alerts/${alertId}/resolve`, { resolution_note: resolutionNote });
}

export function silenceAlert(alertId, durationMinutes = 60, reason = 'Scheduled maintenance') {
  return apiPost(`/alerts/${alertId}/silence`, { duration_minutes: durationMinutes, reason });
}

export function bulkAcknowledgeAlerts(payload) {
  return apiPost('/alerts/bulk/ack', payload);
}

export function bulkResolveAlerts(payload) {
  return apiPost('/alerts/bulk/resolve', payload);
}

export function purgeResolvedAlerts() {
  return apiDelete('/alerts/purge-resolved');
}

export function cleanupDuplicateAlerts() {
  return apiPost('/alerts/cleanup-duplicates');
}

export function aiAnalyzeAlert(alertId) {
  return apiPost(`/alerts/${alertId}/ai-analyze`);
}

export function remediateAlert(alertId) {
  return apiPost(`/alerts/${alertId}/remediate`);
}

export function listAlertRules(orgId = '') {
  const target = orgId ? `/orgs/${orgId}/alert-rules` : '/orgs/default/alert-rules';
  return apiGet(target)
    .catch(() => apiGet('/alert-rules'))
    .catch(() => []);
}

export function createAlertRule(orgId = 'default', data = {}) {
  const thresholdVal = data.threshold !== undefined ? data.threshold : (data.value !== undefined ? data.value : 0);
  const payload = {
    ...data,
    organization_id: orgId || 'default',
    threshold: Number(thresholdVal),
    value: Number(thresholdVal),
  };
  return apiPost(`/orgs/${orgId || 'default'}/alert-rules`, payload)
    .catch(() => apiPost('/alert-rules', payload));
}

export function updateAlertRule(orgId = 'default', ruleId, data = {}) {
  const payload = { ...data };
  if (data.threshold !== undefined || data.value !== undefined) {
    const val = data.threshold !== undefined ? data.threshold : data.value;
    payload.threshold = Number(val);
    payload.value = Number(val);
  }
  return apiPatch(`/orgs/${orgId || 'default'}/alert-rules/${ruleId}`, payload)
    .catch(() => apiPatch(`/alert-rules/${ruleId}`, payload));
}

export function deleteAlertRule(orgId = 'default', ruleId) {
  return apiDelete(`/orgs/${orgId || 'default'}/alert-rules/${ruleId}`)
    .catch(() => apiDelete(`/alert-rules/${ruleId}`));
}

export function toggleAlertRule(orgId = 'default', ruleId, enabled) {
  const payload = { enabled: Boolean(enabled) };
  return apiPatch(`/orgs/${orgId || 'default'}/alert-rules/${ruleId}/toggle`, payload)
    .catch(() => apiPatch(`/alert-rules/${ruleId}/toggle`, payload));
}

export function seedAlertRulePresets(orgId = 'default') {
  return apiPost(`/orgs/${orgId || 'default'}/alert-rules/presets`)
    .catch(() => apiPost('/alert-rules/presets'));
}
