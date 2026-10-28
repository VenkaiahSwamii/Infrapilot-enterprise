import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2, Users as UsersIcon, Palette, Gauge, CreditCard, Lock, Plus, ShieldCheck, ShieldAlert
} from 'lucide-react';
import {
  getOrganizations, createOrganization, getOrganizationSettings,
  updateOrganizationSettings, getOrganizationQuotas, updateOrganizationQuotas,
  getOrganizationBilling, getOrganizationUsers, createInvitation
} from '../../api/organization.js';
import { apiGet } from '../../api/client.js';

import OrganizationDashboard from './OrganizationDashboard.jsx';
import Users from './Users.jsx';
import Roles from './Roles.jsx';
import Settings from './Settings.jsx';
import Quotas from './Quotas.jsx';
import AuditLogs from './AuditLogs.jsx';
import OrganizationSwitcher from '../../components/layout/OrganizationSwitcher.jsx';

export default function OrganizationManagement() {
  const [activeTab, setActiveTab] = useState('overview');
  const [organizations, setOrganizations] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [users, setUsers] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [settings, setSettings] = useState(null);
  const [quotas, setQuotas] = useState(null);
  const [quotaReport, setQuotaReport] = useState(null);
  const [billing, setBilling] = useState(null);
  const [auditLogs, setAuditLogs] = useState(null);

  const [message, setMessage] = useState(null);
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [newOrgForm, setNewOrgForm] = useState({ name: '', slug: '' });

  const loadInitialData = useCallback(async () => {
    try {
      const orgsRes = await getOrganizations();
      const orgList = orgsRes.organizations || [];
      setOrganizations(orgList);

      const activeId = localStorage.getItem('activeOrgId') || orgList[0]?.id || 'default';
      const activeOrg = orgList.find(o => o.id === activeId) || { id: activeId, name: 'Default Organization', slug: 'default' };
      setCurrentOrg(activeOrg);

      if (activeOrg.id && activeOrg.id !== 'default') {
        loadOrgDetails(activeOrg.id);
      }
    } catch (err) {
      console.error('Failed to load multi-tenant data', err);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const loadOrgDetails = async (orgId) => {
    try {
      const [dashRes, settRes, quotaRes, billRes, userRes, auditRes] = await Promise.allSettled([
        apiGet(`/organizations/${orgId}/dashboard`),
        getOrganizationSettings(orgId),
        apiGet(`/organizations/${orgId}/quota`),
        getOrganizationBilling(orgId),
        getOrganizationUsers(orgId),
        apiGet(`/organizations/${orgId}/audit-logs`),
      ]);

      if (dashRes.status === 'fulfilled') setMetrics(dashRes.value);
      if (settRes.status === 'fulfilled') setSettings(settRes.value);
      if (quotaRes.status === 'fulfilled') setQuotaReport(quotaRes.value);
      if (billRes.status === 'fulfilled') setBilling(billRes.value);
      if (userRes.status === 'fulfilled') setUsers(userRes.value?.members || []);
      if (auditRes.status === 'fulfilled') setAuditLogs(auditRes.value);
    } catch (err) {
      console.error('Failed loading tenant details', err);
    }
  };

  const handleOrgSwitch = (org) => {
    setCurrentOrg(org);
    localStorage.setItem('activeOrgId', org.id);
    if (org.id && org.id !== 'default') {
      loadOrgDetails(org.id);
    }
  };

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    try {
      const res = await createOrganization(newOrgForm);
      setMessage({ type: 'success', text: `Organization '${res.name}' created successfully!` });
      setShowCreateOrgModal(false);
      setNewOrgForm({ name: '', slug: '' });
      loadInitialData();
    } catch (err) {
      setMessage({ type: 'error', text: `Failed to create organization: ${err.message}` });
    }
  };

  const handleInviteUser = async (email, role) => {
    if (!currentOrg?.id) return;
    try {
      await createInvitation(currentOrg.id, { email, role });
      setMessage({ type: 'success', text: `Invitation sent to ${email}` });
      loadOrgDetails(currentOrg.id);
    } catch (err) {
      setMessage({ type: 'error', text: `Invitation failed: ${err.message}` });
    }
  };

  const handleSaveSettings = async (formData) => {
    if (!currentOrg?.id) return;
    try {
      await updateOrganizationSettings(currentOrg.id, formData);
      setMessage({ type: 'success', text: 'Organization settings updated successfully!' });
      loadOrgDetails(currentOrg.id);
    } catch (err) {
      setMessage({ type: 'error', text: `Failed updating settings: ${err.message}` });
    }
  };

  const tabs = [
    { id: 'overview', label: 'Organization Overview', icon: Building2 },
    { id: 'users', label: 'Users & Team', icon: UsersIcon },
    { id: 'roles', label: 'Role Permissions', icon: ShieldCheck },
    { id: 'quotas', label: 'Resource Quotas', icon: Gauge },
    { id: 'audit', label: 'Tenant Audit Logs', icon: ShieldAlert },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0d1117', color: '#c9d1d9', padding: '24px 32px' }}>
      {/* Top Bar Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Building2 size={32} color="#58a6ff" />
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f0f6fc', margin: 0 }}>
              Enterprise Multi-Tenant Control Plane
            </h1>
            <span style={{ fontSize: '13px', color: '#8b949e' }}>
              Multi-Organization Isolation, RBAC Scoping & Resource Quotas
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <OrganizationSwitcher
            organizations={organizations}
            currentOrg={currentOrg}
            onSelectOrg={handleOrgSwitch}
          />
          <button
            onClick={() => setShowCreateOrgModal(true)}
            style={{
              backgroundColor: '#238636',
              color: '#ffffff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Plus size={16} />
            New Tenant
          </button>
        </div>
      </div>

      {message && (
        <div style={{
          backgroundColor: message.type === 'success' ? '#1f6feb22' : '#f7816622',
          border: `1px solid ${message.type === 'success' ? '#1f6feb' : '#f78166'}`,
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '20px',
          color: message.type === 'success' ? '#58a6ff' : '#f78166',
          fontSize: '14px'
        }}>
          {message.text}
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #30363d', marginBottom: '24px' }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid #58a6ff' : '2px solid transparent',
                color: isActive ? '#58a6ff' : '#8b949e',
                padding: '10px 16px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      {activeTab === 'overview' && <OrganizationDashboard org={currentOrg} metrics={metrics} />}
      {activeTab === 'users' && <Users users={users} onInvite={handleInviteUser} />}
      {activeTab === 'roles' && <Roles />}
      {activeTab === 'settings' && <Settings settings={settings} onSave={handleSaveSettings} />}
      {activeTab === 'quotas' && <Quotas quotas={quotas} quotaReport={quotaReport} />}
      {activeTab === 'audit' && <AuditLogs auditLogs={auditLogs} />}

      {/* Create Organization Modal */}
      {showCreateOrgModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', width: '420px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#f0f6fc' }}>Create New Tenant Organization</h3>
            <form onSubmit={handleCreateOrg} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '13px', color: '#8b949e', display: 'block', marginBottom: '6px' }}>Organization Name</label>
                <input
                  type="text"
                  required
                  value={newOrgForm.name}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, name: e.target.value })}
                  placeholder="Acme Technologies"
                  style={{ width: '100%', padding: '8px 12px', background: '#0d1117', border: '1px solid #30363d', color: '#fff', borderRadius: '6px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#8b949e', display: 'block', marginBottom: '6px' }}>Tenant Slug (URL Identifer)</label>
                <input
                  type="text"
                  value={newOrgForm.slug}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, slug: e.target.value })}
                  placeholder="acme-tech"
                  style={{ width: '100%', padding: '8px 12px', background: '#0d1117', border: '1px solid #30363d', color: '#fff', borderRadius: '6px' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowCreateOrgModal(false)} style={{ background: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ background: '#238636', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Create Organization</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
