import React, { useState, useMemo } from 'react';
import { 
  Server, 
  Search, 
  RefreshCw, 
  LayoutGrid, 
  Table as TableIcon, 
  SlidersHorizontal, 
  ArrowUpDown, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Radio, 
  Cpu, 
  HardDrive, 
  Activity, 
  Terminal, 
  Wrench, 
  ExternalLink, 
  Copy, 
  Check, 
  Download, 
  Layers,
  ShieldCheck
} from 'lucide-react';
import { useServerStore } from '../store/serverStore.jsx';
import { useNavigate } from 'react-router-dom';
import { getMachineId } from '../utils/machineId.js';

export default function InfrastructurePage() {
  const { servers, loading, fetchServers, liveMetricsMap } = useServerStore();
  const navigate = useNavigate();

  // View & Filter States
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [filterType, setFilterType] = useState('all'); // 'all' | 'online' | 'warning' | 'critical' | 'offline'
  const [osFilter, setOsFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('default'); // 'default' | 'cpu_desc' | 'ram_desc' | 'disk_desc' | 'hostname_asc' | 'last_seen'
  const [copiedId, setCopiedId] = useState(null);

  // Compute fleet statistics
  const stats = useMemo(() => {
    const total = servers.length;
    let online = 0;
    let warning = 0;
    let critical = 0;
    let offline = 0;
    let totalCores = 0;
    let totalMemoryGB = 0;

    servers.forEach((s) => {
      const sId = getMachineId(s);
      const live = liveMetricsMap[sId] || {};
      const statusStr = String(s.status || '').toUpperCase();
      const isOnline = statusStr === 'ONLINE' || s.online === true;
      const cpu = Number(live.cpu_usage ?? s.cpu_usage ?? 0);
      const ram = Number(live.memory_usage ?? s.memory_usage ?? 0);
      const cores = Number(s.cpu_cores || s.CPUCores || 4);
      const mem = Number(s.total_memory_gb || s.TotalMemoryGB || 16);

      totalCores += cores;
      totalMemoryGB += mem;

      if (isOnline) {
        if (cpu > 92 || ram > 95) {
          critical++;
        } else if (cpu > 75 || ram > 80) {
          warning++;
        } else {
          online++;
        }
      } else {
        offline++;
      }
    });

    const healthRate = total > 0 ? Math.round(((online + warning * 0.5) / total) * 100) : 100;
    return { total, online, warning, critical, offline, totalCores, totalMemoryGB, healthRate };
  }, [servers, liveMetricsMap]);

  // Extract unique OS list
  const availableOS = useMemo(() => {
    const set = new Set();
    servers.forEach((s) => {
      const os = String(s.os || 'Linux').trim();
      if (os) set.add(os);
    });
    return Array.from(set);
  }, [servers]);

  // Filter and sort servers
  const processedServers = useMemo(() => {
    let result = servers.filter((s) => {
      const sId = getMachineId(s);
      const live = liveMetricsMap[sId] || {};
      const statusStr = String(s.status || '').toUpperCase();
      const isOnline = statusStr === 'ONLINE' || s.online === true;
      const cpu = Number(live.cpu_usage ?? s.cpu_usage ?? 0);
      const ram = Number(live.memory_usage ?? s.memory_usage ?? 0);
      const isCritical = isOnline && (cpu > 92 || ram > 95);
      const isWarning = isOnline && !isCritical && (cpu > 75 || ram > 80);
      const isHealthy = isOnline && !isCritical && !isWarning;

      // Text Search
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        String(s.hostname || '').toLowerCase().includes(q) ||
        String(s.ip_address || s.IPAddress || '').includes(q) ||
        String(s.os || '').toLowerCase().includes(q) ||
        sId.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      // OS Filter
      if (osFilter !== 'ALL' && !String(s.os || '').toLowerCase().includes(osFilter.toLowerCase())) {
        return false;
      }

      // Status Filter
      if (filterType === 'online') return isHealthy;
      if (filterType === 'warning') return isWarning;
      if (filterType === 'critical') return isCritical;
      if (filterType === 'offline') return !isOnline;

      return true;
    });

    // Sorting
    result.sort((a, b) => {
      const aId = getMachineId(a);
      const bId = getMachineId(b);
      const aLive = liveMetricsMap[aId] || {};
      const bLive = liveMetricsMap[bId] || {};

      const aCpu = Number(aLive.cpu_usage ?? a.cpu_usage ?? 0);
      const bCpu = Number(bLive.cpu_usage ?? b.cpu_usage ?? 0);
      const aRam = Number(aLive.memory_usage ?? a.memory_usage ?? 0);
      const bRam = Number(bLive.memory_usage ?? b.memory_usage ?? 0);
      const aDisk = Number(aLive.disk_usage ?? a.disk_usage ?? 0);
      const bDisk = Number(bLive.disk_usage ?? b.disk_usage ?? 0);

      if (sortBy === 'cpu_desc') return bCpu - aCpu;
      if (sortBy === 'ram_desc') return bRam - aRam;
      if (sortBy === 'disk_desc') return bDisk - aDisk;
      if (sortBy === 'hostname_asc') return String(a.hostname || '').localeCompare(String(b.hostname || ''));
      if (sortBy === 'last_seen') {
        const aT = new Date(aLive.created_at || a.last_seen || 0).getTime();
        const bT = new Date(bLive.created_at || b.last_seen || 0).getTime();
        return bT - aT;
      }
      return 0;
    });

    return result;
  }, [servers, searchQuery, filterType, osFilter, sortBy, liveMetricsMap]);

  const handleCopy = (e, text, id) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleExportCSV = () => {
    const headers = ['Hostname', 'Machine ID', 'IP Address', 'OS', 'Status', 'CPU %', 'Memory %', 'Disk %', 'Last Seen'];
    const rows = processedServers.map((s) => {
      const sId = getMachineId(s);
      const live = liveMetricsMap[sId] || {};
      return [
        `"${s.hostname || ''}"`,
        `"${sId}"`,
        `"${s.ip_address || s.IPAddress || ''}"`,
        `"${s.os || 'Linux'}"`,
        `"${s.status || 'ONLINE'}"`,
        (Number(live.cpu_usage ?? s.cpu_usage ?? 0)).toFixed(1),
        (Number(live.memory_usage ?? s.memory_usage ?? 0)).toFixed(1),
        (Number(live.disk_usage ?? s.disk_usage ?? 0)).toFixed(1),
        `"${live.created_at || s.last_seen || 'never'}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `infrapilot-servers-fleet-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getMetricColor = (val) => {
    if (val > 90) return '#ef4444';
    if (val > 75) return '#f59e0b';
    return '#06b6d4';
  };

  return (
    <div className="infrastructure-page" style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
      
      {/* 1. Header Section */}
      <div
        className="page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: 'rgba(6, 182, 212, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(6, 182, 212, 0.3)'
            }}>
              <Server size={20} color="#06b6d4" />
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9', margin: 0, letterSpacing: '-0.02em' }}>
              Fleet Infrastructure Inspector
            </h1>
          </div>
          <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px' }}>
            Unified real-time monitoring, telemetry streams, and autonomous remediation across all {stats.total} enrolled servers.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleExportCSV}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              backgroundColor: '#0d1220',
              color: '#cbd5e1',
              border: '1px solid #1f2e44',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              transition: 'all 0.15s'
            }}
          >
            <Download size={14} /> Export Fleet CSV
          </button>
          
          <button
            className="refresh-btn"
            onClick={fetchServers}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              backgroundColor: 'rgba(6, 182, 212, 0.12)',
              color: '#06b6d4',
              border: '1px solid rgba(6, 182, 212, 0.35)',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              transition: 'all 0.15s'
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            {loading ? 'Polling Fleet...' : 'Sync Fleet'}
          </button>
        </div>
      </div>

      {/* 2. Executive KPI Cards */}
      <div
        className="infra-kpis"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        {/* Total Servers */}
        <button
          onClick={() => setFilterType('all')}
          style={{
            background: filterType === 'all' ? 'linear-gradient(180deg, #111a2e 0%, #0d1220 100%)' : '#0d1220',
            border: filterType === 'all' ? '1px solid #06b6d4' : '1px solid #1f2e44',
            borderRadius: '12px',
            padding: '16px',
            color: '#f1f5f9',
            cursor: 'pointer',
            textAlign: 'left',
            boxShadow: filterType === 'all' ? '0 0 12px rgba(6, 182, 212, 0.15)' : 'none',
            transition: 'all 0.15s'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>TOTAL NODES</span>
            <Layers size={16} color="#64748b" />
          </div>
          <strong style={{ display: 'block', fontSize: '24px', fontWeight: 800, marginTop: '6px' }}>{stats.total}</strong>
          <span style={{ fontSize: '11px', color: '#06b6d4', marginTop: '2px', display: 'block' }}>
            {stats.totalCores} vCPUs • {stats.totalMemoryGB} GB RAM
          </span>
        </button>

        {/* Healthy / Online */}
        <button
          onClick={() => setFilterType('online')}
          style={{
            background: filterType === 'online' ? 'linear-gradient(180deg, #0d2319 0%, #0d1220 100%)' : '#0d1220',
            border: filterType === 'online' ? '1px solid #22c55e' : '1px solid #1f2e44',
            borderRadius: '12px',
            padding: '16px',
            color: '#f1f5f9',
            cursor: 'pointer',
            textAlign: 'left',
            boxShadow: filterType === 'online' ? '0 0 12px rgba(34, 197, 94, 0.15)' : 'none',
            transition: 'all 0.15s'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase' }}>HEALTHY</span>
            <CheckCircle2 size={16} color="#22c55e" />
          </div>
          <strong style={{ display: 'block', fontSize: '24px', fontWeight: 800, marginTop: '6px', color: '#22c55e' }}>{stats.online}</strong>
          <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', display: 'block' }}>
            Optimal telemetry
          </span>
        </button>

        {/* Warning */}
        <button
          onClick={() => setFilterType('warning')}
          style={{
            background: filterType === 'warning' ? 'linear-gradient(180deg, #261f0d 0%, #0d1220 100%)' : '#0d1220',
            border: filterType === 'warning' ? '1px solid #f59e0b' : '1px solid #1f2e44',
            borderRadius: '12px',
            padding: '16px',
            color: '#f1f5f9',
            cursor: 'pointer',
            textAlign: 'left',
            boxShadow: filterType === 'warning' ? '0 0 12px rgba(245, 158, 11, 0.15)' : 'none',
            transition: 'all 0.15s'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>ELEVATED</span>
            <AlertTriangle size={16} color="#f59e0b" />
          </div>
          <strong style={{ display: 'block', fontSize: '24px', fontWeight: 800, marginTop: '6px', color: '#f59e0b' }}>{stats.warning}</strong>
          <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', display: 'block' }}>
            CPU &gt; 75% or RAM &gt; 80%
          </span>
        </button>

        {/* Critical */}
        <button
          onClick={() => setFilterType('critical')}
          style={{
            background: filterType === 'critical' ? 'linear-gradient(180deg, #260d0d 0%, #0d1220 100%)' : '#0d1220',
            border: filterType === 'critical' ? '1px solid #ef4444' : '1px solid #1f2e44',
            borderRadius: '12px',
            padding: '16px',
            color: '#f1f5f9',
            cursor: 'pointer',
            textAlign: 'left',
            boxShadow: filterType === 'critical' ? '0 0 12px rgba(239, 68, 68, 0.15)' : 'none',
            transition: 'all 0.15s'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' }}>CRITICAL</span>
            <AlertCircle size={16} color="#ef4444" />
          </div>
          <strong style={{ display: 'block', fontSize: '24px', fontWeight: 800, marginTop: '6px', color: '#ef4444' }}>{stats.critical}</strong>
          <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', display: 'block' }}>
            Saturation threshold breached
          </span>
        </button>

        {/* Offline */}
        <button
          onClick={() => setFilterType('offline')}
          style={{
            background: filterType === 'offline' ? 'linear-gradient(180deg, #1c2230 0%, #0d1220 100%)' : '#0d1220',
            border: filterType === 'offline' ? '1px solid #64748b' : '1px solid #1f2e44',
            borderRadius: '12px',
            padding: '16px',
            color: '#f1f5f9',
            cursor: 'pointer',
            textAlign: 'left',
            boxShadow: filterType === 'offline' ? '0 0 12px rgba(100, 116, 139, 0.15)' : 'none',
            transition: 'all 0.15s'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>OFFLINE / STALE</span>
            <Radio size={16} color="#64748b" />
          </div>
          <strong style={{ display: 'block', fontSize: '24px', fontWeight: 800, marginTop: '6px', color: '#94a3b8' }}>{stats.offline}</strong>
          <span style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'block' }}>
            Heartbeat signal absent
          </span>
        </button>
      </div>

      {/* 3. Toolbar & Control Bar */}
      <div
        className="infra-toolbar"
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          marginBottom: '20px',
          backgroundColor: '#0d1220',
          border: '1px solid #1f2e44',
          borderRadius: '12px',
          padding: '10px 16px',
        }}
      >
        {/* Left Controls: Search & Filters */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
          {/* Search Box */}
          <div
            className="search-box"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#080c14',
              border: '1px solid #1f2e44',
              borderRadius: '8px',
              padding: '6px 12px',
              minWidth: '260px',
            }}
          >
            <Search size={15} color="#64748b" />
            <input
              type="text"
              placeholder="Filter by hostname, IP, OS, machine ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ background: 'none', border: 'none', color: '#f1f5f9', outline: 'none', width: '100%', fontSize: '13px' }}
            />
          </div>

          {/* OS Filter */}
          <select
            value={osFilter}
            onChange={(e) => setOsFilter(e.target.value)}
            style={{
              height: '34px',
              backgroundColor: '#080c14',
              border: '1px solid #1f2e44',
              borderRadius: '8px',
              color: '#cbd5e1',
              padding: '0 10px',
              fontSize: '12px',
              fontWeight: 500,
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">All OS ({stats.total})</option>
            {availableOS.map((os) => (
              <option key={os} value={os}>{os}</option>
            ))}
          </select>

          {/* Sort Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowUpDown size={14} color="#64748b" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                height: '34px',
                backgroundColor: '#080c14',
                border: '1px solid #1f2e44',
                borderRadius: '8px',
                color: '#cbd5e1',
                padding: '0 10px',
                fontSize: '12px',
                fontWeight: 500,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="default">Default Ordering</option>
              <option value="cpu_desc">Highest CPU Usage</option>
              <option value="ram_desc">Highest Memory Usage</option>
              <option value="disk_desc">Highest Disk Usage</option>
              <option value="hostname_asc">Hostname (A to Z)</option>
              <option value="last_seen">Most Recently Active</option>
            </select>
          </div>
        </div>

        {/* Right Controls: View Switcher & Result Count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
            Showing <strong style={{ color: '#f1f5f9' }}>{processedServers.length}</strong> of {stats.total} nodes
          </span>

          <div style={{ display: 'flex', backgroundColor: '#080c14', borderRadius: '8px', border: '1px solid #1f2e44', padding: '3px' }}>
            <button
              onClick={() => setViewMode('grid')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: viewMode === 'grid' ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                color: viewMode === 'grid' ? '#06b6d4' : '#64748b',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
              }}
              title="Card Grid View"
            >
              <LayoutGrid size={14} /> Cards
            </button>
            <button
              onClick={() => setViewMode('table')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: viewMode === 'table' ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                color: viewMode === 'table' ? '#06b6d4' : '#64748b',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
              }}
              title="Dense Data Table View"
            >
              <TableIcon size={14} /> Table
            </button>
          </div>
        </div>
      </div>

      {/* 4. Main Server Fleet Render (Grid vs Table) */}
      {processedServers.length === 0 ? (
        <div
          className="empty-state"
          style={{
            textAlign: 'center',
            padding: '80px 24px',
            backgroundColor: '#0d1220',
            border: '1px solid #1f2e44',
            borderRadius: '12px',
            color: '#64748b',
          }}
        >
          <Server size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9', margin: '0 0 6px 0' }}>No Monitored Servers Found</h3>
          <p style={{ fontSize: '13px', margin: 0 }}>No enrolled machines match your search criteria or active status filter.</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* CARD GRID VIEW */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '16px',
          }}
        >
          {processedServers.map((s) => {
            const sId = getMachineId(s);
            const live = liveMetricsMap[sId] || {};
            const statusStr = String(s.status || '').toUpperCase();
            const isOnline = statusStr === 'ONLINE' || s.online === true;

            const cpuVal = Number(live.cpu_usage ?? s.cpu_usage ?? 0);
            const ramVal = Number(live.memory_usage ?? s.memory_usage ?? 0);
            const diskVal = Number(live.disk_usage ?? s.disk_usage ?? 0);

            const isCritical = isOnline && (cpuVal > 92 || ramVal > 95);
            const isWarning = isOnline && !isCritical && (cpuVal > 75 || ramVal > 80);

            let badgeBg = 'rgba(100, 116, 139, 0.15)';
            let badgeColor = '#94a3b8';
            let dotColor = '#64748b';
            let statusLabel = 'OFFLINE';

            if (isOnline) {
              if (isCritical) {
                badgeBg = 'rgba(239, 68, 68, 0.15)';
                badgeColor = '#ef4444';
                dotColor = '#ef4444';
                statusLabel = 'CRITICAL';
              } else if (isWarning) {
                badgeBg = 'rgba(245, 158, 11, 0.15)';
                badgeColor = '#f59e0b';
                dotColor = '#f59e0b';
                statusLabel = 'WARNING';
              } else {
                badgeBg = 'rgba(34, 197, 94, 0.15)';
                badgeColor = '#22c55e';
                dotColor = '#22c55e';
                statusLabel = 'ONLINE';
              }
            }

            const ipAddr = s.ip_address || s.IPAddress || '--';
            const isCopied = copiedId === sId;

            return (
              <div
                key={sId}
                onClick={() => navigate(`/servers/${sId}`)}
                style={{
                  backgroundColor: '#0d1220',
                  border: isCritical ? '1px solid rgba(239, 68, 68, 0.4)' : isWarning ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid #1f2e44',
                  borderRadius: '12px',
                  padding: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'transform 0.15s, border-color 0.15s, box-shadow 0.15s',
                }}
                className="server-grid-card"
              >
                {/* Top Row: Hostname, Status & OS */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.hostname || sId}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                        {ipAddr}
                      </span>
                      <button
                        onClick={(e) => handleCopy(e, ipAddr, sId)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: isCopied ? '#22c55e' : '#64748b',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}
                        title="Copy IP Address"
                      >
                        {isCopied ? <Check size={11} /> : <Copy size={11} />}
                      </button>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '3px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: badgeBg,
                      color: badgeColor,
                      flexShrink: 0
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: dotColor }} />
                    {statusLabel}
                  </span>
                </div>

                {/* OS & Architecture Tag */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    color: '#94a3b8',
                    border: '1px solid rgba(255, 255, 255, 0.06)'
                  }}>
                    {s.os || 'Linux'} {s.architecture ? `(${s.architecture})` : ''}
                  </span>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    Agent: {s.agent_version || s.AgentVersion || 'v1.4.2'}
                  </span>
                </div>

                {/* Telemetry Resource Bars */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                  {/* CPU Bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                      <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Cpu size={12} color="#06b6d4" /> CPU
                      </span>
                      <span style={{ fontWeight: 700, color: isOnline ? getMetricColor(cpuVal) : '#64748b' }}>
                        {isOnline ? `${cpuVal.toFixed(1)}%` : '--'}
                      </span>
                    </div>
                    <div style={{ height: '5px', backgroundColor: '#1a2234', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: isOnline ? `${Math.min(cpuVal, 100)}%` : '0%',
                          backgroundColor: getMetricColor(cpuVal),
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* RAM Bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                      <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Activity size={12} color="#a855f7" /> Memory
                      </span>
                      <span style={{ fontWeight: 700, color: isOnline ? getMetricColor(ramVal) : '#64748b' }}>
                        {isOnline ? `${ramVal.toFixed(1)}%` : '--'}
                      </span>
                    </div>
                    <div style={{ height: '5px', backgroundColor: '#1a2234', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: isOnline ? `${Math.min(ramVal, 100)}%` : '0%',
                          backgroundColor: getMetricColor(ramVal),
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* Disk Bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                      <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <HardDrive size={12} color="#3b82f6" /> Storage
                      </span>
                      <span style={{ fontWeight: 700, color: isOnline ? getMetricColor(diskVal) : '#64748b' }}>
                        {isOnline ? `${diskVal.toFixed(1)}%` : '--'}
                      </span>
                    </div>
                    <div style={{ height: '5px', backgroundColor: '#1a2234', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: isOnline ? `${Math.min(diskVal, 100)}%` : '0%',
                          backgroundColor: getMetricColor(diskVal),
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderTop: '1px solid #1a2234',
                  paddingTop: '10px',
                  marginTop: '4px',
                  fontSize: '11px',
                  color: '#64748b'
                }}>
                  <span>
                    Active: {live.created_at ? new Date(live.created_at).toLocaleTimeString() : s.last_seen ? new Date(s.last_seen).toLocaleTimeString() : 'offline'}
                  </span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/servers/${sId}`);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      backgroundColor: 'rgba(6, 182, 212, 0.12)',
                      color: '#06b6d4',
                      border: '1px solid rgba(6, 182, 212, 0.3)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '11px',
                    }}
                  >
                    Inspect <ExternalLink size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* DENSE DATA TABLE VIEW */
        <div
          className="table-wrapper"
          style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', overflow: 'hidden' }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#080c14', borderBottom: '1px solid #1f2e44', color: '#64748b' }}>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>Hostname / Node ID</th>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>IP Address</th>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>OS / Platform</th>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>CPU %</th>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>Memory %</th>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>Disk %</th>
                <th style={{ padding: '14px 16px', fontWeight: 600 }}>Last Telemetry</th>
                <th style={{ padding: '14px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {processedServers.map((s) => {
                const sId = getMachineId(s);
                const live = liveMetricsMap[sId] || {};
                const statusStr = String(s.status || '').toUpperCase();
                const isOnline = statusStr === 'ONLINE' || s.online === true;

                const cpuVal = Number(live.cpu_usage ?? s.cpu_usage ?? 0);
                const ramVal = Number(live.memory_usage ?? s.memory_usage ?? 0);
                const diskVal = Number(live.disk_usage ?? s.disk_usage ?? 0);

                const isCritical = isOnline && (cpuVal > 92 || ramVal > 95);
                const isWarning = isOnline && !isCritical && (cpuVal > 75 || ramVal > 80);

                let badgeBg = 'rgba(100, 116, 139, 0.15)';
                let badgeColor = '#94a3b8';
                let dotColor = '#64748b';
                let statusLabel = 'Offline';

                if (isOnline) {
                  if (isCritical) {
                    badgeBg = 'rgba(239, 68, 68, 0.15)';
                    badgeColor = '#ef4444';
                    dotColor = '#ef4444';
                    statusLabel = 'Critical';
                  } else if (isWarning) {
                    badgeBg = 'rgba(245, 158, 11, 0.15)';
                    badgeColor = '#f59e0b';
                    dotColor = '#f59e0b';
                    statusLabel = 'Warning';
                  } else {
                    badgeBg = 'rgba(34, 197, 94, 0.15)';
                    badgeColor = '#22c55e';
                    dotColor = '#22c55e';
                    statusLabel = 'Online';
                  }
                }

                return (
                  <tr
                    key={sId}
                    onClick={() => navigate(`/servers/${sId}`)}
                    style={{ borderBottom: '1px solid rgba(31, 46, 68, 0.5)', color: '#cbd5e1', cursor: 'pointer' }}
                    className="table-row-hover"
                  >
                    {/* Status */}
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: badgeBg,
                          color: badgeColor,
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: dotColor }} />
                        {statusLabel}
                      </span>
                    </td>

                    {/* Hostname */}
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#f1f5f9' }}>
                      <div>{s.hostname || sId}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>{sId}</div>
                    </td>

                    {/* IP */}
                    <td style={{ padding: '14px 16px', fontFamily: 'monospace' }}>
                      {s.ip_address || s.IPAddress || '--'}
                    </td>

                    {/* OS */}
                    <td style={{ padding: '14px 16px', color: '#94a3b8' }}>
                      {s.os || 'Linux'} {s.kernel ? `/ ${s.kernel}` : ''}
                    </td>

                    {/* CPU */}
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontWeight: 600, color: isOnline ? getMetricColor(cpuVal) : '#64748b' }}>
                        {isOnline ? `${cpuVal.toFixed(1)}%` : '--'}
                      </span>
                    </td>

                    {/* RAM */}
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontWeight: 600, color: isOnline ? getMetricColor(ramVal) : '#64748b' }}>
                        {isOnline ? `${ramVal.toFixed(1)}%` : '--'}
                      </span>
                    </td>

                    {/* Disk */}
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontWeight: 600, color: isOnline ? getMetricColor(diskVal) : '#64748b' }}>
                        {isOnline ? `${diskVal.toFixed(1)}%` : '--'}
                      </span>
                    </td>

                    {/* Last Seen */}
                    <td style={{ padding: '14px 16px', color: '#64748b', fontSize: '12px' }}>
                      {live.created_at ? new Date(live.created_at).toLocaleTimeString() : s.last_seen ? new Date(s.last_seen).toLocaleTimeString() : 'never'}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/servers/${sId}`);
                        }}
                        style={{
                          background: 'rgba(6, 182, 212, 0.1)',
                          border: '1px solid rgba(6, 182, 212, 0.3)',
                          color: '#06b6d4',
                          padding: '4px 12px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600
                        }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .server-grid-card:hover {
          transform: translateY(-2px);
          border-color: #06b6d4 !important;
          box-shadow: 0 4px 20px rgba(6, 182, 212, 0.12);
        }
        .table-row-hover:hover {
          background-color: rgba(255, 255, 255, 0.02);
        }
      `}</style>
    </div>
  );
}
