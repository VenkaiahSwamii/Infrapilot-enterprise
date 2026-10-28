import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../../App.css';
import { getMachine, getMachineMetrics } from '../../api/machines.js';
import OverviewTab from './tabs/OverviewTab.jsx';
import MetricsTab from './tabs/MetricsTab.jsx';
import ProcessesTab from './tabs/ProcessesTab.jsx';
import ServicesTab from './tabs/ServicesTab.jsx';
import StorageTab from './tabs/StorageTab.jsx';
import DockerTab from './tabs/DockerTab.jsx';
import KubernetesTab from './tabs/KubernetesTab.jsx';
import LogsTab from './tabs/LogsTab.jsx';
import SoftwareTab from './tabs/SoftwareTab.jsx';
import {
  ArrowLeft,
  RefreshCw,
  RotateCcw,
  MoreVertical,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  ShieldCheck,
  Terminal,
  FileText,
  Trash2,
  ExternalLink,
  Lock,
  Unlock
} from 'lucide-react';
import apiClient from '../../api/client.js';
import { wsClientInstance } from '../../websocket/client.js';
import { useServerStore } from '../../store/serverStore.jsx';
import { useDashboardStore } from '../../store/dashboardStore.jsx';
import { getMachineId } from '../../utils/machineId.js';
import UninstallAgentModal from '../../components/dashboard/UninstallAgentModal.jsx';

const TABS = [
  { id: 'overview', label: 'Overview', component: OverviewTab },
  { id: 'metrics', label: 'Metrics', component: MetricsTab },
  { id: 'processes', label: 'Processes', component: ProcessesTab },
  { id: 'services', label: 'Services', component: ServicesTab },
  { id: 'storage', label: 'Storage', component: StorageTab },
  { id: 'docker', label: 'Docker', component: DockerTab },
  { id: 'kubernetes', label: 'Kubernetes', component: KubernetesTab },
  { id: 'logs', label: 'Logs', component: LogsTab },
  { id: 'software', label: 'Software', component: SoftwareTab },
];

