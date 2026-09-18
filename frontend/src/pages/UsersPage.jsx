import React, { useEffect, useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Trash2,
  Edit2,
  CheckCircle,
  RefreshCw,
  XCircle,
  Search,
  Filter,
  Plus,
  Key,
  ShieldCheck,
  UserCheck,
  ChevronDown,
  X,
  Lock,
  Mail,
  Check,
  Server,
  Layers,
  Activity,
  Bell,
  FileText,
  TrendingUp,
  Bot,
  Settings,
  Terminal,
  Network,
  Cpu,
  Eye,
  Sliders,
  AlertCircle
} from 'lucide-react';
import { listUsers, deleteUser, toggleUserStatus, updateUserPermissions } from '../api/auth.js';
import { listServers } from '../api/server.js';
import { useDashboardStore } from '../store/dashboardStore.jsx';

// Available Platform Modules
const AVAILABLE_MODULES = [
  { id: 'overview', label: 'Overview Dashboard', icon: Activity, desc: 'Cluster-wide health, CPU/RAM summaries, quick alerts' },
  { id: 'terminal', label: 'Fleet Web Terminal', icon: Terminal, desc: 'Remote shell execution, SSH & automated diagnostic commands' },
  { id: 'sre', label: 'SRE & Auto-Remediation', icon: Cpu, desc: 'Automated disk cleanup, crash diagnostics & latency analysis' },
  { id: 'machines', label: 'Machines & Nodes', icon: Server, desc: 'Host telemetry, CPU, Memory, Disk, and Process lists' },
  { id: 'docker', label: 'Docker & Containers', icon: Layers, desc: 'Container lifecycle, restart, stop, logs & image repository' },
  { id: 'kubernetes', label: 'Kubernetes Workloads', icon: Network, desc: 'Cluster pods, deployments, services, daemonsets & events' },
  { id: 'metrics', label: 'Live Telemetry & Metrics', icon: Activity, desc: 'Real-time charting, IOPS, Network bandwidth & capacity trends' },
  { id: 'alerts', label: 'Alerting & Incidents', icon: Bell, desc: 'Rule triggers, anomaly detection & incident lifecycle' },
  { id: 'analytics', label: 'Analytics Suite', icon: TrendingUp, desc: 'Infrastructure forecasting, bottleneck discovery & resource stats' },
  { id: 'reports', label: 'Compliance Reports', icon: FileText, desc: 'Exportable SLA, uptime & infrastructure audit documents' },
  { id: 'agents', label: 'Agent Hub & Provisioning', icon: Bot, desc: 'Binary downloads, agent status & one-line install scripts' },
  { id: 'settings', label: 'Platform Settings', icon: Settings, desc: 'Global configurations, integrations & license keys' },
];

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Permission Modal State
  const [editingUser, setEditingUser] = useState(null);
  const [permRole, setPermRole] = useState('Operator');
  const [permMachineScope, setPermMachineScope] = useState('all'); // 'all' | 'custom'
  const [selectedMachineIds, setSelectedMachineIds] = useState(new Set());
  const [permModuleScope, setPermModuleScope] = useState('all'); // 'all' | 'custom'
  const [selectedModuleIds, setSelectedModuleIds] = useState(new Set());
  const [permIsActive, setPermIsActive] = useState(true);
  const [savingPerms, setSavingPerms] = useState(false);
  const [machineSearch, setMachineSearch] = useState('');

  // Invite Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState('Operator');

  const { addToast } = useDashboardStore();

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [usersData, serversData] = await Promise.all([
        listUsers(),
        listServers().catch(() => [])
      ]);
      if (Array.isArray(usersData)) setUsers(usersData);
      if (Array.isArray(serversData)) setServers(serversData);
    } catch (err) {
      setError(err.message || 'Failed to load IAM directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openPermissionModal = (u) => {
    setEditingUser(u);
    setPermRole(u.role || 'Operator');
    setPermIsActive(u.is_active !== false);

    // Parse Machine Scope
    const rawMachines = u.allowed_machines || 'all';
    if (rawMachines === 'all' || !rawMachines) {
      setPermMachineScope('all');
      setSelectedMachineIds(new Set());
    } else {
      setPermMachineScope('custom');
      try {
        const parsed = JSON.parse(rawMachines);
        setSelectedMachineIds(new Set(Array.isArray(parsed) ? parsed : []));
      } catch {
        setSelectedMachineIds(new Set(rawMachines.split(',').map(s => s.trim())));
      }
    }

    // Parse Module Scope
    const rawModules = u.allowed_modules || 'all';
    if (rawModules === 'all' || !rawModules) {
      setPermModuleScope('all');
      setSelectedModuleIds(new Set(AVAILABLE_MODULES.map(m => m.id)));
    } else {
      setPermModuleScope('custom');
      try {
        const parsed = JSON.parse(rawModules);
        setSelectedModuleIds(new Set(Array.isArray(parsed) ? parsed : []));
      } catch {
        setSelectedModuleIds(new Set(rawModules.split(',').map(s => s.trim())));
      }
    }

    setMachineSearch('');
  };

  const handleSavePermissions = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingPerms(true);

    const uId = editingUser.id || editingUser.ID || editingUser.user_id;

    const allowedMachinesPayload = permMachineScope === 'all' 
      ? 'all' 
      : JSON.stringify(Array.from(selectedMachineIds));

    const allowedModulesPayload = permModuleScope === 'all'
      ? 'all'
      : JSON.stringify(Array.from(selectedModuleIds));

    try {
      await updateUserPermissions(uId, {
        role: permRole,
        allowed_machines: allowedMachinesPayload,
        allowed_modules: allowedModulesPayload,
        is_active: permIsActive
      });

      addToast('success', 'Access Permissions Updated', `Permissions saved for ${editingUser.username || 'User'}.`);
      setEditingUser(null);
      fetchData();
    } catch (err) {
      addToast('critical', 'Update Failed', err.message || 'Failed to update user permissions.');
    } finally {
      setSavingPerms(false);
    }
  };

  const handleToggleStatus = async (userId) => {
    try {
      await toggleUserStatus(userId);
      addToast('success', 'User Status Updated', 'Account state modified successfully.');
      fetchData();
    } catch (err) {
      addToast('critical', 'Status Toggle Failed', err.message || 'Failed to toggle status.');
    }
  };

  const handleDelete = async (userId, username) => {
    if (!window.confirm(`Are you sure you want to revoke access and delete ${username}?`)) return;
    try {
      await deleteUser(userId);
      addToast('success', 'User Deleted', `User ${username} removed from organization.`);
      fetchData();
    } catch (err) {
      addToast('critical', 'Delete Failed', err.message || 'Failed to delete user.');
    }
  };

  const handleInvite = (e) => {
    e.preventDefault();
    const newUser = {
      id: `usr-${Date.now().toString(36)}`,
      username: inviteUsername || inviteEmail.split('@')[0],
      email: inviteEmail,
      role: inviteRole,
      created_at: new Date().toISOString(),
      is_active: true,
      allowed_machines: 'all',
      allowed_modules: 'all'
    };
    setUsers((prev) => [newUser, ...prev]);
    setShowInviteModal(false);
    setInviteEmail('');
    setInviteUsername('');
    addToast('success', 'Invitation Dispatched', `Invited ${inviteEmail} with role ${inviteRole}.`);
  };

  const toggleMachineSelect = (mId) => {
    setSelectedMachineIds(prev => {
      const next = new Set(prev);
      if (next.has(mId)) next.delete(mId);
      else next.add(mId);
      return next;
    });
  };

  const toggleModuleSelect = (modId) => {
    setSelectedModuleIds(prev => {
      const next = new Set(prev);
      if (next.has(modId)) next.delete(modId);
      else next.add(modId);
      return next;
    });
  };

  const selectAllMachines = () => {
    setSelectedMachineIds(new Set(servers.map(s => s.id || s.ID || s.uuid || s.name)));
  };

  const deselectAllMachines = () => {
    setSelectedMachineIds(new Set());
  };

  const selectAllModules = () => {
    setSelectedModuleIds(new Set(AVAILABLE_MODULES.map(m => m.id)));
  };

  const deselectAllModules = () => {
    setSelectedModuleIds(new Set(['overview'])); // keep at least overview
  };

  const filteredServersInModal = useMemo(() => {
    const q = machineSearch.toLowerCase().trim();
    if (!q) return servers;
    return servers.filter(s => {
      const name = String(s.name || s.hostname || '').toLowerCase();
      const ip = String(s.ip || s.ip_address || '').toLowerCase();
      const os = String(s.os || '').toLowerCase();
      return name.includes(q) || ip.includes(q) || os.includes(q);
    });
  }, [servers, machineSearch]);

  const totalMembers = users.length;
  const adminCount = users.filter((u) => String(u.role || '').toLowerCase().includes('admin')).length;
  const operatorCount = users.filter((u) => {
    const r = String(u.role || '').toLowerCase();
    return r.includes('operator') || r.includes('devops') || r.includes('sre');
  }).length;

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchQuery.toLowerCase().trim();
      const name = String(u.username || u.Username || '').toLowerCase();
      const email = String(u.email || u.Email || '').toLowerCase();
      const role = String(u.role || '').toLowerCase();

      const matchesSearch = !q || name.includes(q) || email.includes(q) || role.includes(q);
      const matchesRole =
        roleFilter === 'all' ||
        (roleFilter === 'admin' && role.includes('admin')) ||
        (roleFilter === 'operator' && (role.includes('operator') || role.includes('devops'))) ||
        (roleFilter === 'viewer' && role.includes('viewer'));

      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.slice(0, 2).toUpperCase();
  };

  const getMachineScopeSummary = (user) => {
    const raw = user.allowed_machines || 'all';
    if (raw === 'all' || !raw) return { label: 'All Machines (Global)', isAll: true };
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return { label: `${parsed.length} Machine${parsed.length === 1 ? '' : 's'} Assigned`, count: parsed.length, isAll: false };
      }
    } catch {
      const count = raw.split(',').filter(Boolean).length;
      return { label: `${count} Machine${count === 1 ? '' : 's'} Assigned`, count, isAll: false };
    }
    return { label: 'All Machines', isAll: true };
  };

  const getModuleScopeSummary = (user) => {
    const raw = user.allowed_modules || 'all';
    if (raw === 'all' || !raw) return { label: 'All Modules (Full Suite)', isAll: true };
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return { label: `${parsed.length} Module${parsed.length === 1 ? '' : 's'} Enabled`, count: parsed.length, isAll: false };
      }
    } catch {
      const count = raw.split(',').filter(Boolean).length;
      return { label: `${count} Module${count === 1 ? '' : 's'} Enabled`, count, isAll: false };
    }
    return { label: 'All Modules', isAll: true };
  };

  return (
    <div className="iam-users-page-root">
      {/* 1. Page Header */}
      <div className="iam-header-row">
        <div>
          <div className="title-row">
            <div className="icon-badge">
              <ShieldCheck size={22} color="#06b6d4" />
            </div>
            <h1>Identity &amp; Granular Access Management (IAM)</h1>
          </div>
          <p className="subtitle-text">
            Enterprise RBAC policies, machine-specific resource scoping, and module-level permission enforcement.
          </p>
        </div>

        <div className="header-actions">
          <button className="btn-secondary" onClick={fetchData} disabled={loading} type="button">
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
          <button className="btn-primary" onClick={() => setShowInviteModal(true)} type="button">
            <UserPlus size={15} />
            <span>Invite Team Member</span>
          </button>
        </div>
      </div>

      {/* 2. Top KPI Cards */}
      <div className="iam-kpi-grid">
        <div className="iam-kpi-card">
          <div className="kpi-icon blue">
            <Users size={18} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">TOTAL MEMBERS</span>
            <strong className="kpi-val">{totalMembers}</strong>
            <span className="kpi-sub">Enrolled Accounts</span>
          </div>
        </div>

        <div className="iam-kpi-card">
          <div className="kpi-icon purple">
            <ShieldCheck size={18} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">ADMINISTRATORS</span>
            <strong className="kpi-val">{adminCount}</strong>
            <span className="kpi-sub">Full Cluster Authority</span>
          </div>
        </div>

        <div className="iam-kpi-card">
          <div className="kpi-icon green">
            <UserCheck size={18} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">OPERATORS &amp; SREs</span>
            <strong className="kpi-val green-text">{operatorCount}</strong>
            <span className="kpi-sub">Scoped Machine Access</span>
          </div>
        </div>

        <div className="iam-kpi-card">
          <div className="kpi-icon cyan">
            <Server size={18} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">MANAGED NODES</span>
            <strong className="kpi-val">{servers.length}</strong>
            <span className="kpi-sub">Targetable Resources</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <XCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* 3. Controls & Filter Bar */}
      <div className="iam-controls-card">
        <div className="search-bar">
          <Search size={14} color="#64748b" />
          <input
            type="text"
            placeholder="Search directory by username, email, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="btn-clear" onClick={() => setSearchQuery('')} type="button">
              <X size={12} />
            </button>
          )}
        </div>

        <div className="filter-select-wrap">
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">All Roles</option>
            <option value="admin">Administrators</option>
            <option value="operator">Operators &amp; DevOps</option>
            <option value="viewer">Viewers</option>
          </select>
          <ChevronDown size={13} color="#94a3b8" />
        </div>
      </div>

      {/* 4. Users Data Table */}
      <div className="iam-table-card">
        <table className="iam-table">
          <thead>
            <tr>
              <th>USER IDENTITY</th>
              <th>ASSIGNED ROLE</th>
              <th>MACHINE SCOPE</th>
              <th>MODULE ACCESS</th>
              <th>ACCOUNT STATUS</th>
              <th>DATE JOINED</th>
              <th style={{ textAlign: 'right' }}>ACCESS CONTROL</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={7} className="table-empty">
                  <Users size={36} color="#334155" style={{ margin: '0 auto 10px auto', display: 'block' }} />
                  <strong>No matching team members found</strong>
                  <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '12px' }}>
                    Adjust your search query or invite a new member.
                  </p>
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => {
                const uId = u.id || u.ID || u.user_id;
                const username = u.username || u.Username || 'Unnamed';
                const roleLower = String(u.role || 'viewer').toLowerCase();
                const isAdmin = roleLower.includes('admin');
                const isOperator = roleLower.includes('operator') || roleLower.includes('devops') || roleLower.includes('sre');
                const isActive = u.is_active !== false;

                const machineScope = getMachineScopeSummary(u);
                const moduleScope = getModuleScopeSummary(u);

                return (
                  <tr key={uId} className="iam-row">
                    <td>
                      <div className="user-name-cell">
                        <div className={`user-avatar ${isAdmin ? 'admin' : isOperator ? 'operator' : 'viewer'}`}>
                          {getInitials(username)}
                        </div>
                        <div className="user-name-info">
                          <strong>{username}</strong>
                          <small>{u.email || u.Email || 'no-email@company.com'}</small>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className={`role-pill ${isAdmin ? 'admin' : isOperator ? 'operator' : 'viewer'}`}>
                        {u.role || 'Viewer'}
                      </span>
                    </td>

                    <td>
                      <span className={`scope-pill ${machineScope.isAll ? 'all' : 'restricted'}`}>
                        <Server size={11} />
                        {machineScope.label}
                      </span>
                    </td>

                    <td>
                      <span className={`scope-pill ${moduleScope.isAll ? 'all' : 'custom'}`}>
                        <Sliders size={11} />
                        {moduleScope.label}
                      </span>
                    </td>

                    <td>
                      <span className={`status-pill ${isActive ? 'active' : 'suspended'}`}>
                        <span className={`status-dot ${isActive ? 'online' : 'offline'}`} />
                        {isActive ? 'Active' : 'Suspended'}
                      </span>
                    </td>

                    <td>
                      <span className="joined-date">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                      </span>
                    </td>

                    <td>
                      <div className="row-actions-wrap">
                        <button
                          className="btn-edit-perms"
                          onClick={() => openPermissionModal(u)}
                          title="Configure Granular Permissions & Resource Scope"
                          type="button"
                        >
                          <ShieldCheck size={14} />
                          <span>Edit Permissions</span>
                        </button>
                        
                        <button
                          className="btn-toggle-status"
                          onClick={() => handleToggleStatus(uId)}
                          type="button"
                          title="Toggle Account Status"
                        >
                          {isActive ? 'Suspend' : 'Activate'}
                        </button>

                        <button
                          className="btn-del-user"
                          onClick={() => handleDelete(uId, username)}
                          title="Revoke Access & Delete User"
                          type="button"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 5. Interactive RBAC & Machine Scope Permissions Modal */}
      {editingUser && (
        <div className="modal-backdrop" onClick={() => setEditingUser(null)}>
          <div className="perms-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <div className="modal-icon-badge">
                  <ShieldCheck size={18} color="#38bdf8" />
                </div>
                <div>
                  <h3>Configure RBAC &amp; Resource Scope</h3>
                  <p className="modal-subtitle">
                    Targeting <strong>{editingUser.username}</strong> ({editingUser.email})
                  </p>
                </div>
              </div>
              <button className="btn-close" onClick={() => setEditingUser(null)} type="button">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSavePermissions} className="modal-body-scrollable">
              {/* Role Tier */}
              <div className="perm-section">
                <div className="section-header">
                  <Key size={14} color="#38bdf8" />
                  <h4>1. User Role Tier</h4>
                </div>
                <div className="role-options-grid">
                  {[
                    { id: 'Admin', title: 'Administrator', desc: 'Global root access, all machines, IAM configuration & settings' },
                    { id: 'Operator', title: 'Operator / SRE', desc: 'Machine management, remote terminal execution, logs & remediation' },
                    { id: 'DevOps', title: 'DevOps Engineer', desc: 'Deployments, Docker, Kubernetes & real-time telemetry' },
                    { id: 'Viewer', title: 'Viewer', desc: 'Read-only access to metrics, system reports and health audits' }
                  ].map((r) => (
                    <div
                      key={r.id}
                      className={`role-choice-card ${permRole === r.id ? 'selected' : ''}`}
                      onClick={() => setPermRole(r.id)}
                    >
                      <div className="radio-circle">
                        {permRole === r.id && <div className="radio-inner" />}
                      </div>
                      <div className="role-choice-text">
                        <strong>{r.title}</strong>
                        <span>{r.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Machine Scoping */}
              <div className="perm-section">
                <div className="section-header">
                  <Server size={14} color="#06b6d4" />
                  <h4>2. Machine &amp; Node Resource Scoping</h4>
                </div>
                <p className="section-subtext">
                  Choose whether this user can see all infrastructure servers or only explicitly assigned machines.
                </p>

                <div className="scope-radio-toggle">
                  <label className={`scope-radio-opt ${permMachineScope === 'all' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="machineScope"
                      checked={permMachineScope === 'all'}
                      onChange={() => setPermMachineScope('all')}
                    />
                    <span>All Current &amp; Future Infrastructure (Global Access)</span>
                  </label>
                  <label className={`scope-radio-opt ${permMachineScope === 'custom' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="machineScope"
                      checked={permMachineScope === 'custom'}
                      onChange={() => setPermMachineScope('custom')}
                    />
                    <span>Restricted to Specific Machines ({selectedMachineIds.size} selected)</span>
                  </label>
                </div>

                {permMachineScope === 'custom' && (
                  <div className="machine-picker-container">
                    <div className="machine-picker-toolbar">
                      <div className="picker-search">
                        <Search size={13} color="#64748b" />
                        <input
                          type="text"
                          placeholder="Filter available machines by name, IP, or OS..."
                          value={machineSearch}
                          onChange={(e) => setMachineSearch(e.target.value)}
                        />
                      </div>
                      <div className="picker-bulk-btns">
                        <button type="button" onClick={selectAllMachines}>Select All</button>
                        <button type="button" onClick={deselectAllMachines}>Deselect All</button>
                      </div>
                    </div>

                    <div className="machine-list-scroll">
                      {filteredServersInModal.length === 0 ? (
                        <div className="no-machines">No matching servers found</div>
                      ) : (
                        filteredServersInModal.map((s) => {
                          const mId = s.id || s.ID || s.uuid || s.name;
                          const isSelected = selectedMachineIds.has(mId);
                          const isOnline = s.status === 'online' || s.is_online === true;

                          return (
                            <div
                              key={mId}
                              className={`machine-picker-row ${isSelected ? 'selected' : ''}`}
                              onClick={() => toggleMachineSelect(mId)}
                            >
                              <div className={`checkbox-box ${isSelected ? 'checked' : ''}`}>
                                {isSelected && <Check size={12} color="#ffffff" />}
                              </div>
                              <div className="machine-row-info">
                                <div className="name-status">
                                  <span className={`status-dot-sm ${isOnline ? 'online' : 'offline'}`} />
                                  <strong className="m-name">{s.name || s.hostname || 'Unknown Host'}</strong>
                                  <span className="m-ip">{s.ip || s.ip_address || '127.0.0.1'}</span>
                                </div>
                                <span className="m-os">{s.os || 'Linux'} {s.version ? `(${s.version})` : ''}</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Module Scoping */}
              <div className="perm-section">
                <div className="section-header">
                  <Sliders size={14} color="#a855f7" />
                  <h4>3. Navigation Tabs &amp; Feature Modules</h4>
                </div>
                <p className="section-subtext">
                  Control which pages and toolbars appear in the sidebar navigation for this user account.
                </p>

                <div className="scope-radio-toggle">
                  <label className={`scope-radio-opt ${permModuleScope === 'all' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="moduleScope"
                      checked={permModuleScope === 'all'}
                      onChange={() => setPermModuleScope('all')}
                    />
                    <span>All Platform Modules (Full Feature Access)</span>
                  </label>
                  <label className={`scope-radio-opt ${permModuleScope === 'custom' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="moduleScope"
                      checked={permModuleScope === 'custom'}
                      onChange={() => setPermModuleScope('custom')}
                    />
                    <span>Custom Module Permissions ({selectedModuleIds.size} enabled)</span>
                  </label>
                </div>

                {permModuleScope === 'custom' && (
                  <div className="module-picker-container">
                    <div className="picker-bulk-btns" style={{ marginBottom: '8px' }}>
                      <button type="button" onClick={selectAllModules}>Enable All Modules</button>
                      <button type="button" onClick={deselectAllModules}>Minimal (Overview Only)</button>
                    </div>
                    <div className="modules-grid">
                      {AVAILABLE_MODULES.map((mod) => {
                        const isEnabled = selectedModuleIds.has(mod.id);
                        const ModIcon = mod.icon;

                        return (
                          <div
                            key={mod.id}
                            className={`module-toggle-card ${isEnabled ? 'enabled' : 'disabled'}`}
                            onClick={() => toggleModuleSelect(mod.id)}
                          >
                            <div className="mod-card-header">
                              <div className="mod-icon-wrap">
                                <ModIcon size={14} />
                              </div>
                              <span className="mod-title">{mod.label}</span>
                              <div className={`switch-toggle ${isEnabled ? 'on' : 'off'}`}>
                                <div className="switch-knob" />
                              </div>
                            </div>
                            <p className="mod-desc">{mod.desc}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Account Status Toggle */}
              <div className="perm-section">
                <div className="section-header">
                  <UserCheck size={14} color="#22c55e" />
                  <h4>4. Account Activation Status</h4>
                </div>
                <div className="account-status-toggle">
                  <label className="status-label">
                    <input
                      type="checkbox"
                      checked={permIsActive}
                      onChange={(e) => setPermIsActive(e.target.checked)}
                    />
                    <span>Account is Active &amp; Allowed to Authenticate</span>
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  className="btn-secondary"
                  onClick={() => setEditingUser(null)}
                  type="button"
                  disabled={savingPerms}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={savingPerms}>
                  {savingPerms ? (
                    <>
                      <RefreshCw size={14} className="spin" />
                      <span>Saving RBAC Policies...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={15} />
                      <span>Apply Permissions</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Invite User Modal */}
      {showInviteModal && (
        <div className="modal-backdrop" onClick={() => setShowInviteModal(false)}>
          <div className="invite-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <UserPlus size={18} color="#06b6d4" />
                <h3>Invite Team Member</h3>
              </div>
              <button className="btn-close" onClick={() => setShowInviteModal(false)} type="button">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleInvite} className="modal-body">
              <p className="modal-desc">
                An invitation will be provisioned with default enterprise RBAC permissions. You can customize resource and machine scoping after enrollment.
              </p>

              <div className="form-group">
                <label>TEAM MEMBER USERNAME</label>
                <input
                  type="text"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  placeholder="e.g. alex.morgan"
                  required
                />
              </div>

              <div className="form-group">
                <label>EMAIL ADDRESS</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="alex@company.com"
                  required
                />
              </div>

              <div className="form-group">
                <label>ASSIGNED INITIAL ROLE</label>
                <div className="select-wrap">
                  <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                    <option value="Admin">Administrator (Full Control)</option>
                    <option value="Operator">Operator (Telemetry &amp; Remediation)</option>
                    <option value="DevOps">DevOps Engineer</option>
                    <option value="Viewer">Viewer (Read-Only Audit)</option>
                  </select>
                  <ChevronDown size={13} color="#94a3b8" />
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn-secondary" onClick={() => setShowInviteModal(false)} type="button">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  <Check size={14} /> Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .iam-users-page-root {
          padding: 24px 32px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          color: var(--text, #f1f5f9);
        }
        .iam-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
        }
        .title-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .icon-badge {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: rgba(6, 182, 212, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(6, 182, 212, 0.3);
        }
        .title-row h1 {
          font-size: 22px;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
          letter-spacing: -0.01em;
        }
        .subtitle-text {
          font-size: 13px;
          color: #94a3b8;
          margin: 4px 0 0 0;
        }
        .header-actions {
          display: flex;
          gap: 10px;
        }
        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: linear-gradient(135deg, #0284c7, #2563eb);
          color: #ffffff;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
          transition: all 0.2s ease;
        }
        .btn-primary:hover:not(:disabled) {
          background: linear-gradient(135deg, #0369a1, #1d4ed8);
          transform: translateY(-1px);
        }
        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background-color: #0d1424;
          color: #cbd5e1;
          border: 1px solid #1c283d;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-secondary:hover:not(:disabled) {
          background-color: #162238;
          color: #ffffff;
          border-color: #2a3b56;
        }
        .iam-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
        }
        .iam-kpi-card {
          background-color: #0d1424;
          border: 1px solid #1a253a;
          border-radius: 12px;
          padding: 16px 18px;
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        }
        .kpi-icon {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .kpi-icon.blue { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
        .kpi-icon.purple { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
        .kpi-icon.green { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
        .kpi-icon.cyan { background: rgba(6, 182, 212, 0.15); color: #06b6d4; }
        .kpi-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .kpi-label {
          font-size: 10.5px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.5px;
        }
        .kpi-val {
          font-size: 19px;
          font-weight: 800;
          color: #ffffff;
        }
        .kpi-val.green-text { color: #22c55e; }
        .kpi-sub {
          font-size: 11px;
          color: #94a3b8;
        }
        .error-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid #ef4444;
          color: #ef4444;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 13px;
        }
        .iam-controls-card {
          background-color: #0d1424;
          border: 1px solid #1a253a;
          border-radius: 10px;
          padding: 10px 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .search-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          background-color: #080c14;
          border: 1px solid #1c283d;
          border-radius: 6px;
          padding: 6px 12px;
          flex: 1;
          max-width: 440px;
        }
        .search-bar input {
          background: transparent;
          border: none;
          color: #ffffff;
          font-size: 12.5px;
          outline: none;
          width: 100%;
        }
        .btn-clear {
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
        }
        .filter-select-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .filter-select-wrap select {
          appearance: none;
          background-color: #080c14;
          border: 1px solid #1c283d;
          border-radius: 6px;
          padding: 6px 28px 6px 12px;
          color: #cbd5e1;
          font-size: 12px;
          cursor: pointer;
          outline: none;
        }
        .filter-select-wrap select:focus {
          border-color: #3b82f6;
        }
        .filter-select-wrap svg {
          position: absolute;
          right: 8px;
          pointer-events: none;
        }
        .iam-table-card {
          background-color: #0d1424;
          border: 1px solid #1a253a;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        }
        .iam-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 12.5px;
        }
        .iam-table th {
          padding: 12px 16px;
          background-color: #080c14;
          border-bottom: 1px solid #1a253a;
          color: #64748b;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        .iam-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #141d2f;
          color: #cbd5e1;
        }
        .iam-row:hover {
          background-color: rgba(59, 130, 246, 0.04);
        }
        .user-name-cell {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .user-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11.5px;
          font-weight: 800;
        }
        .user-avatar.admin { background: rgba(59, 130, 246, 0.2); color: #38bdf8; border: 1px solid rgba(59, 130, 246, 0.4); }
        .user-avatar.operator { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.4); }
        .user-avatar.viewer { background: rgba(148, 163, 184, 0.2); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.3); }
        .user-name-info {
          display: flex;
          flex-direction: column;
        }
        .user-name-info strong {
          color: #ffffff;
          font-size: 13px;
        }
        .user-name-info small {
          color: #64748b;
          font-size: 11px;
        }
        .role-pill {
          font-size: 11px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 12px;
          display: inline-block;
        }
        .role-pill.admin { background: rgba(59, 130, 246, 0.15); color: #38bdf8; border: 1px solid rgba(59, 130, 246, 0.3); }
        .role-pill.operator { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
        .role-pill.viewer { background: rgba(148, 163, 184, 0.15); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.3); }
        
        .scope-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 6px;
        }
        .scope-pill.all { background: rgba(16, 185, 129, 0.12); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.25); }
        .scope-pill.restricted { background: rgba(245, 158, 11, 0.12); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.25); }
        .scope-pill.custom { background: rgba(168, 85, 247, 0.12); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.25); }

        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
        }
        .status-pill.active { color: #22c55e; }
        .status-pill.suspended { color: #ef4444; }
        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }
        .status-dot.online { background-color: #22c55e; box-shadow: 0 0 6px #22c55e; }
        .status-dot.offline { background-color: #ef4444; }

        .joined-date {
          font-size: 12px;
          color: #94a3b8;
        }
        .row-actions-wrap {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 8px;
        }
        .btn-edit-perms {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.3);
          color: #38bdf8;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-edit-perms:hover {
          background: rgba(56, 189, 248, 0.2);
          border-color: #38bdf8;
          transform: translateY(-1px);
        }
        .btn-toggle-status {
          background-color: #101726;
          border: 1px solid #1c283d;
          color: #cbd5e1;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11.5px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-toggle-status:hover {
          background-color: #1a253a;
          color: #ffffff;
          border-color: #3b82f6;
        }
        .btn-del-user {
          background: transparent;
          border: none;
          color: #64748b;
          padding: 4px;
          cursor: pointer;
          border-radius: 4px;
          display: flex;
        }
        .btn-del-user:hover {
          color: #ef4444;
          background-color: #1a253a;
        }
        .table-empty {
          text-align: center;
          padding: 48px 16px;
          color: #94a3b8;
        }

        /* Modal Styles */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(5px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .perms-modal {
          background-color: #0d1424;
          border: 1px solid #1f2e44;
          border-radius: 14px;
          width: 100%;
          max-width: 680px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0,0,0,0.85);
          overflow: hidden;
        }
        .modal-header {
          padding: 16px 20px;
          border-bottom: 1px solid #1a253a;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: #090d16;
        }
        .modal-title-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .modal-icon-badge {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: rgba(56, 189, 248, 0.15);
          border: 1px solid rgba(56, 189, 248, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .modal-title-row h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
          color: #ffffff;
        }
        .modal-subtitle {
          margin: 2px 0 0 0;
          font-size: 12px;
          color: #94a3b8;
        }
        .modal-subtitle strong {
          color: #38bdf8;
        }
        .btn-close {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
        }
        .btn-close:hover {
          color: #ffffff;
        }
        .modal-body-scrollable {
          padding: 20px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .perm-section {
          background: #080c14;
          border: 1px solid #162032;
          border-radius: 10px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .section-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .section-header h4 {
          margin: 0;
          font-size: 13.5px;
          font-weight: 700;
          color: #ffffff;
        }
        .section-subtext {
          margin: 0;
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.4;
        }
        .role-options-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        .role-choice-card {
          border: 1px solid #1a253a;
          border-radius: 8px;
          padding: 10px 12px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          cursor: pointer;
          background: #0b101c;
          transition: all 0.15s ease;
        }
        .role-choice-card:hover {
          border-color: #2a3b56;
          background: #0e1526;
        }
        .role-choice-card.selected {
          border-color: #38bdf8;
          background: rgba(56, 189, 248, 0.08);
        }
        .radio-circle {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 1.5px solid #475569;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 2px;
          flex-shrink: 0;
        }
        .role-choice-card.selected .radio-circle {
          border-color: #38bdf8;
        }
        .radio-inner {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #38bdf8;
        }
        .role-choice-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .role-choice-text strong {
          font-size: 12.5px;
          color: #f1f5f9;
        }
        .role-choice-text span {
          font-size: 11px;
          color: #94a3b8;
          line-height: 1.3;
        }

        .scope-radio-toggle {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .scope-radio-opt {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12.5px;
          color: #cbd5e1;
          cursor: pointer;
          padding: 8px 12px;
          border-radius: 6px;
          background: #0b101c;
          border: 1px solid #162032;
          transition: all 0.15s ease;
        }
        .scope-radio-opt.active {
          border-color: #38bdf8;
          color: #ffffff;
          background: rgba(56, 189, 248, 0.06);
        }
        .scope-radio-opt input {
          cursor: pointer;
        }

        .machine-picker-container, .module-picker-container {
          border: 1px solid #1a253a;
          border-radius: 8px;
          padding: 12px;
          background: #0b101c;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .machine-picker-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .picker-search {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #060911;
          border: 1px solid #1c283d;
          border-radius: 6px;
          padding: 5px 10px;
          flex: 1;
        }
        .picker-search input {
          background: transparent;
          border: none;
          color: #ffffff;
          font-size: 12px;
          outline: none;
          width: 100%;
        }
        .picker-bulk-btns {
          display: flex;
          gap: 6px;
        }
        .picker-bulk-btns button {
          background: #162032;
          border: 1px solid #22324e;
          color: #94a3b8;
          border-radius: 5px;
          padding: 4px 8px;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .picker-bulk-btns button:hover {
          color: #ffffff;
          background: #1d2c44;
          border-color: #38bdf8;
        }
        .machine-list-scroll {
          max-height: 200px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .machine-picker-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 6px;
          background: #080c14;
          border: 1px solid #162032;
          cursor: pointer;
          transition: all 0.12s ease;
        }
        .machine-picker-row:hover {
          background: #0f172a;
          border-color: #27374f;
        }
        .machine-picker-row.selected {
          border-color: #0284c7;
          background: rgba(2, 132, 199, 0.12);
        }
        .checkbox-box {
          width: 16px;
          height: 16px;
          border-radius: 4px;
          border: 1.5px solid #475569;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .checkbox-box.checked {
          background: #0284c7;
          border-color: #0284c7;
        }
        .machine-row-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex: 1;
        }
        .name-status {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .status-dot-sm {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }
        .status-dot-sm.online { background-color: #22c55e; }
        .status-dot-sm.offline { background-color: #64748b; }
        .m-name {
          font-size: 12.5px;
          color: #f1f5f9;
        }
        .m-ip {
          font-family: monospace;
          font-size: 11px;
          color: #94a3b8;
        }
        .m-os {
          font-size: 11px;
          color: #64748b;
        }
        .no-machines {
          text-align: center;
          padding: 16px;
          font-size: 12px;
          color: #64748b;
        }

        .modules-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          max-height: 240px;
          overflow-y: auto;
        }
        .module-toggle-card {
          border: 1px solid #1a253a;
          border-radius: 8px;
          padding: 8px 10px;
          background: #080c14;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 4px;
          transition: all 0.15s ease;
        }
        .module-toggle-card:hover {
          border-color: #2a3b56;
          background: #0c1220;
        }
        .module-toggle-card.enabled {
          border-color: #a855f7;
          background: rgba(168, 85, 247, 0.08);
        }
        .mod-card-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .mod-icon-wrap {
          color: #a855f7;
          display: flex;
        }
        .mod-title {
          font-size: 12px;
          font-weight: 700;
          color: #f1f5f9;
          flex: 1;
        }
        .switch-toggle {
          width: 28px;
          height: 16px;
          border-radius: 10px;
          background: #1e293b;
          position: relative;
          transition: all 0.2s ease;
        }
        .switch-toggle.on {
          background: #a855f7;
        }
        .switch-knob {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #ffffff;
          position: absolute;
          top: 2px;
          left: 2px;
          transition: all 0.2s ease;
        }
        .switch-toggle.on .switch-knob {
          left: 14px;
        }
        .mod-desc {
          margin: 0;
          font-size: 10.5px;
          color: #94a3b8;
          line-height: 1.3;
        }

        .account-status-toggle {
          display: flex;
          align-items: center;
        }
        .status-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12.5px;
          color: #f1f5f9;
          cursor: pointer;
        }
        .status-label input {
          cursor: pointer;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 8px;
          padding-top: 14px;
          border-top: 1px solid #1a253a;
        }

        .invite-modal {
          background-color: #0d1424;
          border: 1px solid #1f2e44;
          border-radius: 14px;
          width: 100%;
          max-width: 480px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.8);
          overflow: hidden;
        }
        .modal-body {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .modal-desc {
          font-size: 12.5px;
          color: #94a3b8;
          line-height: 1.4;
          margin: 0;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-group label {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.5px;
        }
        .form-group input, .select-wrap select {
          background-color: #080c14;
          border: 1px solid #1c283d;
          border-radius: 8px;
          padding: 9px 12px;
          color: #ffffff;
          font-size: 13px;
          outline: none;
        }
        .form-group input:focus, .select-wrap select:focus {
          border-color: #3b82f6;
        }
        .select-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .select-wrap select {
          width: 100%;
          appearance: none;
          padding-right: 28px;
          cursor: pointer;
        }
        .select-wrap svg {
          position: absolute;
          right: 10px;
          pointer-events: none;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
