import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Server,
  Activity,
  Bell,
  FileText,
  TrendingUp,
  Layers,
  Bot,
  Settings,
  Shield,
  ShieldCheck,
  Database,
  Radio,
  HardDrive,
  Zap,
  Terminal,
} from 'lucide-react';

import { useAlertStore } from '../../store/alertStore.jsx';

export default function Sidebar({ collapsed }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeCount, criticalCount } = useAlertStore();

  const navItems = [
    { label: 'Overview', icon: Home, path: '/' },
    { label: 'Fleet Terminal', icon: Terminal, path: '/terminal', badge: 'CLI' },
    { label: 'SRE Disk Space', icon: HardDrive, path: '/sre-disk', badge: 'DISK' },
    { label: 'Crash & Service Health', icon: Zap, path: '/sre-crash', badge: 'SRE' },
    { label: 'Latency & Gateway', icon: Radio, path: '/sre-latency', badge: 'SLO' },
    { label: 'Machines', icon: Server, path: '/infrastructure' },
    { label: 'Metrics', icon: Activity, path: '/live-metrics' },
    {
      label: 'Alerts',
      icon: Bell,
      path: '/alerts',
      badge: activeCount > 0 ? (activeCount > 99 ? '99+' : activeCount) : null,
    },
    { label: 'Analytics', icon: TrendingUp, path: '/analytics' },
    { label: 'Reports', icon: Layers, path: '/reports' },
    { label: 'Agents', icon: Bot, path: '/agents' },
    { label: 'Settings', icon: Settings, path: '/admin/settings' },
  ];

  return (
    <aside className={`sidebar-container ${collapsed ? 'collapsed' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-brand-header" onClick={() => navigate('/')} role="button" tabIndex={0}>
        <div className="brand-logo-hex">
          <Shield size={20} color="#ffffff" />
        </div>
        {!collapsed && (
          <div className="brand-text-block">
            <h1 className="brand-title">InfraPilot</h1>
            <span className="brand-subtitle">Infrastructure Monitoring</span>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="sidebar-nav-list" aria-label="Main Navigation">
        {navItems.map((item) => {
          const isMachines = item.path === '/infrastructure' && location.pathname.includes('/machines');
          const isActive =
            item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path) || isMachines;
          const Icon = item.icon;

          return (
            <button
              key={item.label}
              className={`nav-item-btn ${isActive ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
              type="button"
              title={item.label}
            >
              <Icon size={17} className="nav-item-icon" />
              {!collapsed && <span className="nav-item-label">{item.label}</span>}
              {!collapsed && item.badge && (
                <span className={`nav-item-badge ${item.label === 'Alerts' && criticalCount > 0 ? 'critical-pulse' : ''}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom System Status Widget */}
      {!collapsed && (
        <div className="sidebar-system-status-card">
          <div className="status-header">
            <span className="status-title-text">System Status</span>
            <div className="operational-tag">
              <span className="status-dot green pulse" />
              <span>All Systems Operational</span>
            </div>
          </div>

          <div className="status-rows-list">
            <div className="status-row">
              <div className="row-left">
                <Radio size={13} color="#06b6d4" />
                <span>Backend API</span>
              </div>
              <span className="badge-operational">Operational</span>
            </div>

            <div className="status-row">
              <div className="row-left">
                <Database size={13} color="#f59e0b" />
                <span>Database</span>
              </div>
              <span className="badge-operational">Operational</span>
            </div>

            <div className="status-row">
              <div className="row-left">
                <Bot size={13} color="#22c55e" />
                <span>Agent Network</span>
              </div>
              <span className="badge-operational">Operational</span>
            </div>

            <div className="status-row">
              <div className="row-left">
                <HardDrive size={13} color="#ef4444" />
                <span>Storage</span>
              </div>
              <span className="badge-operational">Operational</span>
            </div>
          </div>

          <button
            className="btn-view-system-health"
            onClick={() => navigate('/reports')}
            type="button"
          >
            View System Health
          </button>
        </div>
      )}

      <style>{`
        .sidebar-container {
          width: 220px;
          height: 100vh;
          background-color: #0b0f19;
          border-right: 1px solid #161e2e;
          display: flex;
          flex-direction: column;
          padding: 16px 12px;
          gap: 14px;
          flex-shrink: 0;
          z-index: 100;
          overflow-y: auto;
          position: relative;
          user-select: none;
        }
        .sidebar-container.collapsed {
          width: 64px;
          padding: 16px 8px;
        }
        .sidebar-brand-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 4px 6px 10px 6px;
          cursor: pointer;
        }
        .brand-logo-hex {
          width: 34px;
          height: 34px;
          border-radius: 9px;
          background: linear-gradient(135deg, #1d4ed8, #0284c7);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4);
          flex-shrink: 0;
        }
        .brand-text-block {
          display: flex;
          flex-direction: column;
          line-height: 1.15;
        }
        .brand-title {
          font-size: 16px;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
          letter-spacing: -0.02em;
        }
        .brand-subtitle {
          font-size: 10px;
          color: #64748b;
          white-space: nowrap;
        }

        .sidebar-nav-list {
          display: flex;
          flex-direction: column;
          gap: 3px;
          flex: 1;
        }
        .nav-item-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 8px 12px;
          border-radius: 8px;
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
        }
        .nav-item-btn:hover {
          background-color: #121824;
          color: #f1f5f9;
        }
        .nav-item-btn.active {
          background-color: #1d4ed8;
          color: #ffffff;
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(29, 78, 216, 0.35);
        }
        .nav-item-icon {
          flex-shrink: 0;
        }
        .nav-item-label {
          flex: 1;
        }
        .nav-item-badge {
          background-color: #ef4444;
          color: #ffffff;
          font-size: 10px;
          font-weight: 800;
          border-radius: 10px;
          padding: 1px 6px;
          line-height: 1.3;
        }

        /* Bottom System Status Box */
        .sidebar-system-status-card {
          background: #0d1220;
          border: 1px solid #161e2e;
          border-radius: 10px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: auto;
        }
        .status-header {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .status-title-text {
          font-size: 11px;
          font-weight: 700;
          color: #cbd5e1;
        }
        .operational-tag {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          color: #22c55e;
          font-weight: 600;
        }
        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: #22c55e;
        }
        .status-dot.pulse {
          box-shadow: 0 0 6px #22c55e;
        }

        .status-rows-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .status-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
        }
        .row-left {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #94a3b8;
        }
        .badge-operational {
          color: #22c55e;
          font-size: 10px;
          font-weight: 600;
        }

        .btn-view-system-health {
          width: 100%;
          background: #121824;
          border: 1px solid #1f2e44;
          border-radius: 6px;
          color: #94a3b8;
          font-size: 11px;
          font-weight: 600;
          padding: 6px 8px;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: center;
        }
        .btn-view-system-health:hover {
          background: #1a2333;
          color: #ffffff;
          border-color: #38bdf8;
        }
      `}</style>
    </aside>
  );
}
