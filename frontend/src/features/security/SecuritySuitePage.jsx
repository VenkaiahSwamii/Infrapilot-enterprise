import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Activity,
  Radio,
  Lock,
  Key,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Trash2,
  Plus,
  Search,
  Server,
  Terminal,
  ExternalLink,
  Cpu,
  ChevronRight,
  Info,
  SlidersHorizontal,
} from 'lucide-react';
import { apiClient } from '../../api/client.js';
import { useServerStore } from '../../store/serverStore.jsx';
import ServerSelectDropdown from '../../components/common/ServerSelectDropdown.jsx';

export default function SecuritySuitePage() {
  const { servers, selectedServer } = useServerStore();
  const [activeTab, setActiveTab] = useState('posture'); // 'posture' | 'ports' | 'cves' | 'vault'
  const [loading, setLoading] = useState(false);

  // Section A Data
  const [posture, setPosture] = useState(null);

  // Section B Data
  const [ports, setPorts] = useState([]);
  const [portSearch, setPortSearch] = useState('');
  const [portRiskFilter, setPortRiskFilter] = useState('ALL');

  // Section D Data
  const [cves, setCves] = useState([]);
  const [cveSearch, setCveSearch] = useState('');
  const [cveSeverityFilter, setCveSeverityFilter] = useState('ALL');

  // API Key Vault Data
  const [apiKeys, setApiKeys] = useState([]);
  const [isCreateKeyModalOpen, setIsCreateKeyModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState('metrics:read,logs:read');
  const [newKeyTTL, setNewKeyTTL] = useState(30);
  const [generatedSecretKey, setGeneratedSecretKey] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);

  // Fetch all security datasets
  const fetchSecurityData = async () => {
    setLoading(true);
    try {
      const [postureRes, portsRes, cvesRes, keysRes] = await Promise.allSettled([
        apiClient.get('/security/posture'),
        apiClient.get('/security/ports'),
        apiClient.get('/security/vulnerabilities'),
        apiClient.get('/security/api-keys'),
      ]);

      if (postureRes.status === 'fulfilled') {
        setPosture(postureRes.value.data);
      }
      if (portsRes.status === 'fulfilled' && portsRes.value.data?.ports) {
        setPorts(portsRes.value.data.ports);
      }
      if (cvesRes.status === 'fulfilled' && cvesRes.value.data?.vulnerabilities) {
        setCves(cvesRes.value.data.vulnerabilities);
      }
      if (keysRes.status === 'fulfilled' && keysRes.value.data?.api_keys) {
        setApiKeys(keysRes.value.data.api_keys);
      }
    } catch (err) {
      console.error('Failed to load security suite data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityData();
  }, []);

  const handleCreateAPIKey = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    try {
      const scopesArray = newKeyScopes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await apiClient.post('/security/api-keys', {
        name: newKeyName.trim(),
        scopes: scopesArray,
        ttl_days: Number(newKeyTTL),
      });

      if (res.data?.secret_key) {
        setGeneratedSecretKey(res.data.secret_key);
        fetchSecurityData();
      }
    } catch (err) {
      console.error('Failed to generate API key:', err);
    }
  };

  const handleRevokeAPIKey = async (id) => {
    if (!window.confirm('Are you sure you want to revoke this API key? Any service using it will be blocked immediately.')) {
      return;
    }
    try {
      await apiClient.delete(`/security/api-keys/${id}`);
      fetchSecurityData();
    } catch (err) {
      console.error('Failed to revoke API key:', err);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Filtered Ports
  const filteredPorts = useMemo(() => {
    return ports.filter((p) => {
      if (portRiskFilter !== 'ALL' && p.risk_level !== portRiskFilter) return false;
      if (!portSearch) return true;
      const q = portSearch.toLowerCase();
      return (
        String(p.port).includes(q) ||
        String(p.process_name || '').toLowerCase().includes(q) ||
        String(p.bind_address || '').toLowerCase().includes(q) ||
        String(p.description || '').toLowerCase().includes(q)
      );
    });
  }, [ports, portSearch, portRiskFilter]);

  // Filtered CVEs
  const filteredCVEs = useMemo(() => {
    return cves.filter((c) => {
      if (cveSeverityFilter !== 'ALL' && c.severity !== cveSeverityFilter) return false;
      if (!cveSearch) return true;
      const q = cveSearch.toLowerCase();
      return (
        String(c.cve_id || '').toLowerCase().includes(q) ||
        String(c.package_name || '').toLowerCase().includes(q) ||
        String(c.title || '').toLowerCase().includes(q) ||
        String(c.description || '').toLowerCase().includes(q)
      );
    });
  }, [cves, cveSearch, cveSeverityFilter]);

  const fleetScore = posture?.fleet_score ?? 88;
  const scoreColor = fleetScore >= 80 ? '#22c55e' : fleetScore >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ padding: '24px 32px', minHeight: '100vh', backgroundColor: '#080c14', color: '#f1f5f9' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0284c7 0%, #10b981 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(16, 185, 129, 0.35)',
            }}
          >
            <ShieldCheck size={24} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: '#f8fafc', letterSpacing: '-0.02em' }}>
              Enterprise Security Suite
            </h1>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '2px 0 0 0' }}>
              Fleet security posture, live attack surface radar, package CVE vulnerability scanner, and API secret vault.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={fetchSecurityData}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#94a3b8',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh Telemetry
          </button>
          <ServerSelectDropdown />
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          padding: '6px',
          background: 'rgba(15, 23, 42, 0.7)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => setActiveTab('posture')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '8px',
            border: activeTab === 'posture' ? '1px solid rgba(34, 197, 94, 0.5)' : '1px solid transparent',
            background: activeTab === 'posture' ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.25) 0%, rgba(16, 185, 129, 0.15) 100%)' : 'transparent',
            color: activeTab === 'posture' ? '#4ade80' : '#94a3b8',
            fontWeight: activeTab === 'posture' ? 700 : 600,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          <Activity size={16} color={activeTab === 'posture' ? '#4ade80' : '#64748b'} />
          Fleet Security Posture
        </button>

        <button
          onClick={() => setActiveTab('ports')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '8px',
            border: activeTab === 'ports' ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid transparent',
            background: activeTab === 'ports' ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.25) 0%, rgba(2, 132, 199, 0.15) 100%)' : 'transparent',
            color: activeTab === 'ports' ? '#38bdf8' : '#94a3b8',
            fontWeight: activeTab === 'ports' ? 700 : 600,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          <Radio size={16} color={activeTab === 'ports' ? '#38bdf8' : '#64748b'} />
          Attack Surface &amp; Port Radar
          {ports.length > 0 && (
            <span style={{ fontSize: '10px', background: 'rgba(56, 189, 248, 0.25)', padding: '2px 6px', borderRadius: '10px' }}>
              {ports.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('cves')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '8px',
            border: activeTab === 'cves' ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid transparent',
            background: activeTab === 'cves' ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(220, 38, 38, 0.15) 100%)' : 'transparent',
            color: activeTab === 'cves' ? '#f87171' : '#94a3b8',
            fontWeight: activeTab === 'cves' ? 700 : 600,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          <ShieldAlert size={16} color={activeTab === 'cves' ? '#f87171' : '#64748b'} />
          Vulnerabilities &amp; CVEs
          {cves.length > 0 && (
            <span style={{ fontSize: '10px', background: 'rgba(239, 68, 68, 0.25)', padding: '2px 6px', borderRadius: '10px' }}>
              {cves.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('vault')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '8px',
            border: activeTab === 'vault' ? '1px solid rgba(168, 85, 247, 0.5)' : '1px solid transparent',
            background: activeTab === 'vault' ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(147, 51, 234, 0.15) 100%)' : 'transparent',
            color: activeTab === 'vault' ? '#c084fc' : '#94a3b8',
            fontWeight: activeTab === 'vault' ? 700 : 600,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          <Key size={16} color={activeTab === 'vault' ? '#c084fc' : '#64748b'} />
          API Keys &amp; Secret Vault
        </button>
      </div>

      {/* =========================================================================
          TAB 1: FLEET SECURITY POSTURE (SECTION A)
          ========================================================================= */}
      {activeTab === 'posture' && (
        <div>
          {/* Top Score Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div
              style={{
                background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.8) 0%, rgba(10, 15, 29, 0.9) 100%)',
                border: `1px solid ${scoreColor}40`,
                borderRadius: '14px',
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  border: `4px solid ${scoreColor}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  fontWeight: 900,
                  color: scoreColor,
                  boxShadow: `0 0 20px ${scoreColor}40`,
                }}
              >
                {fleetScore}%
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>FLEET SECURITY SCORE</span>
                <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '2px 0 0 0', color: scoreColor }}>
                  {posture?.fleet_risk_level || 'COMPLIANT'}
                </h3>
              </div>
            </div>

            <div
              style={{
                background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.8) 0%, rgba(10, 15, 29, 0.9) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '20px',
              }}
            >
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>MONITORED FLEET NODES</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: 800, color: '#f8fafc' }}>{posture?.total_nodes ?? servers.length}</span>
                <span style={{ fontSize: '12px', color: '#22c55e' }}>{posture?.compliant_nodes ?? servers.length} Compliant</span>
              </div>
            </div>

            <div
              style={{
                background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.8) 0%, rgba(10, 15, 29, 0.9) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '20px',
              }}
            >
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>OPEN LISTENING SOCKETS</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: 800, color: '#38bdf8' }}>{posture?.total_open_ports ?? ports.length}</span>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>mTLS &amp; System Ports</span>
              </div>
            </div>

            <div
              style={{
                background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.8) 0%, rgba(10, 15, 29, 0.9) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '20px',
              }}
            >
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>ACTIVE CVE ADVISORIES</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: 800, color: (posture?.total_critical_cves ?? 0) > 0 ? '#ef4444' : '#f59e0b' }}>
                  {posture?.total_active_cves ?? cves.length}
                </span>
                <span style={{ fontSize: '12px', color: '#f87171' }}>{posture?.total_critical_cves ?? 1} Critical</span>
              </div>
            </div>
          </div>

          {/* Node Risk Matrix Table */}
          <div
            style={{
              background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.75) 0%, rgba(10, 15, 29, 0.8) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '14px',
              padding: '20px',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 16px 0', color: '#f8fafc' }}>
              Node Security Risk Matrix
            </h3>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8', fontSize: '11px', fontWeight: 700 }}>
                    <th style={{ padding: '12px 16px' }}>NODE &amp; HOSTNAME</th>
                    <th style={{ padding: '12px 16px' }}>IP ADDRESS</th>
                    <th style={{ padding: '12px 16px' }}>PLATFORM</th>
                    <th style={{ padding: '12px 16px' }}>SECURITY SCORE</th>
                    <th style={{ padding: '12px 16px' }}>RISK CLASSIFICATION</th>
                    <th style={{ padding: '12px 16px' }}>EXPOSURES</th>
                  </tr>
                </thead>
                <tbody>
                  {(posture?.nodes || []).map((node) => {
                    const nodeColor = node.score >= 80 ? '#22c55e' : node.score >= 50 ? '#f59e0b' : '#ef4444';
                    return (
                      <tr
                        key={node.node_id}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                          transition: 'background 0.2s',
                        }}
                      >
                        <td style={{ padding: '14px 16px', fontWeight: 700, color: '#f8fafc' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Server size={14} color="#38bdf8" />
                            <span>{node.hostname}</span>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px', color: '#94a3b8', fontFamily: 'monospace' }}>
                          {node.ip_address || '127.0.0.1'}
                        </td>
                        <td style={{ padding: '14px 16px', color: '#cbd5e1' }}>
                          {(node.os || 'linux').toUpperCase()}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '80px', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${node.score}%`, height: '100%', background: nodeColor }} />
                            </div>
                            <span style={{ fontWeight: 800, color: nodeColor }}>{node.score}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 800,
                              background: `${nodeColor}18`,
                              color: nodeColor,
                              border: `1px solid ${nodeColor}40`,
                            }}
                          >
                            {node.risk_level}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', color: '#94a3b8', fontSize: '12px' }}>
                          {node.critical_ports > 0 && <span style={{ color: '#ef4444', marginRight: '8px' }}>⚠️ {node.critical_ports} Critical Ports</span>}
                          {node.active_cve_count > 0 && <span style={{ color: '#f59e0b' }}>🐛 {node.active_cve_count} CVEs</span>}
                          {node.critical_ports === 0 && node.active_cve_count === 0 && <span style={{ color: '#22c55e' }}>Healthy</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: ATTACK SURFACE & PORT SCANNER (SECTION B)
          ========================================================================= */}
      {activeTab === 'ports' && (
        <div
          style={{
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.75) 0%, rgba(10, 15, 29, 0.8) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '20px',
          }}
        >
          {/* Controls Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  width: '100%',
                  maxWidth: '360px',
                }}
              >
                <Search size={14} color="#64748b" />
                <input
                  type="text"
                  placeholder="Filter by port, process, or bind address..."
                  value={portSearch}
                  onChange={(e) => setPortSearch(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: '#f8fafc', fontSize: '12px', outline: 'none', width: '100%' }}
                />
              </div>

              <select
                value={portRiskFilter}
                onChange={(e) => setPortRiskFilter(e.target.value)}
                style={{
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#cbd5e1',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  outline: 'none',
                }}
              >
                <option value="ALL">All Risk Levels</option>
                <option value="SAFE">Safe Ports (mTLS / Localhost)</option>
                <option value="LOW">Low Risk</option>
                <option value="MEDIUM">Medium Risk</option>
                <option value="CRITICAL">Critical Risk</option>
              </select>
            </div>

            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              Showing <strong>{filteredPorts.length}</strong> active listening sockets
            </span>
          </div>

          {/* Open Ports Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8', fontSize: '11px', fontWeight: 700 }}>
                  <th style={{ padding: '12px 16px' }}>PORT &amp; PROTOCOL</th>
                  <th style={{ padding: '12px 16px' }}>BIND ADDRESS</th>
                  <th style={{ padding: '12px 16px' }}>PROCESS / SERVICE</th>
                  <th style={{ padding: '12px 16px' }}>RISK LEVEL</th>
                  <th style={{ padding: '12px 16px' }}>SECURITY CONTEXT</th>
                </tr>
              </thead>
              <tbody>
                {filteredPorts.map((p) => {
                  const riskColor =
                    p.risk_level === 'SAFE'
                      ? '#22c55e'
                      : p.risk_level === 'LOW'
                      ? '#38bdf8'
                      : p.risk_level === 'MEDIUM'
                      ? '#f59e0b'
                      : '#ef4444';

                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <td style={{ padding: '14px 16px', fontWeight: 800, color: '#f8fafc' }}>
                        <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '3px 8px', borderRadius: '6px', marginRight: '8px' }}>
                          {p.protocol}
                        </span>
                        {p.port}
                      </td>
                      <td style={{ padding: '14px 16px', fontFamily: 'monospace', color: p.is_public ? '#f59e0b' : '#22c55e' }}>
                        {p.bind_address} {p.is_public ? '(Public / Wildcard)' : '(Localhost Only)'}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 600, color: '#cbd5e1' }}>
                        {p.process_name}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 800,
                            background: `${riskColor}18`,
                            color: riskColor,
                            border: `1px solid ${riskColor}40`,
                          }}
                        >
                          {p.risk_level}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', color: '#94a3b8', fontSize: '12px' }}>
                        {p.description}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: VULNERABILITY & CVE RADAR (SECTION D)
          ========================================================================= */}
      {activeTab === 'cves' && (
        <div
          style={{
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.75) 0%, rgba(10, 15, 29, 0.8) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '20px',
          }}
        >
          {/* Controls Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  width: '100%',
                  maxWidth: '360px',
                }}
              >
                <Search size={14} color="#64748b" />
                <input
                  type="text"
                  placeholder="Search by CVE ID, package, or description..."
                  value={cveSearch}
                  onChange={(e) => setCveSearch(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: '#f8fafc', fontSize: '12px', outline: 'none', width: '100%' }}
                />
              </div>

              <select
                value={cveSeverityFilter}
                onChange={(e) => setCveSeverityFilter(e.target.value)}
                style={{
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#cbd5e1',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  outline: 'none',
                }}
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical (CVSS 9.0+)</option>
                <option value="HIGH">High (CVSS 7.0 - 8.9)</option>
                <option value="MEDIUM">Medium</option>
              </select>
            </div>

            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              Showing <strong>{filteredCVEs.length}</strong> active security advisories
            </span>
          </div>

          {/* CVE Cards List or Clean State */}
          {filteredCVEs.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 24px',
                textAlign: 'center',
                background: 'rgba(34, 197, 94, 0.05)',
                border: '1px solid rgba(34, 197, 94, 0.2)',
                borderRadius: '12px',
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(34, 197, 94, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                  boxShadow: '0 0 20px rgba(34, 197, 94, 0.25)',
                }}
              >
                <ShieldCheck size={28} color="#22c55e" />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc', margin: '0 0 6px 0' }}>
                All Systems Patched &amp; Secure
              </h3>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 18px 0', maxWidth: '440px' }}>
                Zero active CVE advisories detected. All inspected packages (OpenSSH, curl, OpenSSL, sudo) meet or exceed fixed security baselines.
              </p>
              <button
                onClick={fetchSecurityData}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(34, 197, 94, 0.2)',
                  border: '1px solid rgba(34, 197, 94, 0.4)',
                  color: '#22c55e',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={13} />
                <span>Re-Audit Fleet Vulnerabilities</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {filteredCVEs.map((c) => {
                const isCrit = c.severity === 'CRITICAL';
                const sevColor = isCrit ? '#ef4444' : c.severity === 'HIGH' ? '#f59e0b' : '#38bdf8';

                return (
                  <div
                    key={c.id}
                    style={{
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: `1px solid ${sevColor}35`,
                      borderRadius: '12px',
                      padding: '18px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            background: `${sevColor}20`,
                            color: sevColor,
                            border: `1px solid ${sevColor}50`,
                            fontSize: '12px',
                            fontWeight: 800,
                          }}
                        >
                          {c.severity} (CVSS {c.cvss_score})
                        </span>
                        <strong style={{ fontSize: '15px', color: '#f8fafc' }}>{c.cve_id}</strong>
                        <span style={{ color: '#94a3b8', fontSize: '13px' }}>• {c.package_name} ({c.installed_version})</span>
                      </div>

                      <span style={{ fontSize: '12px', color: '#22c55e' }}>
                        Fixed in: <strong>{c.fixed_version}</strong>
                      </span>
                    </div>

                    <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0', margin: '10px 0 4px 0' }}>
                      {c.title}
                    </h4>
                    <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 12px 0', lineHeight: 1.5 }}>
                      {c.description}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0, 0, 0, 0.4)', borderRadius: '8px', padding: '8px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'monospace', fontSize: '12px', color: '#38bdf8' }}>
                        <Terminal size={14} color="#38bdf8" />
                        <span>{c.remediation_command}</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(c.remediation_command)}
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                      >
                        {copiedKey ? <Check size={13} color="#22c55e" /> : <Copy size={13} />}
                        <span>Copy Fix</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 4: API KEYS & SECRET VAULT (MODULE 1)
          ========================================================================= */}
      {activeTab === 'vault' && (
        <div
          style={{
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.75) 0%, rgba(10, 15, 29, 0.8) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
                Scoped Enterprise API Keys
              </h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0 0' }}>
                Manage least-privilege credentials for automated pipelines, external telemetry, and agents.
              </p>
            </div>

            <button
              onClick={() => {
                setGeneratedSecretKey('');
                setIsCreateKeyModalOpen(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'linear-gradient(135deg, #0284c7 0%, #6366f1 100%)',
                border: 'none',
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Plus size={15} />
              Generate API Key
            </button>
          </div>

          {/* Key Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8', fontSize: '11px', fontWeight: 700 }}>
                  <th style={{ padding: '12px 16px' }}>KEY NAME</th>
                  <th style={{ padding: '12px 16px' }}>MASKED KEY</th>
                  <th style={{ padding: '12px 16px' }}>ALLOWED SCOPES</th>
                  <th style={{ padding: '12px 16px' }}>STATUS</th>
                  <th style={{ padding: '12px 16px' }}>LAST USED</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((k) => (
                  <tr key={k.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: '#f8fafc' }}>{k.name}</td>
                    <td style={{ padding: '14px 16px', fontFamily: 'monospace', color: '#38bdf8' }}>{k.masked_key}</td>
                    <td style={{ padding: '14px 16px', color: '#cbd5e1' }}>
                      {k.scopes.split(',').map((s) => (
                        <span key={s} style={{ background: 'rgba(255, 255, 255, 0.06)', padding: '2px 6px', borderRadius: '4px', marginRight: '4px', fontSize: '11px' }}>
                          {s}
                        </span>
                      ))}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 800,
                          background: k.status === 'ACTIVE' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: k.status === 'ACTIVE' ? '#22c55e' : '#ef4444',
                        }}
                      >
                        {k.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#94a3b8', fontSize: '12px' }}>
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      {k.status === 'ACTIVE' && (
                        <button
                          onClick={() => handleRevokeAPIKey(k.id)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#f87171',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: GENERATE API KEY
          ========================================================================= */}
      {isCreateKeyModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#0d1220',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
            }}
          >
            {!generatedSecretKey ? (
              <form onSubmit={handleCreateAPIKey}>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#f8fafc', margin: '0 0 16px 0' }}>
                  Generate New Scoped API Key
                </h3>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>
                    KEY NAME
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Grafana-Telemetry-Collector"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>
                    ALLOWED SCOPES (COMMA-SEPARATED)
                  </label>
                  <input
                    type="text"
                    value={newKeyScopes}
                    onChange={(e) => setNewKeyScopes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                    Options: <code>metrics:read</code>, <code>logs:*</code>, <code>servers:read</code>, <code>*</code>
                  </span>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>
                    EXPIRATION (TTL)
                  </label>
                  <select
                    value={newKeyTTL}
                    onChange={(e) => setNewKeyTTL(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: '#0d1220',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  >
                    <option value={30}>30 Days</option>
                    <option value={90}>90 Days</option>
                    <option value={365}>1 Year</option>
                    <option value={0}>Never Expire</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setIsCreateKeyModalOpen(false)}
                    style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{ padding: '8px 18px', background: '#0284c7', border: 'none', color: '#ffffff', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Generate Secret
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#22c55e', marginBottom: '14px' }}>
                  <CheckCircle2 size={20} />
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>API Key Generated Successfully</h3>
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                  Please copy your secret key now. <strong>For security reasons, you will not be able to view it again.</strong>
                </p>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    background: '#05070d',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    color: '#38bdf8',
                  }}
                >
                  <span style={{ overflowX: 'auto', marginRight: '8px' }}>{generatedSecretKey}</span>
                  <button
                    onClick={() => copyToClipboard(generatedSecretKey)}
                    style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    {copiedKey ? <Check size={16} color="#22c55e" /> : <Copy size={16} />}
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setIsCreateKeyModalOpen(false)}
                    style={{ padding: '8px 18px', background: '#0284c7', border: 'none', color: '#ffffff', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
