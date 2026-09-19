import React, { useEffect, useState, useMemo } from 'react';
import { 
  Layers, 
  Activity, 
  RefreshCw, 
  Server, 
  AlertTriangle, 
  ShieldCheck, 
  Play, 
  Square, 
  RotateCw, 
  Trash2, 
  FileText, 
  Copy, 
  Check, 
  Terminal, 
  Plus, 
  Download, 
  Box, 
  Globe, 
  HardDrive, 
  Zap, 
  X, 
  Search, 
  Info,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { listServers } from '../api/server.js';
import { 
  getDockerContainers, 
  getDockerOverview, 
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
} from '../api/docker.js';
import { useDashboardStore } from '../store/dashboardStore.jsx';
import ServerSelectDropdown from '../components/common/ServerSelectDropdown.jsx';

export default function DockerPage() {
  const [servers, setServers] = useState([]);
  const [containers, setContainers] = useState([]);
  const [images, setImages] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [events, setEvents] = useState([]);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedServerId, setSelectedServerId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('containers'); // 'containers' | 'images' | 'networks' | 'volumes' | 'events'
  const [actionLoading, setActionLoading] = useState({});
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Modals
  const [showRunModal, setShowRunModal] = useState(false);
  const [showPullModal, setShowPullModal] = useState(false);
  const [activeLogContainer, setActiveLogContainer] = useState(null);
  const [containerLogs, setContainerLogs] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);

  // Run Container Form State
  const [runForm, setRunForm] = useState({
    serverId: '',
    image: 'nginx:alpine',
    name: '',
    ports: '8080:80',
    environment: '',
    volumes: '',
    restartPolicy: 'unless-stopped',
    command: '',
    network: '',
  });

  // Pull Image Form State
  const [pullForm, setPullForm] = useState({
    serverId: '',
    image: 'redis:alpine',
  });

  const { addToast } = useDashboardStore();

  const backendHost = typeof window !== 'undefined' ? (window.location.hostname || '192.168.1.2') : '192.168.1.2';
  const dockerCmd = `docker run -d --name infrapilot-agent --restart always --net=host -v /var/run/docker.sock:/var/run/docker.sock:ro -e BACKEND_URL=http://${backendHost}:8080 infrapilot/agent:latest`;

  const handleCopyCmd = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(dockerCmd);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
      addToast('success', 'Copied', 'Docker 1-line run command copied to clipboard.');
    }
  };

  const fetchDockerData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const serverList = await listServers();
      setServers(serverList);

      const onlineServers = serverList.filter(
        s => String(s.status || '').toUpperCase() === 'ONLINE' && !s.is_blocked
      );

      // Default runForm serverId if empty
      if (!runForm.serverId && onlineServers.length > 0) {
        const firstId = onlineServers[0].id || onlineServers[0].ID || onlineServers[0].machine_id;
        setRunForm(prev => ({ ...prev, serverId: firstId }));
        setPullForm(prev => ({ ...prev, serverId: firstId }));
      }

      const allContainers = [];
      const allImages = [];
      const allNetworks = [];
      const allVolumes = [];
      const allEvents = [];

      // Fetch docker telemetry in parallel for all online servers
      await Promise.allSettled(
        onlineServers.map(async (server) => {
          const sId = server.id || server.ID || server.Id || server.machine_id;
          const hostName = server.hostname || server.name || 'Host';

          try {
            const [cData, iData, nData, vData, eData] = await Promise.allSettled([
              getDockerContainers(sId),
              getDockerImages(sId),
              getDockerNetworks(sId),
              getDockerVolumes(sId),
              getDockerEvents(sId)
            ]);

            if (cData.status === 'fulfilled' && Array.isArray(cData.value)) {
              allContainers.push(...cData.value.map(c => ({ ...c, hostServerName: hostName, hostServerId: sId })));
            }
            if (iData.status === 'fulfilled' && Array.isArray(iData.value)) {
              allImages.push(...iData.value.map(i => ({ ...i, hostServerName: hostName, hostServerId: sId })));
            }
            if (nData.status === 'fulfilled' && Array.isArray(nData.value)) {
              allNetworks.push(...nData.value.map(n => ({ ...n, hostServerName: hostName, hostServerId: sId })));
            }
            if (vData.status === 'fulfilled' && Array.isArray(vData.value)) {
              allVolumes.push(...vData.value.map(v => ({ ...v, hostServerName: hostName, hostServerId: sId })));
            }
            if (eData.status === 'fulfilled' && Array.isArray(eData.value)) {
              allEvents.push(...eData.value.map(e => ({ ...e, hostServerName: hostName, hostServerId: sId })));
            }
          } catch (err) {
            console.log(`No Docker daemon response for server ${hostName}`);
          }
        })
      );

      setContainers(allContainers);
      setImages(allImages);
      setNetworks(allNetworks);
      setVolumes(allVolumes);
      setEvents(allEvents);
    } catch (err) {
      setError(err.message || 'Failed to retrieve Docker information.');
      addToast('critical', 'Docker Sync Failed', err.message || 'Unable to contact docker nodes.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDockerData();
    const interval = setInterval(() => {
      fetchDockerData(true);
    }, 12000);
    return () => clearInterval(interval);
  }, []);

  // Container Actions (Start, Stop, Restart, Remove)
  const handleContainerAction = async (container, action) => {
    const sId = container.hostServerId;
    const cId = container.id || container.ID || container.name || container.Name;
    if (!sId || !cId) return;

    setActionLoading(prev => ({ ...prev, [cId]: action }));
    try {
      if (action === 'start') await startContainer(sId, cId);
      else if (action === 'stop') await stopContainer(sId, cId);
      else if (action === 'restart') await restartContainer(sId, cId);
      else if (action === 'remove') await removeContainer(sId, cId);

      // Optimistic update locally
      setContainers(prev => prev.map(c => {
        if ((c.id === cId || c.name === cId) && c.hostServerId === sId) {
          if (action === 'start' || action === 'restart') {
            return { ...c, state: 'running', status: 'Up Less than a second' };
          }
          if (action === 'stop') {
            return { ...c, state: 'exited', status: 'Exited (0) Just now', cpu_percent: 0 };
          }
        }
        return c;
      }).filter(c => action !== 'remove' || !((c.id === cId || c.name === cId) && c.hostServerId === sId)));

      addToast('success', `Container ${action.toUpperCase()}`, `Dispatched ${action} signal for container ${container.name || cId} on ${container.hostServerName}.`);
      setTimeout(() => fetchDockerData(true), 1500);
    } catch (err) {
      addToast('critical', `Action Failed: ${action}`, err.response?.data?.error || err.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [cId]: null }));
    }
  };

  // Run Container Form Submit
  const handleRunSubmit = async (e) => {
    e.preventDefault();
    if (!runForm.serverId || !runForm.image) {
      addToast('warning', 'Validation Error', 'Please select a host machine and specify a Docker image.');
      return;
    }

    const payload = {
      machine_id: runForm.serverId,
      image: runForm.image.trim(),
      name: runForm.name.trim(),
      restart_policy: runForm.restartPolicy,
      ports: runForm.ports ? runForm.ports.split(',').map(p => p.trim()).filter(Boolean) : [],
      environment: runForm.environment ? runForm.environment.split(',').map(e => e.trim()).filter(Boolean) : [],
      volumes: runForm.volumes ? runForm.volumes.split(',').map(v => v.trim()).filter(Boolean) : [],
      command: runForm.command.trim(),
      network: runForm.network.trim(),
    };

    try {
      await runContainer(payload);
      addToast('success', 'Container Run Enqueued', `Dispatched run request for image "${payload.image}" to target machine.`);
      setShowRunModal(false);
      setTimeout(() => fetchDockerData(true), 1200);
    } catch (err) {
      addToast('critical', 'Run Failed', err.response?.data?.error || err.message);
    }
  };

  // Pull Image Form Submit
  const handlePullSubmit = async (e) => {
    e.preventDefault();
    if (!pullForm.serverId || !pullForm.image) {
      addToast('warning', 'Validation Error', 'Please select a host machine and enter image name.');
      return;
    }

    try {
      await pullImage(pullForm.serverId, pullForm.image.trim());
      addToast('success', 'Image Pull Enqueued', `Pull request for image "${pullForm.image}" sent to agent.`);
      setShowPullModal(false);
      setTimeout(() => fetchDockerData(true), 1500);
    } catch (err) {
      addToast('critical', 'Pull Failed', err.response?.data?.error || err.message);
    }
  };

  // Remove Image
  const handleRemoveImage = async (img) => {
    const sId = img.hostServerId;
    const imgName = img.id || img.name || img.repository;
    if (!sId || !imgName) return;

    if (!window.confirm(`Are you sure you want to remove image "${img.name || imgName}" from ${img.hostServerName}?`)) {
      return;
    }

    try {
      await removeImage(sId, imgName, true);
      setImages(prev => prev.filter(i => !(i.id === img.id && i.hostServerId === sId)));
      addToast('success', 'Image Removed', `Image ${img.name || imgName} removed from ${img.hostServerName}.`);
      setTimeout(() => fetchDockerData(true), 1500);
    } catch (err) {
      addToast('critical', 'Remove Image Failed', err.response?.data?.error || err.message);
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

    const failed = containers.filter(c => {
      const status = String(c.status || '').toLowerCase();
      return status.includes('exit (1') || status.includes('dead') || status.includes('failed');
    }).length;

    const totalCpu = containers.reduce((acc, c) => acc + (c.cpu_percent || 0), 0);
    const totalMem = containers.reduce((acc, c) => acc + (c.memory_used_bytes || c.memory_used || 0), 0);

    return { total, running, stopped, restarting, failed, totalCpu, totalMem };
  }, [containers]);

  // Filtered lists
  const filteredContainers = useMemo(() => {
    return containers.filter(c => {
      if (selectedServerId !== 'all' && String(c.hostServerId) !== String(selectedServerId)) {
        return false;
      }
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const name = String(c.names || c.Names || c.name || '').toLowerCase();
      const image = String(c.image || c.Image || '').toLowerCase();
      const server = String(c.hostServerName || '').toLowerCase();
      return name.includes(q) || image.includes(q) || server.includes(q);
    });
  }, [containers, selectedServerId, searchQuery]);

  const filteredImages = useMemo(() => {
    return images.filter(img => {
      if (selectedServerId !== 'all' && String(img.hostServerId) !== String(selectedServerId)) {
        return false;
      }
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const name = String(img.name || img.repository || '').toLowerCase();
      const tag = String(img.tag || '').toLowerCase();
      const server = String(img.hostServerName || '').toLowerCase();
      return name.includes(q) || tag.includes(q) || server.includes(q);
    });
  }, [images, selectedServerId, searchQuery]);

  const onlineServersList = useMemo(() => {
    return servers.filter(s => String(s.status || '').toUpperCase() === 'ONLINE' && !s.is_blocked);
  }, [servers]);

  return (
    <div className="docker-page" style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* ── Page Header ── */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <Layers size={28} color="#06b6d4" />
            Central Docker Management & Fleet Control
          </h1>
          <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px', marginBottom: 0 }}>
            Full multi-node container lifecycle control: run images, start/stop containers, pull images, and monitor real-time telemetry across connected hosts.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              if (selectedServerId !== 'all') {
                setRunForm(prev => ({ ...prev, serverId: selectedServerId }));
              }
              setShowRunModal(true);
            }}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 700,
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
              transition: 'all 0.15s'
            }}
          >
            <Plus size={16} />
            Deploy Container
          </button>

          <button
            onClick={() => {
              if (selectedServerId !== 'all') {
                setPullForm(prev => ({ ...prev, serverId: selectedServerId }));
              }
              setShowPullModal(true);
            }}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              backgroundColor: 'rgba(6, 182, 212, 0.12)',
              color: '#06b6d4',
              border: '1px solid rgba(6, 182, 212, 0.35)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            <Download size={14} />
            Pull Image
          </button>

          <button
            className="refresh-btn"
            onClick={() => fetchDockerData(true)}
            disabled={loading || refreshing}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              backgroundColor: '#1f2e44',
              color: '#f1f5f9',
              border: '1px solid #2e3f5a',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Syncing...' : 'Sync Fleet'}
          </button>
        </div>
      </div>

      {/* ── 1-Line Docker Deploy Banner ── */}
      <div style={{
        background: 'linear-gradient(90deg, rgba(6, 182, 212, 0.1) 0%, rgba(13, 18, 32, 0.95) 100%)',
        border: '1px solid rgba(6, 182, 212, 0.25)',
        borderRadius: '10px',
        padding: '12px 16px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'rgba(6, 182, 212, 0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Terminal size={16} color="#06b6d4" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Connect Any Remote Machine to Docker Fleet
            </span>
            <code style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#e2e8f0',
              backgroundColor: '#090d16',
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid #1e293b',
              wordBreak: 'break-all',
            }}>
              {dockerCmd}
            </code>
          </div>
        </div>

        <button
          onClick={handleCopyCmd}
          type="button"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 12px',
            background: copiedCmd ? '#064e3b' : '#0369a1',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {copiedCmd ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
          <span>{copiedCmd ? 'Copied!' : 'Copy Command'}</span>
        </button>
      </div>

      {/* ── KPI Stats Grid ── */}
      <div className="docker-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div className="kpi-card" style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '10px', padding: '16px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Containers</span>
          <strong style={{ display: 'block', fontSize: '26px', fontWeight: 800, color: '#f1f5f9', marginTop: '4px' }}>{stats.total}</strong>
        </div>
        <div className="kpi-card" style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '10px', padding: '16px', borderLeft: '3px solid #22c55e' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase' }}>Running</span>
          <strong style={{ display: 'block', fontSize: '26px', fontWeight: 800, color: '#22c55e', marginTop: '4px' }}>{stats.running}</strong>
        </div>
        <div className="kpi-card" style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '10px', padding: '16px', borderLeft: '3px solid #f59e0b' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>Stopped / Exited</span>
          <strong style={{ display: 'block', fontSize: '26px', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>{stats.stopped}</strong>
        </div>
        <div className="kpi-card" style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '10px', padding: '16px', borderLeft: '3px solid #38bdf8' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>Docker Images</span>
          <strong style={{ display: 'block', fontSize: '26px', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>{images.length}</strong>
        </div>
        <div className="kpi-card" style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '10px', padding: '16px', borderLeft: '3px solid #a855f7' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase' }}>Volumes / Net</span>
          <strong style={{ display: 'block', fontSize: '26px', fontWeight: 800, color: '#a855f7', marginTop: '4px' }}>{volumes.length} / {networks.length}</strong>
        </div>
      </div>

      {/* ── Sub-Tab Toolbar & Node Selector ── */}
      <div style={{
        backgroundColor: '#0d1220',
        border: '1px solid #1f2e44',
        borderRadius: '10px',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {[
            { id: 'containers', label: 'Containers', count: containers.length, icon: Box },
            { id: 'images', label: 'Docker Images', count: images.length, icon: Layers },
            { id: 'networks', label: 'Networks', count: networks.length, icon: Globe },
            { id: 'volumes', label: 'Volumes', count: volumes.length, icon: HardDrive },
            { id: 'events', label: 'Events Audit', count: events.length, icon: Zap }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  backgroundColor: isActive ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                  border: isActive ? '1px solid #06b6d4' : '1px solid transparent',
                  borderRadius: '6px',
                  color: isActive ? '#06b6d4' : '#94a3b8',
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
                  backgroundColor: isActive ? '#06b6d4' : 'rgba(255, 255, 255, 0.08)',
                  color: isActive ? '#080c14' : '#cbd5e1',
                  fontSize: '10px',
                  fontWeight: 700
                }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#080c14', border: '1px solid #1f2e44', borderRadius: '6px', padding: '6px 10px', width: '220px' }}>
            <Search size={14} color="#64748b" />
            <input
              type="text"
              placeholder="Search by name, image, host..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ background: 'none', border: 'none', color: '#f1f5f9', outline: 'none', width: '100%', fontSize: '12px' }}
            />
          </div>

          <ServerSelectDropdown
            value={selectedServerId}
            onChange={(sId) => setSelectedServerId(sId)}
            showAll={true}
            allLabel="All Connected Hosts"
          />
        </div>
      </div>

      {/* ── Sub-Tab Content ── */}

      {/* TAB 1: CONTAINERS */}
      {activeTab === 'containers' && (
        <div className="table-wrapper" style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', overflow: 'hidden' }}>
          {filteredContainers.length === 0 ? (
            <div className="empty-state" style={{ textAlign: 'center', padding: '60px 24px', color: '#64748b' }}>
              <Box size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <strong style={{ color: '#cbd5e1', display: 'block', fontSize: '15px' }}>No active containers found</strong>
              <p style={{ fontSize: '12px', marginTop: '4px', color: '#64748b' }}>
                Use "Deploy Container" above to run any Docker container on your connected nodes.
              </p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#080c14', borderBottom: '1px solid #1f2e44', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Container</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Image</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Host Machine</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>CPU / Memory</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Actions & Controls</th>
                </tr>
              </thead>
              <tbody>
                {filteredContainers.map((container, idx) => {
                  const state = String(container.state || container.State || container.status || '').toLowerCase();
                  const isUp = state === 'running' || state.includes('up');
                  const isRestarting = state.includes('restarting');
                  const rawId = container.id || container.ID || container.name || `c-${idx}`;
                  const shortId = rawId.length > 12 ? rawId.substring(0, 12) : rawId;
                  const name = container.names || container.Names || container.name || 'unnamed';
                  const cpu = container.cpu_percent || container.cpu_stats || 0;
                  const memUsed = container.memory_used_bytes || container.memory_used || 0;
                  const isBusy = actionLoading[rawId] || actionLoading[name];

                  return (
                    <tr key={rawId} style={{ borderBottom: '1px solid rgba(31, 46, 68, 0.4)', color: '#cbd5e1' }}>
                      {/* Name & ID */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '14px' }}>{name}</span>
                          <span
                            onClick={() => handleCopyId(rawId)}
                            style={{ fontSize: '11px', color: copiedId === rawId ? '#34d399' : '#64748b', fontFamily: 'monospace', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                            title="Click to copy Container ID"
                          >
                            {copiedId === rawId ? <Check size={10} /> : <Copy size={10} />}
                            {shortId}
                          </span>
                        </div>
                      </td>

                      {/* Image */}
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>
                        <span style={{ padding: '2px 6px', backgroundColor: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.25)', borderRadius: '4px', color: '#06b6d4', fontSize: '11px' }}>
                          {container.image || container.Image || '--'}
                        </span>
                      </td>

                      {/* Host Machine */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#38bdf8' }}>
                          <Server size={13} color="#06b6d4" />
                          {container.hostServerName}
                        </span>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: isUp ? 'rgba(34, 197, 94, 0.12)' : (isRestarting ? 'rgba(234, 179, 8, 0.12)' : 'rgba(239, 68, 68, 0.12)'),
                            color: isUp ? '#22c55e' : (isRestarting ? '#eab308' : '#ef4444'),
                            border: isUp ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: isUp ? '#22c55e' : (isRestarting ? '#eab308' : '#ef4444') }} />
                          {container.status || (isUp ? 'Running' : 'Exited')}
                        </span>
                      </td>

                      {/* CPU / Memory */}
                      <td style={{ padding: '12px 16px' }}>
                        {isUp ? (
                          <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                            <strong style={{ color: '#f1f5f9' }}>{typeof cpu === 'number' ? `${cpu.toFixed(1)}%` : cpu}</strong>
                            {' CPU • '}
                            <strong style={{ color: '#c084fc' }}>{formatBytes(memUsed)}</strong>
                          </span>
                        ) : (
                          <span style={{ color: '#64748b' }}>--</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          {isUp ? (
                            <button
                              onClick={() => handleContainerAction(container, 'stop')}
                              disabled={Boolean(isBusy)}
                              type="button"
                              style={{
                                padding: '5px 8px',
                                backgroundColor: 'rgba(234, 179, 8, 0.12)',
                                border: '1px solid rgba(234, 179, 8, 0.35)',
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
                              onClick={() => handleContainerAction(container, 'start')}
                              disabled={Boolean(isBusy)}
                              type="button"
                              style={{
                                padding: '5px 8px',
                                backgroundColor: 'rgba(34, 197, 94, 0.12)',
                                border: '1px solid rgba(34, 197, 94, 0.35)',
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

                          <button
                            onClick={() => handleContainerAction(container, 'restart')}
                            disabled={Boolean(isBusy)}
                            type="button"
                            style={{
                              padding: '5px 8px',
                              backgroundColor: 'rgba(6, 182, 212, 0.12)',
                              border: '1px solid rgba(6, 182, 212, 0.35)',
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

                          <button
                            onClick={() => handleOpenLogs(container)}
                            type="button"
                            style={{
                              padding: '5px 8px',
                              backgroundColor: '#1f2e44',
                              border: '1px solid #2e3f5a',
                              borderRadius: '6px',
                              color: '#f1f5f9',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 600
                            }}
                            title="View Container Logs"
                          >
                            <FileText size={12} />
                            Logs
                          </button>

                          <button
                            onClick={() => {
                              if (window.confirm(`Delete container "${name}" on ${container.hostServerName}?`)) {
                                handleContainerAction(container, 'remove');
                              }
                            }}
                            type="button"
                            style={{
                              padding: '5px 8px',
                              backgroundColor: 'rgba(239, 68, 68, 0.12)',
                              border: '1px solid rgba(239, 68, 68, 0.35)',
                              borderRadius: '6px',
                              color: '#f87171',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title="Remove Container"
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

      {/* TAB 2: DOCKER IMAGES */}
      {activeTab === 'images' && (
        <div className="table-wrapper" style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', overflow: 'hidden' }}>
          {filteredImages.length === 0 ? (
            <div className="empty-state" style={{ textAlign: 'center', padding: '60px 24px', color: '#64748b' }}>
              <Layers size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <strong style={{ color: '#cbd5e1', display: 'block', fontSize: '15px' }}>No Docker images found on connected nodes</strong>
              <p style={{ fontSize: '12px', marginTop: '4px', color: '#64748b' }}>
                Use "Pull Image" above to pull Docker images directly onto your nodes.
              </p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#080c14', borderBottom: '1px solid #1f2e44', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Image & Tag</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Host Machine</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Image ID</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Size</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredImages.map((img, idx) => {
                  const imgName = img.repository || img.name || 'unnamed';
                  const imgTag = img.tag || 'latest';
                  const fullImageName = `${imgName}:${imgTag}`;

                  return (
                    <tr key={img.id || idx} style={{ borderBottom: '1px solid rgba(31, 46, 68, 0.4)', color: '#cbd5e1' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Layers size={16} color="#06b6d4" />
                          <strong style={{ color: '#f1f5f9', fontSize: '14px' }}>{imgName}</strong>
                          <span style={{ padding: '2px 6px', backgroundColor: 'rgba(6, 182, 212, 0.15)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '4px', color: '#06b6d4', fontSize: '11px', fontFamily: 'monospace' }}>
                            {imgTag}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#38bdf8' }}>
                          <Server size={13} color="#06b6d4" />
                          {img.hostServerName}
                        </span>
                      </td>

                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#64748b', fontSize: '12px' }}>
                        {(img.id || '').substring(0, 16)}
                      </td>

                      <td style={{ padding: '12px 16px', color: '#38bdf8', fontFamily: 'monospace' }}>
                        {img.size || (img.size_bytes ? formatBytes(img.size_bytes) : '-')}
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button
                            onClick={() => {
                              setRunForm({
                                serverId: img.hostServerId,
                                image: fullImageName,
                                name: `${imgName.split('/').pop()}-app`,
                                ports: '8080:80',
                                environment: '',
                                volumes: '',
                                restartPolicy: 'unless-stopped',
                                command: '',
                                network: '',
                              });
                              setShowRunModal(true);
                            }}
                            type="button"
                            style={{
                              padding: '5px 10px',
                              backgroundColor: 'rgba(2, 132, 199, 0.15)',
                              border: '1px solid rgba(2, 132, 199, 0.4)',
                              borderRadius: '6px',
                              color: '#38bdf8',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 700
                            }}
                            title="Run Container From This Image"
                          >
                            <Play size={12} fill="#38bdf8" />
                            Run Container
                          </button>

                          <button
                            onClick={() => handleRemoveImage(img)}
                            type="button"
                            style={{
                              padding: '5px 8px',
                              backgroundColor: 'rgba(239, 68, 68, 0.12)',
                              border: '1px solid rgba(239, 68, 68, 0.35)',
                              borderRadius: '6px',
                              color: '#f87171',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title="Delete Image"
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

      {/* TAB 3: NETWORKS */}
      {activeTab === 'networks' && (
        <div className="table-wrapper" style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', overflow: 'hidden' }}>
          {networks.length === 0 ? (
            <div style={{ padding: '60px 24px', textAlign: 'center', color: '#64748b' }}>
              No custom Docker networks detected across fleet.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#080c14', borderBottom: '1px solid #1f2e44', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Network Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Host Machine</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Driver</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Scope</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Subnet / Gateway</th>
                </tr>
              </thead>
              <tbody>
                {networks.map((net, idx) => (
                  <tr key={net.id || idx} style={{ borderBottom: '1px solid rgba(31, 46, 68, 0.4)', color: '#cbd5e1' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Globe size={15} color="#3b82f6" />
                        {net.name}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#38bdf8' }}>{net.hostServerName}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ padding: '2px 6px', backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '4px', color: '#3b82f6', fontSize: '11px', fontFamily: 'monospace' }}>
                        {net.driver || 'bridge'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#64748b' }}>{net.scope || 'local'}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#94a3b8' }}>{net.subnet || net.gateway || 'Default'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB 4: VOLUMES */}
      {activeTab === 'volumes' && (
        <div className="table-wrapper" style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', overflow: 'hidden' }}>
          {volumes.length === 0 ? (
            <div style={{ padding: '60px 24px', textAlign: 'center', color: '#64748b' }}>
              No persistent volumes mapped across fleet.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#080c14', borderBottom: '1px solid #1f2e44', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Volume Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Host Machine</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Driver</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Mount Point</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Size</th>
                </tr>
              </thead>
              <tbody>
                {volumes.map((vol, idx) => (
                  <tr key={vol.name || idx} style={{ borderBottom: '1px solid rgba(31, 46, 68, 0.4)', color: '#cbd5e1' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <HardDrive size={15} color="#a855f7" />
                        {vol.name}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#38bdf8' }}>{vol.hostServerName}</td>
                    <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{vol.driver || 'local'}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#64748b', fontSize: '11px' }}>{vol.mountpoint || vol.Mountpoint || vol.mount_point || '-'}</td>
                    <td style={{ padding: '12px 16px', color: '#c084fc', fontWeight: 600 }}>{vol.size || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB 5: EVENTS */}
      {activeTab === 'events' && (
        <div className="table-wrapper" style={{ backgroundColor: '#0d1220', border: '1px solid #1f2e44', borderRadius: '12px', overflow: 'hidden' }}>
          {events.length === 0 ? (
            <div style={{ padding: '60px 24px', textAlign: 'center', color: '#64748b' }}>
              No recent Docker lifecycle audit events.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#080c14', borderBottom: '1px solid #1f2e44', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Timestamp</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Host Machine</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Action</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Resource Target</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt, idx) => (
                  <tr key={evt.id || idx} style={{ borderBottom: '1px solid rgba(31, 46, 68, 0.4)', color: '#cbd5e1' }}>
                    <td style={{ padding: '12px 16px', color: '#64748b', fontFamily: 'monospace', fontSize: '11px' }}>
                      {evt.time || evt.timestamp ? new Date(evt.time || evt.timestamp).toLocaleString() : '-'}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#38bdf8' }}>{evt.hostServerName}</td>
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
      {/* MODAL 1: DEPLOY / RUN CONTAINER MODAL */}
      {/* ========================================================================= */}
      {showRunModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#0d1220',
            border: '1px solid #1f2e44',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '560px',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.85)'
          }}>
            <div style={{
              padding: '16px 20px',
              backgroundColor: '#111827',
              borderBottom: '1px solid #1f2e44',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Play size={18} color="#0284c7" fill="#0284c7" />
                <h3 style={{ margin: 0, fontSize: '16px', color: '#f1f5f9', fontWeight: 700 }}>
                  Deploy New Docker Container
                </h3>
              </div>
              <button
                onClick={() => setShowRunModal(false)}
                type="button"
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRunSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Target Host */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Target Connected Host <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={runForm.serverId}
                  onChange={(e) => setRunForm({ ...runForm, serverId: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#080c14',
                    border: '1px solid #1f2e44',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                >
                  <option value="" disabled>-- Select Connected Host --</option>
                  {onlineServersList.map(s => {
                    const sId = s.id || s.ID || s.machine_id;
                    return (
                      <option key={sId} value={sId}>
                        {s.hostname || s.name} ({s.ip_address || 'Connected'})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Docker Image */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Docker Image <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. nginx:alpine, redis:7-alpine, postgres:15"
                  value={runForm.image}
                  onChange={(e) => setRunForm({ ...runForm, image: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#080c14',
                    border: '1px solid #1f2e44',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                  {['nginx:alpine', 'redis:7-alpine', 'postgres:15-alpine', 'alpine:latest', 'httpd:alpine'].map(suggested => (
                    <button
                      key={suggested}
                      type="button"
                      onClick={() => setRunForm({ ...runForm, image: suggested })}
                      style={{
                        padding: '2px 8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid #1f2e44',
                        borderRadius: '4px',
                        color: '#38bdf8',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      {suggested}
                    </button>
                  ))}
                </div>
              </div>

              {/* Container Name */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Container Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. my-web-app"
                  value={runForm.name}
                  onChange={(e) => setRunForm({ ...runForm, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#080c14',
                    border: '1px solid #1f2e44',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Ports & Restart Policy (2 Columns) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                    Port Mappings
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 8080:80, 5432:5432"
                    value={runForm.ports}
                    onChange={(e) => setRunForm({ ...runForm, ports: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: '#080c14',
                      border: '1px solid #1f2e44',
                      borderRadius: '6px',
                      color: '#f1f5f9',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                    Restart Policy
                  </label>
                  <select
                    value={runForm.restartPolicy}
                    onChange={(e) => setRunForm({ ...runForm, restartPolicy: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: '#080c14',
                      border: '1px solid #1f2e44',
                      borderRadius: '6px',
                      color: '#f1f5f9',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  >
                    <option value="unless-stopped">unless-stopped</option>
                    <option value="always">always</option>
                    <option value="on-failure">on-failure</option>
                    <option value="no">no (none)</option>
                  </select>
                </div>
              </div>

              {/* Env Vars & Volume Mounts (2 Columns) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                    Environment Variables
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ENV=prod, PORT=80"
                    value={runForm.environment}
                    onChange={(e) => setRunForm({ ...runForm, environment: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: '#080c14',
                      border: '1px solid #1f2e44',
                      borderRadius: '6px',
                      color: '#f1f5f9',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                    Volumes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. /data:/var/lib/data"
                    value={runForm.volumes}
                    onChange={(e) => setRunForm({ ...runForm, volumes: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: '#080c14',
                      border: '1px solid #1f2e44',
                      borderRadius: '6px',
                      color: '#f1f5f9',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowRunModal(false)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'transparent',
                    border: '1px solid #1f2e44',
                    borderRadius: '6px',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 20px',
                    backgroundColor: '#0284c7',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  <Play size={14} fill="#ffffff" />
                  Launch Container
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: PULL IMAGE MODAL */}
      {/* ========================================================================= */}
      {showPullModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#0d1220',
            border: '1px solid #1f2e44',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '480px',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.85)'
          }}>
            <div style={{
              padding: '16px 20px',
              backgroundColor: '#111827',
              borderBottom: '1px solid #1f2e44',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Download size={18} color="#06b6d4" />
                <h3 style={{ margin: 0, fontSize: '16px', color: '#f1f5f9', fontWeight: 700 }}>
                  Pull Docker Image to Node
                </h3>
              </div>
              <button
                onClick={() => setShowPullModal(false)}
                type="button"
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePullSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Target Host */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Target Node <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={pullForm.serverId}
                  onChange={(e) => setPullForm({ ...pullForm, serverId: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#080c14',
                    border: '1px solid #1f2e44',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                >
                  <option value="" disabled>-- Select Connected Host --</option>
                  {onlineServersList.map(s => {
                    const sId = s.id || s.ID || s.machine_id;
                    return (
                      <option key={sId} value={sId}>
                        {s.hostname || s.name} ({s.ip_address || 'Connected'})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Docker Image */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Image Repository & Tag <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. ubuntu:22.04, redis:alpine, node:20"
                  value={pullForm.image}
                  onChange={(e) => setPullForm({ ...pullForm, image: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#080c14',
                    border: '1px solid #1f2e44',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowPullModal(false)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'transparent',
                    border: '1px solid #1f2e44',
                    borderRadius: '6px',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 20px',
                    backgroundColor: '#0284c7',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  <Download size={14} />
                  Start Pulling Image
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: LIVE LOG VIEWER MODAL */}
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
          zIndex: 99999,
          padding: '24px'
        }}>
          <div style={{
            backgroundColor: '#0a0e17',
            border: '1px solid #1f2e44',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '900px',
            height: '75vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.85)'
          }}>
            <div style={{
              padding: '14px 20px',
              backgroundColor: '#111827',
              borderBottom: '1px solid #1f2e44',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Terminal size={18} color="#06b6d4" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', color: '#f1f5f9', fontWeight: 700 }}>
                    Logs: {activeLogContainer.name || activeLogContainer.names || activeLogContainer.id}
                  </h3>
                  <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                    {activeLogContainer.image} • Host: {activeLogContainer.hostServerName}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => handleOpenLogs(activeLogContainer)}
                  disabled={logsLoading}
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid #1f2e44',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  <RefreshCw size={13} className={logsLoading ? 'spin' : ''} />
                  Refresh
                </button>
                <button
                  onClick={() => setActiveLogContainer(null)}
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div style={{
              flex: 1,
              backgroundColor: '#050811',
              padding: '16px',
              fontFamily: 'monospace',
              fontSize: '12px',
              lineHeight: '1.6',
              color: '#34d399',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap'
            }}>
              {logsLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#06b6d4' }}>
                  <RefreshCw size={14} className="spin" /> Loading streaming logs...
                </div>
              ) : (
                containerLogs || 'No log output available for this container.'
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}
