import { apiGet, apiPost } from './client.js';

/**
 * Test SSH connectivity and credential authentication to a remote target machine
 * @param {Object} target - { host, port, username, auth_type, password, ssh_key, sudo_password }
 */
export function testRemoteSSHConnection(target) {
  return apiPost('/agent/remote-deploy/test', target);
}

/**
 * Execute 1-click credential-based remote agent deployment
 * @param {Object} deployConfig - { host, port, username, auth_type, password, ssh_key, sudo_password, server_url, enroll_token, target_os }
 */
export function executeRemoteAgentDeploy(deployConfig) {
  return apiPost('/agent/remote-deploy/execute', deployConfig);
}

/**
 * Retrieve previous remote deployment executions history
 */
export function getRemoteDeployHistory() {
  return apiGet('/agent/remote-deploy/history');
}

/**
 * Get detailed logs for a specific remote deployment ID
 * @param {string} deployId
 */
export function getRemoteDeployStatus(deployId) {
  return apiGet(`/agent/remote-deploy/${deployId}`);
}

/**
 * Execute remote SSH agent uninstallation and decommissioning
 * @param {string} serverId
 * @param {Object} uninstallConfig - { host, port, username, auth_type, password, ssh_key, sudo_password, force_db_only }
 */
export function executeRemoteAgentUninstall(serverId, uninstallConfig) {
  return apiPost(`/servers/${serverId}/remote-uninstall`, uninstallConfig);
}
