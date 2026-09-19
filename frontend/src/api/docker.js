import { apiGet, apiPost } from './client.js';

export function getDockerOverview(serverId) {
  return apiGet(`/docker/overview/${serverId}`);
}

export function getDockerContainers(serverId) {
  return apiGet(`/docker/containers/${serverId}`);
}

export function getDockerImages(serverId) {
  return apiGet(`/docker/images/${serverId}`);
}

export function getDockerNetworks(serverId) {
  return apiGet(`/docker/networks/${serverId}`);
}

export function getDockerVolumes(serverId) {
  return apiGet(`/docker/volumes/${serverId}`);
}

export function getDockerEvents(serverId) {
  return apiGet(`/docker/events/${serverId}`);
}

export function getContainerLogs(containerId) {
  return apiGet(`/docker/logs/${containerId}`);
}

export function startContainer(machineId, container) {
  return apiPost('/docker/container/start', { machine_id: machineId, container });
}

export function stopContainer(machineId, container) {
  return apiPost('/docker/container/stop', { machine_id: machineId, container });
}

export function restartContainer(machineId, container) {
  return apiPost('/docker/container/restart', { machine_id: machineId, container });
}

export function removeContainer(machineId, container) {
  return apiPost('/docker/container/remove', { machine_id: machineId, container });
}

export function runContainer(data) {
  return apiPost('/docker/container/run', data);
}

export function pullImage(machineId, image) {
  return apiPost('/docker/image/pull', { machine_id: machineId, image });
}

export function removeImage(machineId, image, force = false) {
  return apiPost('/docker/image/remove', { machine_id: machineId, image, force });
}
