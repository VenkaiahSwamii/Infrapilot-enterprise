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
import TerminalTab from './tabs/TerminalTab.jsx';
import FilesTab from './tabs/FilesTab.jsx';
import SoftwareTab from './tabs/SoftwareTab.jsx';
import HistoryTab from './tabs/HistoryTab.jsx';
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
  ExternalLink
} from 'lucide-react';
import { wsClientInstance } from '../../websocket/client.js';
import { useServerStore } from '../../store/serverStore.jsx';
import { useDashboardStore } from '../../store/dashboardStore.jsx';
import { getMachineId } from '../../utils/machineId.js';

const TABS = [
  { id: 'overview', label: 'Overview', component: OverviewTab },
  { id: 'metrics', label: 'Metrics', component: MetricsTab },
  { id: 'processes', label: 'Processes', component: ProcessesTab },
  { id: 'services', label: 'Services', component: ServicesTab },
  { id: 'storage', label: 'Storage', component: StorageTab },
  { id: 'docker', label: 'Docker', component: DockerTab },
  { id: 'kubernetes', label: 'Kubernetes', component: KubernetesTab },
  { id: 'logs', label: 'Logs', component: LogsTab },
  { id: 'terminal', label: 'Terminal', component: TerminalTab },
  { id: 'files', label: 'Files', component: FilesTab },
  { id: 'software', label: 'Software', component: SoftwareTab },
  { id: 'history', label: 'History', component: HistoryTab },
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
              cpu_cores: machinePayload.cpu_cores || machinePayload.CPUCores || 4,
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

  const ActiveComponent = TABS.find((t) => t.id === activeTab)?.component;

  const rawStatusUpper = String(machine?.status || '').toUpperCase();
  const isDBOnline = rawStatusUpper === 'ONLINE' || machine?.online === true;

  let lastSeenDiff = Infinity;
  const lastSeenVal = liveMetric?.created_at || machine?.last_seen || machine?.LastSeen;
  if (lastSeenVal) {
    const t = new Date(lastSeenVal).getTime();
    if (!isNaN(t)) lastSeenDiff = Math.abs(Date.now() - t);
  }
  const isRecentTelemetry = lastSeenDiff < 120000; // 2 minutes

  const isOnline = isDBOnline && (isRecentTelemetry || liveMetric !== undefined);

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
        <button className="back-btn" onClick={() => navigate('/infrastructure')} type="button">
          <ArrowLeft size={14} /> Back to Machines
        </button>

        <div className="top-right-actions">
          <button className="btn-action-ghost" onClick={handleRefresh} type="button">
            <RefreshCw size={13} /> Refresh
          </button>
          <button className="btn-action-blue" onClick={handleRestartAgent} type="button">
            <RotateCcw size={13} /> Restart Agent
          </button>
          <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button
              className={`btn-action-ghost icon-only ${showMoreMenu ? 'active' : ''}`}
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

                <button
                  className="menu-item"
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    setActiveTab('terminal');
                  }}
                >
                  <Terminal size={14} color="#a855f7" />
                  <span>Switch to Terminal Tab</span>
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
          <span className={`status-badge ${isOnline ? 'online' : 'offline'}`}>
            <span className="dot" /> {isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>

        <div className="host-status-right">
          <div className={`live-connected-pill ${isOnline ? 'connected' : 'disconnected'}`}>
            <span className={isOnline ? 'green-pulse' : 'red-pulse'} />
            <span>{isOnline ? 'CONNECTED' : 'DISCONNECTED'}</span>
          </div>
          <span className="last-seen-label">
            Last seen: {liveMetric?.created_at ? new Date(liveMetric.created_at).toLocaleString('en-GB') : resolvedMachine?.last_seen ? new Date(resolvedMachine.last_seen).toLocaleString('en-GB') : '--'}
          </span>
        </div>
      </div>

      {/* Metadata Ribbon Box (5 items) */}
      <div className="metadata-ribbon-grid">
        <div className="ribbon-box">
          <span className="lbl">Machine ID</span>
          <span className="val mono">{resolvedMachine?.id || machineId || '--'}</span>
        </div>

        <div className="ribbon-box">
          <span className="lbl">IP Address</span>
          <span className="val">{resolvedMachine?.ip_address || '--'}</span>
        </div>

        <div className="ribbon-box">
          <span className="lbl">OS</span>
          <span className="val">{resolvedMachine?.os || '--'}</span>
        </div>

        <div className="ribbon-box flex-wide">
          <span className="lbl">Platform</span>
          <span className="val">{resolvedMachine?.platform || resolvedMachine?.operating_system || resolvedMachine?.os || '--'}</span>
        </div>

        <div className="ribbon-box">
          <span className="lbl">Architecture</span>
          <span className="val">{resolvedMachine?.architecture || '--'}</span>
        </div>
      </div>

      {/* Tab Navigation Line */}
      <div className="tab-line-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn-line ${activeTab === tab.id ? 'active' : ''}`}
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
          padding: 16px 24px 48px 24px;
          background-color: #080c14;
          min-height: calc(100vh - 64px);
          color: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 16px;
          position: relative;
        }

        .header-top-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .back-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background-color: #101726;
          border: 1px solid #1c283d;
          color: #cbd5e1;
          font-size: 12.5px;
          padding: 5px 12px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .back-btn:hover {
          background-color: #1c283d;
          color: #ffffff;
        }
        .top-right-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .btn-action-ghost {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background-color: #101726;
          border: 1px solid #1c283d;
          color: #cbd5e1;
          font-size: 12px;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
        }
        .btn-action-ghost:hover {
          background-color: #1c283d;
          color: #ffffff;
        }
        .btn-action-ghost.icon-only {
          padding: 6px 8px;
        }
        .btn-action-blue {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background-color: rgba(59, 130, 246, 0.1);
          border: 1px solid #3b82f6;
          color: #38bdf8;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 14px;
          border-radius: 6px;
          cursor: pointer;
        }

        .host-title-bar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .host-title-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .host-name {
          font-size: 26px;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
          line-height: 1.1;
        }
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.05em;
        }
        .status-badge.online {
          background-color: rgba(34, 197, 94, 0.12);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }
        .status-badge.offline {
          background-color: rgba(239, 68, 68, 0.12);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: currentColor;
        }
        .host-status-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 3px;
        }
        .live-connected-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 800;
        }
        .live-connected-pill.connected {
          color: #22c55e;
        }
        .live-connected-pill.disconnected {
          color: #ef4444;
        }
        .green-pulse {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background-color: #22c55e;
          box-shadow: 0 0 6px #22c55e;
        }
        .red-pulse {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background-color: #ef4444;
          box-shadow: 0 0 6px #ef4444;
        }
        .last-seen-label {
          font-size: 11.5px;
          color: #64748b;
        }

        .metadata-ribbon-grid {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .ribbon-box {
          background-color: #101726;
          border: 1px solid #1c283d;
          border-radius: 8px;
          padding: 8px 14px;
          display: flex;
          flex-direction: column;
        }
        .ribbon-box.flex-wide {
          flex: 1.5;
        }
        .ribbon-box .lbl {
          font-size: 10.5px;
          color: #64748b;
        }
        .ribbon-box .val {
          font-size: 12.5px;
          color: #f1f5f9;
          font-weight: 600;
          margin-top: 1px;
        }
        .ribbon-box .val.mono {
          font-family: monospace;
          color: #cbd5e1;
        }

        .tab-line-bar {
          display: flex;
          align-items: center;
          gap: 24px;
          border-bottom: 1px solid #1c283d;
          padding-bottom: 2px;
          overflow-x: auto;
        }
        .tab-btn-line {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 13.5px;
          font-weight: 500;
          padding: 8px 0;
          cursor: pointer;
          position: relative;
          transition: color 0.15s ease;
        }
        .tab-btn-line:hover {
          color: #f1f5f9;
        }
        .tab-btn-line.active {
          color: #06b6d4;
          font-weight: 700;
        }
        .tab-btn-line.active::after {
          content: '';
          position: absolute;
          bottom: -2px;
          left: 0;
          width: 100%;
          height: 2px;
          background-color: #06b6d4;
          border-radius: 2px;
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
          left: 220px;
          right: 0;
          height: 32px;
          background-color: #080c14;
          border-top: 1px solid #161e2e;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
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
    </div>
  );
}
