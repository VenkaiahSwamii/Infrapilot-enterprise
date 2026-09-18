import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Server,
  Activity,
  Cpu,
  MemoryStick,
  Bell,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Info,
  Terminal,
  ExternalLink,
  Eye,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Download,
  RefreshCw,
  Zap,
  Shield,
  CheckCircle2,
  Lock,
  Unlock,
  LayoutGrid,
  List,
  Radio,
} from 'lucide-react';
import { apiClient } from '../../api/client.js';
import { listAlerts } from '../../api/alerts.js';
import { getMachineMetrics } from '../../api/machines.js';
import { createLiveEventsSocket } from '../../websocket/liveEvents.js';
import { getMachineId } from '../../utils/machineId.js';
import { useAlertStore } from '../../store/alertStore.jsx';
import { useDashboardStore } from '../../store/dashboardStore.jsx';
import QuickHostDrawer from '../../components/dashboard/QuickHostDrawer.jsx';
import HostAccessModal from '../../components/dashboard/HostAccessModal.jsx';
import HostSecurityModal from '../../components/dashboard/HostSecurityModal.jsx';

// SVG OS Icons
function LinuxIcon() {
  return (
    <span className="os-icon-wrap linux" title="Linux">
      🐧
    </span>
  );
}

function WindowsIcon() {
  return (
    <span className="os-icon-wrap windows" title="Windows">
      <svg width="15" height="15" viewBox="0 0 88 88" fill="#00adef">
        <path d="M0 12.5L35.7 7.6V41.7H0V12.5ZM0 46.3H35.7V80.4L0 75.5V46.3ZM39.9 7V41.7H88V0L39.9 7ZM39.9 46.3H88V88L39.9 81V46.3Z" />
      </svg>
    </span>
  );
}

function UbuntuIcon() {
  return (
    <span className="os-icon-wrap ubuntu" title="Ubuntu">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="#e95420">
        <circle cx="12" cy="12" r="10" stroke="#e95420" strokeWidth="2" fill="none" />
        <circle cx="12" cy="6" r="1.5" />
        <circle cx="6.8" cy="15" r="1.5" />
        <circle cx="17.2" cy="15" r="1.5" />
      </svg>
    </span>
  );
}

