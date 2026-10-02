import { apiGet, apiPost, apiPut, apiDelete } from './client.js';

export function getNetworkOverviewStats() {
  return apiGet('/network/stats');
}

export function getAllNetworkChecks() {
  return apiGet('/network/checks');
}

export function createNetworkCheck(data) {
  return apiPost('/network/checks', data);
}

export function getNetworkCheckByID(id) {
  return apiGet(`/network/checks/${id}`);
}

export function updateNetworkCheck(id, data) {
  return apiPut(`/network/checks/${id}`, data);
}

export function deleteNetworkCheck(id) {
  return apiDelete(`/network/checks/${id}`);
}

export function runNetworkCheckNow(id) {
  return apiPost(`/network/checks/${id}/run`);
}

export function getNetworkCheckMetrics(id, params = {}) {
  const query = new URLSearchParams();
  if (params.timeRange) query.append('time_range', params.timeRange);
  if (params.limit) query.append('limit', params.limit);
  const qs = query.toString();
  return apiGet(`/network/checks/${id}/metrics${qs ? `?${qs}` : ''}`);
}

export function getHostNetworkViews() {
  return apiGet('/network/hosts');
}
