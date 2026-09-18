import { apiGet, apiPost, apiDelete, apiPatch } from './client.js';

export function getProfile() {
  return apiGet('/profile');
}

export function listUsers() {
  return apiGet('/admin/users').catch(() => []);
}

export function deleteUser(id) {
  return apiDelete(`/admin/users/${id}`);
}

export function updateUserRole(id, role) {
  return apiPatch(`/admin/users/${id}/role`, { role });
}

export function updateUserPermissions(id, permissions) {
  return apiPatch(`/admin/users/${id}/permissions`, permissions);
}

export function toggleUserStatus(id) {
  return apiPatch(`/admin/users/${id}/status`, {});
}

export function listOrganizationUsers(orgId = 'default') {
  return apiGet(`/organizations/${orgId}/users`).catch(() => []);
}

export function inviteUser(email, role, orgId = 'default') {
  return apiPost(`/organizations/${orgId}/invitations`, { email, role });
}