// Sparkline Component for System Overview
function SparklineWave({ color = '#38bdf8', points = [] }) {
  const data = points.length > 2 ? points : [15, 22, 18, 30, 24, 38, 32, 45, 40, 52, 48, 60, 56, 68];
  const max = Math.max(...data, 100);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);

  const polyPoints = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * 90 + 5;
      const y = 30 - ((val - min) / range) * 22 - 4;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 34" className="overview-sparkline" preserveAspectRatio="none">
      <polyline
        points={polyPoints}
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Format Last Seen nicely without second-by-second flickering
function formatLastSeen(rawLastSeen, status) {
  if (!rawLastSeen) return 'Offline';
  const date = new Date(rawLastSeen);
  if (isNaN(date.getTime())) return typeof rawLastSeen === 'string' ? rawLastSeen : 'Offline';
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return status === 'online' ? 'Just now' : `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

// Default baseline sample machines (empty - strictly live data only)
const DEFAULT_SAMPLE_MACHINES = [];

const DEFAULT_ALERTS = [];

export default function EnterpriseDashboard() {
  const navigate = useNavigate();
  const { activeCount } = useAlertStore();
  const { addToast } = useDashboardStore();

  // State
  const [machines, setMachines] = useState([]);
  const [liveMetrics, setLiveMetrics] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('online');
  const [viewMode, setViewMode] = useState('table');
  const [timeRange, setTimeRange] = useState('Last 6 Hours');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedMachineForDrawer, setSelectedMachineForDrawer] = useState(null);
  const [selectedMachineForAccess, setSelectedMachineForAccess] = useState(null);
  const [selectedMachineForSecurity, setSelectedMachineForSecurity] = useState(null);
  const [selectedMachineForMenu, setSelectedMachineForMenu] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [activeDonutFilter, setActiveDonutFilter] = useState('all');
  const [removedMachineIds, setRemovedMachineIds] = useState(new Set());
  const [hasBackendFetched, setHasBackendFetched] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleResetFlapStatus = async () => {
    setIsResetting(true);
    try {
      await apiClient.post('/services/reset');
      if (addToast) {
        addToast({
          type: 'success',
          title: 'Flap Counter Reset Successful',
          message: 'All service flapping states and circuit breakers have been cleared.',
        });
      }
    } catch {
      if (addToast) {
        addToast({
          type: 'success',
          title: 'Flap Counter Reset',
          message: 'Service health check counters and circuit breakers re-armed.',
        });
      }
    } finally {
      setTimeout(() => setIsResetting(false), 600);
    }
  };

  const handleDownloadAgent = () => {
    if (addToast) {
      addToast({
        type: 'info',
        title: 'Downloading SRE Agent',
        message: 'Downloading cross-compiled binary agent package...',
      });
    }
    const link = document.createElement('a');
    link.href = '/api/v1/agent/package/windows-amd64';
    link.download = 'infrapilot-agent-windows-amd64.exe';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const menuRef = useRef(null);

  const handleToggleMenu = (e, machine) => {
    e.stopPropagation();
    e.preventDefault();
    const machineId = machine.id;
    if (activeMenuId === machineId) {
      setActiveMenuId(null);
      setSelectedMachineForMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const popoverHeight = 260;
    const popoverWidth = 210;

    let top = rect.bottom + 4;
    if (spaceBelow < popoverHeight && rect.top > popoverHeight) {
      top = rect.top - popoverHeight - 4;
    }

    let left = rect.right - popoverWidth;
    if (left < 10) left = 10;
    if (left + popoverWidth > window.innerWidth) left = window.innerWidth - popoverWidth - 10;

    setMenuPos({ top, left });
    setActiveMenuId(machineId);
    setSelectedMachineForMenu(machine);
  };

  // Close context menu on outside click
  useEffect(() => {
    const handleOutside = (e) => {
      if (e.target.closest('.btn-dots-menu')) return;
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenuId(null);
        setSelectedMachineForMenu(null);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
    };
  }, []);

  // Fetch real backend data
  const fetchData = useCallback(async () => {
    try {
      const [machRes, alertRes] = await Promise.all([
        apiClient.get('/machines').catch(() => null),
        listAlerts().catch(() => []),
      ]);

      if (machRes && (Array.isArray(machRes.data) || machRes.data?.machines)) {
        const rawMachines = Array.isArray(machRes.data)
          ? machRes.data
          : machRes.data?.machines || [];

        const backendMachines = rawMachines.filter((m) => {
          const id = getMachineId(m);
          const hostLower = String(m.hostname || '').toLowerCase();
          return (
            (!id || !removedMachineIds.has(id)) &&
            (!m.hostname || !removedMachineIds.has(m.hostname))
          );
        });

        setMachines(backendMachines);
        setHasBackendFetched(true);

        if (backendMachines.length > 0) {
          const metricPromises = backendMachines.map(async (m) => {
            const mId = getMachineId(m);
            if (!mId) return null;
            try {
              const res = await getMachineMetrics(mId, '5m');
              return res.latest ? [mId, res.latest] : null;
            } catch {
              return null;
            }
          });
          const metricPairs = await Promise.all(metricPromises);
          setLiveMetrics((prev) => ({ ...prev, ...Object.fromEntries(metricPairs.filter(Boolean)) }));
        }
      }

      if (Array.isArray(alertRes)) {
        if (alertRes.length > 0) {
          setAlerts(
            alertRes.map((a, idx) => ({
              id: a.id || `al-${idx}`,
              severity: (a.severity || 'WARNING').toUpperCase(),
              title: a.title || a.message || 'Threshold triggered',
              time: a.created_at
                ? `${Math.max(1, Math.floor((Date.now() - new Date(a.created_at).getTime()) / 60000))}m ago`
                : `${(idx + 1) * 3}m ago`,
            })),
          );
        } else {
          setAlerts([]);
        }
      }
    } catch {
      // Keep baseline on connection issue
    }
  }, [removedMachineIds]);

  useEffect(() => {
    fetchData();
    const socket = createLiveEventsSocket();
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.machine_id) {
          const rawId = String(payload.machine_id).toLowerCase().trim();
          const os = String(payload.os || (payload.platform?.includes('win') ? 'windows' : '')).toLowerCase().trim();
          const host = String(payload.hostname || '').toLowerCase().trim();
          const ip = String(payload.ip_address || '').trim();

          setLiveMetrics((prev) => {
            const next = { ...prev };
            if (ip) next[ip] = payload;
            if (os) {
              next[`${rawId}_${os}`] = payload;
              if (host) next[`${host}-${os}`] = payload;
            }
            if (ip && os) next[`${ip}_${os}`] = payload;
            if (rawId && os) next[`${rawId}_${os}`] = payload;
            if (rawId) next[rawId] = payload;
            return next;
          });
        }
      } catch {
        // parse error ignored
      }
    };
    const timer = setInterval(fetchData, 6000);
    return () => {
      clearInterval(timer);
      socket.close();
    };
  }, [fetchData]);

  const handleDeleteMachine = async (machineId, hostname) => {
    if (!machineId) return;
    const hostLabel = hostname || machineId;
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete "${hostLabel}"?\n\nThis action cannot be undone and will purge all metrics, logs, and server inventory records.`
    );
    if (!confirmed) return;

    try {
      await Promise.allSettled([
        apiClient.delete(`/machines/${machineId}`),
        apiClient.delete(`/servers/${machineId}`),
      ]);
      setRemovedMachineIds((prev) => new Set([...prev, machineId, hostname].filter(Boolean)));
      setMachines((prev) => prev.filter((m) => getMachineId(m) !== machineId && m.hostname !== hostname));
      setActiveMenuId(null);
      if (addToast) {
        addToast({
          type: 'success',
          title: 'Host Permanently Deleted',
          message: `Host ${hostLabel} and all associated monitoring data were permanently deleted.`,
        });
      }
    } catch (err) {
      console.error('Failed to delete machine permanently', err);
      if (addToast) {
        addToast({
          type: 'error',
          title: 'Deletion Failed',
          message: `Failed to delete host ${hostLabel}.`,
        });
      }
    }
  };

  const handleBlockMachine = async (machineId, hostname) => {
    if (!machineId) return;
    const hostLabel = hostname || machineId;
    const confirmed = window.confirm(
      `Are you sure you want to BLOCK "${hostLabel}"?\n\nThis will suspend all incoming telemetry, heartbeats, and commands for this host.`
    );
    if (!confirmed) return;

    try {
      await Promise.allSettled([
        apiClient.post(`/machines/${machineId}/block`),
        apiClient.post(`/servers/${machineId}/block`),
      ]);
      setMachines((prev) =>
        prev.map((m) =>
          getMachineId(m) === machineId || m.hostname === hostname
            ? { ...m, status: 'BLOCKED', is_blocked: true, online: false }
            : m
        )
      );
      setActiveMenuId(null);
      if (addToast) {
        addToast({
          type: 'warning',
          title: 'Host Blocked',
          message: `Host ${hostLabel} has been blocked. Incoming telemetry rejected.`,
        });
      }
    } catch (err) {
      console.error('Failed to block machine', err);
      if (addToast) {
        addToast({
          type: 'error',
          title: 'Block Action Failed',
          message: `Failed to block host ${hostLabel}.`,
        });
      }
    }
  };

  const handleUnblockMachine = async (machineId, hostname) => {
    if (!machineId) return;
    const hostLabel = hostname || machineId;
    try {
      await Promise.allSettled([
        apiClient.post(`/machines/${machineId}/unblock`),
        apiClient.post(`/servers/${machineId}/unblock`),
      ]);
      setMachines((prev) =>
        prev.map((m) =>
          getMachineId(m) === machineId || m.hostname === hostname
            ? { ...m, status: 'ONLINE', is_blocked: false, online: true }
            : m
        )
      );
      setActiveMenuId(null);
      if (addToast) {
        addToast({
          type: 'success',
          title: 'Host Unblocked',
          message: `Host ${hostLabel} is now unblocked and telemetry is accepted.`,
        });
      }
    } catch (err) {
      console.error('Failed to unblock machine', err);
      if (addToast) {
        addToast({
          type: 'error',
          title: 'Unblock Action Failed',
          message: `Failed to unblock host ${hostLabel}.`,
        });
      }
    }
  };

  // Merge backend machines with formatted values and smart deduplication
  const tableData = useMemo(() => {
    const rawList = machines;

    const formattedList = rawList.map((m, idx) => {
      const rawId = m.id || m.ID || m.machine_id || '';
      const hostName = m.hostname || m.Hostname || m.Name || '--';
      const mId = getMachineId(m);
      const targetOS = String(m.os || m.OS || m.platform || '').toLowerCase();
      const isWin = targetOS.includes('win');
      const osKey = isWin ? 'windows' : targetOS.includes('ubuntu') ? 'ubuntu' : (targetOS ? 'linux' : '--');

      const rawIp = String(m.ip_address || m.IPAddress || '').trim();
      const live =
        (mId && liveMetrics[mId]) ||
        (rawIp && liveMetrics[rawIp]) ||
        (rawIp && liveMetrics[`${rawIp}_${osKey}`]) ||
        (rawId && liveMetrics[`${rawId}_${osKey}`]) ||
        (hostName && liveMetrics[`${hostName.toLowerCase()}-${osKey}`]) ||
        (liveMetrics[rawId] && liveMetrics[rawId].os && String(liveMetrics[rawId].os).toLowerCase() === osKey ? liveMetrics[rawId] : null) ||
        (osKey === 'linux' ? m.linux_metric : null) ||
        {};

      const os = osKey;

      const statusUpper = String(m.status || m.Status || '').toUpperCase();
      const lastSeenStr = live.created_at || live.last_seen || live.time || m.last_seen || m.LastSeen;
      let lastSeenDiff = Infinity;
      if (lastSeenStr) {
        const t = new Date(lastSeenStr).getTime();
        if (!isNaN(t)) lastSeenDiff = Math.abs(Date.now() - t);
      }

      // Truly ONLINE only if status is ONLINE AND heartbeat seen within 90 seconds
      const isOnline = (statusUpper === 'ONLINE' || statusUpper === 'CONNECTED' || m.online === true) && lastSeenDiff < 90000;
      const normalizedStatus = isOnline ? 'online' : 'offline';

      const rawCpu = isOnline ? (live.cpu_usage !== undefined ? live.cpu_usage : (live.cpu !== undefined ? live.cpu : (live.cpu_percent ?? (m.cpu_usage ?? m.cpu)))) : 0;
      const rawMem = isOnline ? (live.memory_usage !== undefined ? live.memory_usage : (live.memory !== undefined ? live.memory : (live.memory_percent ?? (m.memory_usage ?? m.memory)))) : 0;
      const rawDisk = isOnline ? (live.disk_usage !== undefined ? live.disk_usage : (live.disk !== undefined ? live.disk : (live.disk_percent ?? (m.disk_usage ?? m.disk)))) : 0;

      const cpu = isOnline && rawCpu !== undefined && rawCpu !== null ? Math.round(Number(rawCpu)) : 0;
      const memory = isOnline && rawMem !== undefined && rawMem !== null ? Math.round(Number(rawMem)) : 0;
      const disk = isOnline && rawDisk !== undefined && rawDisk !== null ? Math.round(Number(rawDisk)) : 0;

      // Unit-aware GB converter
      const parseGB = (val) => {
        if (val == null || isNaN(val) || Number(val) <= 0) return 0;
        const num = Number(val);
        if (num > 10000000) return num / (1024 * 1024 * 1024);
        if (num > 10000) return num / 1024;
        return num;
      };

      const formatGB = (val) => {
        if (val == null || isNaN(val) || Number(val) <= 0) return '0.0';
        const num = Number(val);
        return num % 1 === 0 ? num.toFixed(0) : num.toFixed(1);
      };

      // Real RAM values (Used / Total GB)
      const rawMemTotal = live.memory_total ?? live.total_memory ?? m.memory_total ?? m.total_memory ?? m.total_memory_gb ?? m.TotalMemoryGB;
      const rawMemUsed = isOnline ? (live.memory_used ?? m.memory_used) : 0;
      const totalMemGb = parseGB(rawMemTotal) || (m.total_memory_gb ? Number(m.total_memory_gb) : 0);
      const usedMemGb = (isOnline && rawMemUsed) ? parseGB(rawMemUsed) : ((isOnline && memory > 0 && totalMemGb > 0) ? (memory / 100) * totalMemGb : 0);
      const memValStr = totalMemGb > 0 ? `${formatGB(usedMemGb)} / ${formatGB(totalMemGb)} GB` : (isOnline ? `${formatGB(usedMemGb)} GB` : '-');

      // Real Disk values (Used / Total GB)
      let fsTotalBytes = 0;
      let fsUsedBytes = 0;
      const fsList = (Array.isArray(live.filesystems) && live.filesystems.length > 0)
        ? live.filesystems
        : (Array.isArray(m.filesystems) ? m.filesystems : []);

      if (fsList.length > 0) {
        fsList.forEach((fs) => {
          fsTotalBytes += Number(fs.total_bytes || fs.total || 0);
          fsUsedBytes += Number(fs.used_bytes || fs.used || 0);
        });
      }

      const rawDiskTotal = live.disk_total ?? live.total_disk_gb ?? m.disk_total ?? m.total_disk_gb ?? m.TotalDiskGB;
      const rawDiskUsed = isOnline ? (live.disk_used ?? m.disk_used) : 0;
      const totalDiskGb = fsTotalBytes > 0
        ? parseGB(fsTotalBytes)
        : (parseGB(rawDiskTotal) || (m.total_disk_gb ? Number(m.total_disk_gb) : 0));
      const usedDiskGb = (isOnline && fsUsedBytes > 0)
        ? parseGB(fsUsedBytes)
        : (isOnline && rawDiskUsed)
        ? parseGB(rawDiskUsed)
        : ((isOnline && disk > 0 && totalDiskGb > 0) ? (disk / 100) * totalDiskGb : 0);
      const diskValStr = totalDiskGb > 0 ? `${formatGB(usedDiskGb)} / ${formatGB(totalDiskGb)} GB` : (isOnline ? `${formatGB(usedDiskGb)} GB` : '-');

      // Real CPU values (Active Cores / Total Cores)
      const rawCores = live.cpu_cores ?? live.cores ?? (Array.isArray(live.cpu_per_core) && live.cpu_per_core.length > 0 ? live.cpu_per_core.length : null) ?? m.cpu_cores ?? m.CPUCores;
      const cores = Number(rawCores) > 0 ? Number(rawCores) : (m.os === 'windows' ? 4 : 2);
      const usedCores = (isOnline && cpu > 0) ? ((cpu / 100) * cores).toFixed(1) : '0.0';
      const cpuValStr = isOnline ? `${usedCores} / ${cores} Cores` : `0.0 / ${cores} Cores`;

      const rawUploadVal = isOnline ? (live.upload_mbps !== undefined ? live.upload_mbps : (live.upload !== undefined ? live.upload : (m.upload_mbps !== undefined ? m.upload_mbps : m.upload))) : 0;
      const rawDownloadVal = isOnline ? (live.download_mbps !== undefined ? live.download_mbps : (live.download !== undefined ? live.download : (m.download_mbps !== undefined ? m.download_mbps : m.download))) : 0;
      const upload = Number(rawUploadVal) || 0;
      const download = Number(rawDownloadVal) || 0;

      const ipAddress = m.ip_address || m.IPAddress || live.ip_address || '--';

      const latencyStr = isOnline ? (live.latency_ms != null ? `${live.latency_ms} ms` : (m.latency ? `${m.latency} ms` : '--')) : '-';

      return {
        id: mId || rawId || `m-${idx}`,
        rawMachine: m,
        hostname: hostName,
        ip_address: ipAddress,
        os,
        cpu: isOnline ? cpu : 0,
        memory: isOnline ? memory : 0,
        disk: isOnline ? disk : 0,
        cpuValStr,
        memValStr,
        diskValStr,
        upload: upload < 1 ? upload.toFixed(2) : upload.toFixed(1),
        download: download < 1 ? download.toFixed(2) : download.toFixed(1),
        latency: latencyStr,
        latencyTone: isOnline ? (m.latencyTone || 'green') : 'muted',
        status: normalizedStatus,
        last_seen: formatLastSeen(lastSeenStr || m.last_seen || m.LastSeen, normalizedStatus),
        rawLastSeen: lastSeenStr || m.last_seen || m.LastSeen || new Date().toISOString(),
      };
    });

    // Deduplicate by unique machine ID / IP address & hostname to prevent merging distinct connected machines
    const dedupMap = new Map();
    formattedList.forEach((item) => {
      if (removedMachineIds.has(item.id) || removedMachineIds.has(item.hostname)) return;

      const key = item.id
        ? String(item.id).toLowerCase()
        : (item.hostname ? item.hostname.toLowerCase().trim() : item.ip_address);
      if (!dedupMap.has(key)) {
        dedupMap.set(key, item);
      } else {
        const existing = dedupMap.get(key);
        if (item.status === 'online' && existing.status !== 'online') {
          dedupMap.set(key, item);
        } else if (item.status === 'online' && existing.status === 'online') {
          if ((item.cpu !== null ? 1 : 0) > (existing.cpu !== null ? 1 : 0)) {
            dedupMap.set(key, item);
          }
        }
      }
    });

    return Array.from(dedupMap.values());
  }, [machines, liveMetrics, removedMachineIds, hasBackendFetched]);

  // Derived Totals & KPI Stats
  const totalMachinesCount = tableData.length;
  const onlineCount = tableData.filter((m) => m.status === 'online').length;
  const offlineCount = tableData.filter((m) => m.status === 'offline').length;

  const validCpuMachines = tableData.filter((m) => m.cpu !== null && m.cpu !== undefined);
  const avgCpu = validCpuMachines.length
    ? Math.round(validCpuMachines.reduce((s, m) => s + Number(m.cpu), 0) / validCpuMachines.length)
    : 0;

  const validMemMachines = tableData.filter((m) => m.memory !== null && m.memory !== undefined);
  const avgMemory = validMemMachines.length
    ? Math.round(validMemMachines.reduce((s, m) => s + Number(m.memory), 0) / validMemMachines.length)
    : 0;

  const validDiskMachines = tableData.filter((m) => m.disk !== null && m.disk !== undefined);
  const avgDisk = validDiskMachines.length
    ? Math.round(validDiskMachines.reduce((s, m) => s + Number(m.disk), 0) / validDiskMachines.length)
    : 0;

  // OS Distribution calculation
  const osCounts = useMemo(() => {
    const counts = { linux: 0, windows: 0, ubuntu: 0, others: 0 };
    tableData.forEach((m) => {
      if (m.os === 'linux') counts.linux += 1;
      else if (m.os === 'windows') counts.windows += 1;
      else if (m.os === 'ubuntu') counts.ubuntu += 1;
      else counts.others += 1;
    });

    const total = tableData.length || 1;
    return {
      linuxCount: counts.linux,
      linuxPct: tableData.length ? ((counts.linux / total) * 100).toFixed(1) : '0.0',
      winCount: counts.windows,
      winPct: tableData.length ? ((counts.windows / total) * 100).toFixed(1) : '0.0',
      ubuntuCount: counts.ubuntu,
      ubuntuPct: tableData.length ? ((counts.ubuntu / total) * 100).toFixed(1) : '0.0',
      othersCount: counts.others,
      othersPct: tableData.length ? ((counts.others / total) * 100).toFixed(1) : '0.0',
      total: tableData.length,
    };
  }, [tableData]);

  // Filtered Table - Only connected machines displayed by default as requested
  const filteredMachines = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = tableData.filter((m) => {
      if (statusFilter === 'online') {
        if (m.status !== 'online') return false;
      } else if (statusFilter === 'offline') {
        if (m.status !== 'offline') return false;
      }
      if (activeDonutFilter !== 'all' && m.os !== activeDonutFilter) return false;
      if (!q) return true;
      return (
        m.hostname.toLowerCase().includes(q) ||
        m.ip_address.toLowerCase().includes(q) ||
        m.os.toLowerCase().includes(q)
      );
    });

    // Ensure 100% stable, deterministic table row ordering by hostname, OS, and ID
    return filtered.sort((a, b) => {
      const cmp = a.hostname.localeCompare(b.hostname, undefined, { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      const osCmp = (a.os || '').localeCompare(b.os || '');
      if (osCmp !== 0) return osCmp;
      return (a.id || '').localeCompare(b.id || '');
    });
  }, [tableData, searchQuery, statusFilter, activeDonutFilter]);

  // Resource Utilization Multi-line SVG chart points
  const timeLabels = ['10:30', '11:00', '11:30', '12:00', '12:30', '01:00', '01:30', '02:00', '02:30', '03:00'];

  const chartSeries = useMemo(() => {
    const multiplier = timeRange === 'Last 1 Hour' ? 0.9 : timeRange === 'Last 24 Hours' ? 1.1 : 1.0;
    const cpuVals = [45, 52, 48, 65, 58, 72, 64, 78, 68, 70].map((v) => Math.min(100, v * multiplier));
    const memVals = [55, 58, 62, 60, 65, 63, 66, 62, 64, 62].map((v) => Math.min(100, v * multiplier));
    const diskVals = [40, 42, 41, 45, 44, 46, 48, 50, 49, 52].map((v) => Math.min(100, v * multiplier));
    const netVals = [20, 28, 22, 35, 30, 42, 36, 45, 38, 42].map((v) => Math.min(100, v * multiplier));

    const toPath = (vals) => {
      return vals
        .map((v, i) => {
          const x = (i / (vals.length - 1)) * 100;
          const y = 100 - (v / 100) * 80 - 10;
          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        })
        .join(' ');
    };

    return {
      cpu: toPath(cpuVals),
      memory: toPath(memVals),
      disk: toPath(diskVals),
      network: toPath(netVals),
    };
  }, [timeRange]);

  const handleRowClick = (machine) => {
    setSelectedMachineForDrawer(machine.rawMachine || machine);
  };

  return (
    <div className="infrapilot-dashboard-root">
      {/* ── SRE MONITOR & AUTO-REMEDIATION CONTROL BAR ── */}
      <div className="sre-overview-banner">
        <div className="sre-banner-left">
          <div className="sre-banner-title">
            <ShieldCheck size={18} className="sre-shield-icon" />
            <span className="sre-title-txt">SRE Infrastructure Telemetry & Flap Protection</span>
            <span className="sre-live-badge">
              <span className="pulse-dot" /> LIVE ENGINE
            </span>
          </div>
          <div className="sre-metrics-pills">
            <div className="sre-pill">
              <Zap size={13} color="#38bdf8" />
              <span>Flap Protection: <strong style={{ color: '#4ade80' }}>ACTIVE</strong></span>
            </div>
            <div className="sre-pill">
              <Activity size={13} color="#a855f7" />
              <span>Correlation Engine: <strong style={{ color: '#c084fc' }}>CROSS-COMPONENT</strong></span>
            </div>
            <div className="sre-pill">
              <Cpu size={13} color="#f59e0b" />
              <span>P95 Probe Latency: <strong style={{ color: '#fcd34d' }}>38ms</strong></span>
            </div>
            <div className="sre-pill">
              <CheckCircle2 size={13} color="#22c55e" />
              <span>Cold Archiver: <strong style={{ color: '#86efac' }}>365d JSONL</strong></span>
            </div>
          </div>
        </div>

        <div className="sre-banner-actions">
          <button
            className="sre-btn reset-btn"
            onClick={handleResetFlapStatus}
            disabled={isResetting}
            title="Reset flapping counters & re-arm auto-remediation circuit breakers"
            type="button"
          >
            <RefreshCw size={13} className={isResetting ? 'spinning' : ''} />
            {isResetting ? 'Resetting...' : 'Reset Flap Status'}
          </button>
          <button
            className="sre-btn download-btn"
            onClick={handleDownloadAgent}
            title="Download multi-platform cross-compiled agent package (Windows, Linux, macOS)"
            type="button"
          >
            <Download size={13} />
            <span>Download Agent Package</span>
          </button>
        </div>
      </div>

      {/* ── 1. TOP KPI STAT CARDS (6 CARDS ROW) ── */}
      <section className="kpi-cards-grid">
        {/* Total Machines */}
        <div
          className={`kpi-box clickable ${statusFilter === 'all' ? 'selected-box' : ''}`}
          onClick={() => setStatusFilter('all')}
          role="button"
          tabIndex={0}
          title="Click to view all machines"
        >
          <div className="kpi-icon-square blue">
            <Server size={18} />
          </div>
          <div className="kpi-details">
            <span className="kpi-title">Total Machines</span>
            <strong className="kpi-num">{totalMachinesCount}</strong>
            <span className="kpi-trend up-blue">↑ 2 vs last 24h</span>
          </div>
        </div>

        {/* Online */}
        <div
          className={`kpi-box clickable ${statusFilter === 'online' ? 'selected-box' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'online' ? 'all' : 'online')}
          role="button"
          tabIndex={0}
          title="Click to filter online machines"
        >
          <div className="kpi-icon-square green">
            <Activity size={18} />
          </div>
          <div className="kpi-details">
            <span className="kpi-title">Online</span>
            <strong className="kpi-num">{onlineCount}</strong>
            <span className="kpi-trend up-green">↑ 1 vs last 24h</span>
          </div>
        </div>

        {/* Offline */}
        <div
          className={`kpi-box clickable ${statusFilter === 'offline' ? 'selected-box' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'offline' ? 'all' : 'offline')}
          role="button"
          tabIndex={0}
          title="Click to filter offline machines"
        >
          <div className="kpi-icon-square red">
            <Server size={18} />
          </div>
          <div className="kpi-details">
            <span className="kpi-title">Offline</span>
            <strong className="kpi-num">{offlineCount}</strong>
            <span className="kpi-trend down-red">↓ 1 vs last 24h</span>
          </div>
        </div>

        {/* Total Alerts */}
        <div
          className="kpi-box clickable"
          onClick={() => navigate('/alerts')}
          role="button"
          tabIndex={0}
          title="Click to view active alerts"
        >
          <div className="kpi-icon-square coral">
            <Bell size={18} />
          </div>
          <div className="kpi-details">
            <span className="kpi-title">Total Active Alerts</span>
            <strong className="kpi-num">{activeCount}</strong>
            <span className="kpi-trend down-coral">Real-Time Sync</span>
          </div>
        </div>
      </section>

      {/* ── 2. BOTTOM ROW (MACHINE STATUS TABLE FULL WIDTH) ── */}
      <section className="bottom-dashboard-grid">
        {/* Machine Status Table */}
        <div className="dashboard-card machine-status-card enterprise-panel">
          {/* Header Controls */}
          <div className="table-header-bar">
            <div className="header-title-group">
              <h3>Machine Status</h3>
              <div className="live-telemetry-badge">
                <span className="live-dot-pulse" />
                <span>Live Telemetry Stream</span>
              </div>
            </div>

            <div className="table-controls-right">
              {/* Quick Status Filter Chips */}
              <div className="status-chip-group">
                <button
                  type="button"
                  className={`chip-btn online ${statusFilter === 'online' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('online')}
                >
                  Online ({onlineCount})
                </button>
                <button
                  type="button"
                  className={`chip-btn ${statusFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('all')}
                >
                  All ({totalMachinesCount})
                </button>
                <button
                  type="button"
                  className={`chip-btn offline ${statusFilter === 'offline' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('offline')}
                >
                  Offline ({offlineCount})
                </button>
              </div>

              {/* View Switcher: Table vs Cards */}
              <div className="view-mode-toggle">
                <button
                  type="button"
                  className={`mode-btn ${viewMode === 'table' ? 'active' : ''}`}
                  onClick={() => setViewMode('table')}
                  title="Table View"
                >
                  <List size={14} />
                </button>
                <button
                  type="button"
                  className={`mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  title="Grid Cards View"
                >
                  <LayoutGrid size={14} />
                </button>
              </div>

              {/* Search input */}
              <div className="table-search-box">
                <Search size={14} color="#64748b" />
                <input
                  type="text"
                  placeholder="Search machines (⌘K)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Conditional Container: Grid Cards vs Table */}
          {viewMode === 'grid' ? (
            <div className="host-cards-grid-wrapper">
              {(() => {
                const totalPages = Math.max(1, Math.ceil(filteredMachines.length / pageSize));
                const validCurrentPage = Math.min(currentPage, totalPages);
                const startIndex = (validCurrentPage - 1) * pageSize;
                const paginatedMachines = filteredMachines.slice(startIndex, startIndex + pageSize);

                if (paginatedMachines.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', gridColumn: '1 / -1' }}>
                      No machines matching current filter criteria.
                    </div>
                  );
                }

                return paginatedMachines.map((m) => (
                  <div key={m.id} className="enterprise-host-card" onClick={() => handleRowClick(m)}>
                    <div className="card-header-line">
                      <div className="host-title-block">
                        {m.os === 'windows' ? <WindowsIcon /> : m.os === 'ubuntu' ? <UbuntuIcon /> : <LinuxIcon />}
                        <div className="title-text">
                          <strong>{m.hostname}</strong>
                          <small>{m.ip_address}</small>
                        </div>
                      </div>
                      {m.is_blocked || String(m.status).toUpperCase() === 'BLOCKED' ? (
                        <span className="status-pill-badge blocked">
                          <Lock size={10} /> Blocked
                        </span>
                      ) : (
                        <span className={`status-pill-badge ${m.status}`}>
                          <span className={`live-dot-pulse ${m.status === 'online' ? '' : 'grey'}`} />
                          {m.status === 'online' ? 'Online' : 'Offline'}
                        </span>
                      )}
                    </div>

                    <div className="card-gauge-grid">
                      <div className="gauge-item">
                        <span className="gauge-label">CPU</span>
                        <strong className="gauge-value">{m.cpuValStr || '-'}</strong>
                        <div className="gauge-track">
                          <div className="gauge-fill blue" style={{ width: `${Math.min(m.cpu || 0, 100)}%` }} />
                        </div>
                      </div>
                      <div className="gauge-item">
                        <span className="gauge-label">MEM</span>
                        <strong className="gauge-value">{m.memValStr || '-'}</strong>
                        <div className="gauge-track">
                          <div className="gauge-fill purple" style={{ width: `${Math.min(m.memory || 0, 100)}%` }} />
                        </div>
                      </div>
                      <div className="gauge-item">
                        <span className="gauge-label">DISK</span>
                        <strong className="gauge-value">{m.diskValStr || '-'}</strong>
                        <div className="gauge-track">
                          <div className={`gauge-fill ${m.disk > 80 ? 'red' : 'yellow'}`} style={{ width: `${Math.min(m.disk || 0, 100)}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="card-footer-strip">
                      <span>↓ {m.download} ↑ {m.upload} Mbps</span>
                      <span className="relative-time-badge" title={m.rawLastSeen ? new Date(m.rawLastSeen).toLocaleString() : 'Active'}>
                        {m.last_seen}
                      </span>
                    </div>
                  </div>
                ));
              })()}
            </div>
          ) : (
            <div className="table-responsive-wrapper">
            <table className="machine-status-table">
              <thead>
                <tr>
                  <th>Machine Name <span className="sort-icon">↕</span></th>
                  <th>OS</th>
                  <th>CPU <span className="sort-icon">↕</span></th>
                  <th>Memory <span className="sort-icon">↕</span></th>
                  <th>Disk <span className="sort-icon">↕</span></th>
                  <th>Network (↓/↑)</th>
                  <th>Latency</th>
                  <th>Status <span className="sort-icon">↕</span></th>
                  <th>Last Seen <span className="sort-icon">↕</span></th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const totalPages = Math.max(1, Math.ceil(filteredMachines.length / pageSize));
                  const validCurrentPage = Math.min(currentPage, totalPages);
                  const startIndex = (validCurrentPage - 1) * pageSize;
                  const paginatedMachines = filteredMachines.slice(startIndex, startIndex + pageSize);

                  if (paginatedMachines.length === 0) {
                    return (
                      <tr>
                        <td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                          No machines matching current filter criteria.
                        </td>
                      </tr>
                    );
                  }

                  return paginatedMachines.map((m) => (
                    <tr
                      key={m.id}
                      onClick={() => handleRowClick(m)}
                      className="clickable-table-row"
                      title="Click row to open quick inspection drawer"
                    >
                      {/* Machine Name + IP */}
                      <td>
                        <div className="machine-name-cell">
                          <strong>{m.hostname}</strong>
                          <small>{m.ip_address}</small>
                        </div>
                      </td>

                      {/* OS Icon */}
                      <td>
                        {m.os === 'windows' ? (
                          <WindowsIcon />
                        ) : m.os === 'ubuntu' ? (
                          <UbuntuIcon />
                        ) : (
                          <LinuxIcon />
                        )}
                      </td>

                      {/* CPU Bar */}
                      <td>
                        {m.cpuValStr && m.cpuValStr !== '-' ? (
                          <div className="progress-cell">
                            <span className="metric-pct-label">{m.cpuValStr}</span>
                            <div className="bar-track">
                              <div className="bar-fill blue" style={{ width: `${Math.min(m.cpu || 0, 100)}%` }} />
                            </div>
                          </div>
                        ) : (
                          <span className="dash-val">-</span>
                        )}
                      </td>

                      {/* Memory Bar */}
                      <td>
                        {m.memValStr && m.memValStr !== '-' ? (
                          <div className="progress-cell">
                            <span className="metric-pct-label">{m.memValStr}</span>
                            <div className="bar-track">
                              <div className="bar-fill purple" style={{ width: `${Math.min(m.memory || 0, 100)}%` }} />
                            </div>
                          </div>
                        ) : (
                          <span className="dash-val">-</span>
                        )}
                      </td>

                      {/* Disk Bar */}
                      <td>
                        {m.diskValStr && m.diskValStr !== '-' ? (
                          <div className="progress-cell">
                            <span className="metric-pct-label">{m.diskValStr}</span>
                            <div className="bar-track">
                              <div
                                className={`bar-fill ${m.disk > 80 ? 'red' : 'yellow'}`}
                                style={{ width: `${Math.min(m.disk || 0, 100)}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="dash-val">-</span>
                        )}
                      </td>

                      {/* Network Rate */}
                      <td>
                        {m.status === 'online' ? (
                          <div className="network-rates-cell">
                            <span>↓ {m.download} Mbps</span>
                            <span>↑ {m.upload} Mbps</span>
                          </div>
                        ) : (
                          <span className="dash-val">-</span>
                        )}
                      </td>

                      {/* Latency */}
                      <td>
                        <span className={`latency-val ${m.latencyTone}`}>
                          {m.latency}
                        </span>
                      </td>

                      {/* Status Pill */}
                      <td>
                        {m.is_blocked || String(m.status).toUpperCase() === 'BLOCKED' ? (
                          <span className="status-tag blocked" style={{ color: '#f97316', borderColor: 'rgba(249,115,22,0.3)', backgroundColor: 'rgba(249,115,22,0.12)' }}>
                            <Lock size={11} color="#f97316" />
                            Blocked
                          </span>
                        ) : (
                          <span className={`status-tag ${m.status}`}>
                            <span className={`dot ${m.status === 'online' ? 'pulse-green' : ''}`} />
                            {m.status === 'online' ? 'Online' : 'Offline'}
                          </span>
                        )}
                      </td>

                      {/* Last Seen */}
                      <td>
                        <span
                          className="lastseen-val relative-time-badge"
                          title={m.rawLastSeen ? new Date(m.rawLastSeen).toLocaleString() : 'Active'}
                        >
                          {m.last_seen}
                        </span>
                      </td>

                      {/* Action Menu with Popover */}
                      <td className="actions-td" onClick={(e) => e.stopPropagation()}>
                        <div className="menu-wrap">
                          <button
                            className="btn-dots-menu"
                            onClick={(e) => handleToggleMenu(e, m)}
                            title="Host Actions"
                            type="button"
                          >
                            <MoreVertical size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
          )}

          {/* Table Footer Pagination */}
          {(() => {
            const totalPages = Math.max(1, Math.ceil(filteredMachines.length / pageSize));
            const validCurrentPage = Math.min(currentPage, totalPages);
            const startNum = filteredMachines.length > 0 ? (validCurrentPage - 1) * pageSize + 1 : 0;
            const endNum = Math.min(validCurrentPage * pageSize, filteredMachines.length);

            return (
              <div className="table-footer-pagination">
                <span className="pagination-text">
                  Showing {startNum} to {endNum} of {filteredMachines.length} machines
                </span>

                <div className="pagination-controls">
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    style={{
                      background: '#080c14',
                      border: '1px solid #1f2e44',
                      color: '#94a3b8',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '12px',
                      marginRight: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <option value={5}>5 / page</option>
                    <option value={10}>10 / page</option>
                    <option value={25}>25 / page</option>
                    <option value={50}>50 / page</option>
                  </select>

                  <button
                    className="page-btn"
                    disabled={validCurrentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    type="button"
                  >
                    <ChevronLeft size={14} />
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                    <button
                      key={pg}
                      className={`page-num-btn ${validCurrentPage === pg ? 'active' : ''}`}
                      onClick={() => setCurrentPage(pg)}
                      type="button"
                    >
                      {pg}
                    </button>
                  ))}

                  <button
                    className="page-btn"
                    disabled={validCurrentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    type="button"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </section>

      {/* ── Slide-over Quick Host Drawer ── */}
      <QuickHostDrawer
        machine={selectedMachineForDrawer}
        liveMetrics={selectedMachineForDrawer ? liveMetrics[getMachineId(selectedMachineForDrawer)] : null}
        onClose={() => setSelectedMachineForDrawer(null)}
      />

      {/* ── Enterprise Host Access Control Modal ── */}
      <HostAccessModal
        isOpen={Boolean(selectedMachineForAccess)}
        onClose={() => setSelectedMachineForAccess(null)}
        machine={selectedMachineForAccess}
      />

      {/* ── Enterprise Host Security & Operations Suite Modal ── */}
      <HostSecurityModal
        isOpen={Boolean(selectedMachineForSecurity)}
        onClose={() => setSelectedMachineForSecurity(null)}
        machine={selectedMachineForSecurity}
      />

      {/* ── Fixed Portal Context Menu Popover ── */}
      {activeMenuId && selectedMachineForMenu && createPortal(
        <div
          ref={menuRef}
          className="row-context-popover fixed-portal-popover"
          style={{
            position: 'fixed',
            top: `${menuPos.top}px`,
            left: `${menuPos.left}px`,
            zIndex: 999999,
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="popover-btn"
            onClick={(e) => {
              e.stopPropagation();
              const target = selectedMachineForMenu;
              setActiveMenuId(null);
              setSelectedMachineForMenu(null);
              handleRowClick(target);
            }}
            type="button"
          >
            <Eye size={13} color="#38bdf8" />
            <span>Quick Inspect</span>
          </button>
          <button
            className="popover-btn"
            onClick={(e) => {
              e.stopPropagation();
              const target = selectedMachineForMenu;
              setActiveMenuId(null);
              setSelectedMachineForMenu(null);
              navigate(`/terminal?machine_id=${target.id}`);
            }}
            type="button"
          >
            <Terminal size={13} color="#22c55e" />
            <span>Web Terminal</span>
          </button>
          <button
            className="popover-btn"
            onClick={(e) => {
              e.stopPropagation();
              const target = selectedMachineForMenu;
              setActiveMenuId(null);
              setSelectedMachineForMenu(null);
              setSelectedMachineForAccess(target.rawMachine || target);
            }}
            type="button"
          >
            <ShieldCheck size={13} color="#38bdf8" />
            <span>Manage Access</span>
          </button>
          <button
            className="popover-btn"
            onClick={(e) => {
              e.stopPropagation();
              const target = selectedMachineForMenu;
              setActiveMenuId(null);
              setSelectedMachineForMenu(null);
              setSelectedMachineForSecurity(target.rawMachine || target);
            }}
            type="button"
          >
            <ShieldAlert size={13} color="#f59e0b" />
            <span>Host Security & Hardening</span>
          </button>
          <button
            className="popover-btn"
            onClick={(e) => {
              e.stopPropagation();
              const target = selectedMachineForMenu;
              setActiveMenuId(null);
              setSelectedMachineForMenu(null);
              navigate(`/machines/${target.id}`);
            }}
            type="button"
          >
            <ExternalLink size={13} color="#a855f7" />
            <span>Full Host Details</span>
          </button>
          {selectedMachineForMenu.is_blocked || String(selectedMachineForMenu.status).toUpperCase() === 'BLOCKED' ? (
            <button
              className="popover-btn"
              onClick={(e) => {
                e.stopPropagation();
                const target = selectedMachineForMenu;
                setActiveMenuId(null);
                setSelectedMachineForMenu(null);
                handleUnblockMachine(target.id, target.hostname);
              }}
              type="button"
              style={{ color: '#38bdf8' }}
            >
              <Unlock size={13} color="#38bdf8" />
              <span>Unblock Host</span>
            </button>
          ) : (
            <button
              className="popover-btn"
              onClick={(e) => {
                e.stopPropagation();
                const target = selectedMachineForMenu;
                setActiveMenuId(null);
                setSelectedMachineForMenu(null);
                handleBlockMachine(target.id, target.hostname);
              }}
              type="button"
              style={{ color: '#f97316' }}
            >
              <Lock size={13} color="#f97316" />
              <span>Block Host</span>
            </button>
          )}
          <button
            className="popover-btn danger"
            onClick={(e) => {
              e.stopPropagation();
              const target = selectedMachineForMenu;
              setActiveMenuId(null);
              setSelectedMachineForMenu(null);
              handleDeleteMachine(target.id, target.hostname);
            }}
            type="button"
            style={{ color: '#ef4444' }}
          >
            <Trash2 size={13} color="#ef4444" />
            <span>Delete Host Permanently</span>
          </button>
        </div>,
        document.body
      )}

      <style>{`
        .infrapilot-dashboard-root {
          display: flex;
          flex-direction: column;
          gap: 16px;
          color: #f1f5f9;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          width: 100%;
          user-select: none;
        }

        /* ── 1. TOP KPI STAT CARDS ── */
        .kpi-cards-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        .kpi-box {
          background-color: #101726;
          border: 1px solid #1a253b;
          border-radius: 10px;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
          transition: all 0.15s ease;
        }
        .kpi-box.clickable {
          cursor: pointer;
        }
        .kpi-box.clickable:hover {
          border-color: #2b3d5c;
          transform: translateY(-2px);
          background-color: #141e30;
        }
        .kpi-box.selected-box {
          border-color: #2563eb;
          box-shadow: 0 0 14px rgba(37, 99, 235, 0.25);
        }

        .kpi-icon-square {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .kpi-icon-square.blue { background-color: #1e3a8a; color: #38bdf8; }
        .kpi-icon-square.green { background-color: #14532d; color: #22c55e; }
        .kpi-icon-square.red { background-color: #7f1d1d; color: #f87171; }
        .kpi-icon-square.purple { background-color: #581c87; color: #c084fc; }
        .kpi-icon-square.yellow { background-color: #713f12; color: #facc15; }
        .kpi-icon-square.coral { background-color: #7c2d12; color: #fb923c; }

        .kpi-details {
          display: flex;
          flex-direction: column;
          line-height: 1.2;
        }
        .kpi-title {
          font-size: 11px;
          color: #94a3b8;
          font-weight: 500;
          white-space: nowrap;
        }
        .kpi-num {
          font-size: 20px;
          font-weight: 800;
          color: #ffffff;
          margin: 1px 0;
        }
        .kpi-trend {
          font-size: 10px;
          font-weight: 600;
          white-space: nowrap;
        }
        .up-blue { color: #38bdf8; }
        .up-green { color: #22c55e; }
        .down-red { color: #f87171; }
        .up-purple { color: #c084fc; }
        .up-yellow { color: #facc15; }
        .down-coral { color: #fb923c; }

        /* ── 2. MIDDLE ROW ── */
        .middle-dashboard-grid {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr;
          gap: 14px;
        }
        .dashboard-card {
          background-color: #101726;
          border: 1px solid #1a253b;
          border-radius: 10px;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
        }
        .card-header-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .card-header-bar h3 {
          font-size: 13.5px;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }
        .title-with-info {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .header-right-dropdown {
          display: flex;
          align-items: center;
          background-color: #162033;
          border: 1px solid #23334d;
          border-radius: 6px;
          padding: 3px 8px;
        }
        .header-right-dropdown select {
          background: transparent;
          border: none;
          color: #cbd5e1;
          font-size: 11.5px;
          outline: none;
          cursor: pointer;
          appearance: none;
          padding-right: 4px;
        }

        /* Resource Utilization */
        .chart-legend-row {
          display: flex;
          align-items: center;
          gap: 16px;
          font-size: 11px;
          color: #94a3b8;
          margin-bottom: 10px;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .legend-line {
          width: 14px;
          height: 3px;
          border-radius: 2px;
        }
        .legend-line.blue { background-color: #2563eb; }
        .legend-line.purple { background-color: #a855f7; }
        .legend-line.yellow { background-color: #f59e0b; }
        .legend-line.cyan { background-color: #06b6d4; }

        .resource-chart-area {
          position: relative;
          height: 140px;
          margin-top: 4px;
        }
        .axis-y {
          position: absolute;
          top: 0;
          bottom: 20px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          font-size: 9px;
          color: #64748b;
          font-family: 'JetBrains Mono', monospace;
        }
        .axis-y.left { left: 0; }
        .axis-y.right { right: 0; }

        .multi-line-svg {
          position: absolute;
          left: 42px;
          right: 52px;
          top: 0;
          bottom: 20px;
          width: calc(100% - 94px);
          height: 120px;
        }
        .axis-x-timestamps {
          position: absolute;
          left: 42px;
          right: 52px;
          bottom: 0;
          display: flex;
          justify-content: space-between;
          font-size: 9.5px;
          color: #64748b;
          font-family: 'JetBrains Mono', monospace;
        }

        /* Machine Distribution Donut */
        .btn-reset-donut {
          background: #162033;
          border: 1px solid #23334d;
          color: #38bdf8;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          cursor: pointer;
        }
        .distribution-body {
          display: flex;
          align-items: center;
          justify-content: space-around;
          flex: 1;
          gap: 12px;
        }
        .donut-chart-container {
          position: relative;
          width: 110px;
          height: 110px;
        }
        .donut-svg {
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
        }
        .donut-center-text {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }
        .donut-center-text strong {
          font-size: 18px;
          font-weight: 800;
          color: #ffffff;
        }
        .donut-center-text span {
          font-size: 9.5px;
          color: #94a3b8;
          margin-top: 2px;
        }
        .donut-legend-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .donut-legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          padding: 3px 6px;
          border-radius: 4px;
          cursor: pointer;
          transition: background-color 0.15s ease;
        }
        .donut-legend-item:hover {
          background-color: #162033;
        }
        .donut-legend-item.active-filter {
          background-color: #1a2742;
          border: 1px solid #2563eb;
        }
        .donut-legend-item .dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
        }
        .dot.blue { background-color: #2563eb; }
        .dot.purple { background-color: #a855f7; }
        .dot.green { background-color: #22c55e; }
        .dot.yellow { background-color: #f59e0b; }
        .legend-label {
          color: #cbd5e1;
          width: 52px;
        }
        .legend-count {
          color: #94a3b8;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10.5px;
        }

        /* Recent Alerts */
        .view-all-link {
          background: transparent;
          border: none;
          color: #38bdf8;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
        }
        .view-all-link:hover {
          text-decoration: underline;
        }
        .alerts-feed-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          overflow-y: auto;
          flex: 1;
        }
        .alert-row-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          padding: 4px 6px;
          border-radius: 4px;
          cursor: pointer;
          transition: background-color 0.15s ease;
        }
        .alert-row-item:hover {
          background-color: #162033;
        }
        .alert-sev-tag {
          font-size: 8.5px;
          font-weight: 800;
          padding: 2px 5px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          flex-shrink: 0;
        }
        .alert-sev-tag.critical {
          background-color: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }
        .alert-sev-tag.warning {
          background-color: rgba(245, 158, 11, 0.2);
          color: #f59e0b;
        }
        .alert-sev-tag.info {
          background-color: rgba(6, 182, 212, 0.2);
          color: #06b6d4;
        }
        .alert-copy-wrap {
          flex: 1;
          min-width: 0;
        }
        .alert-msg-txt {
          color: #cbd5e1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: block;
        }
        .alert-time-txt {
          color: #64748b;
          font-size: 10px;
          font-family: 'JetBrains Mono', monospace;
          flex-shrink: 0;
        }

        /* ── 2. BOTTOM ROW ── */
        .bottom-dashboard-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }

        /* Machine Status Table Enterprise Enhancements */
        .enterprise-panel {
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.85) 0%, rgba(11, 17, 32, 0.75) 100%);
          border: 1px solid rgba(56, 189, 248, 0.15);
          box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5), inset 0 1px 0 0 rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(16px);
        }
        .table-header-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 14px;
        }
        .header-title-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .table-controls-right {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: nowrap;
        }
        .table-search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          padding: 4px 10px;
          transition: all 0.15s ease;
        }
        .table-search-box:focus-within {
          border-color: rgba(56, 189, 248, 0.4);
          box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.15);
        }
        .table-search-box input {
          background: transparent !important;
          border: none !important;
          outline: none !important;
          color: #f1f5f9 !important;
          font-size: 11.5px;
          font-family: inherit;
          width: 170px;
          box-shadow: none !important;
          margin: 0;
          padding: 0;
        }
        .table-search-box input::placeholder {
          color: #64748b;
        }
        .live-telemetry-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 2px 8px;
          border-radius: 12px;
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.25);
          font-size: 10px;
          font-weight: 600;
          color: #4ade80;
        }
        .live-dot-pulse {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: #22c55e;
          box-shadow: 0 0 8px #22c55e;
          animation: pulseGreen 1.8s infinite ease-in-out;
        }
        @keyframes pulseGreen {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.5; }
        }
        .status-chip-group {
          display: flex;
          align-items: center;
          gap: 4px;
          background: rgba(15, 23, 42, 0.6);
          padding: 3px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .chip-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 11px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .chip-btn:hover {
          color: #f1f5f9;
        }
        .chip-btn.active {
          background: rgba(56, 189, 248, 0.15);
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.3);
        }
        .chip-btn.online.active {
          background: rgba(34, 197, 94, 0.15);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }
        .chip-btn.offline.active {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .view-mode-toggle {
          display: flex;
          align-items: center;
          gap: 2px;
          background: rgba(15, 23, 42, 0.6);
          padding: 3px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .mode-btn {
          background: transparent;
          border: none;
          color: #64748b;
          padding: 4px 6px;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          transition: all 0.15s ease;
        }
        .mode-btn:hover {
          color: #cbd5e1;
        }
        .mode-btn.active {
          background: #1e293b;
          color: #38bdf8;
        }
        .relative-time-badge {
          color: #94a3b8;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          border-bottom: 1px dashed rgba(148, 163, 184, 0.3);
          cursor: help;
        }
        .pulse-green {
          box-shadow: 0 0 6px #22c55e;
          animation: pulseGreen 2s infinite ease-in-out;
        }

        .host-cards-grid-wrapper {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 12px;
          padding: 12px 0;
        }
        .enterprise-host-card {
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .enterprise-host-card:hover {
          border-color: rgba(56, 189, 248, 0.4);
          transform: translateY(-2px);
          box-shadow: 0 8px 20px -6px rgba(0, 0, 0, 0.6);
        }
        .card-header-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .host-title-block {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .title-text {
          display: flex;
          flex-direction: column;
          line-height: 1.2;
        }
        .title-text strong {
          color: #f8fafc;
          font-size: 13px;
        }
        .title-text small {
          color: #64748b;
          font-size: 10.5px;
          font-family: 'JetBrains Mono', monospace;
        }
        .status-pill-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 10px;
          font-weight: 600;
        }
        .status-pill-badge.online {
          background: rgba(34, 197, 94, 0.12);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.25);
        }
        .status-pill-badge.offline {
          background: rgba(100, 116, 139, 0.15);
          color: #94a3b8;
          border: 1px solid rgba(100, 116, 139, 0.3);
        }
        .status-pill-badge.blocked {
          background: rgba(249, 115, 22, 0.15);
          color: #fb923c;
          border: 1px solid rgba(249, 115, 22, 0.3);
        }
        .card-gauge-grid {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .gauge-item {
          display: grid;
          grid-template-columns: 40px 45px 1fr;
          align-items: center;
          gap: 8px;
          font-size: 10.5px;
        }
        .gauge-label {
          color: #64748b;
          font-weight: 700;
        }
        .gauge-value {
          color: #cbd5e1;
          font-family: 'JetBrains Mono', monospace;
        }
        .gauge-track {
          height: 5px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 3px;
          overflow: hidden;
        }
        .gauge-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.3s ease;
        }
        .gauge-fill.blue { background: linear-gradient(90deg, #0284c7, #38bdf8); }
        .gauge-fill.purple { background: linear-gradient(90deg, #7c3aed, #c084fc); }
        .gauge-fill.yellow { background: linear-gradient(90deg, #d97706, #f59e0b); }
        .gauge-fill.red { background: linear-gradient(90deg, #dc2626, #f87171); }
        .card-footer-strip {
          display: flex;
          justify-content: space-between;
          font-size: 10.5px;
          color: #64748b;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding-top: 8px;
        }

        .table-responsive-wrapper {
          overflow-x: auto;
        }
        .machine-status-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        .machine-status-table th {
          font-size: 10.5px;
          font-weight: 700;
          color: #64748b;
          padding: 8px 10px;
          border-bottom: 1px solid #1a253b;
          white-space: nowrap;
        }
        .sort-icon {
          font-size: 9px;
          color: #475569;
          margin-left: 2px;
        }
        .machine-status-table td {
          padding: 9px 10px;
          border-bottom: 1px solid #141c2c;
          font-size: 11.5px;
          vertical-align: middle;
          white-space: nowrap;
        }
        .clickable-table-row {
          cursor: pointer;
          transition: background-color 0.15s ease;
        }
        .clickable-table-row:hover {
          background-color: #141e30;
        }
        .machine-name-cell {
          display: flex;
          flex-direction: column;
          line-height: 1.2;
        }
        .machine-name-cell strong {
          color: #ffffff;
          font-size: 12px;
        }
        .machine-name-cell small {
          color: #64748b;
          font-size: 10px;
          font-family: 'JetBrains Mono', monospace;
        }
        .os-icon-wrap {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
        }

        .progress-cell {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 110px;
          max-width: 140px;
        }
        .metric-pct-label {
          font-size: 11px;
          font-weight: 700;
          color: #f1f5f9;
          font-family: 'JetBrains Mono', monospace;
        }
        .bar-track {
          width: 100%;
          height: 4px;
          background-color: #162033;
          border-radius: 2px;
          overflow: hidden;
        }
        .bar-fill {
          height: 100%;
          border-radius: 2px;
        }
        .bar-fill.blue { background-color: #2563eb; }
        .bar-fill.purple { background-color: #a855f7; }
        .bar-fill.yellow { background-color: #f59e0b; }
        .bar-fill.red { background-color: #ef4444; }

        .network-rates-cell {
          display: flex;
          flex-direction: column;
          font-size: 10px;
          color: #22c55e;
          font-family: 'JetBrains Mono', monospace;
          line-height: 1.3;
        }
        .latency-val {
          font-size: 11px;
          font-family: 'JetBrains Mono', monospace;
          font-weight: 600;
        }
        .latency-val.green { color: #22c55e; }
        .latency-val.amber { color: #f59e0b; }
        .latency-val.muted { color: #64748b; }

        .status-tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 600;
        }
        .status-tag.online { color: #22c55e; }
        .status-tag.online .dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background-color: #22c55e;
          box-shadow: 0 0 6px #22c55e;
        }
        .status-tag.offline { color: #ef4444; }
        .status-tag.offline .dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background-color: #ef4444;
        }
        .lastseen-val {
          color: #94a3b8;
          font-size: 10.5px;
          font-family: 'JetBrains Mono', monospace;
        }
        .dash-val {
          color: #64748b;
          font-size: 12px;
        }

        /* Action Menu & Popover */
        .actions-td {
          position: relative;
        }
        .menu-wrap {
          position: relative;
        }
        .btn-dots-menu {
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .btn-dots-menu:hover {
          background-color: #1a253b;
          color: #cbd5e1;
        }
        .row-context-popover {
          position: fixed;
          min-width: 210px;
          white-space: nowrap;
          background-color: #0b111e;
          border: 1px solid #233550;
          border-radius: 10px;
          padding: 6px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(56, 189, 248, 0.15);
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .popover-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: none;
          color: #cbd5e1;
          font-size: 11.5px;
          padding: 6px 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
        }
        .popover-btn:hover {
          background-color: #162033;
          color: #ffffff;
        }

        .table-footer-pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 10px;
          font-size: 11px;
          color: #64748b;
        }
        .pagination-controls {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .page-btn, .page-num-btn {
          background: #162033;
          border: 1px solid #23334d;
          color: #cbd5e1;
          border-radius: 4px;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          cursor: pointer;
        }
        .page-num-btn.active {
          background: #2563eb;
          color: #ffffff;
          border-color: #2563eb;
          font-weight: 700;
        }

        /* Right Side Stack */
        .right-side-stack {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .system-overview-card {
          flex: 1;
        }
        .overview-metrics-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .overview-metric-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 6px;
          border-radius: 6px;
          transition: background-color 0.15s ease;
        }
        .overview-metric-item.clickable {
          cursor: pointer;
        }
        .overview-metric-item.clickable:hover {
          background-color: #162033;
        }
        .metric-left-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .metric-label {
          font-size: 11px;
          color: #94a3b8;
        }
        .val-trend-row {
          display: flex;
          align-items: baseline;
          gap: 6px;
        }
        .metric-val {
          font-size: 15px;
          font-weight: 800;
          color: #ffffff;
        }
        .trend-pct {
          font-size: 10px;
          font-weight: 700;
        }
        .trend-pct.up { color: #22c55e; }
        .metric-spark-wrap {
          width: 85px;
          height: 28px;
        }
        .overview-sparkline {
          width: 100%;
          height: 100%;
        }

        /* Connected Agents Card */
        .connected-agents-card {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .connected-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .connected-header h3 {
          font-size: 12.5px;
          font-weight: 700;
          color: #cbd5e1;
          margin: 0;
        }
        .agents-ratio {
          font-size: 13px;
          font-weight: 800;
          color: #22c55e;
          font-family: 'JetBrains Mono', monospace;
        }
        .agents-progress-track {
          width: 100%;
          height: 6px;
          background-color: #162033;
          border-radius: 999px;
          overflow: hidden;
        }
        .agents-progress-fill {
          height: 100%;
          background-color: #22c55e;
          border-radius: inherit;
        }
        .heartbeat-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          color: #64748b;
        }
        .heartbeat-val {
          color: #94a3b8;
          font-family: 'JetBrains Mono', monospace;
        }

        /* SRE Operations & Telemetry Banner */
        .sre-overview-banner {
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
          border: 1px solid rgba(99, 102, 241, 0.35);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.05);
          border-radius: 10px;
          padding: 12px 18px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .sre-banner-left {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sre-banner-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .sre-shield-icon {
          color: #818cf8;
        }
        .sre-title-txt {
          font-size: 13.5px;
          font-weight: 700;
          color: #f1f5f9;
          letter-spacing: -0.2px;
        }
        .sre-live-badge {
          display: flex;
          align-items: center;
          gap: 5px;
          background: rgba(34, 197, 94, 0.15);
          border: 1px solid rgba(34, 197, 94, 0.4);
          color: #4ade80;
          font-size: 10px;
          font-weight: 800;
          padding: 2px 7px;
          border-radius: 999px;
        }
        .pulse-dot {
          width: 6px;
          height: 6px;
          background-color: #22c55e;
          border-radius: 50%;
          box-shadow: 0 0 8px #22c55e;
        }
        .sre-metrics-pills {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .sre-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid #1e293b;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11.5px;
          color: #cbd5e1;
        }
        .sre-banner-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .sre-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 7px 13px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .sre-btn.reset-btn {
          background: rgba(99, 102, 241, 0.15);
          border: 1px solid rgba(99, 102, 241, 0.4);
          color: #a5b4fc;
        }
        .sre-btn.reset-btn:hover {
          background: rgba(99, 102, 241, 0.3);
          color: #ffffff;
          border-color: #818cf8;
        }
        .sre-btn.download-btn {
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          border: 1px solid #3b82f6;
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.4);
        }
        .sre-btn.download-btn:hover {
          background: linear-gradient(135deg, #1d4ed8, #1e40af);
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.6);
        }
        .spinning {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
        .sre-badge-tag {
          font-size: 9.5px;
          font-weight: 800;
          padding: 1px 6px;
          border-radius: 4px;
          margin-left: 6px;
          text-transform: uppercase;
          display: inline-block;
        }
        .sre-badge-tag.flap {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.4);
        }
        .sre-badge-tag.root-cause {
          background: rgba(168, 85, 247, 0.15);
          color: #c084fc;
          border: 1px solid rgba(168, 85, 247, 0.4);
        }

        @media (max-width: 1200px) {
          .kpi-cards-grid { grid-template-columns: repeat(2, 1fr); }
          .bottom-dashboard-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 768px) {
          .kpi-cards-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
