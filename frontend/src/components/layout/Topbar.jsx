import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Bell,
  Moon,
  Sun,
  Calendar,
  ChevronDown,
  User,
  LogOut,
  Settings,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  CheckCheck,
  Sparkles,
  Check,
  RotateCcw,
} from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore.jsx';
import { useAlertStore } from '../../store/alertStore.jsx';

export default function Topbar({ userProfile }) {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('infrapilot_theme') || 'dark');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAlertsMenu, setShowAlertsMenu] = useState(false);
  const [alertTab, setAlertTab] = useState('all'); // 'all' | 'critical' | 'warning'
  const [cleaningUp, setCleaningUp] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState('5s');

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('infrapilot_theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  // Date & Calendar State
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('now');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [displayRangeText, setDisplayRangeText] = useState('');

  const calendarRef = useRef(null);
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

  // Format real-time date string
  useEffect(() => {
    const updateDateText = () => {
      const now = new Date();
      setCurrentDate(now);

      if (selectedPreset === 'now') {
        const monthDayYear = now.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        const timeStr = now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
        setDisplayRangeText(`${monthDayYear} ${timeStr} - Now`);
      } else if (selectedPreset === 'today') {
        const monthDayYear = now.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        setDisplayRangeText(`${monthDayYear} 00:00 AM - Now`);
      } else if (selectedPreset === '7d') {
        const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const pastStr = past7.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const nowStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        setDisplayRangeText(`${pastStr} - ${nowStr}`);
      } else if (selectedPreset === '30d') {
        const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const pastStr = past30.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const nowStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        setDisplayRangeText(`${pastStr} - ${nowStr}`);
      } else if (selectedPreset === 'custom') {
        const selStr = selectedDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        setDisplayRangeText(`${selStr} - Present`);
      }
    };

    updateDateText();
    const interval = setInterval(updateDateText, 30000);
    return () => clearInterval(interval);
  }, [selectedPreset, selectedDate]);

  // Close popovers on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
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

  // Calendar Calculation
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const handlePrevMonth = () => {
    setCalendarMonth(new Date(year, month - 1, 1));
  };
  const handleNextMonth = () => {
    setCalendarMonth(new Date(year, month + 1, 1));
  };

  const handleSelectDay = (dayNum) => {
    const clickedDate = new Date(year, month, dayNum);
    setSelectedDate(clickedDate);
    setSelectedPreset('custom');
  };

  const handleApplyPreset = (presetKey) => {
    setSelectedPreset(presetKey);
    setShowCalendar(false);
    addToast('info', 'Date Range Updated', `Timefilter applied.`);
  };

  return (
    <header className="topbar">
      {/* Title & Subtitle */}
      <div className="topbar-left">
        <h1 className="page-title">Overview</h1>
        <span className="page-subtitle">Enterprise Infrastructure Dashboard</span>
      </div>

      {/* Center Search Bar */}
      <div className="topbar-search">
        <Search size={15} color="#64748b" />
        <input type="text" placeholder="Search machines, metrics, logs..." />
        <span className="search-kbd">Ctrl /</span>
      </div>

      {/* Right Controls */}
      <div className="topbar-right">
        {/* Live Pill */}
        <div className="live-pill">
          <span className="pulse-dot" />
          <span>Live</span>
          <span className="info-i">i</span>
        </div>

        {/* Refresh Interval Selector */}
        <div className="select-pill">
          <select value={refreshInterval} onChange={(e) => setRefreshInterval(e.target.value)}>
            <option value="5s">5s</option>
            <option value="10s">10s</option>
            <option value="30s">30s</option>
            <option value="1m">1m</option>
          </select>
          <ChevronDown size={12} color="#94a3b8" />
        </div>

        {/* Date Range Picker */}
        <div className="calendar-container-wrapper" ref={calendarRef}>
          <button
            className={`date-picker-btn ${showCalendar ? 'active' : ''}`}
            onClick={() => setShowCalendar(!showCalendar)}
            type="button"
          >
            <span>{displayRangeText || 'May 24, 2025 10:30 AM - Now'}</span>
            <Calendar size={14} color="#06b6d4" style={{ marginLeft: 8 }} />
          </button>

          {/* Calendar Popover */}
          {showCalendar && (
            <div className="calendar-popover">
              <div className="calendar-sidebar">
                <span className="sidebar-heading">TIME RANGES</span>
                <button
                  className={`preset-btn ${selectedPreset === 'now' ? 'active' : ''}`}
                  onClick={() => handleApplyPreset('now')}
                  type="button"
                >
                  Live (Real-Time)
                </button>
                <button
                  className={`preset-btn ${selectedPreset === 'today' ? 'active' : ''}`}
                  onClick={() => handleApplyPreset('today')}
                  type="button"
                >
                  Today
                </button>
                <button
                  className={`preset-btn ${selectedPreset === '7d' ? 'active' : ''}`}
                  onClick={() => handleApplyPreset('7d')}
                  type="button"
                >
                  Last 7 Days
                </button>
                <button
                  className={`preset-btn ${selectedPreset === '30d' ? 'active' : ''}`}
                  onClick={() => handleApplyPreset('30d')}
                  type="button"
                >
                  Last 30 Days
                </button>
              </div>

              <div className="calendar-main-view">
                <div className="calendar-header-controls">
                  <button className="cal-nav-btn" onClick={handlePrevMonth} type="button">
                    <ChevronLeft size={16} />
                  </button>
                  <strong className="month-year-title">
                    {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </strong>
                  <button className="cal-nav-btn" onClick={handleNextMonth} type="button">
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div className="days-header-row">
                  <span>Su</span>
                  <span>Mo</span>
                  <span>Tu</span>
                  <span>We</span>
                  <span>Th</span>
                  <span>Fr</span>
                  <span>Sa</span>
                </div>

                <div className="days-grid">
                  {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
                    <span key={`empty-${idx}`} className="day-empty" />
                  ))}

                  {Array.from({ length: daysInMonth }).map((_, idx) => {
                    const dayNum = idx + 1;
                    const isToday =
                      dayNum === currentDate.getDate() &&
                      month === currentDate.getMonth() &&
                      year === currentDate.getFullYear();

                    const isSelected =
                      selectedPreset === 'custom' &&
                      dayNum === selectedDate.getDate() &&
                      month === selectedDate.getMonth() &&
                      year === selectedDate.getFullYear();

                    return (
                      <button
                        key={`day-${dayNum}`}
                        className={`day-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelectDay(dayNum)}
                        type="button"
                      >
                        {dayNum}
                      </button>
                    );
                  })}
                </div>

                <div className="calendar-footer-bar">
                  <button className="btn-cancel" onClick={() => setShowCalendar(false)} type="button">
                    Cancel
                  </button>
                  <button
                    className="btn-apply"
                    onClick={() => handleApplyPreset(selectedPreset)}
                    type="button"
                  >
                    Apply Range
                  </button>
                </div>
              </div>
            </div>
          )}
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

        {/* Dark Mode Moon Toggle */}
        <button
          className="header-icon-btn"
          onClick={toggleTheme}
          title="Toggle Theme"
          type="button"
        >
          {theme === 'light' ? (
            <Sun size={17} color="#f59e0b" />
          ) : (
            <Moon size={17} color="#cbd5e1" />
          )}
        </button>

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
                  navigate('/admin/users');
                }}
                type="button"
              >
                <User size={14} style={{ marginRight: 8 }} />
                User Management (RBAC)
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  setShowDropdown(false);
                  navigate('/admin/settings');
                }}
                type="button"
              >
                <Settings size={14} style={{ marginRight: 8 }} />
                Account Settings
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
          background-color: #0b0f19;
          border-bottom: 1px solid #161e2e;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          gap: 16px;
          z-index: 90;
          user-select: none;
        }
        .topbar-left {
          display: flex;
          flex-direction: column;
        }
        .page-title {
          font-size: 17px;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
          line-height: 1.2;
        }
        .page-subtitle {
          font-size: 11.5px;
          color: #64748b;
        }
        .topbar-search {
          display: flex;
          align-items: center;
          gap: 8px;
          background-color: #121824;
          border: 1px solid #161e2e;
          border-radius: 8px;
          padding: 6px 12px;
          width: 320px;
        }
        .topbar-search input {
          background: transparent;
          border: none;
          outline: none;
          color: #f8fafc;
          font-size: 12.5px;
          width: 100%;
        }
        .topbar-search input::placeholder {
          color: #64748b;
        }
        .search-kbd {
          font-size: 10px;
          color: #64748b;
          background-color: #0b0f19;
          border: 1px solid #161e2e;
          border-radius: 4px;
          padding: 2px 5px;
          white-space: nowrap;
        }
        .topbar-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .live-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          background-color: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.25);
          color: #22c55e;
          padding: 4px 9px;
          border-radius: 6px;
          font-size: 11.5px;
          font-weight: 600;
        }
        .pulse-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: #22c55e;
          box-shadow: 0 0 6px #22c55e;
        }
        .info-i {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 13px;
          height: 13px;
          border-radius: 50%;
          border: 1px solid #22c55e;
          font-size: 9px;
          line-height: 1;
        }
        .select-pill {
          display: flex;
          align-items: center;
          background-color: #121824;
          border: 1px solid #161e2e;
          border-radius: 6px;
          padding: 4px 8px;
        }
        .select-pill select {
          background: transparent;
          border: none;
          color: #cbd5e1;
          font-size: 12px;
          outline: none;
          cursor: pointer;
          appearance: none;
          padding-right: 4px;
        }

        .calendar-container-wrapper {
          position: relative;
        }
        .date-picker-btn {
          display: flex;
          align-items: center;
          background-color: #121824;
          border: 1px solid #161e2e;
          border-radius: 6px;
          padding: 5px 10px;
          font-size: 12px;
          color: #cbd5e1;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .date-picker-btn:hover, .date-picker-btn.active {
          border-color: #06b6d4;
          background-color: #162132;
        }

        .calendar-popover {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          display: flex;
          background-color: #0d1220;
          border: 1px solid #1f2e44;
          border-radius: 12px;
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.7);
          z-index: 200;
          overflow: hidden;
          width: 480px;
        }

        .calendar-sidebar {
          width: 140px;
          background-color: #080c14;
          border-right: 1px solid #1f2e44;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .sidebar-heading {
          font-size: 10px;
          font-weight: 800;
          color: #64748b;
          letter-spacing: 0.05em;
          margin-bottom: 4px;
        }
        .preset-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 6px;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .preset-btn:hover {
          background-color: #121824;
          color: #ffffff;
        }
        .preset-btn.active {
          background-color: #1d4ed8;
          color: #ffffff;
          font-weight: 600;
        }

        .calendar-main-view {
          flex: 1;
          padding: 14px;
          display: flex;
          flex-direction: column;
        }
        .calendar-header-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .month-year-title {
          font-size: 13.5px;
          color: #ffffff;
          font-weight: 700;
        }
        .cal-nav-btn {
          background: #121824;
          border: 1px solid #1f2e44;
          color: #cbd5e1;
          border-radius: 6px;
          padding: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .cal-nav-btn:hover {
          color: #ffffff;
          background-color: #1f2e44;
        }

        .days-header-row {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          text-align: center;
          font-size: 11px;
          color: #64748b;
          font-weight: 700;
          margin-bottom: 6px;
        }
        .days-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 2px;
        }
        .day-empty {
          height: 30px;
        }
        .day-cell {
          height: 30px;
          background: transparent;
          border: none;
          color: #cbd5e1;
          font-size: 11.5px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .day-cell:hover {
          background-color: #1f2e44;
          color: #ffffff;
        }
        .day-cell.today {
          border: 1px solid #06b6d4;
          color: #06b6d4;
          font-weight: 700;
        }
        .day-cell.selected {
          background-color: #3b82f6;
          color: #ffffff;
          font-weight: 700;
        }

        .calendar-footer-bar {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid #1f2e44;
        }
        .btn-cancel {
          background: transparent;
          border: 1px solid #1f2e44;
          color: #94a3b8;
          font-size: 11.5px;
          padding: 4px 10px;
          border-radius: 6px;
          cursor: pointer;
        }
        .btn-apply {
          background-color: #3b82f6;
          border: none;
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 600;
          padding: 4px 12px;
          border-radius: 6px;
          cursor: pointer;
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
