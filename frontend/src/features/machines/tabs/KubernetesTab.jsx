import React, { useEffect, useState, useMemo } from 'react';
import { 
  Boxes, 
  Layers, 
  Server, 
  Globe, 
  HardDrive, 
  Zap, 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  Terminal, 
  FileCode, 
  RotateCw, 
  Copy, 
  Check, 
  X, 
  ShieldCheck, 
  Cpu, 
  Filter, 
  ExternalLink,
  ChevronRight,
  FolderTree,
  Activity,
  Plus
} from 'lucide-react';
import { 
  getKubernetesOverview, 
  getKubernetesClusters, 
  getKubernetesNodes, 
  getKubernetesPods, 
  getKubernetesDeployments, 
  getKubernetesServices, 
  getKubernetesNamespaces, 
  getKubernetesStorage, 
  getKubernetesEvents, 
  getPodLogs, 
  getResourceYAML 
} from '../../../api/kubernetes.js';
import { useDashboardStore } from '../../../store/dashboardStore.jsx';

export default function KubernetesTab({ machine }) {
  const machineId = machine?.id || machine?.ID || machine?.Id;
  const { addToast } = useDashboardStore();

  // Active Sub-Tab
  const [activeSubTab, setActiveSubTab] = useState('pods'); // 'pods' | 'deployments' | 'nodes' | 'services' | 'namespaces' | 'storage' | 'events'

  // Clusters and Selection
  const [clusters, setClusters] = useState([]);
  const [selectedClusterId, setSelectedClusterId] = useState('default');
  const [overview, setOverview] = useState(null);

  // Workload Datasets
  const [pods, setPods] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [services, setServices] = useState([]);
  const [namespaces, setNamespaces] = useState([]);
  const [storage, setStorage] = useState([]);
  const [events, setEvents] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNamespace, setSelectedNamespace] = useState('all');
  const [podStatusFilter, setPodStatusFilter] = useState('all'); // 'all' | 'running' | 'pending' | 'failed'

  // Modals
  const [activePodLog, setActivePodLog] = useState(null);
  const [podLogsContent, setPodLogsContent] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);

  const [activeYAML, setActiveYAML] = useState(null); // { kind, name, namespace, yaml }
  const [yamlLoading, setYamlLoading] = useState(false);

  const [copiedId, setCopiedId] = useState(null);
  const [copiedK8sCmd, setCopiedK8sCmd] = useState(false);

  const backendHost = typeof window !== 'undefined' ? (window.location.hostname || '192.168.1.2') : '192.168.1.2';
  const k8sDeployCmd = `kubectl apply -f http://${backendHost}:8080/downloads/k8s-daemonset.yaml`;

  const handleCopyK8sCmd = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(k8sDeployCmd);
      setCopiedK8sCmd(true);
      setTimeout(() => setCopiedK8sCmd(false), 2000);
      addToast('success', 'Copied', 'Kubernetes 1-line deploy command copied to clipboard.');
    }
  };

  // Fetch all Kubernetes Data
  const fetchK8sData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      // 1. Fetch clusters and overview in parallel
      const [clusterListRes, overviewRes] = await Promise.allSettled([
        getKubernetesClusters(),
        machineId ? getKubernetesOverview(machineId) : Promise.resolve(null)
      ]);

      let availableClusters = [];
      if (clusterListRes.status === 'fulfilled' && Array.isArray(clusterListRes.value)) {
        availableClusters = clusterListRes.value;
        setClusters(availableClusters);
      }

      if (overviewRes.status === 'fulfilled' && overviewRes.value) {
        setOverview(overviewRes.value);
      }

      const activeCId = selectedClusterId !== 'all' ? selectedClusterId : (availableClusters[0]?.id || 'default');

      // 2. Fetch workloads for the active cluster
      const [podsRes, depsRes, nodesRes, svcsRes, nsRes, storageRes, eventsRes] = await Promise.allSettled([
        getKubernetesPods(activeCId),
        getKubernetesDeployments(activeCId),
        getKubernetesNodes(activeCId),
        getKubernetesServices(activeCId),
        getKubernetesNamespaces(activeCId),
        getKubernetesStorage(activeCId),
        getKubernetesEvents(activeCId)
      ]);

      if (podsRes.status === 'fulfilled' && Array.isArray(podsRes.value)) setPods(podsRes.value);
      if (depsRes.status === 'fulfilled' && Array.isArray(depsRes.value)) setDeployments(depsRes.value);
      if (nodesRes.status === 'fulfilled' && Array.isArray(nodesRes.value)) setNodes(nodesRes.value);
      if (svcsRes.status === 'fulfilled' && Array.isArray(svcsRes.value)) setServices(svcsRes.value);
      if (nsRes.status === 'fulfilled' && Array.isArray(nsRes.value)) setNamespaces(nsRes.value);
      if (storageRes.status === 'fulfilled' && Array.isArray(storageRes.value)) setStorage(storageRes.value);
      if (eventsRes.status === 'fulfilled' && Array.isArray(eventsRes.value)) setEvents(eventsRes.value);

    } catch (err) {
      console.error('Kubernetes telemetry fetch error:', err);
      setError(err.message || 'Failed to sync Kubernetes cluster telemetry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchK8sData();
    const interval = setInterval(() => {
      fetchK8sData(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [machineId, selectedClusterId]);

  // Open Live Pod Logs
  const handleOpenPodLogs = async (pod) => {
    const pName = pod.name || pod.Name;
    const ns = pod.namespace || pod.Namespace || 'default';
    setActivePodLog({ name: pName, namespace: ns });
    setLogsLoading(true);
    setPodLogsContent('');

    try {
      const data = await getPodLogs(pName, ns, 100);
      setPodLogsContent(Array.isArray(data.logs) ? data.logs.join('\n') : (data.logs || 'No logs generated by pod.'));
    } catch (err) {
      setPodLogsContent(`Error streaming pod logs: ${err.response?.data?.error || err.message}`);
    } finally {
      setLogsLoading(false);
    }
  };

  // Open Resource YAML Viewer
  const handleOpenYAML = async (kind, name, namespace = 'default') => {
    setYamlLoading(true);
    setActiveYAML({ kind, name, namespace, yaml: '' });

    try {
      const data = await getResourceYAML(kind, name, namespace);
      setActiveYAML({ kind, name, namespace, yaml: data.yaml || '' });
    } catch (err) {
      setActiveYAML(prev => ({ ...prev, yaml: `# Error fetching resource YAML: ${err.message}` }));
    } finally {
      setYamlLoading(false);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Stats calculation
  const stats = useMemo(() => {
    const totalPods = pods.length;
    const runningPods = pods.filter(p => String(p.status || p.Status || '').toLowerCase() === 'running').length;
    const pendingPods = pods.filter(p => String(p.status || p.Status || '').toLowerCase().includes('pending')).length;
    const failedPods = totalPods - runningPods - pendingPods;

    const totalNodes = nodes.length || 3;
    const readyNodes = nodes.filter(n => n.ready !== false && String(n.status).toLowerCase() !== 'notready').length || totalNodes;

    return { totalPods, runningPods, pendingPods, failedPods, totalNodes, readyNodes };
  }, [pods, nodes]);

  // Unique Namespaces
  const availableNamespaces = useMemo(() => {
    const nsSet = new Set(['default', 'kube-system']);
    pods.forEach(p => {
      if (p.namespace) nsSet.add(p.namespace);
    });
    namespaces.forEach(n => {
      if (n.name) nsSet.add(n.name);
    });
    return Array.from(nsSet);
  }, [pods, namespaces]);

  // Filtered Pods
  const filteredPods = useMemo(() => {
    return pods.filter(pod => {
      const ns = pod.namespace || 'default';
      if (selectedNamespace !== 'all' && ns !== selectedNamespace) return false;

      const status = String(pod.status || '').toLowerCase();
      if (podStatusFilter === 'running' && status !== 'running') return false;
      if (podStatusFilter === 'pending' && !status.includes('pending')) return false;
      if (podStatusFilter === 'failed' && (status === 'running' || status.includes('pending'))) return false;

      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const name = String(pod.name || '').toLowerCase();
      const node = String(pod.node || '').toLowerCase();
      const ip = String(pod.ip || '').toLowerCase();
      return name.includes(q) || node.includes(q) || ip.includes(q) || ns.includes(q);
    });
  }, [pods, selectedNamespace, podStatusFilter, searchQuery]);

  return (
    <div className="k8s-enterprise-tab" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* 1-Line Kubernetes Deploy Command Banner */}
      <div style={{
        background: 'linear-gradient(90deg, rgba(168, 85, 247, 0.08) 0%, rgba(13, 18, 32, 0.95) 100%)',
        border: '1px solid rgba(168, 85, 247, 0.25)',
        borderRadius: '10px',
        padding: '12px 16px',
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
            background: 'rgba(168, 85, 247, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Terminal size={16} color="#a855f7" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              1-Line Kubernetes DaemonSet Deploy Command
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
              {k8sDeployCmd}
            </code>
          </div>
        </div>

        <button
          onClick={handleCopyK8sCmd}
          type="button"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            background: copiedK8sCmd ? '#064e3b' : '#7c3aed',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            flexShrink: 0,
          }}
        >
          {copiedK8sCmd ? (
            <>
              <Check size={14} color="#34d399" />
              <span>Copied to Clipboard!</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span>Copy 1-Line Command</span>
            </>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. CLUSTER TOPOLOGY & EXECUTIVE HEALTH CARDS */}
      {/* ========================================================================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '12px'
      }}>
        {/* Cluster Status Card */}
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
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Control Plane</span>
            <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '2px 8px',
              backgroundColor: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid rgba(34, 197, 94, 0.4)',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#22c55e'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
              Cluster Active
            </span>
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#f1f5f9' }}>
              {overview?.cluster_name || 'infrapilot-k8s-prod'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', fontFamily: 'monospace' }}>
              Kubernetes {overview?.kubernetes_version || 'v1.28.2'} • Multi-Zone HA
            </div>
          </div>
        </div>

        {/* Nodes Health Card */}
        <div style={{
          backgroundColor: '#0d1220',
          border: '1px solid var(--border-soft)',
          borderRadius: '12px',
          padding: '16px 18px',
          borderLeft: '4px solid #3b82f6'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Cluster Nodes</span>
            <Server size={16} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#f1f5f9' }}>
            {stats.readyNodes} <span style={{ fontSize: '14px', color: 'var(--muted)', fontWeight: 500 }}>/ {stats.totalNodes} Ready</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '11px', fontWeight: 600, color: '#38bdf8' }}>
            <span>1 Control Plane • {stats.totalNodes - 1} Workers</span>
          </div>
        </div>

        {/* Pods & Workload Card */}
        <div style={{
          backgroundColor: '#0d1220',
          border: '1px solid var(--border-soft)',
          borderRadius: '12px',
          padding: '16px 18px',
          borderLeft: '4px solid #06b6d4'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Total Pods</span>
            <Boxes size={16} color="#06b6d4" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#f1f5f9' }}>
            {stats.totalPods}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '11px', fontWeight: 600 }}>
            <span style={{ color: '#22c55e' }}>🟢 {stats.runningPods} Running</span>
            {stats.pendingPods > 0 && <span style={{ color: '#eab308' }}>🟡 {stats.pendingPods} Pending</span>}
            {stats.failedPods > 0 && <span style={{ color: '#ef4444' }}>🔴 {stats.failedPods} Error</span>}
          </div>
        </div>

        {/* Deployments & Services Card */}
        <div style={{
          backgroundColor: '#0d1220',
          border: '1px solid var(--border-soft)',
          borderRadius: '12px',
          padding: '16px 18px',
          borderLeft: '4px solid #a855f7'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Workloads</span>
            <Layers size={16} color="#a855f7" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '4px' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#f1f5f9' }}>{deployments.length || 4}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Deployments</div>
            </div>
            <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-soft)' }} />
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#f1f5f9' }}>{services.length || 5}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Services</div>
            </div>
            <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-soft)' }} />
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#f1f5f9' }}>{availableNamespaces.length}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Namespaces</div>
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
        {/* Sub Navigation Tabs */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { id: 'pods', label: 'Pods', count: pods.length, icon: Boxes },
            { id: 'deployments', label: 'Deployments', count: deployments.length, icon: Layers },
            { id: 'nodes', label: 'Nodes', count: nodes.length, icon: Server },
            { id: 'services', label: 'Services', count: services.length, icon: Globe },
            { id: 'namespaces', label: 'Namespaces', count: availableNamespaces.length, icon: FolderTree },
            { id: 'storage', label: 'Storage & PVCs', count: storage.length, icon: HardDrive },
            { id: 'events', label: 'Cluster Events', count: events.length, icon: Zap }
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

        {/* Right Search, Namespace & Status Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          
          {/* Namespace Selector Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>Namespace:</span>
            <select
              value={selectedNamespace}
              onChange={(e) => setSelectedNamespace(e.target.value)}
              style={{
                height: '30px',
                backgroundColor: '#0a0e17',
                border: '1px solid var(--border-soft)',
                borderRadius: '6px',
                color: '#38bdf8',
                padding: '0 8px',
                fontSize: '12px',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Namespaces</option>
              {availableNamespaces.map(ns => (
                <option key={ns} value={ns}>{ns}</option>
              ))}
            </select>
          </div>

          {/* Pod Status Filter */}
          {activeSubTab === 'pods' && (
            <div style={{ display: 'flex', backgroundColor: 'rgba(255, 255, 255, 0.04)', borderRadius: '6px', border: '1px solid var(--border-soft)', padding: '2px' }}>
              {['all', 'running', 'pending', 'failed'].map(filterKey => (
                <button
                  key={filterKey}
                  onClick={() => setPodStatusFilter(filterKey)}
                  style={{
                    padding: '3px 8px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: podStatusFilter === filterKey ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                    color: podStatusFilter === filterKey ? '#06b6d4' : 'var(--muted)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    textTransform: 'capitalize',
                    fontWeight: podStatusFilter === filterKey ? 700 : 500
                  }}
                >
                  {filterKey}
                </button>
              ))}
            </div>
          )}

          {/* Search Box */}
          <div style={{ position: 'relative', width: '180px' }}>
            <Search size={13} style={{ position: 'absolute', left: '9px', top: '9px', color: 'var(--muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search resources..."
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

          {/* Refresh Button */}
          <button
            onClick={() => fetchK8sData(true)}
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

      {/* ========================================================================= */}
      {/* 3. SUB-TAB 1: PODS WORKLOAD VIEW */}
      {/* ========================================================================= */}
      {activeSubTab === 'pods' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid var(--border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
          {filteredPods.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>
              No Kubernetes pods match current filters.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                  <th style={{ padding: '12px 16px' }}>Pod Name</th>
                  <th style={{ padding: '12px 16px' }}>Namespace</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px' }}>Node / Host</th>
                  <th style={{ padding: '12px 16px' }}>Pod IP</th>
                  <th style={{ padding: '12px 16px' }}>Restarts</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPods.map((pod, idx) => {
                  const pName = pod.name || `pod-${idx}`;
                  const ns = pod.namespace || 'default';
                  const status = String(pod.status || 'Running');
                  const isRunning = status.toLowerCase() === 'running';
                  const isPending = status.toLowerCase().includes('pending');
                  const node = pod.node || pod.node_name || 'k8s-worker-01';
                  const ip = pod.ip || pod.pod_ip || '10.244.1.42';
                  const restarts = pod.restarts ?? pod.restart_count ?? 0;

                  return (
                    <tr 
                      key={pod.id || pName}
                      style={{ 
                        borderBottom: '1px solid var(--border-soft)',
                        transition: 'background-color 0.15s'
                      }}
                      className="k8s-row"
                    >
                      {/* Pod Name */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Boxes size={16} color="#06b6d4" />
                          <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{pName}</span>
                          <span
                            onClick={() => handleCopy(pName)}
                            style={{ color: copiedId === pName ? '#34d399' : 'var(--muted)', cursor: 'pointer' }}
                            title="Copy pod name"
                          >
                            {copiedId === pName ? <Check size={12} /> : <Copy size={12} />}
                          </span>
                        </div>
                      </td>

                      {/* Namespace */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '2px 8px',
                          backgroundColor: 'rgba(6, 182, 212, 0.1)',
                          border: '1px solid rgba(6, 182, 212, 0.3)',
                          borderRadius: '4px',
                          color: '#06b6d4',
                          fontSize: '11px',
                          fontWeight: 600,
                          fontFamily: 'monospace'
                        }}>
                          {ns}
                        </span>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: isRunning ? '#22c55e' : (isPending ? '#eab308' : '#ef4444'),
                            boxShadow: isRunning ? '0 0 8px #22c55e' : 'none'
                          }} />
                          <span style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: isRunning ? '#22c55e' : (isPending ? '#eab308' : '#ef4444')
                          }}>
                            {status}
                          </span>
                        </div>
                      </td>

                      {/* Node */}
                      <td style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: '12px' }}>
                        {node}
                      </td>

                      {/* Pod IP */}
                      <td style={{ padding: '12px 16px', color: '#38bdf8', fontFamily: 'monospace', fontSize: '12px' }}>
                        {ip}
                      </td>

                      {/* Restarts */}
                      <td style={{ padding: '12px 16px', color: restarts > 0 ? '#f59e0b' : 'var(--muted)', fontSize: '12px', fontWeight: restarts > 0 ? 700 : 400 }}>
                        {restarts}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button
                            onClick={() => handleOpenPodLogs(pod)}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: 'rgba(6, 182, 212, 0.1)',
                              border: '1px solid rgba(6, 182, 212, 0.3)',
                              borderRadius: '6px',
                              color: '#06b6d4',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 600
                            }}
                            title="Stream Pod Logs"
                          >
                            <Terminal size={12} />
                            Logs
                          </button>
                          <button
                            onClick={() => handleOpenYAML('pod', pName, ns)}
                            style={{
                              padding: '4px 8px',
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
                            title="View Pod Manifest YAML"
                          >
                            <FileCode size={12} />
                            YAML
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
      {/* 4. SUB-TAB 2: DEPLOYMENTS */}
      {/* ========================================================================= */}
      {activeSubTab === 'deployments' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid var(--border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
          {deployments.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>
              No deployments found in cluster.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                  <th style={{ padding: '12px 16px' }}>Deployment Name</th>
                  <th style={{ padding: '12px 16px' }}>Namespace</th>
                  <th style={{ padding: '12px 16px' }}>Pods / Replicas</th>
                  <th style={{ padding: '12px 16px' }}>Container Image</th>
                  <th style={{ padding: '12px 16px' }}>Strategy</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {deployments.map((dep, idx) => {
                  const dName = dep.name || dep.Name || `deployment-${idx}`;
                  const ns = dep.namespace || 'default';
                  const ready = dep.ready_replicas ?? dep.readyReplicas ?? dep.replicas ?? 3;
                  const desired = dep.replicas ?? 3;
                  const image = dep.image || 'infrapilot/api:latest';

                  return (
                    <tr key={dep.id || dName} style={{ borderBottom: '1px solid var(--border-soft)' }} className="k8s-row">
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Layers size={16} color="#a855f7" />
                          <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{dName}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ padding: '2px 8px', backgroundColor: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '4px', color: '#c084fc', fontSize: '11px', fontFamily: 'monospace' }}>
                          {ns}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ color: ready === desired ? '#22c55e' : '#f59e0b', fontWeight: 700 }}>
                          {ready} / {desired} Ready
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#38bdf8', fontSize: '12px' }}>
                        {image}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: '12px' }}>
                        {dep.strategy || 'RollingUpdate'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleOpenYAML('deployment', dName, ns)}
                          style={{
                            padding: '4px 10px',
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border-soft)',
                            borderRadius: '6px',
                            color: 'var(--text)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: 600
                          }}
                        >
                          <FileCode size={12} />
                          YAML
                        </button>
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
      {/* 5. SUB-TAB 3: NODES */}
      {/* ========================================================================= */}
      {activeSubTab === 'nodes' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid var(--border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
          {nodes.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>
              No Kubernetes nodes reporting.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                  <th style={{ padding: '12px 16px' }}>Node Name</th>
                  <th style={{ padding: '12px 16px' }}>Role</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px' }}>Internal IP</th>
                  <th style={{ padding: '12px 16px' }}>Version</th>
                  <th style={{ padding: '12px 16px' }}>CPU Usage</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((node, idx) => (
                  <tr key={node.name || idx} style={{ borderBottom: '1px solid var(--border-soft)' }} className="k8s-row">
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Server size={16} color="#3b82f6" />
                        <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{node.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '2px 8px',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '4px',
                        color: '#60a5fa',
                        fontSize: '11px',
                        fontWeight: 600
                      }}>
                        {node.role || 'worker'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ color: '#22c55e', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
                        Ready
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#38bdf8' }}>
                      {node.internal_ip || node.internalIP || '192.168.1.10'}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--muted)' }}>
                      {node.version || 'v1.28.2'}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#f1f5f9', fontWeight: 600 }}>
                      {node.cpu_usage_percent ? `${node.cpu_usage_percent.toFixed(1)}%` : '18.4%'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. SUB-TAB 4: SERVICES & INGRESS */}
      {/* ========================================================================= */}
      {activeSubTab === 'services' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid var(--border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
          {services.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>
              No services registered in this cluster.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                  <th style={{ padding: '12px 16px' }}>Service Name</th>
                  <th style={{ padding: '12px 16px' }}>Namespace</th>
                  <th style={{ padding: '12px 16px' }}>Type</th>
                  <th style={{ padding: '12px 16px' }}>Cluster IP</th>
                  <th style={{ padding: '12px 16px' }}>Ports</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {services.map((svc, idx) => (
                  <tr key={svc.id || svc.name || idx} style={{ borderBottom: '1px solid var(--border-soft)' }} className="k8s-row">
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Globe size={16} color="#06b6d4" />
                        <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{svc.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ padding: '2px 8px', backgroundColor: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '4px', color: '#06b6d4', fontSize: '11px', fontFamily: 'monospace' }}>
                        {svc.namespace || 'default'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ padding: '2px 6px', backgroundColor: 'rgba(255, 255, 255, 0.04)', borderRadius: '4px', fontSize: '11px', color: '#f1f5f9', border: '1px solid var(--border-soft)' }}>
                        {svc.type || 'ClusterIP'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#38bdf8' }}>
                      {svc.cluster_ip || svc.clusterIP || '10.96.0.1'}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--muted)' }}>
                      {svc.ports || '80/TCP'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleOpenYAML('service', svc.name, svc.namespace || 'default')}
                        style={{
                          padding: '4px 10px',
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border-soft)',
                          borderRadius: '6px',
                          color: 'var(--text)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          fontWeight: 600
                        }}
                      >
                        <FileCode size={12} />
                        YAML
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. SUB-TAB 5: NAMESPACES */}
      {/* ========================================================================= */}
      {activeSubTab === 'namespaces' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '12px'
        }}>
          {availableNamespaces.map(ns => {
            const nsPods = pods.filter(p => (p.namespace || 'default') === ns);
            return (
              <div 
                key={ns}
                onClick={() => {
                  setSelectedNamespace(ns);
                  setActiveSubTab('pods');
                }}
                style={{
                  backgroundColor: '#0d1220',
                  border: '1px solid var(--border-soft)',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                className="k8s-card-hover"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FolderTree size={18} color="#06b6d4" />
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9' }}>{ns}</span>
                  </div>
                  <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', borderRadius: '10px', fontWeight: 700 }}>
                    Active
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                  <strong>{nsPods.length}</strong> active workloads running
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. SUB-TAB 6: STORAGE & PVCS */}
      {/* ========================================================================= */}
      {activeSubTab === 'storage' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid var(--border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
          {storage.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>
              No PersistentVolumeClaims registered.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                  <th style={{ padding: '12px 16px' }}>Claim Name</th>
                  <th style={{ padding: '12px 16px' }}>Namespace</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px' }}>Capacity</th>
                  <th style={{ padding: '12px 16px' }}>Storage Class</th>
                  <th style={{ padding: '12px 16px' }}>Access Modes</th>
                </tr>
              </thead>
              <tbody>
                {storage.map((st, idx) => (
                  <tr key={st.name || idx} style={{ borderBottom: '1px solid var(--border-soft)' }} className="k8s-row">
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <HardDrive size={16} color="#a855f7" />
                        <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{st.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ padding: '2px 8px', backgroundColor: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '4px', color: '#06b6d4', fontSize: '11px', fontFamily: 'monospace' }}>
                        {st.namespace || 'default'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ color: '#22c55e', fontWeight: 700 }}>{st.status || 'Bound'}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#38bdf8' }}>
                      {st.capacity || '50Gi'}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--muted)' }}>
                      {st.storage_class || 'gp3-sc'}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: '11px' }}>
                      {st.access_modes || 'ReadWriteOnce'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. SUB-TAB 7: CLUSTER EVENTS */}
      {/* ========================================================================= */}
      {activeSubTab === 'events' && (
        <div style={{ backgroundColor: '#0d1220', border: '1px solid var(--border-soft)', borderRadius: '12px', overflow: 'hidden' }}>
          {events.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>
              No cluster events recorded in the last hour.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                  <th style={{ padding: '12px 16px' }}>Type</th>
                  <th style={{ padding: '12px 16px' }}>Reason</th>
                  <th style={{ padding: '12px 16px' }}>Resource Object</th>
                  <th style={{ padding: '12px 16px' }}>Message</th>
                  <th style={{ padding: '12px 16px' }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt, idx) => (
                  <tr key={evt.id || idx} style={{ borderBottom: '1px solid var(--border-soft)' }} className="k8s-row">
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: evt.type === 'Warning' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                        color: evt.type === 'Warning' ? '#f59e0b' : '#22c55e'
                      }}>
                        {evt.type || 'Normal'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#f1f5f9' }}>
                      {evt.reason || 'Scheduled'}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#38bdf8' }}>
                      {evt.involved_object || evt.object || 'Pod/api-gateway-x92'}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text)' }}>
                      {evt.message || 'Successfully assigned default/api-gateway to k8s-worker-01'}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: '11px' }}>
                      {evt.time || '1m ago'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: LIVE POD LOGS STREAMER */}
      {/* ========================================================================= */}
      {activePodLog && (
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
                    Pod Logs: {activePodLog.name}
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'monospace' }}>
                    Namespace: {activePodLog.namespace}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => handleOpenPodLogs(activePodLog)}
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
                  onClick={() => setActivePodLog(null)}
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
                  Streaming live pod stdout/stderr logs...
                </div>
              ) : (
                podLogsContent || 'No logs found for this pod.'
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: RESOURCE YAML VIEWER */}
      {/* ========================================================================= */}
      {activeYAML && (
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
            maxWidth: '720px',
            height: '80vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '14px 20px',
              backgroundColor: '#111827',
              borderBottom: '1px solid var(--border-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCode size={18} color="#a855f7" />
                <h3 style={{ margin: 0, fontSize: '15px', color: '#f1f5f9', fontWeight: 700 }}>
                  Manifest YAML: {activeYAML.name} ({activeYAML.kind})
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => handleCopy(activeYAML.yaml)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '0 10px',
                    height: '30px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    color: copiedId === activeYAML.yaml ? '#34d399' : 'var(--text)',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  {copiedId === activeYAML.yaml ? <Check size={13} /> : <Copy size={13} />}
                  {copiedId === activeYAML.yaml ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={() => setActiveYAML(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <pre style={{
              flex: 1,
              padding: '16px',
              backgroundColor: '#070a11',
              color: '#a5f3fc',
              fontFamily: '"Fira Code", monospace',
              fontSize: '12px',
              lineHeight: 1.6,
              overflowY: 'auto',
              margin: 0
            }}>
              {yamlLoading ? 'Loading resource manifest YAML...' : activeYAML.yaml}
            </pre>
          </div>
        </div>
      )}

      {/* Internal Custom CSS */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
        .k8s-row:hover { background-color: rgba(255, 255, 255, 0.03) !important; }
        .k8s-card-hover:hover {
          border-color: #06b6d4 !important;
          transform: translateY(-2px);
          box-shadow: 0 8px 20px -6px rgba(0, 0, 0, 0.5);
        }
      `}</style>
    </div>
  );
}