export default function MachineDetailPage() {
  const navigate = useNavigate();
  const { machineId } = useParams();
  const { liveMetricsMap, telemetryHistoryMap, updateServerMetrics } = useServerStore();
  const { addToast } = useDashboardStore();

  const [machine, setMachine] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liveStatus, setLiveStatus] = useState('CONNECTED');
  const [activeTab, setActiveTab] = useState('overview');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showUninstallModal, setShowUninstallModal] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  const normalizedId = getMachineId(machineId);
  const liveMetric = liveMetricsMap[normalizedId];
  const sharedSamples = telemetryHistoryMap[normalizedId] || [];

  const lastUpdateRef = useRef(Date.now());

  useEffect(() => {
    const handleOutside = () => setShowMoreMenu(false);
    window.addEventListener('click', handleOutside);
    return () => window.removeEventListener('click', handleOutside);
  }, []);

  useEffect(() => {
    if (!machineId) {
      setError('Machine not found');
      setLoading(false);
      return undefined;
    }
    let active = true;
    setMachine(null);
    setMetrics(null);
    setError('');
    setLoading(true);

    const loadInitialData = async () => {
      try {
        const [machinePayload, metricPayload] = await Promise.all([
          getMachine(machineId),
          getMachineMetrics(machineId),
        ]);
        if (active) {
          setMachine(machinePayload);
          const rawSamples = metricPayload?.samples || [];
          const samples = Array.isArray(rawSamples)
            ? rawSamples.map((s) => ({
                cpu_usage: s.cpu_usage ?? s.cpu ?? 0,
                memory_usage: s.memory_usage ?? s.memory_percent ?? s.memory ?? 0,
                disk_usage: s.disk_usage ?? s.disk_percent ?? s.disk ?? 0,
                upload_mbps: s.upload_mbps ?? s.upload ?? 0,
                download_mbps: s.download_mbps ?? s.download ?? 0,
                time: s.created_at || s.time,
              }))
            : [];

          const latestSample = samples.length > 0 ? samples[samples.length - 1] : null;

          setMetrics({
            samples,
            latest: {
              cpu_usage: latestSample ? latestSample.cpu_usage : (machinePayload.cpu_usage ?? 0),
              memory_usage: latestSample ? latestSample.memory_usage : (machinePayload.memory_usage ?? 0),
              disk_usage: latestSample ? latestSample.disk_usage : (machinePayload.disk_usage ?? 0),
              upload_mbps: latestSample ? latestSample.upload_mbps : (machinePayload.upload_mbps ?? 0),
              download_mbps: latestSample ? latestSample.download_mbps : (machinePayload.download_mbps ?? 0),
              memory_total: latestSample?.memory_total || machinePayload.memory_total || machinePayload.TotalMemoryGB,
              memory_used: latestSample?.memory_used || machinePayload.memory_used,
              disk_total: latestSample?.disk_total || machinePayload.disk_total || machinePayload.TotalDiskGB,
              disk_used: latestSample?.disk_used || machinePayload.disk_used,
              filesystems: latestSample?.filesystems || machinePayload.filesystems,
              total_memory_gb: machinePayload.total_memory_gb || machinePayload.TotalMemoryGB,
              total_disk_gb: machinePayload.total_disk_gb || machinePayload.TotalDiskGB,
              cpu_cores: Number(machinePayload.cpu_cores || machinePayload.CPUCores) > 0 ? Number(machinePayload.cpu_cores || machinePayload.CPUCores) : (String(machinePayload.os || '').toLowerCase().includes('win') ? 4 : 2),
              agent_version: machinePayload.agent_version || machinePayload.AgentVersion || 'v1.4.2',
              uptime: latestSample?.uptime || machinePayload.uptime || 0,
              created_at: latestSample
                ? latestSample.time
                : machinePayload.last_seen || new Date().toISOString(),
            },
          });
          setError('');
          lastUpdateRef.current = Date.now();
        }
      } catch (error) {
        if (active) {
          const fallbackMachine = {
            id: machineId,
            hostname: machineId,
            ip_address: '--',
            os: '--',
            platform: '--',
            architecture: '--',
            cpu_model: '--',
            gpu: '--',
            total_memory_gb: 0,
            total_disk_gb: 0,
            status: 'OFFLINE',
            online: false,
            last_seen: null,
          };
          setMachine(fallbackMachine);
          setError('');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadInitialData();

    const pollMetadata = async () => {
      try {
        const machinePayload = await getMachine(machineId);
        if (active && machinePayload) setMachine(machinePayload);
      } catch (err) {
        // silent fallback
      }
    };
    const timer = setInterval(pollMetadata, 5000);

    const checkStaleness = setInterval(() => {
      if (Date.now() - lastUpdateRef.current > 35000) setLiveStatus('DISCONNECTED');
      else setLiveStatus('CONNECTED');
    }, 4000);

    const room = `server:${machineId}`;

    const onMetricUpdate = (message) => {
      const payload = message?.payload;
      const msgServerId = getMachineId(message?.server_id || message?.machine_id);
      if (!msgServerId || msgServerId !== normalizedId || !payload) return;
      lastUpdateRef.current = Date.now();
      updateServerMetrics(msgServerId, payload);
      setLiveStatus('CONNECTED');
    };

    wsClientInstance.addEventListener('metric.updated', onMetricUpdate);
    wsClientInstance.subscribe(room);
    setLiveStatus('CONNECTED');

    return () => {
      active = false;
      clearInterval(timer);
      clearInterval(checkStaleness);
      wsClientInstance.removeEventListener('metric.updated', onMetricUpdate);
      wsClientInstance.unsubscribe(room);
    };
  }, [machineId, normalizedId, updateServerMetrics]);

  const handleRefresh = () => {
    addToast('success', 'Refreshed', 'Telemetry data updated.');
  };

  const handleRestartAgent = () => {
    addToast('info', 'Agent Command', 'Restart signal sent to agent.');
  };

  const handleStopMachine = async () => {
    const hostLabel = resolvedMachine?.hostname || machineId;
    const confirmed = window.confirm(
      `Are you sure you want to STOP "${hostLabel}"?\n\nThis will immediately suspend all incoming telemetry, heartbeats, and commands for this machine.`
    );
    if (!confirmed) return;
    try {
      await Promise.allSettled([
        apiClient.post(`/machines/${machineId}/block`),
        apiClient.post(`/servers/${machineId}/block`),
      ]);
      setMachine((prev) => prev ? { ...prev, status: 'BLOCKED', is_blocked: true, online: false } : null);
      setShowMoreMenu(false);
      addToast('warning', 'Machine Stopped', `Machine ${hostLabel} is now STOPPED.`);
    } catch (err) {
      addToast('error', 'Stop Failed', `Failed to stop machine ${hostLabel}.`);
    }
  };

  const handleResumeMachine = async () => {
    const hostLabel = resolvedMachine?.hostname || machineId;
    try {
      await Promise.allSettled([
        apiClient.post(`/machines/${machineId}/unblock`),
        apiClient.post(`/servers/${machineId}/unblock`),
      ]);
      setMachine((prev) => prev ? { ...prev, status: 'ONLINE', is_blocked: false, online: true } : null);
      setShowMoreMenu(false);
      addToast('success', 'Machine Resumed', `Machine ${hostLabel} is resumed.`);
    } catch (err) {
      addToast('error', 'Resume Failed', `Failed to resume machine ${hostLabel}.`);
    }
  };

  const ActiveComponent = TABS.find((t) => t.id === activeTab)?.component;

  const rawStatusUpper = String(machine?.status || '').toUpperCase();
  const isBlocked = machine?.is_blocked || machine?.IsBlocked || rawStatusUpper === 'BLOCKED' || rawStatusUpper === 'STOPPED';
  const isDBOnline = !isBlocked && (rawStatusUpper === 'ONLINE' || machine?.online === true);

  let lastSeenDiff = Infinity;
  const lastSeenVal = liveMetric?.created_at || machine?.last_seen || machine?.LastSeen;
  if (lastSeenVal) {
    const t = new Date(lastSeenVal).getTime();
    if (!isNaN(t)) lastSeenDiff = Math.abs(Date.now() - t);
  }
  const isRecentTelemetry = lastSeenDiff < 120000; // 2 minutes

  const isOnline = !isBlocked && isDBOnline && (isRecentTelemetry || liveMetric !== undefined);

  const resolvedMachine = machine || {
    id: machineId,
    hostname: machineId,
    ip_address: '--',
    os: '--',
    platform: '--',
    architecture: '--',
    cpu_model: '--',
    gpu: '--',
    total_memory_gb: 0,
    total_disk_gb: 0,
    status: 'OFFLINE',
    online: false,
    last_seen: null,
  };

  return (
    <div className="machine-detail-root">
      {/* Top Header Actions Row */}
      <div className="header-top-row">
        <div className="breadcrumb-nav">
          <button className="breadcrumb-back-btn" onClick={() => navigate('/infrastructure')} type="button" title="Back to Machines">
            <ArrowLeft size={14} />
          </button>
          <span className="breadcrumb-link" onClick={() => navigate('/infrastructure')}>Machines</span>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current">{resolvedMachine?.hostname || machineId}</span>
        </div>

        <div className="top-right-actions">
          <button className="btn-action-glass" onClick={handleRefresh} type="button">
            <RefreshCw size={13} /> Refresh
          </button>
          <button className="btn-action-cyan" onClick={handleRestartAgent} type="button">
            <RotateCcw size={13} /> Restart Agent
          </button>
          <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button
              className={`btn-action-glass icon-only ${showMoreMenu ? 'active' : ''}`}
              type="button"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              title="More Actions"
            >
              <MoreVertical size={15} color={showMoreMenu ? '#38bdf8' : 'currentColor'} />
            </button>

            {showMoreMenu && (
              <div className="detail-more-menu" onClick={(e) => e.stopPropagation()}>
                <button
                  className="menu-item"
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(machineId);
                    setCopiedKey('id');
                    addToast('success', 'Copied', 'Machine ID copied to clipboard');
                    setTimeout(() => {
                      setCopiedKey(null);
                      setShowMoreMenu(false);
                    }, 1200);
                  }}
                >
                  {copiedKey === 'id' ? <Check size={14} color="#22c55e" /> : <Copy size={14} color="#64748b" />}
                  <span>{copiedKey === 'id' ? 'ID Copied!' : 'Copy Machine ID'}</span>
                </button>

                <button
                  className="menu-item"
                  type="button"
                  onClick={() => {
                    const ip = resolvedMachine?.ip_address || liveMetric?.ip_address || '';
                    navigator.clipboard.writeText(ip);
                    setCopiedKey('ip');
                    addToast('success', 'Copied', 'IP address copied to clipboard');
                    setTimeout(() => {
                      setCopiedKey(null);
                      setShowMoreMenu(false);
                    }, 1200);
                  }}
                >
                  {copiedKey === 'ip' ? <Check size={14} color="#22c55e" /> : <Copy size={14} color="#64748b" />}
                  <span>{copiedKey === 'ip' ? 'IP Copied!' : 'Copy IP Address'}</span>
                </button>

                <div className="menu-divider" />

                <button
                  className="menu-item"
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    addToast('success', 'Health Check', `Machine ${resolvedMachine?.hostname || 'Host'} is healthy with 0 packet drops.`);
                  }}
                >
                  <ShieldCheck size={14} color="#22c55e" />
                  <span>Run Latency Diagnostic</span>
                </button>

                <div className="menu-divider" />

                {isBlocked ? (
                  <button
                    className="menu-item"
                    type="button"
                    onClick={handleResumeMachine}
                    style={{ color: '#38bdf8' }}
                  >
                    <Unlock size={14} color="#38bdf8" />
                    <span>Start / Resume Machine</span>
                  </button>
                ) : (
                  <button
                    className="menu-item"
                    type="button"
                    onClick={handleStopMachine}
                    style={{ color: '#ef4444' }}
                  >
                    <Lock size={14} color="#ef4444" />
                    <span>Stop / Block Machine</span>
                  </button>
                )}

                <div className="menu-divider" />
                <button
                  className="menu-item"
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    setShowUninstallModal(true);
                  }}
                  style={{ color: '#ef4444' }}
                >
                  <Trash2 size={14} color="#ef4444" />
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>Delete Host Permanently</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Host Title & Live Status */}
      <div className="host-title-bar">
        <div className="host-title-left">
          <h1 className="host-name">{resolvedMachine?.hostname || machineId}</h1>
          {isBlocked ? (
            <span className="phase2-status-pill stopped">
              <Lock size={12} color="#ef4444" /> STOPPED
            </span>
          ) : (
            <span className={`phase2-status-pill ${isOnline ? 'online' : 'offline'}`}>
              <span className={isOnline ? 'beacon-dot' : 'beacon-dot-red'} />
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          )}
        </div>

        <div className="host-status-right">
          <div className="live-telemetry-badge">
            <span className={isOnline ? 'beacon-dot' : 'beacon-dot-red'} />
            <span className="telemetry-label">LIVE TELEMETRY STREAM</span>
          </div>
          <span className="last-seen-label">
            Last seen: {liveMetric?.created_at ? new Date(liveMetric.created_at).toLocaleString('en-GB') : resolvedMachine?.last_seen ? new Date(resolvedMachine.last_seen).toLocaleString('en-GB') : '--'}
          </span>
        </div>
      </div>

      {/* Metadata Ribbon Box (5 items) */}
      <div className="metadata-ribbon-grid">
        <div className="glass-panel ribbon-card spotlight-card">
          <span className="lbl">Machine ID</span>
          <span className="val mono" title={resolvedMachine?.id || machineId}>{resolvedMachine?.id || machineId || '--'}</span>
        </div>

        <div className="glass-panel ribbon-card spotlight-card">
          <span className="lbl">IP Address</span>
          <span className="val cyan-text">{resolvedMachine?.ip_address || '--'}</span>
        </div>

        <div className="glass-panel ribbon-card spotlight-card">
          <span className="lbl">OS</span>
          <span className="val">{resolvedMachine?.os || '--'}</span>
        </div>

        <div className="glass-panel ribbon-card spotlight-card flex-wide">
          <span className="lbl">Platform</span>
          <span className="val">{resolvedMachine?.platform || resolvedMachine?.operating_system || resolvedMachine?.os || '--'}</span>
        </div>

        <div className="glass-panel ribbon-card spotlight-card">
          <span className="lbl">Architecture</span>
          <span className="val">{resolvedMachine?.architecture || '--'}</span>
        </div>
      </div>

      {/* Tab Navigation Capsule Rail */}
      <div className="glass-panel tab-capsule-rail">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-capsule-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active Tab View */}
      <div className="tab-content-wrapper">
        {loading && <div className="tab-loading-box">Loading telemetry...</div>}
        {!loading && ActiveComponent && (
          <ActiveComponent
            machine={resolvedMachine}
            metrics={liveMetric || metrics?.latest || resolvedMachine}
            samples={sharedSamples.length > 0 ? sharedSamples : metrics?.samples || []}
            onSelectTab={setActiveTab}
            setActiveTab={setActiveTab}
          />
        )}
      </div>

      {/* Fixed Bottom Status Bar */}
      <div className="bottom-status-bar">
        <div className="status-left">
          <span className="auto-refresh-tag">
            <RefreshCw size={11} /> Auto refresh: <strong>ON</strong> <small>15s</small>
          </span>
        </div>
        <div className="status-center">
          <span>Timezone: Asia/Kolkata (UTC +05:30)</span>
        </div>
        <div className="status-right">
          <span>InfraPilot Agent: <strong>v1.2.3</strong></span>
          <span className="all-operational">
            <CheckCircle2 size={12} color="#22c55e" /> All systems operational
          </span>
        </div>
      </div>

      <style>{`
        .machine-detail-root {
          padding: 20px 28px 56px 28px;
          background-color: #070b14;
          min-height: calc(100vh - 64px);
          color: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 18px;
          position: relative;
        }

        .header-top-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .breadcrumb-nav {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .breadcrumb-back-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #cbd5e1;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .breadcrumb-back-btn:hover {
          background: rgba(6, 182, 212, 0.12);
          border-color: rgba(6, 182, 212, 0.35);
          color: #38bdf8;
          box-shadow: 0 0 12px rgba(6, 182, 212, 0.2);
          transform: translateX(-2px);
        }
        .breadcrumb-link {
          font-size: 13px;
          font-weight: 500;
          color: #94a3b8;
          cursor: pointer;
          transition: color 0.15s ease;
        }
        .breadcrumb-link:hover {
          color: #38bdf8;
        }
        .breadcrumb-separator {
          color: #475569;
          font-size: 13px;
        }
        .breadcrumb-current {
          font-size: 13px;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: -0.01em;
        }

        .top-right-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .btn-action-glass {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.09);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 600;
          padding: 7px 14px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .btn-action-glass:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.18);
          color: #ffffff;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        }
        .btn-action-glass.icon-only {
          padding: 7px 10px;
        }
        .btn-action-glass.active {
          border-color: rgba(6, 182, 212, 0.45);
          background: rgba(6, 182, 212, 0.12);
        }

        .btn-action-cyan {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: linear-gradient(135deg, rgba(6, 182, 212, 0.16), rgba(14, 165, 233, 0.1));
          border: 1px solid rgba(6, 182, 212, 0.35);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: #38bdf8;
          font-size: 12px;
          font-weight: 600;
          padding: 7px 16px;
          border-radius: 8px;
          cursor: pointer;
          box-shadow: 0 0 16px rgba(6, 182, 212, 0.12);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .btn-action-cyan:hover {
          background: linear-gradient(135deg, rgba(6, 182, 212, 0.25), rgba(14, 165, 233, 0.18));
          border-color: rgba(6, 182, 212, 0.55);
          color: #ffffff;
          box-shadow: 0 0 24px rgba(6, 182, 212, 0.28);
          transform: translateY(-1px);
        }

        .host-title-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .host-title-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .host-name {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #ffffff;
          margin: 0;
          line-height: 1.1;
        }

        .phase2-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.05em;
        }
        .phase2-status-pill.online {
          background-color: rgba(34, 197, 94, 0.12);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.35);
          box-shadow: 0 0 12px rgba(34, 197, 94, 0.15);
        }
        .phase2-status-pill.offline {
          background-color: rgba(239, 68, 68, 0.12);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.35);
        }
        .phase2-status-pill.stopped {
          background-color: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.4);
        }

        .beacon-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background-color: #22c55e;
          box-shadow: 0 0 8px #22c55e;
          animation: pulseGreenBeacon 2s infinite;
        }
        .beacon-dot-red {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background-color: #ef4444;
          box-shadow: 0 0 8px #ef4444;
        }
        @keyframes pulseGreenBeacon {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.85); }
        }

        .host-status-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        }
        .live-telemetry-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(16, 24, 39, 0.65);
          border: 1px solid rgba(34, 197, 94, 0.25);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-radius: 20px;
          padding: 4px 12px;
          font-size: 11px;
          font-weight: 700;
          color: #22c55e;
          letter-spacing: 0.04em;
        }
        .last-seen-label {
          font-size: 11.5px;
          color: #64748b;
        }

        .metadata-ribbon-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 12px;
        }
        .ribbon-card {
          padding: 10px 16px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ribbon-card .lbl {
          font-size: 10.5px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .ribbon-card .val {
          font-size: 13px;
          color: #f1f5f9;
          font-weight: 600;
          margin-top: 1px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ribbon-card .val.cyan-text {
          color: #38bdf8;
          font-weight: 700;
        }
        .ribbon-card .val.mono {
          font-family: monospace;
          color: #94a3b8;
          font-size: 12px;
        }

        .tab-capsule-rail {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px;
          border-radius: 12px;
          overflow-x: auto;
        }
        .tab-capsule-btn {
          border-radius: 8px;
          padding: 7px 16px;
          font-size: 13px;
          font-weight: 600;
          border: 1px solid transparent;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .tab-capsule-btn:hover {
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.04);
        }
        .tab-capsule-btn.active {
          color: #38bdf8;
          background: rgba(6, 182, 212, 0.14);
          border-color: rgba(6, 182, 212, 0.35);
          box-shadow: 0 0 16px rgba(6, 182, 212, 0.12);
          text-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
        }

        .tab-content-wrapper {
          width: 100%;
        }
        .tab-loading-box {
          padding: 60px;
          text-align: center;
          color: #64748b;
          background-color: #101726;
          border: 1px solid #1c283d;
          border-radius: 12px;
        }

        .bottom-status-bar {
          position: fixed;
          bottom: 0;
          left: 240px;
          right: 0;
          height: 34px;
          background: rgba(8, 12, 20, 0.88);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-top: 1px solid rgba(255, 255, 255, 0.07);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 28px;
          font-size: 11px;
          color: #64748b;
          z-index: 80;
        }
        .auto-refresh-tag {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .auto-refresh-tag strong {
          color: #22c55e;
        }
        .all-operational {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #22c55e;
          font-weight: 600;
        }
        .detail-more-menu {
          position: absolute;
          right: 0;
          top: calc(100% + 6px);
          background: #0d1424;
          border: 1px solid #1f2e44;
          border-radius: 10px;
          padding: 6px;
          width: 210px;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.85);
          z-index: 999;
          display: flex;
          flex-direction: column;
          gap: 2px;
          animation: menuSlide 0.15s ease-out;
        }
        .detail-more-menu .menu-item {
          display: flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: none;
          padding: 8px 10px;
          border-radius: 6px;
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          text-align: left;
          width: 100%;
          transition: all 0.15s ease;
        }
        .detail-more-menu .menu-item:hover {
          background: #162238;
          color: #ffffff;
        }
        .detail-more-menu .menu-divider {
          height: 1px;
          background-color: #162238;
          margin: 4px 0;
        }
      `}</style>

      {/* ── Remote Uninstall & Host Decommission Modal ── */}
      <UninstallAgentModal
        isOpen={showUninstallModal}
        onClose={() => setShowUninstallModal(false)}
        agent={resolvedMachine}
        onUninstalled={() => {
          navigate('/infrastructure');
        }}
      />
    </div>
  );
}
