import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Bell,
  User,
  LogOut,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  CheckCheck,
  Sparkles,
  Check,
  RotateCcw,
  Mail,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore.jsx';
import { useAlertStore } from '../../store/alertStore.jsx';

export default function Topbar({ userProfile }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAlertsMenu, setShowAlertsMenu] = useState(false);
  const [alertTab, setAlertTab] = useState('all'); // 'all' | 'critical' | 'warning'

  const pageMeta = useMemo(() => {
    const p = (location?.pathname || '/').toLowerCase();
    if (p.startsWith('/security')) return { title: 'Security Suite', subtitle: 'Host Security Audit & Compliance' };
    if (p.startsWith('/terminal')) return { title: 'Fleet Terminal', subtitle: 'Distributed Log & Remote Command Execution' };
    if (p.startsWith('/sre-disk')) return { title: 'SRE Disk Space', subtitle: 'Predictive Disk Management & Auto-Remediation' };
    if (p.startsWith('/sre-crash')) return { title: 'Crash & Service Health', subtitle: 'Daemon Watchdog & High-Availability Service Monitoring' };
    if (p.startsWith('/sre-latency') || p.startsWith('/latency') || p.startsWith('/network')) return { title: 'Latency & Gateway', subtitle: 'Network Health & SRE Diagnostic Probes' };
    if (p.startsWith('/docker')) return { title: 'Docker Containers', subtitle: 'Fleet Container Runtime & Container Metrics' };
    if (p.startsWith('/kubernetes') || p.startsWith('/k8s')) return { title: 'Kubernetes', subtitle: 'Pods, Namespaces & Cluster Orchestration' };
    if (p.startsWith('/live-metrics') || p.startsWith('/metrics')) return { title: 'Metrics', subtitle: 'Live System Telemetry & Performance Streams' };
    if (p.startsWith('/alerts')) return { title: 'Alerts', subtitle: 'Incident Management & Rule Triggers' };
    if (p.startsWith('/reports') || p.startsWith('/analytics')) return { title: 'Reports & Analytics', subtitle: 'Infrastructure Reliability & Uptime Reports' };
    if (p.startsWith('/agents')) return { title: 'Agents', subtitle: 'Connected Node Agents & Installation' };
    if (p.startsWith('/notifications')) return { title: 'Notifications & Email', subtitle: 'Email Delivery & Webhook Channels' };
    if (p.startsWith('/users') || p.startsWith('/user-management') || p.startsWith('/admin/users')) return { title: 'User Management', subtitle: 'Role-Based Access Control & User Directory' };
    if (p.startsWith('/settings')) return { title: 'System Settings', subtitle: 'Enterprise Dashboard & Alert Settings' };
    if (p.startsWith('/servers') || p.startsWith('/machines')) return { title: 'Node Telemetry', subtitle: 'Detailed Machine Health & System Metrics' };
    return { title: 'Overview', subtitle: 'Enterprise Infrastructure Dashboard' };
  }, [location?.pathname]);
  const [cleaningUp, setCleaningUp] = useState(false);

  const alertsRef = useRef(null);
  const {
    alerts,
    activeAlerts,
    activeCount,
    criticalCount,
    resolveAlert,
    acknowledgeAlert,
    resolveAllActive,
    cleanupDuplicates,
  } = useAlertStore();
  const { addToast } = useDashboardStore();

  // Close popovers on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (alertsRef.current && !alertsRef.current.contains(event.target)) {
        setShowAlertsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    addToast('info', 'Logged Out', 'You have been successfully logged out.');
    navigate('/login');
  };

  return (
    <header className="topbar">
      {/* Title & Subtitle */}
      <div className="topbar-left">
        <h1 className="page-title">{pageMeta.title}</h1>
        <span className="page-subtitle">{pageMeta.subtitle}</span>
      </div>

      {/* Right Controls */}
      <div className="topbar-right">
        {/* Live WebSocket Telemetry Beacon */}
        <div className="live-pill" title="Real-time WebSocket telemetry stream active">
          <span className="beacon-dot" />
          <span className="live-pill-text">WebSocket: Live</span>
        </div>

        {/* Notification Bell with Badge & Enterprise Flyout */}
        <div className="alerts-bell-container" ref={alertsRef}>
          <button
            className={`header-icon-btn ${showAlertsMenu ? 'active' : ''}`}
            onClick={() => setShowAlertsMenu(!showAlertsMenu)}
            title="View Active Alerts & Notifications"
            type="button"
          >
            <Bell size={17} color={criticalCount > 0 ? '#ef4444' : '#cbd5e1'} />
            {activeCount > 0 && (
              <span className={`bell-badge ${criticalCount > 0 ? 'critical-pulse' : ''}`}>
                {activeCount > 99 ? '99+' : activeCount}
              </span>
            )}
          </button>

          {showAlertsMenu && (
            <div className="alerts-flyout-dropdown">
              <div className="alerts-flyout-header">
                <div className="flyout-title-row">
                  <span className="flyout-title">Alerts & Notifications</span>
                  <span className="flyout-count-pill">{activeCount} Active</span>
                </div>
                <button
                  className="flyout-link-btn"
                  onClick={() => {
                    setShowAlertsMenu(false);
                    navigate('/alerts');
                  }}
                  type="button"
                >
                  View All <ExternalLink size={11} style={{ marginLeft: 4 }} />
                </button>
              </div>

              {/* Sub-header Filter Tabs & Quick Action Bar */}
              <div className="flyout-toolbar">
                <div className="flyout-tabs">
                  <button
                    className={`flyout-tab-btn ${alertTab === 'all' ? 'active' : ''}`}
                    onClick={() => setAlertTab('all')}
                    type="button"
                  >
                    All ({activeCount})
                  </button>
                  <button
                    className={`flyout-tab-btn crit ${alertTab === 'critical' ? 'active' : ''}`}
                    onClick={() => setAlertTab('critical')}
                    type="button"
                  >
                    P1 ({criticalCount})
                  </button>
                  <button
                    className={`flyout-tab-btn warn ${alertTab === 'warning' ? 'active' : ''}`}
                    onClick={() => setAlertTab('warning')}
                    type="button"
                  >
                    Warnings ({Math.max(0, activeCount - criticalCount)})
                  </button>
                </div>

                <div className="flyout-quick-actions">
                  {activeCount > 0 && (
                    <button
                      className="flyout-action-btn"
                      title="Resolve all active alerts"
                      type="button"
                      onClick={async () => {
                        try {
                          await resolveAllActive();
                          addToast('success', 'Resolved All', 'All active alerts marked as resolved.');
                        } catch {
                          addToast('error', 'Error', 'Failed to resolve all alerts.');
                        }
                      }}
                    >
                      <CheckCheck size={12} style={{ marginRight: 3 }} /> Resolve All
                    </button>
                  )}
                  <button
                    className="flyout-action-btn clean"
                    title="Clean up duplicate active alerts"
                    disabled={cleaningUp}
                    type="button"
                    onClick={async () => {
                      setCleaningUp(true);
                      try {
                        await cleanupDuplicates();
                        addToast('success', 'Deduplication', 'Duplicate alerts cleaned and synchronized.');
                      } catch {
                        addToast('error', 'Error', 'Failed to clean duplicates.');
                      } finally {
                        setCleaningUp(false);
                      }
                    }}
                  >
                    <Sparkles size={12} style={{ marginRight: 3 }} /> {cleaningUp ? 'Cleaning...' : 'Deduplicate'}
                  </button>
                </div>
              </div>

              {/* Alerts List */}
              <div className="alerts-flyout-list">
                {(() => {
                  const filtered = activeAlerts.filter((al) => {
                    const isCritical = (al.severity || '').toLowerCase() === 'critical' || al.priority === 'P1';
                    if (alertTab === 'critical') return isCritical;
                    if (alertTab === 'warning') return !isCritical;
                    return true;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="flyout-empty-state">
                        <ShieldCheck size={26} color="#22c55e" />
                        <span className="empty-title">All Systems Operational</span>
                        <span className="empty-sub">Zero unresolved alerts matching current filter</span>
                      </div>
                    );
                  }

                  return filtered.slice(0, 5).map((al) => {
                    const isCritical = (al.severity || '').toLowerCase() === 'critical' || al.priority === 'P1';
                    const priorityTag = al.priority || (isCritical ? 'P1' : 'P3');
                    const timeAgo = (() => {
                      const t = al.created_at || al.CreatedAt || al.updated_at;
                      if (!t) return 'Just now';
                      const diffSec = Math.floor((Date.now() - new Date(t).getTime()) / 1000);
                      if (diffSec < 10) return 'Just now';
                      if (diffSec < 60) return `${diffSec}s ago`;
                      const diffMin = Math.floor(diffSec / 60);
                      if (diffMin < 60) return `${diffMin}m ago`;
                      const diffHr = Math.floor(diffMin / 60);
                      if (diffHr < 24) return `${diffHr}h ago`;
                      return `${Math.floor(diffHr / 24)}d ago`;
                    })();

                    return (
                      <div key={al.id || al.ID} className={`flyout-alert-item ${isCritical ? 'crit' : 'warn'}`}>
                        <div className="flyout-alert-icon">
                          <AlertTriangle size={15} color={isCritical ? '#ef4444' : '#f59e0b'} />
                        </div>
                        <div className="flyout-alert-body">
                          <div className="flyout-alert-top">
                            <span className={`flyout-tag ${isCritical ? 'crit' : 'warn'}`}>
                              {priorityTag} {al.severity ? al.severity.toUpperCase() : 'ALERT'}
                            </span>
                            <span className="flyout-time">{timeAgo}</span>
                          </div>
                          <div className="flyout-alert-msg" title={al.message || al.title}>
                            {al.title || al.message}
                          </div>
                          <div className="flyout-alert-sub">
                            <span className="host-pill">{al.hostname || al.machine_name || 'Host'}</span>
                            {al.metric_value ? <span className="val-pill">{al.metric_value}%</span> : null}
                          </div>
                        </div>
                        <div className="flyout-alert-actions">
                          <button
                            className="flyout-btn-resolve"
                            title="Resolve Alert"
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await resolveAlert(al.id || al.ID);
                                addToast('success', 'Resolved', 'Alert marked as resolved');
                              } catch {}
                            }}
                          >
                            Resolve
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="alerts-flyout-footer">
                <button
                  className="flyout-center-btn"
                  type="button"
                  onClick={() => {
                    setShowAlertsMenu(false);
                    navigate('/alerts');
                  }}
                >
                  Open Alert Command Center
                </button>
              </div>
            </div>
          )}
        </div>


        {/* User Profile Info */}
        <div className="profile-container">
          <button className="profile-btn" onClick={() => setShowDropdown(!showDropdown)} type="button">
            <div className="avatar-img">
              <User size={16} color="#ffffff" />
            </div>
            <div className="profile-info">
              <span className="profile-name">{userProfile?.username || 'User'}</span>
              <span className="profile-role">{userProfile?.role || localStorage.getItem('user_role') || 'Viewer'}</span>
            </div>
          </button>

          {showDropdown && (
            <div className="profile-menu">
              <button
                className="menu-item"
                onClick={() => {
                  setShowDropdown(false);
                  navigate('/notifications');
                }}
                type="button"
              >
                <Mail size={14} style={{ marginRight: 8 }} />
                Notifications & Email
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  setShowDropdown(false);
                  navigate('/settings');
                }}
                type="button"
              >
                <SettingsIcon size={14} style={{ marginRight: 8 }} />
                System Settings
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  setShowDropdown(false);
                  navigate('/admin/users');
                }}
                type="button"
              >
                <User size={14} style={{ marginRight: 8 }} />
                User Management (RBAC)
              </button>
              <div className="menu-divider" />
              <button className="menu-item logout" onClick={handleLogout} type="button">
                <LogOut size={14} style={{ marginRight: 8 }} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .topbar {
          height: 60px;
          background: rgba(8, 12, 20, 0.82);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          gap: 16px;
          z-index: 90;
          user-select: none;
        }
        .topbar-left {
          display: flex;
          flex-direction: column;
        }
        .page-title {
          font-size: 16.5px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0;
          line-height: 1.2;
          letter-spacing: -0.015em;
        }
        .page-subtitle {
          font-size: 11px;
          color: #64748b;
          font-weight: 500;
        }

        .topbar-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .live-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(16, 185, 129, 0.10);
          border: 1px solid rgba(16, 185, 129, 0.28);
          color: #10b981;
          padding: 5px 11px;
          border-radius: 20px;
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: 0.02em;
          box-shadow: 0 0 12px rgba(16, 185, 129, 0.12);
        }
        .live-pill-text {
          color: #34d399;
          font-size: 11px;
        }


        .alerts-bell-container {
          position: relative;
        }
        .header-icon-btn {
          position: relative;
          width: 32px;
          height: 32px;
          background-color: #121824;
          border: 1px solid #161e2e;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .header-icon-btn:hover,
        .header-icon-btn.active {
          background-color: #1a2333;
          border-color: #3b82f6;
        }
        .bell-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          background-color: #ef4444;
          color: #ffffff;
          font-size: 9.5px;
          font-weight: 800;
          border-radius: 10px;
          padding: 1px 5px;
          line-height: 1.2;
          box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
        }
        .bell-badge.critical-pulse {
          animation: badgePulse 2s infinite ease-in-out;
        }
        @keyframes badgePulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 8px rgba(239, 68, 68, 0.6); }
          50% { transform: scale(1.1); box-shadow: 0 0 14px rgba(239, 68, 68, 1); }
        }

        .alerts-flyout-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          width: 420px;
          background: #090e1a;
          border: 1px solid #1e293b;
          border-radius: 12px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.06);
          z-index: 120;
          overflow: hidden;
          animation: flyoutSlide 0.15s ease-out;
        }
        @keyframes flyoutSlide {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .alerts-flyout-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: #0f172a;
          border-bottom: 1px solid #1e293b;
        }
        .flyout-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .flyout-title {
          font-size: 13px;
          font-weight: 700;
          color: #f1f5f9;
        }
        .flyout-count-pill {
          background: #ef4444;
          color: #ffffff;
          font-size: 10px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 10px;
          letter-spacing: 0.3px;
        }
        .flyout-link-btn {
          background: transparent;
          border: none;
          color: #38bdf8;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        .flyout-link-btn:hover {
          color: #60a5fa;
          text-decoration: underline;
        }

        /* Sub-header Filter Toolbar */
        .flyout-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: #0c1322;
          border-bottom: 1px solid #162032;
          gap: 8px;
        }
        .flyout-tabs {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .flyout-tab-btn {
          background: transparent;
          border: 1px solid transparent;
          color: #94a3b8;
          font-size: 11px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .flyout-tab-btn:hover {
          background: #162032;
          color: #cbd5e1;
        }
        .flyout-tab-btn.active {
          background: #1e293b;
          border-color: #334155;
          color: #ffffff;
        }
        .flyout-tab-btn.crit.active {
          background: rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.4);
          color: #ef4444;
        }
        .flyout-tab-btn.warn.active {
          background: rgba(245, 158, 11, 0.15);
          border-color: rgba(245, 158, 11, 0.4);
          color: #f59e0b;
        }
        .flyout-quick-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .flyout-action-btn {
          background: #162032;
          border: 1px solid #1f2e44;
          color: #cbd5e1;
          font-size: 10.5px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 5px;
          cursor: pointer;
          display: flex;
          align-items: center;
          transition: all 0.15s ease;
        }
        .flyout-action-btn:hover:not(:disabled) {
          background: #2563eb;
          border-color: #2563eb;
          color: #ffffff;
        }
        .flyout-action-btn.clean:hover:not(:disabled) {
          background: #0ea5e9;
          border-color: #0ea5e9;
          color: #ffffff;
        }
        .flyout-action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Alerts List */
        .alerts-flyout-list {
          max-height: 310px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }
        .flyout-alert-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 14px;
          border-bottom: 1px solid #141c2c;
          transition: background 0.15s ease;
        }
        .flyout-alert-item:hover {
          background: #111a2c;
        }
        .flyout-alert-item.crit {
          border-left: 3px solid #ef4444;
        }
        .flyout-alert-item.warn {
          border-left: 3px solid #f59e0b;
        }
        .flyout-alert-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 2px;
          flex-shrink: 0;
        }
        .flyout-alert-body {
          flex: 1;
          min-width: 0;
        }
        .flyout-alert-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 3px;
        }
        .flyout-tag {
          font-size: 9.5px;
          font-weight: 800;
          padding: 1px 6px;
          border-radius: 4px;
          letter-spacing: 0.4px;
        }
        .flyout-tag.crit {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.35);
        }
        .flyout-tag.warn {
          background: rgba(245, 158, 11, 0.2);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.35);
        }
        .flyout-time {
          font-size: 10px;
          color: #64748b;
        }
        .flyout-alert-msg {
          font-size: 12px;
          font-weight: 600;
          color: #f8fafc;
          line-height: 1.35;
          margin-bottom: 4px;
        }
        .flyout-alert-sub {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .host-pill {
          font-size: 10px;
          color: #94a3b8;
          background: #162032;
          padding: 1px 6px;
          border-radius: 4px;
          font-family: monospace;
        }
        .val-pill {
          font-size: 10px;
          font-weight: 700;
          color: #f43f5e;
          background: rgba(244, 63, 94, 0.12);
          padding: 1px 6px;
          border-radius: 4px;
        }
        .flyout-alert-actions {
          margin-top: 2px;
          flex-shrink: 0;
        }
        .flyout-btn-resolve {
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: #4ade80;
          font-size: 10.5px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .flyout-btn-resolve:hover {
          background: #22c55e;
          border-color: #22c55e;
          color: #0f172a;
        }

        .flyout-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 32px 16px;
          color: #94a3b8;
          text-align: center;
        }
        .empty-title {
          font-size: 13px;
          font-weight: 700;
          color: #f1f5f9;
          margin-top: 4px;
        }
        .empty-sub {
          font-size: 11px;
          color: #64748b;
        }

        .alerts-flyout-footer {
          padding: 8px 12px;
          background: #090e1a;
          border-top: 1px solid #1e293b;
        }
        .flyout-center-btn {
          width: 100%;
          background: #1e293b;
          border: 1px solid #334155;
          color: #e2e8f0;
          font-size: 11.5px;
          font-weight: 600;
          padding: 7px 12px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s;
          text-align: center;
        }
        .flyout-center-btn:hover {
          background: #2563eb;
          border-color: #2563eb;
          color: #ffffff;
        }
        .profile-container {
          position: relative;
        }
        .profile-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: none;
          cursor: pointer;
        }
        .avatar-img {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: linear-gradient(135deg, #2563eb, #38bdf8);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .profile-info {
          display: flex;
          flex-direction: column;
          text-align: left;
          line-height: 1.15;
        }
        .profile-name {
          font-size: 12.5px;
          font-weight: 700;
          color: #ffffff;
        }
        .profile-role {
          font-size: 10px;
          color: #64748b;
        }
        .profile-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          width: 180px;
          background-color: #121824;
          border: 1px solid #161e2e;
          border-radius: 8px;
          padding: 6px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
          z-index: 110;
        }
        .menu-item {
          display: flex;
          align-items: center;
          width: 100%;
          padding: 8px 12px;
          background: transparent;
          border: none;
          color: #cbd5e1;
          font-size: 12px;
          border-radius: 6px;
          cursor: pointer;
        }
        .menu-item:hover {
          background-color: #1a2333;
          color: #ffffff;
        }
        .menu-item.logout {
          color: #ef4444;
        }
        .menu-divider {
          height: 1px;
          background-color: #161e2e;
          margin: 4px 0;
        }
      `}</style>
    </header>
  );
}
