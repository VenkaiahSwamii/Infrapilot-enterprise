import { apiGet, apiPost } from './client.js';

export function listMachines() {
  return apiGet('/machines').then((payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.machines)) return payload.machines;
    throw new TypeError('Machines API returned an unsupported response shape');
  });
}

export function getMachineMetrics(machineId, range = '1h') {
  return apiGet(`/machines/${machineId}/metrics?range=${range}`).then((payload) => {
    const samples = Array.isArray(payload) ? payload : payload?.metrics;
    if (!Array.isArray(samples)) throw new TypeError('Metrics API returned an unsupported response shape');
    return { samples, latest: samples.length > 0 ? samples[samples.length - 1] : null };
  });
}
export function getMachine(id) {
  return apiGet(`/machines/${id}`);
}

export function getMachineProcesses(id) {
  return apiGet(`/linux/servers/${id}/processes`);
}

export function getMachineServices(id) {
  return apiGet(`/services/${id}`);
}

export function getMachineDocker(id) {
  return apiGet(`/docker/containers/${id}`);
}

export function getMachineKubernetes(id) {
  return apiGet(`/kubernetes/overview/${id}`);
}

export function getMachineLogs(id) {
  return apiGet(`/machines/${id}/logs`);
}

export function getMachineStorage(id) {
  return apiGet(`/linux/servers/${id}/storage`);
}

export function getMachineSoftware(id) {
  return apiGet(`/machines/${id}/software`).catch(() => apiGet(`/software/${id}`));
}

export function updateSoftwarePackage(machineId, pkg) {
  return apiPost('/software/update', { machine_id: machineId, package: pkg });
}

export function installSoftwarePackage(machineId, pkg) {
  return apiPost('/software/install', { machine_id: machineId, package: pkg });
}

export function removeSoftwarePackage(machineId, pkg) {
  return apiPost('/software/remove', { machine_id: machineId, package: pkg });
}

export function patchAllSoftwarePackages(machineId) {
  return apiPost('/software/patch-all', { machine_id: machineId });
}

export function getMachineHistory(id, range = '1h') {
  return apiGet(`/machines/${id}/history?range=${range}`);
}

export function getMachineServicesScoped(id) {
  return apiGet(`/services/${id}`).catch(() => apiGet(`/machines/${id}/services`));
}

export function restartMachineService(id, serviceName) {
  return apiPost('/services/restart', { machine_id: id, service: serviceName })
    .catch(() => apiPost(`/machines/${id}/services/restart`, { service: serviceName }));
}

export function getMachineServiceLogs(id, serviceName) {
  return apiGet(`/services/logs?machine_id=${encodeURIComponent(id)}&service=${encodeURIComponent(serviceName)}`);
}

export function getMachineRemediationActions(id) {
  return apiGet(`/machines/${id}/actions`)
    .catch(() => apiGet(`/remediation/jobs?machine_id=${encodeURIComponent(id)}`))
    .catch(() => []);
}

