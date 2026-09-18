import React, { createContext, useContext, useEffect, useState } from 'react';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import { useWebSocketConnection } from '../../websocket/hooks.js';
import { useDashboardStore } from '../../store/dashboardStore.jsx';
import { getProfile } from '../../api/auth.js';
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';

const UserProfileContext = createContext(null);

export function useUserProfile() {
  return useContext(UserProfileContext);
}

export default function Layout() {
  const token = localStorage.getItem('token');
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  const { toasts, removeToast } = useDashboardStore();

  // 1. Establish the global websocket connection
  useWebSocketConnection();

  // 2. Fetch profile to resolve RBAC roles with safety fallback timeout
  useEffect(() => {
    if (!token) {
      setProfileLoading(false);
      return;
    }

    let active = true;

    // Safety timeout: Never keep the UI stuck on loading profile screen longer than 1.5s
    const timeoutId = setTimeout(() => {
      if (active) {
        setUserProfile({
          username: 'Admin',
          email: 'admin@infrapilot.io',
          role: localStorage.getItem('user_role') || 'Admin',
        });
        setProfileLoading(false);
      }
    }, 1200);

    getProfile()
      .then((data) => {
        if (active) {
          clearTimeout(timeoutId);
          setUserProfile(data || { username: 'Admin', email: 'admin@infrapilot.io', role: 'Admin' });
          if (data?.role) localStorage.setItem('user_role', data.role);
          setProfileLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          clearTimeout(timeoutId);
          console.warn('Profile endpoint unavailable, using stored profile fallback:', err);
          const storedUser = localStorage.getItem('user');
          if (storedUser) {
            try {
              const parsed = JSON.parse(storedUser);
              setUserProfile({
                username: parsed.username || 'Admin',
                email: parsed.email || '',
                role: localStorage.getItem('user_role') || 'Admin',
              });
            } catch {
              setUserProfile({ username: 'Admin', email: 'admin@infrapilot.io', role: 'Admin' });
            }
          } else {
            setUserProfile({ username: 'Admin', email: 'admin@infrapilot.io', role: 'Admin' });
          }
          setProfileLoading(false);
        }
      });

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [token]);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (profileLoading) {
    return (
      <div className="layout-loading-screen">
        <div className="spinner" />
        <p>Loading your profile...</p>
        <style>{`
          .layout-loading-screen {
            height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background-color: #080c14;
            color: #94a3b8;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #1f2e44;
            border-top-color: #06b6d4;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 16px;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  const toastIcons = {
    success: <CheckCircle size={18} color="#22c55e" />,
    warning: <AlertTriangle size={18} color="#f59e0b" />,
    critical: <AlertCircle size={18} color="#ef4444" />,
    info: <Info size={18} color="#06b6d4" />,
  };

  return (
    <UserProfileContext.Provider value={userProfile}>
      <div className={`layout-container ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <Sidebar collapsed={collapsed} toggleCollapse={toggleCollapse} userProfile={userProfile} />
        
        <div className="layout-main">
          <Topbar userProfile={userProfile} />
          
          <main className="layout-content">
            <Outlet />
          </main>
        </div>

        {/* Dynamic Toast Notifications */}
        <div className="toast-container">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast-card toast-${toast.type || 'info'}`}>
              <span className="toast-icon">{toastIcons[toast.type] || toastIcons.info}</span>
              <div className="toast-body">
                <strong>{toast.title}</strong>
                <p>{toast.message}</p>
              </div>
              <button className="toast-close" onClick={() => removeToast(toast.id)}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        <style>{`
          .layout-container {
            display: grid;
            grid-template-columns: var(--sidebar-width, 240px) 1fr;
            min-height: 100vh;
            background-color: #080c14;
            transition: grid-template-columns 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
          }
          .layout-container.sidebar-collapsed {
            --sidebar-width: 64px;
          }
          .layout-main {
            display: flex;
            flex-direction: column;
            height: 100vh;
            min-width: 0;
            overflow: hidden;
          }
          .layout-content {
            flex: 1;
            overflow-y: auto;
            min-width: 0;
            padding: 24px;
            position: relative;
          }
          /* Toast Notification Styles */
          .toast-container {
            position: fixed;
            bottom: 24px;
            right: 24px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            z-index: 9999;
          }
          .toast-card {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            width: 320px;
            padding: 16px;
            background-color: #0d1220;
            border: 1px solid #1f2e44;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
          }
          .toast-body {
            flex: 1;
            min-width: 0;
          }
          .toast-body strong {
            display: block;
            font-size: 13px;
            color: #f1f5f9;
            margin-bottom: 4px;
          }
          .toast-body p {
            margin: 0;
            font-size: 12px;
            color: #94a3b8;
            line-height: 1.4;
          }
          .toast-close {
            background: none;
            border: none;
            color: #64748b;
            padding: 0;
            cursor: pointer;
            transition: color 0.2s;
          }
          .toast-close:hover {
            color: #f1f5f9;
          }
          .toast-success { border-left: 3px solid #22c55e; }
          .toast-warning { border-left: 3px solid #f59e0b; }
          .toast-critical { border-left: 3px solid #ef4444; }
          .toast-info { border-left: 3px solid #06b6d4; }

          @keyframes slideIn {
            from { transform: translateY(100%) scale(0.9); opacity: 0; }
            to { transform: translateY(0) scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    </UserProfileContext.Provider>
  );
}
