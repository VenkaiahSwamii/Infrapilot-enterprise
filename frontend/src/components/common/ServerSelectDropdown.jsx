import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Server, ChevronDown, Check, Search, Radio, RefreshCw, Layers } from 'lucide-react';
import { useServerStore } from '../../store/serverStore.jsx';
import { getMachineId } from '../../utils/machineId.js';

export default function ServerSelectDropdown({
  value,
  onChange,
  showAll = false,
  allLabel = 'All Monitored Servers',
  filterOnlineOnly = false,
  style = {},
  className = '',
  size = 'md',
}) {
  const store = useServerStore();
  const servers = store?.servers || [];
  const globalSelectedId = store?.selectedServerId || '';
  const setGlobalSelectedId = store?.setSelectedServerId;
  const liveMetricsMap = store?.liveMetricsMap || {};
  const fetchServers = store?.fetchServers;

  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  const activeSelectedId = value !== undefined ? String(value) : String(globalSelectedId);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const availableServers = useMemo(() => {
    if (!filterOnlineOnly) return servers;
    return servers.filter((s) => {
      const st = String(s.status || s.Status || '').toUpperCase();
      return st === 'ONLINE' || s.online === true;
    });
  }, [servers, filterOnlineOnly]);

  const filteredList = useMemo(() => {
    if (!searchTerm.trim()) return availableServers;
    const term = searchTerm.toLowerCase();
    return availableServers.filter((s) => {
      const name = String(s.hostname || s.name || '').toLowerCase();
      const ip = String(s.ip_address || '').toLowerCase();
      const os = String(s.os || s.platform || '').toLowerCase();
      const id = String(s.id || '').toLowerCase();
      return name.includes(term) || ip.includes(term) || os.includes(term) || id.includes(term);
    });
  }, [availableServers, searchTerm]);

  // Determine currently selected server object
  const currentServer = useMemo(() => {
    if (activeSelectedId === 'ALL' || activeSelectedId === 'all') return null;
    return (
      servers.find((s) => {
        const sId = String(s.id || s.ID || s.machine_id || '').toLowerCase();
        const curId = activeSelectedId.toLowerCase();
        return sId === curId || getMachineId(s).toLowerCase() === curId || String(s.hostname || '').toLowerCase() === curId;
      }) || null
    );
  }, [servers, activeSelectedId]);

  const handleSelect = (s) => {
    if (s === 'ALL') {
      if (onChange) onChange('ALL', null);
      else if (setGlobalSelectedId) setGlobalSelectedId('ALL');
    } else {
      const sId = String(s.id || s.ID || getMachineId(s));
      if (onChange) onChange(sId, s);
      else if (setGlobalSelectedId) setGlobalSelectedId(sId);
    }
    setIsOpen(false);
    setSearchTerm('');
  };

  const getOsIcon = (osStr) => {
    const os = String(osStr || '').toLowerCase();
    if (os.includes('win')) return '🪟';
    if (os.includes('darwin') || os.includes('mac') || os.includes('apple')) return '🍎';
    return '🐧';
  };

  const isSelected = (s) => {
    if (s === 'ALL') return activeSelectedId === 'ALL' || activeSelectedId === 'all';
    const sId = String(s.id || s.ID || s.machine_id || '').toLowerCase();
    const curId = activeSelectedId.toLowerCase();
    return sId === curId || getMachineId(s).toLowerCase() === curId || String(s.hostname || '').toLowerCase() === curId;
  };

  const isCompact = size === 'sm';

  return (
    <div
      ref={dropdownRef}
      className={`server-select-dropdown-root ${className}`}
      style={{
        position: 'relative',
        display: 'inline-block',
        minWidth: isCompact ? '200px' : '260px',
        userSelect: 'none',
        ...style,
      }}
    >
      {/* Trigger Button */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          background: 'linear-gradient(180deg, #0f172a 0%, #0b1120 100%)',
          border: isOpen ? '1px solid #38bdf8' : '1px solid #1e293b',
          boxShadow: isOpen ? '0 0 0 2px rgba(56, 189, 248, 0.15)' : 'none',
          borderRadius: '9px',
          padding: isCompact ? '6px 12px' : '8px 14px',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          {activeSelectedId === 'ALL' || activeSelectedId === 'all' ? (
            <>
              <Layers size={15} color="#38bdf8" />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: isCompact ? '12px' : '13px', fontWeight: 700, color: '#f8fafc' }}>
                  {allLabel}
                </span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  {availableServers.length} machines reporting
                </span>
              </div>
            </>
          ) : currentServer ? (
            <>
              {/* Online/Offline status dot */}
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background:
                    String(currentServer.status || '').toUpperCase() === 'ONLINE' || currentServer.online === true
                      ? '#22c55e'
                      : '#ef4444',
                  boxShadow:
                    String(currentServer.status || '').toUpperCase() === 'ONLINE' || currentServer.online === true
                      ? '0 0 6px rgba(34, 197, 94, 0.6)'
                      : 'none',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: '14px', flexShrink: 0 }}>
                {getOsIcon(currentServer.os || currentServer.platform)}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <span
                  style={{
                    fontSize: isCompact ? '12px' : '13px',
                    fontWeight: 700,
                    color: '#f8fafc',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {currentServer.hostname || currentServer.name || 'Unnamed Host'}
                </span>
                <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
                  {currentServer.ip_address || '127.0.0.1'}
                  {currentServer.cpu_usage !== undefined ? ` • ${Math.round(currentServer.cpu_usage)}% CPU` : ''}
                </span>
              </div>
            </>
          ) : (
            <>
              <Server size={15} color="#94a3b8" />
              <span style={{ fontSize: isCompact ? '12px' : '13px', color: '#94a3b8' }}>
                {servers.length === 0 ? 'Connecting to servers...' : 'Select a Server...'}
              </span>
            </>
          )}
        </div>

        <ChevronDown
          size={14}
          color="#94a3b8"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            flexShrink: 0,
          }}
        />
      </div>

      {/* Popover Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            minWidth: '280px',
            backgroundColor: '#0c1322',
            border: '1px solid #1e293b',
            borderRadius: '10px',
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
            zIndex: 999,
            overflow: 'hidden',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          {/* Header & Search */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #1e293b', backgroundColor: '#090e1a' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#040711',
                border: '1px solid #1e293b',
                borderRadius: '6px',
                padding: '5px 10px',
              }}
            >
              <Search size={13} color="#64748b" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by hostname, IP, OS..."
                autoFocus
                style={{
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: '#f1f5f9',
                  fontSize: '12px',
                  width: '100%',
                }}
              />
            </div>
          </div>

          {/* Options List */}
          <div style={{ maxHeight: '250px', overflowY: 'auto', padding: '4px' }}>
            {/* Show All option if requested */}
            {showAll && (
              <div
                onClick={() => handleSelect('ALL')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: isSelected('ALL') ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                  color: isSelected('ALL') ? '#38bdf8' : '#cbd5e1',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected('ALL')) e.currentTarget.style.backgroundColor = '#131e33';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected('ALL')) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Layers size={14} color="#38bdf8" />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{allLabel}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Aggregate across all nodes</div>
                  </div>
                </div>
                {isSelected('ALL') && <Check size={14} color="#38bdf8" />}
              </div>
            )}

            {filteredList.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                {servers.length === 0 ? 'No machines registered yet.' : 'No matching servers found.'}
              </div>
            ) : (
              filteredList.map((s) => {
                const sId = s.id || s.ID || getMachineId(s);
                const selected = isSelected(s);
                const isOnline = String(s.status || s.Status || '').toUpperCase() === 'ONLINE' || s.online === true;
                const live = liveMetricsMap[getMachineId(s)] || {};
                const cpu = live.cpu_usage ?? s.cpu_usage;
                const ram = live.memory_usage ?? s.memory_usage;

                return (
                  <div
                    key={sId}
                    onClick={() => handleSelect(s)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      backgroundColor: selected ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                      color: selected ? '#38bdf8' : '#e2e8f0',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) e.currentTarget.style.backgroundColor = '#131e33';
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: isOnline ? '#22c55e' : '#ef4444',
                          boxShadow: isOnline ? '0 0 6px rgba(34, 197, 94, 0.6)' : 'none',
                        }}
                      />
                      <span>{getOsIcon(s.os || s.platform)}</span>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: selected ? '#38bdf8' : '#f8fafc' }}>
                          {s.hostname || s.name || sId}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          {s.ip_address || '127.0.0.1'}
                          {cpu !== undefined && ` • CPU: ${Math.round(cpu)}%`}
                          {ram !== undefined && ` • RAM: ${Math.round(ram)}%`}
                        </div>
                      </div>
                    </div>

                    {selected && <Check size={14} color="#38bdf8" />}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer with Refresh */}
          <div
            style={{
              padding: '6px 10px',
              borderTop: '1px solid #1e293b',
              backgroundColor: '#090e1a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: '#64748b',
            }}
          >
            <span>{servers.length} total host{servers.length === 1 ? '' : 's'}</span>
            {fetchServers && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  fetchServers();
                }}
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  padding: '2px 4px',
                }}
              >
                <RefreshCw size={11} /> Refresh
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
