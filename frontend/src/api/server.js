import { apiGet, apiPost } from './client.js';

export function listServers() {
  return apiGet('/servers').then((payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.servers)) return payload.servers;
    throw new TypeError('Servers API returned an unsupported response shape');
  });
}

export function getServerMetrics(serverId, range = '1h') {
  return apiGet(`/servers/${serverId}/metrics?range=${range}`).then((payload) => {
    const samples = Array.isArray(payload) ? payload : payload?.metrics;
    if (!Array.isArray(samples)) throw new TypeError('Metrics API returned an unsupported response shape');
    return { samples, latest: samples.length > 0 ? samples[samples.length - 1] : null };
  });
}

export function getServer(id) {
  return apiGet(`/servers/${id}`);
}

export function getServerProcesses(id) {
  return apiGet(`/linux/servers/${id}/processes`);
}

export function getServerServices(id) {
  return apiGet(`/linux/servers/${id}/services`);
}

export function getServerDocker(id) {
  return apiGet(`/docker/overview/${id}`);
}

export function getServerKubernetes(id) {
  return apiGet(`/linux/servers/${id}/kubernetes`);
}

export function getServerLogs(id) {
  return apiGet(`/linux/servers/${id}/logs`);
}

export function getServerStorage(id) {
  return apiGet(`/linux/servers/${id}/storage`);
}

export function getServerSoftware(id) {
  return apiGet(`/software/${id}`);
}

export function getServerHistory(id, range = '1h') {
  return apiGet(`/servers/${id}/history?range=${range}`);
}

export async function rotateServerKey(id) {
  return apiPost(`/servers/${id}/key-rotation`);
}

export async function purgeOfflineServers() {
  return apiPost('/servers/purge-offline');
}
