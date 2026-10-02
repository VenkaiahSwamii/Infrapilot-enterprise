import { apiGet, apiPost, apiPut, apiDelete } from './client.js';

export function getOverviewStats() {
  return apiGet('/synthetic/stats');
}

export function getAllTests() {
  return apiGet('/synthetic/tests');
}

export function createSyntheticTest(data) {
  return apiPost('/synthetic/tests', data);
}

export function getSyntheticTestByID(id) {
  return apiGet(`/synthetic/tests/${id}`);
}

export function updateSyntheticTest(id, data) {
  return apiPut(`/synthetic/tests/${id}`, data);
}

export function deleteSyntheticTest(id) {
  return apiDelete(`/synthetic/tests/${id}`);
}

export function runSyntheticTestNow(id) {
  return apiPost(`/synthetic/tests/${id}/run`);
}

export function getSyntheticTestResults(id, params = {}) {
  const query = new URLSearchParams();
  if (params.timeRange) query.append('time_range', params.timeRange);
  if (params.limit) query.append('limit', params.limit);
  const qs = query.toString();
  return apiGet(`/synthetic/tests/${id}/results${qs ? `?${qs}` : ''}`);
}
