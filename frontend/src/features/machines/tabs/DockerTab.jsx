import React, { useEffect, useState, useMemo } from 'react';
import { 
  Layers, 
  Play, 
  Square, 
  RotateCw, 
  Trash2, 
  FileText, 
  Info, 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  HardDrive, 
  Globe, 
  Box, 
  Cpu, 
  MemoryStick, 
  Copy, 
  Check, 
  X, 
  Terminal, 
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Zap,
  Filter,
  Plus,
  DownloadCloud
} from 'lucide-react';
import { 
  getDockerOverview, 
  getDockerContainers, 
  getDockerImages, 
  getDockerNetworks, 
  getDockerVolumes, 
  getDockerEvents, 
  getContainerLogs,
  startContainer,
  stopContainer,
  restartContainer,
  removeContainer,
  runContainer,
  pullImage,
  removeImage
} from '../../../api/docker.js';
import { useDashboardStore } from '../../../store/dashboardStore.jsx';

export default function DockerTab({ machine }) {
  const machineId = machine?.id || machine?.ID || machine?.Id;
  const { addToast } = useDashboardStore();

  // Active Sub-Tab
  const [activeSubTab, setActiveSubTab] = useState('containers'); // 'containers' | 'images' | 'networks' | 'volumes' | 'events'

  // Data States
  const [overview, setOverview] = useState(null);
  const [containers, setContainers] = useState([]);
  const [images, setImages] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [events, setEvents] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState({});

  // Filtering & Searching
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'running' | 'exited' | 'restarting'

  // Modals
  const [activeLogContainer, setActiveLogContainer] = useState(null);
  const [containerLogs, setContainerLogs] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);

  const [inspectContainer, setInspectContainer] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Deploy / Run Container Modal State
  const [showRunModal, setShowRunModal] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [runForm, setRunForm] = useState({
    image: '',
    name: '',
    ports: '',
    env: '',
    volumes: '',
    restart: 'unless-stopped',
    command: ''
  });

  // Pull Image Modal State
  const [showPullModal, setShowPullModal] = useState(false);
  const [pullLoading, setPullLoading] = useState(false);
  const [pullForm, setPullForm] = useState({
    image: '',
    tag: 'latest'
  });

  // Fetch all Docker data for this machine
  const fetchAllData = async (isManualRefresh = false) => {
    if (!machineId) return;
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const [overviewRes, containersRes, imagesRes, networksRes, volumesRes, eventsRes] = await Promise.allSettled([
        getDockerOverview(machineId),
        getDockerContainers(machineId),
        getDockerImages(machineId),
        getDockerNetworks(machineId),
        getDockerVolumes(machineId),
        getDockerEvents(machineId)
      ]);

      if (overviewRes.status === 'fulfilled') setOverview(overviewRes.value);
      if (containersRes.status === 'fulfilled' && Array.isArray(containersRes.value)) {
        setContainers(containersRes.value);
      }
      if (imagesRes.status === 'fulfilled' && Array.isArray(imagesRes.value)) {
        setImages(imagesRes.value);
      }
      if (networksRes.status === 'fulfilled' && Array.isArray(networksRes.value)) {
        setNetworks(networksRes.value);
      }
      if (volumesRes.status === 'fulfilled' && Array.isArray(volumesRes.value)) {
        setVolumes(volumesRes.value);
      }
      if (eventsRes.status === 'fulfilled' && Array.isArray(eventsRes.value)) {
        setEvents(eventsRes.value);
      }
    } catch (err) {
      console.error('Docker telemetry fetch error:', err);
      setError(err.message || 'Failed to fetch Docker telemetry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(() => {
      fetchAllData(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [machineId]);

  // Container Action Dispatcher
  const handleAction = async (container, action) => {
    const cId = container.id || container.ID || container.name || container.Name;
    setActionLoading(prev => ({ ...prev, [cId]: action }));

    try {
      let res;
      if (action === 'start') res = await startContainer(machineId, cId);
      else if (action === 'stop') res = await stopContainer(machineId, cId);
      else if (action === 'restart') res = await restartContainer(machineId, cId);
      else if (action === 'remove') res = await removeContainer(machineId, cId);

      addToast('success', `Container ${action.toUpperCase()}`, `Request to ${action} ${container.name || cId} dispatched successfully.`);
      setTimeout(() => fetchAllData(true), 1500);
    } catch (err) {
      addToast('critical', `Action Failed: ${action}`, err.response?.data?.error || err.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [cId]: null }));
      setConfirmDelete(null);
    }
  };

  // Run/Deploy Container Dispatcher
  const handleDeployContainer = async (e) => {
    if (e) e.preventDefault();
    if (!runForm.image.trim()) {
      addToast('critical', 'Validation Error', 'Image name is required.');
      return;
    }

    setRunLoading(true);
    try {
      const payload = {
        machine_id: machineId,
        image: runForm.image.trim(),
        name: runForm.name.trim(),
        ports: runForm.ports ? runForm.ports.split(',').map(p => p.trim()).filter(Boolean) : [],
        environment: runForm.env ? runForm.env.split(',').map(e => e.trim()).filter(Boolean) : [],
        volumes: runForm.volumes ? runForm.volumes.split(',').map(v => v.trim()).filter(Boolean) : [],
        restart: runForm.restart || 'unless-stopped',
        command: runForm.command.trim()
      };

      await runContainer(payload);
      addToast('success', 'Container Deployment Initiated', `Dispatched docker run for ${payload.image} on ${machine?.hostname || 'this host'}.`);
      setShowRunModal(false);
      setRunForm({
        image: '',
        name: '',
        ports: '',
        env: '',
        volumes: '',
        restart: 'unless-stopped',
        command: ''
      });
      setTimeout(() => fetchAllData(true), 1500);
    } catch (err) {
      addToast('critical', 'Container Run Failed', err.response?.data?.error || err.message);
    } finally {
      setRunLoading(false);
    }
  };

  // Pull Image Dispatcher
  const handlePullImage = async (e) => {
    if (e) e.preventDefault();
    if (!pullForm.image.trim()) {
      addToast('critical', 'Validation Error', 'Image repository is required.');
      return;
    }

    setPullLoading(true);
    try {
      const fullImage = pullForm.tag ? `${pullForm.image.trim()}:${pullForm.tag.trim()}` : pullForm.image.trim();
      await pullImage(machineId, fullImage);
      addToast('success', 'Image Pull Initiated', `Dispatched docker pull for ${fullImage}. Check event logs for progress.`);
      setShowPullModal(false);
      setPullForm({ image: '', tag: 'latest' });
      setTimeout(() => fetchAllData(true), 2500);
    } catch (err) {
      addToast('critical', 'Image Pull Failed', err.response?.data?.error || err.message);
    } finally {
      setPullLoading(false);
    }
  };

  // Remove Image Dispatcher
  const handleDeleteImage = async (img) => {
    const fullImg = img.repository ? `${img.repository}:${img.tag || 'latest'}` : (img.name || img.id);
    if (!confirm(`Are you sure you want to remove image ${fullImg}?`)) return;

    try {
      await removeImage(machineId, fullImg, false);
      addToast('success', 'Image Remove Dispatched', `Requested removal of image ${fullImg}.`);
      setTimeout(() => fetchAllData(true), 1500);
    } catch (err) {
      addToast('critical', 'Image Removal Failed', err.response?.data?.error || err.message);
    }
  };

  // Open Log Viewer
  const handleOpenLogs = async (container) => {
    const cId = container.id || container.ID || container.name;
    setActiveLogContainer(container);
    setLogsLoading(true);
    setContainerLogs('');

    try {
      const data = await getContainerLogs(cId);
      setContainerLogs(data.logs || 'No logs generated by container yet.');
    } catch (err) {
      setContainerLogs(`Error loading container logs: ${err.response?.data?.error || err.message}`);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Stats calculation
  const stats = useMemo(() => {
    const total = containers.length;
    const running = containers.filter(c => {
      const state = String(c.state || c.State || c.status || '').toLowerCase();
      return state === 'running' || state.includes('up');
    }).length;
    const restarting = containers.filter(c => {
      const state = String(c.state || c.State || c.status || '').toLowerCase();
      return state.includes('restarting');
    }).length;
    const stopped = total - running - restarting;

    const totalCpu = containers.reduce((acc, c) => acc + (c.cpu_percent || 0), 0);
    const totalMem = containers.reduce((acc, c) => acc + (c.memory_used_bytes || c.memory_used || 0), 0);

    return { total, running, stopped, restarting, totalCpu, totalMem };
  }, [containers]);

  // Filtered containers
  const filteredContainers = useMemo(() => {
    return containers.filter(c => {
      const state = String(c.state || c.State || c.status || '').toLowerCase();
      if (statusFilter === 'running' && !(state === 'running' || state.includes('up'))) return false;
      if (statusFilter === 'exited' && (state === 'running' || state.includes('up') || state.includes('restarting'))) return false;
      if (statusFilter === 'restarting' && !state.includes('restarting')) return false;

      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const name = String(c.name || c.Name || c.names || '').toLowerCase();
      const image = String(c.image || c.Image || '').toLowerCase();
      const id = String(c.id || c.ID || '').toLowerCase();
      return name.includes(q) || image.includes(q) || id.includes(q);
    });
  }, [containers, statusFilter, searchQuery]);

  if (loading && !overview && containers.length === 0) {
    return (
      <div className="tab-empty" style={{ padding: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <RefreshCw size={32} className="spin" color="#06b6d4" />
        <div style={{ fontSize: '15px', color: '#f1f5f9' }}>Connecting to Docker daemon telemetry...</div>
      </div>
    );
  }

  const isDockerInstalled = overview?.docker_installed !== false;

  return (
    <div className="docker-enterprise-tab" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* ========================================================================= */}
      {/* 1. EXECUTIVE METRICS & ENGINE STATUS KPI GRID */}
      {/* ========================================================================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '12px'
      }}>
        {/* Docker Engine Status Card */}
        <div style={{
          backgroundColor: '#0d1220',
          border: '1px solid var(--border-soft)',
          borderRadius: '12px',
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Docker Engine</span>
            <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '2px 8px',
              backgroundColor: isDockerInstalled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: isDockerInstalled ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 700,
              color: isDockerInstalled ? '#22c55e' : '#ef4444'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isDockerInstalled ? '#22c55e' : '#ef4444' }} />
              {isDockerInstalled ? 'Active' : 'Offline'}
            </span>
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#f1f5f9' }}>
              {overview?.docker_version || overview?.engine_version || 'Docker Daemon'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', fontFamily: 'monospace' }}>
              API: {overview?.api_version || 'v1.44'} • {overview?.host_os || machine?.platform || 'Host OS'}
            </div>
          </div>
        </div>

        {/* Containers Breakdown Card */}
        <div style={{
          backgroundColor: '#0d1220',
          border: '1px solid var(--border-soft)',
          borderRadius: '12px',
          padding: '16px 18px',
          borderLeft: '4px solid #06b6d4'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Total Containers</span>
            <Box size={16} color="#06b6d4" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#f1f5f9' }}>
            {stats.total}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '11px', fontWeight: 600 }}>
            <span style={{ color: '#22c55e' }}>🟢 {stats.running} Running</span>
            <span style={{ color: '#eab308' }}>🟡 {stats.restarting} Restarting</span>
            <span style={{ color: '#94a3b8' }}>⚪ {stats.stopped} Stopped</span>
          </div>
        </div>

        {/* Container Resource Footprint Card */}
        <div style={{
          backgroundColor: '#0d1220',
          border: '1px solid var(--border-soft)',
          borderRadius: '12px',
          padding: '16px 18px',
          borderLeft: '4px solid #a855f7'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Resources In Use</span>
            <Cpu size={16} color="#a855f7" />
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9' }}>
            {stats.totalCpu.toFixed(1)}% <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>CPU</span>
          </div>
          <div style={{ fontSize: '12px', color: '#c084fc', marginTop: '4px', fontWeight: 600 }}>
            {formatBytes(stats.totalMem)} RAM allocated
          </div>
        </div>

        {/* Images & Volumes Count Card */}
        <div style={{
          backgroundColor: '#0d1220',
          border: '1px solid var(--border-soft)',
          borderRadius: '12px',
          padding: '16px 18px',
          borderLeft: '4px solid #3b82f6'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Storage & Net</span>
            <HardDrive size={16} color="#3b82f6" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '4px' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#f1f5f9' }}>{images.length || overview?.images || 0}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Images</div>
            </div>
            <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-soft)' }} />
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#f1f5f9' }}>{volumes.length || overview?.volumes || 0}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Volumes</div>
            </div>
            <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-soft)' }} />
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#f1f5f9' }}>{networks.length || overview?.networks || 0}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Networks</div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. SUB-NAVIGATION TOOLBAR & SEARCH */}
      {/* ========================================================================= */}
      <div style={{
        backgroundColor: '#0d1220',
        border: '1px solid var(--border-soft)',
        borderRadius: '12px',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {[
            { id: 'containers', label: 'Containers', count: containers.length, icon: Box },
            { id: 'images', label: 'Images', count: images.length, icon: Layers },
            { id: 'networks', label: 'Networks', count: networks.length, icon: Globe },
            { id: 'volumes', label: 'Volumes', count: volumes.length, icon: HardDrive },
            { id: 'events', label: 'Events Audit', count: events.length, icon: Zap }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  backgroundColor: isActive ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                  border: isActive ? '1px solid #06b6d4' : '1px solid transparent',
                  borderRadius: '8px',
                  color: isActive ? '#06b6d4' : 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: isActive ? 700 : 500,
                  transition: 'all 0.15s'
                }}
              >
                <Icon size={14} />
                {tab.label}
                <span style={{
                  padding: '1px 6px',
                  borderRadius: '10px',
                  backgroundColor: isActive ? '#06b6d4' : 'rgba(255, 255, 255, 0.06)',
                  color: isActive ? '#080c14' : 'var(--text)',
                  fontSize: '10px',
                  fontWeight: 700
                }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Search & Refresh Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {activeSubTab === 'containers' && (
            <>
              {/* Status Filter Pills */}
              <div style={{ display: 'flex', backgroundColor: 'rgba(255, 255, 255, 0.04)', borderRadius: '6px', border: '1px solid var(--border-soft)', padding: '2px' }}>
                {['all', 'running', 'restarting', 'exited'].map(filterKey => (
                  <button
                    key={filterKey}
                    onClick={() => setStatusFilter(filterKey)}
                    style={{
                      padding: '3px 8px',
                      border: 'none',
                      borderRadius: '4px',
                      backgroundColor: statusFilter === filterKey ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                      color: statusFilter === filterKey ? '#06b6d4' : 'var(--muted)',
                      cursor: 'pointer',
                      fontSize: '11px',
                      textTransform: 'capitalize',
                      fontWeight: statusFilter === filterKey ? 700 : 500
                    }}
                  >
                    {filterKey}
                  </button>
                ))}
              </div>

              {/* Search Box */}
              <div style={{ position: 'relative', width: '200px' }}>
                <Search size={13} style={{ position: 'absolute', left: '9px', top: '9px', color: 'var(--muted)' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter containers..."
                  style={{
                    width: '100%',
                    height: '30px',
                    backgroundColor: '#0a0e17',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    padding: '0 24px 0 28px',
                    fontSize: '12px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ position: 'absolute', right: '6px', top: '6px', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </>
          )}

          {/* Deploy Container Button */}
          <button
            onClick={() => {
              setRunForm({
                image: '',
                name: '',
                ports: '',
                env: '',
                volumes: '',
                restart: 'unless-stopped',
                command: ''
              });
              setShowRunModal(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '0 12px',
              height: '30px',
              backgroundColor: '#06b6d4',
              border: 'none',
              borderRadius: '6px',
              color: '#080c14',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <Plus size={14} />
            Deploy Container
          </button>

          {/* Pull Image Button */}
          <button
            onClick={() => {
              setPullForm({ image: '', tag: 'latest' });
              setShowPullModal(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '0 12px',
              height: '30px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-soft)',
              borderRadius: '6px',
              color: 'var(--text)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <DownloadCloud size={14} />
            Pull Image
          </button>

          {/* Refresh Button */}
          <button
            onClick={() => fetchAllData(true)}
            disabled={refreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '0 12px',
              height: '30px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-soft)',
              borderRadius: '6px',
              color: 'var(--text)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: refreshing ? 'not-allowed' : 'pointer'
            }}
          >
            <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          color: '#f87171',
          fontSize: '13px'
        }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SUB-TAB 1: CONTAINERS FLEET VIEW */}
      {/* ========================================================================= */}
      {activeSubTab === 'containers' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid var(--border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
          {filteredContainers.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>
              No containers found matching current filters.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                  <th style={{ padding: '12px 16px' }}>Container & Image</th>
                  <th style={{ padding: '12px 16px' }}>Status & State</th>
                  <th style={{ padding: '12px 16px' }}>Ports</th>
                  <th style={{ padding: '12px 16px' }}>CPU Usage</th>
                  <th style={{ padding: '12px 16px' }}>Memory</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredContainers.map(container => {
                  const name = container.name || container.Name || container.names || 'unnamed';
                  const rawId = container.id || container.ID || 'unknown';
                  const shortId = rawId.substring(0, 12);
                  const image = container.image || container.Image || 'unknown';
                  const state = String(container.state || container.State || container.status || '').toLowerCase();
                  const isRunning = state === 'running' || state.includes('up');
                  const isRestarting = state.includes('restarting');
                  const ports = container.ports || container.Ports || '-';
                  const cpu = container.cpu_percent || 0;
                  const memUsed = container.memory_used_bytes || container.memory_used || 0;
                  const memLimit = container.memory_limit_bytes || container.memory_limit || 0;
                  const memPct = memLimit > 0 ? ((memUsed / memLimit) * 100).toFixed(1) : 0;
                  const isBusy = actionLoading[rawId] || actionLoading[name];

                  return (
                    <tr 
                      key={rawId}
                      style={{ 
                        borderBottom: '1px solid var(--border-soft)',
                        transition: 'background-color 0.15s'
                      }}
                      className="container-row"
                    >
                      {/* Name, Image & ID */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9' }}>{name}</span>
                            <span 
                              onClick={() => handleCopyId(rawId)}
                              style={{ 
                                fontSize: '11px', 
                                color: copiedId === rawId ? '#34d399' : 'var(--muted)', 
                                fontFamily: 'monospace',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                              title="Click to copy container ID"
                            >
                              {copiedId === rawId ? <Check size={11} /> : <Copy size={11} />}
                              {shortId}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              padding: '1px 6px',
                              backgroundColor: 'rgba(6, 182, 212, 0.1)',
                              border: '1px solid rgba(6, 182, 212, 0.3)',
                              borderRadius: '4px',
                              color: '#06b6d4',
                              fontSize: '11px',
                              fontFamily: 'monospace'
                            }}>
                              {image}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: isRunning ? '#22c55e' : (isRestarting ? '#eab308' : '#64748b'),
                              boxShadow: isRunning ? '0 0 8px #22c55e' : (isRestarting ? '0 0 8px #eab308' : 'none')
                            }} />
                            <span style={{
                              fontSize: '12px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              color: isRunning ? '#22c55e' : (isRestarting ? '#eab308' : '#94a3b8')
                            }}>
                              {container.state || (isRunning ? 'Running' : 'Exited')}
                            </span>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                            {container.status || '-'}
                          </span>
                        </div>
                      </td>

                      {/* Ports */}
                      <td style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: '12px', fontFamily: 'monospace' }}>
                        {ports !== '-' ? (
                          <span style={{
                            padding: '2px 6px',
                            backgroundColor: 'rgba(255, 255, 255, 0.04)',
                            borderRadius: '4px',
                            border: '1px solid var(--border-soft)',
                            color: '#e2e8f0'
                          }}>
                            {ports}
                          </span>
                        ) : '-'}
                      </td>

                      {/* CPU Progress */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ width: '100px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text)', marginBottom: '3px' }}>
                            <span>{cpu.toFixed(1)}%</span>
                          </div>
                          <div style={{ height: '5px', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(cpu, 100)}%`,
                              height: '100%',
                              backgroundColor: cpu > 75 ? '#ef4444' : (cpu > 40 ? '#f59e0b' : '#06b6d4'),
                              borderRadius: '3px'
                            }} />
                          </div>
                        </div>
                      </td>

                      {/* Memory */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '12px', color: '#f1f5f9', fontFamily: 'monospace' }}>
                            {formatBytes(memUsed)} {memLimit > 0 ? `/ ${formatBytes(memLimit)}` : ''}
                          </span>
                          {memLimit > 0 && (
                            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{memPct}% used</span>
                          )}
                        </div>
                      </td>

                      {/* Action Controls */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          
                          {/* Start / Stop Toggle */}
                          {isRunning ? (
                            <button
                              onClick={() => handleAction(container, 'stop')}
                              disabled={Boolean(isBusy)}
                              style={{
                                padding: '5px 8px',
                                backgroundColor: 'rgba(234, 179, 8, 0.1)',
                                border: '1px solid rgba(234, 179, 8, 0.3)',
                                borderRadius: '6px',
                                color: '#eab308',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                fontWeight: 700
                              }}
                              title="Stop Container"
                            >
                              <Square size={12} fill="#eab308" />
                              Stop
                            </button>
                          ) : (
                            <button
                              onClick={() => handleAction(container, 'start')}
                              disabled={Boolean(isBusy)}
                              style={{
                                padding: '5px 8px',
                                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                                borderRadius: '6px',
                                color: '#22c55e',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                fontWeight: 700
                              }}
                              title="Start Container"
                            >
                              <Play size={12} fill="#22c55e" />
                              Start
                            </button>
                          )}

                          {/* Restart */}
                          <button
                            onClick={() => handleAction(container, 'restart')}
                            disabled={Boolean(isBusy)}
                            style={{
                              padding: '5px 8px',
                              backgroundColor: 'rgba(6, 182, 212, 0.1)',
                              border: '1px solid rgba(6, 182, 212, 0.3)',
                              borderRadius: '6px',
                              color: '#06b6d4',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 700
                            }}
                            title="Restart Container"
                          >
                            <RotateCw size={12} className={isBusy === 'restart' ? 'spin' : ''} />
                            Restart
                          </button>

                          {/* Logs */}
                          <button
                            onClick={() => handleOpenLogs(container)}
                            style={{
                              padding: '5px 8px',
                              backgroundColor: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid var(--border-soft)',
                              borderRadius: '6px',
                              color: 'var(--text)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 600
                            }}
                            title="View Streaming Logs"
                          >
                            <FileText size={12} />
                            Logs
                          </button>

                          {/* Inspect */}
                          <button
                            onClick={() => setInspectContainer(container)}
                            style={{
                              padding: '5px 8px',
                              backgroundColor: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid var(--border-soft)',
                              borderRadius: '6px',
                              color: 'var(--muted)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title="Inspect Metadata"
                          >
                            <Info size={12} />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => setConfirmDelete(container)}
                            style={{
                              padding: '5px 8px',
                              backgroundColor: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              borderRadius: '6px',
                              color: '#f87171',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title="Delete Container"
                          >
                            <Trash2 size={12} />
                          </button>

                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. SUB-TAB 2: DOCKER IMAGES */}
      {/* ========================================================================= */}
      {activeSubTab === 'images' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid var(--border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
          {images.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>
              No images found on this node.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                  <th style={{ padding: '12px 16px' }}>Repository & Tag</th>
                  <th style={{ padding: '12px 16px' }}>Image ID</th>
                  <th style={{ padding: '12px 16px' }}>Size</th>
                  <th style={{ padding: '12px 16px' }}>Created</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {images.map((img, idx) => {
                  const fullImg = img.repository ? `${img.repository}:${img.tag || 'latest'}` : (img.name || img.id);
                  return (
                    <tr key={img.id || idx} style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--text)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Layers size={16} color="#06b6d4" />
                          <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{img.repository || img.name || 'Unnamed'}</span>
                          <span style={{
                            padding: '1px 6px',
                            backgroundColor: 'rgba(255, 255, 255, 0.06)',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: '#06b6d4'
                          }}>
                            {img.tag || 'latest'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--muted)' }}>
                        {(img.id || '').substring(0, 16)}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#38bdf8', fontFamily: 'monospace' }}>
                        {img.size || (img.size_bytes ? formatBytes(img.size_bytes) : '-')}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--muted)' }}>
                        {img.created || img.created_at || '-'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button
                            onClick={() => {
                              setRunForm(prev => ({ ...prev, image: fullImg }));
                              setShowRunModal(true);
                            }}
                            style={{
                              padding: '5px 8px',
                              backgroundColor: 'rgba(6, 182, 212, 0.1)',
                              border: '1px solid rgba(6, 182, 212, 0.3)',
                              borderRadius: '6px',
                              color: '#06b6d4',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 700
                            }}
                            title="Launch container from this image"
                          >
                            <Play size={12} fill="#06b6d4" />
                            Run
                          </button>
                          <button
                            onClick={() => handleDeleteImage(img)}
                            style={{
                              padding: '5px 8px',
                              backgroundColor: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              borderRadius: '6px',
                              color: '#f87171',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px'
                            }}
                            title="Remove image from host"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. SUB-TAB 3: NETWORKS */}
      {/* ========================================================================= */}
      {activeSubTab === 'networks' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid var(--border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
          {networks.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>
              No custom Docker networks detected.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                  <th style={{ padding: '12px 16px' }}>Network Name</th>
                  <th style={{ padding: '12px 16px' }}>Driver</th>
                  <th style={{ padding: '12px 16px' }}>Scope</th>
                  <th style={{ padding: '12px 16px' }}>Subnet</th>
                  <th style={{ padding: '12px 16px' }}>Gateway</th>
                </tr>
              </thead>
              <tbody>
                {networks.map((net, idx) => (
                  <tr key={net.id || idx} style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--text)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#f1f5f9' }}>
                        <Globe size={16} color="#3b82f6" />
                        {net.name}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '2px 6px',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '4px',
                        color: '#3b82f6',
                        fontSize: '11px',
                        fontFamily: 'monospace'
                      }}>
                        {net.driver || 'bridge'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--muted)' }}>{net.scope || 'local'}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#e2e8f0' }}>{net.subnet || '-'}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#e2e8f0' }}>{net.gateway || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. SUB-TAB 4: VOLUMES */}
      {/* ========================================================================= */}
      {activeSubTab === 'volumes' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid var(--border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
          {volumes.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>
              No persistent volumes mapped.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                  <th style={{ padding: '12px 16px' }}>Volume Name</th>
                  <th style={{ padding: '12px 16px' }}>Driver</th>
                  <th style={{ padding: '12px 16px' }}>Mount Point</th>
                  <th style={{ padding: '12px 16px' }}>Size</th>
                </tr>
              </thead>
              <tbody>
                {volumes.map((vol, idx) => (
                  <tr key={vol.name || idx} style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--text)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#f1f5f9' }}>
                        <HardDrive size={16} color="#a855f7" />
                        {vol.name}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--muted)' }}>{vol.driver || 'local'}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--muted)', fontSize: '11px' }}>
                      {vol.mountpoint || vol.Mountpoint || '-'}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#c084fc', fontWeight: 600 }}>{vol.size || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. SUB-TAB 5: EVENTS & AUDIT STREAM */}
      {/* ========================================================================= */}
      {activeSubTab === 'events' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid var(--border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
          {events.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>
              No recent daemon lifecycle events recorded.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                  <th style={{ padding: '12px 16px' }}>Timestamp</th>
                  <th style={{ padding: '12px 16px' }}>Action</th>
                  <th style={{ padding: '12px 16px' }}>Type</th>
                  <th style={{ padding: '12px 16px' }}>Resource Target</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt, idx) => (
                  <tr key={evt.id || idx} style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--text)' }}>
                    <td style={{ padding: '12px 16px', color: 'var(--muted)', fontFamily: 'monospace', fontSize: '11px' }}>
                      {evt.time || evt.timestamp ? new Date(evt.time || evt.timestamp).toLocaleString() : '-'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: String(evt.action).includes('die') || String(evt.action).includes('kill') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                        color: String(evt.action).includes('die') || String(evt.action).includes('kill') ? '#ef4444' : '#22c55e'
                      }}>
                        {evt.action || 'event'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--muted)', textTransform: 'uppercase', fontSize: '11px' }}>
                      {evt.type || 'container'}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#f1f5f9' }}>
                      {evt.actor || evt.target || evt.resource || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: LIVE CONTAINER LOG STREAMER */}
      {/* ========================================================================= */}
      {activeLogContainer && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '24px'
        }}>
          <div style={{
            backgroundColor: '#0a0e17',
            border: '1px solid var(--border-soft)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '960px',
            height: '80vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)'
          }}>
            {/* Header */}
            <div style={{
              padding: '14px 20px',
              backgroundColor: '#111827',
              borderBottom: '1px solid var(--border-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Terminal size={18} color="#06b6d4" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', color: '#f1f5f9', fontWeight: 700 }}>
                    Container Logs: {activeLogContainer.name || activeLogContainer.id}
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'monospace' }}>
                    {activeLogContainer.image}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => handleOpenLogs(activeLogContainer)}
                  disabled={logsLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '0 12px',
                    height: '32px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  <RefreshCw size={13} className={logsLoading ? 'spin' : ''} />
                  Refresh
                </button>
                <button
                  onClick={() => setActiveLogContainer(null)}
                  style={{
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    color: 'var(--muted)',
                    cursor: 'pointer'
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Log Terminal Window */}
            <div style={{
              flex: 1,
              padding: '16px',
              backgroundColor: '#070a11',
              color: '#38bdf8',
              fontFamily: '"Fira Code", monospace',
              fontSize: '12px',
              lineHeight: 1.6,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap'
            }}>
              {logsLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#06b6d4' }}>
                  <RefreshCw size={16} className="spin" />
                  Streaming live stdout/stderr logs...
                </div>
              ) : (
                containerLogs || 'No logs generated by container.'
              )}
            </div>

            {/* Log Footer */}
            <div style={{
              padding: '8px 16px',
              backgroundColor: '#111827',
              borderTop: '1px solid var(--border-soft)',
              fontSize: '11px',
              color: 'var(--muted)',
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <span>Live stream from Docker runtime</span>
              <span>Host: {machine?.hostname || 'Node'}</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CONTAINER METADATA INSPECTOR */}
      {/* ========================================================================= */}
      {inspectContainer && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '24px'
        }}>
          <div style={{
            backgroundColor: '#0d1220',
            border: '1px solid var(--border-soft)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '640px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              backgroundColor: '#111827',
              borderBottom: '1px solid var(--border-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Info size={18} color="#06b6d4" />
                <h3 style={{ margin: 0, fontSize: '15px', color: '#f1f5f9', fontWeight: 700 }}>
                  Container Inspect: {inspectContainer.name || inspectContainer.Name}
                </h3>
              </div>
              <button onClick={() => setInspectContainer(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>Container ID</span>
                  <strong style={{ fontSize: '12px', color: '#f1f5f9', fontFamily: 'monospace' }}>{inspectContainer.id || inspectContainer.ID}</strong>
                </div>
                <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>Image</span>
                  <strong style={{ fontSize: '12px', color: '#06b6d4', fontFamily: 'monospace' }}>{inspectContainer.image || inspectContainer.Image}</strong>
                </div>
                <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>State</span>
                  <strong style={{ fontSize: '12px', color: '#22c55e', textTransform: 'uppercase' }}>{inspectContainer.state || 'N/A'}</strong>
                </div>
                <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>Ports</span>
                  <strong style={{ fontSize: '12px', color: '#f1f5f9', fontFamily: 'monospace' }}>{inspectContainer.ports || 'None'}</strong>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Raw JSON Metadata</span>
                <pre style={{
                  padding: '12px',
                  backgroundColor: '#070a11',
                  borderRadius: '6px',
                  color: '#a5f3fc',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  overflowX: 'auto',
                  maxHeight: '200px'
                }}>
                  {JSON.stringify(inspectContainer, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: DELETE CONFIRMATION */}
      {/* ========================================================================= */}
      {confirmDelete && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#111827',
            border: '1px solid var(--border-soft)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '420px',
            padding: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#f87171', marginBottom: '12px' }}>
              <Trash2 size={20} />
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Remove Container?</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.5, margin: '0 0 18px' }}>
              Are you sure you want to delete container <strong style={{ color: '#f1f5f9' }}>{confirmDelete.name || confirmDelete.id}</strong>?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{
                  padding: '0 16px',
                  height: '34px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction(confirmDelete, 'remove')}
                style={{
                  padding: '0 18px',
                  height: '34px',
                  backgroundColor: '#ef4444',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: DEPLOY CONTAINER MODAL */}
      {/* ========================================================================= */}
      {showRunModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#0d1220',
            border: '1px solid var(--border-soft)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '560px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              backgroundColor: '#111827',
              borderBottom: '1px solid var(--border-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Plus size={18} color="#06b6d4" />
                <h3 style={{ margin: 0, fontSize: '15px', color: '#f1f5f9', fontWeight: 700 }}>
                  Deploy Docker Container on {machine?.hostname || 'Host'}
                </h3>
              </div>
              <button onClick={() => setShowRunModal(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleDeployContainer} style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Image Name */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#f1f5f9', marginBottom: '6px' }}>
                  Image Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. nginx:alpine, redis:7-alpine, postgres:15"
                  value={runForm.image}
                  onChange={(e) => setRunForm(prev => ({ ...prev, image: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#070a11',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Quick Picks */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['nginx:alpine', 'redis:7-alpine', 'postgres:15-alpine', 'node:18-alpine', 'python:3.11-slim', 'rabbitmq:management'].map(tpl => (
                  <button
                    key={tpl}
                    type="button"
                    onClick={() => setRunForm(prev => ({ ...prev, image: tpl }))}
                    style={{
                      padding: '3px 8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid var(--border-soft)',
                      borderRadius: '4px',
                      color: '#06b6d4',
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    + {tpl}
                  </button>
                ))}
              </div>

              {/* Container Name */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#f1f5f9', marginBottom: '6px' }}>
                  Container Name <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. my-nginx-web"
                  value={runForm.name}
                  onChange={(e) => setRunForm(prev => ({ ...prev, name: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#070a11',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Port Mappings */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#f1f5f9', marginBottom: '6px' }}>
                  Port Mappings <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(host:container, comma separated)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 8080:80, 443:443"
                  value={runForm.ports}
                  onChange={(e) => setRunForm(prev => ({ ...prev, ports: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#070a11',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Environment Variables */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#f1f5f9', marginBottom: '6px' }}>
                  Environment Variables <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(KEY=VAL, comma separated)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. PORT=3000, NODE_ENV=production"
                  value={runForm.env}
                  onChange={(e) => setRunForm(prev => ({ ...prev, env: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#070a11',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Volumes */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#f1f5f9', marginBottom: '6px' }}>
                  Volumes <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(host:container, comma separated)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. /var/data:/data"
                  value={runForm.volumes}
                  onChange={(e) => setRunForm(prev => ({ ...prev, volumes: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#070a11',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Restart Policy & Command */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#f1f5f9', marginBottom: '6px' }}>
                    Restart Policy
                  </label>
                  <select
                    value={runForm.restart}
                    onChange={(e) => setRunForm(prev => ({ ...prev, restart: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: '#070a11',
                      border: '1px solid var(--border-soft)',
                      borderRadius: '6px',
                      color: '#f1f5f9',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="unless-stopped">unless-stopped</option>
                    <option value="always">always</option>
                    <option value="on-failure">on-failure</option>
                    <option value="no">no</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#f1f5f9', marginBottom: '6px' }}>
                    Custom Command <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. sh -c 'npm start'"
                    value={runForm.command}
                    onChange={(e) => setRunForm(prev => ({ ...prev, command: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: '#070a11',
                      border: '1px solid var(--border-soft)',
                      borderRadius: '6px',
                      color: '#f1f5f9',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowRunModal(false)}
                  style={{
                    padding: '0 16px',
                    height: '36px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={runLoading}
                  style={{
                    padding: '0 20px',
                    height: '36px',
                    backgroundColor: '#06b6d4',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#080c14',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: runLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {runLoading && <RefreshCw size={14} className="spin" />}
                  {runLoading ? 'Deploying...' : 'Deploy Container'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: PULL DOCKER IMAGE MODAL */}
      {/* ========================================================================= */}
      {showPullModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#0d1220',
            border: '1px solid var(--border-soft)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '480px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)'
          }}>
            <div style={{
              padding: '16px 20px',
              backgroundColor: '#111827',
              borderBottom: '1px solid var(--border-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <DownloadCloud size={18} color="#06b6d4" />
                <h3 style={{ margin: 0, fontSize: '15px', color: '#f1f5f9', fontWeight: 700 }}>
                  Pull Docker Image on {machine?.hostname || 'Host'}
                </h3>
              </div>
              <button onClick={() => setShowPullModal(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePullImage} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#f1f5f9', marginBottom: '6px' }}>
                  Image Repository <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ubuntu, postgres, nginx, redis"
                  value={pullForm.image}
                  onChange={(e) => setPullForm(prev => ({ ...prev, image: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#070a11',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#f1f5f9', marginBottom: '6px' }}>
                  Tag
                </label>
                <input
                  type="text"
                  placeholder="latest"
                  value={pullForm.tag}
                  onChange={(e) => setPullForm(prev => ({ ...prev, tag: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#070a11',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowPullModal(false)}
                  style={{
                    padding: '0 16px',
                    height: '36px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pullLoading}
                  style={{
                    padding: '0 20px',
                    height: '36px',
                    backgroundColor: '#06b6d4',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#080c14',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: pullLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {pullLoading && <RefreshCw size={14} className="spin" />}
                  {pullLoading ? 'Pulling Image...' : 'Pull Image'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Internal Custom CSS */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
        .container-row:hover { background-color: rgba(255, 255, 255, 0.03) !important; }
      `}</style>
    </div>
  );
}
