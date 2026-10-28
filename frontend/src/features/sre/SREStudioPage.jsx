import React, { useState } from 'react';
import {
  Sparkles,
  Bot,
  Network,
  Clock,
  Flame,
  Sliders,
  FileText,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import SREChatCopilot from './SREChatCopilot.jsx';
import DigitalTwinDAG from './DigitalTwinDAG.jsx';
import TimeTravelOverlay from './TimeTravelOverlay.jsx';
import SROMultiBurnGauge from './SROMultiBurnGauge.jsx';
import ConfigDriftViewer from './ConfigDriftViewer.jsx';
import PostMortemModal from './PostMortemModal.jsx';
import { sreApi } from '../../api/sreApi.js';

export default function SREStudioPage() {
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState(null);
  const [postMortemOpen, setPostMortemOpen] = useState(false);
  const [currentIncidentData, setCurrentIncidentData] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleOpenDigitalTwin = (node) => {
    if (node) {
      setHighlightedNodeId(node.id);
      setSelectedNode(node);
    }
  };

  const handleOpenPostMortem = (data) => {
    setCurrentIncidentData(data);
    setPostMortemOpen(true);
  };

  const handleSyncTopology = async () => {
    setIsSyncing(true);
    try {
      await sreApi.triggerSync();
    } catch {
      // Ignore
    } finally {
      setTimeout(() => setIsSyncing(false), 500);
    }
  };

  return (
    <div style={styles.page}>
      {/* Page Header */}
      <div style={styles.pageHeader}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={styles.title}>SRE Diagnostic Studio & Digital Twin</h1>
            <span style={styles.tag}>ZERO-AI DETERMINISTIC ENGINE</span>
          </div>
          <p style={styles.subtitle}>
            Continuous dependency graph traversal, time travel variance analysis, Google SRE error budget tracking, and real-time cascade failure simulation.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleSyncTopology} disabled={isSyncing} style={styles.syncBtn}>
            <RefreshCw size={13} className={isSyncing ? 'spinning' : ''} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Live Topology'}</span>
          </button>
          <button onClick={() => setPostMortemOpen(true)} style={styles.exportBtn}>
            <FileText size={13} />
            <span>Export Incident Post-Mortem</span>
          </button>
        </div>
      </div>

      {/* Main Cockpit Grid: Copilot + Digital Twin */}
      <div style={styles.topGrid}>
        {/* Left: Conversational SRE Copilot */}
        <div style={{ height: '480px' }}>
          <SREChatCopilot
            onSelectNode={setSelectedNode}
            onOpenDigitalTwin={handleOpenDigitalTwin}
            onOpenPostMortem={handleOpenPostMortem}
          />
        </div>

        {/* Right: Digital Twin DAG Simulator */}
        <div style={{ height: '480px' }}>
          <DigitalTwinDAG
            onSelectNode={setSelectedNode}
            highlightedNodeId={highlightedNodeId}
          />
        </div>
      </div>

      {/* Secondary Row: Time Travel Comparator + Google SRE SLO Gauge */}
      <div style={styles.middleGrid}>
        <TimeTravelOverlay metric="latency_ms" />
        <SROMultiBurnGauge
          targetSLO={0.999}
          currentBurnRate={14.8}
          windowHours={1.0}
          remainingBudgetPct={85.2}
          timeToExhaustHours={54.2}
        />
      </div>

      {/* Tertiary Row: Configuration Drift Inspector */}
      <ConfigDriftViewer
        host="192.168.1.136"
        component="PostgreSQL Database"
      />

      {/* Post-Mortem Modal */}
      <PostMortemModal
        isOpen={postMortemOpen}
        onClose={() => setPostMortemOpen(false)}
        incidentData={currentIncidentData}
      />
    </div>
  );
}

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    padding: '24px',
    backgroundColor: '#020617',
    minHeight: '100vh',
    color: '#f8fafc',
  },
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '12px',
  },
  title: {
    fontSize: '22px',
    fontWeight: 700,
    margin: 0,
    color: '#f8fafc',
  },
  tag: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: '4px',
    backgroundColor: '#0284c722',
    color: '#38bdf8',
    border: '1px solid #0284c744',
  },
  subtitle: {
    fontSize: '12px',
    color: '#94a3b8',
    marginTop: '4px',
    marginBottom: 0,
    maxWidth: '850px',
  },
  syncBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    borderRadius: '8px',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    color: '#cbd5e1',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  exportBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    borderRadius: '8px',
    backgroundColor: '#0284c7',
    border: 'none',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  topGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
    gap: '20px',
  },
  middleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    gap: '20px',
  },
};
