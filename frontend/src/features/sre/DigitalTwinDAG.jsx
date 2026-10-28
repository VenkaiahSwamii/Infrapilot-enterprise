import React, { useState, useEffect } from 'react';
import {
  Server,
  Database,
  Globe,
  Radio,
  Network,
  Zap,
  ShieldAlert,
  Play,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { sreApi } from '../../api/sreApi.js';

export default function DigitalTwinDAG({ onSelectNode, highlightedNodeId }) {
  const [nodes, setNodes] = useState([
    { id: 'node-gateway', name: 'Network Gateway', type: 'GATEWAY', host: '192.168.1.1', port: 80, status: 'HEALTHY', x: 80, y: 160 },
    { id: 'node-postgres', name: 'PostgreSQL DB', type: 'DATABASE', host: '192.168.1.136', port: 5432, status: 'HEALTHY', x: 260, y: 80 },
    { id: 'node-backend', name: 'Core Backend', type: 'API', host: '192.168.1.86', port: 8080, status: 'HEALTHY', x: 440, y: 160 },
    { id: 'node-api-gw', name: 'Core API Gateway', type: 'API', host: '192.168.1.86', port: 5000, status: 'HEALTHY', x: 620, y: 100 },
    { id: 'node-frontend', name: 'Frontend Portal', type: 'WEB', host: '192.168.1.86', port: 3000, status: 'HEALTHY', x: 620, y: 220 },
  ]);

  const edges = [
    { from: 'node-gateway', to: 'node-postgres' },
    { from: 'node-postgres', to: 'node-backend' },
    { from: 'node-backend', to: 'node-api-gw' },
    { from: 'node-backend', to: 'node-frontend' },
    { from: 'node-api-gw', to: 'node-frontend' },
  ];

  const [simulatedFailureId, setSimulatedFailureId] = useState(null);
  const [impactedNodes, setImpactedNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    // Fetch live topology from backend
    const loadTopology = async () => {
      try {
        const resp = await sreApi.getTopology();
        if (resp && Array.isArray(resp.nodes) && resp.nodes.length > 0) {
          // Merge coordinates with live nodes
          setNodes((prev) =>
            prev.map((n) => {
              const live = resp.nodes.find((ln) => ln.id === n.id || ln.host === n.host);
              return live ? { ...n, status: live.status, latency_ms: live.latency_ms } : n;
            })
          );
        }
      } catch {
        // Retain default initial topology
      }
    };
    loadTopology();
  }, []);

  useEffect(() => {
    if (highlightedNodeId) {
      handleSimulateFailure(highlightedNodeId);
    }
  }, [highlightedNodeId]);

  // Downstream cascade traversal algorithm
  const handleSimulateFailure = (nodeId) => {
    setSimulatedFailureId(nodeId);

    // Compute downstream nodes
    const downstream = new Set();
    const queue = [nodeId];
    const visited = new Set();

    while (queue.length > 0) {
      const curr = queue.shift();
      if (visited.has(curr)) continue;
      visited.add(curr);

      edges.forEach((e) => {
        if (e.from === curr && !visited.has(e.to)) {
          downstream.add(e.to);
          queue.push(e.to);
        }
      });
    }

    setImpactedNodes(Array.from(downstream));
    const target = nodes.find((n) => n.id === nodeId);
    if (target) {
      setSelectedNode(target);
      if (onSelectNode) onSelectNode(target);
    }
  };

  const handleReset = () => {
    setSimulatedFailureId(null);
    setImpactedNodes([]);
    setSelectedNode(null);
  };

  const getNodeIcon = (type) => {
    switch (type) {
      case 'DATABASE':
        return <Database size={16} color="#38bdf8" />;
      case 'GATEWAY':
        return <Radio size={16} color="#a855f7" />;
      case 'WEB':
        return <Globe size={16} color="#34d399" />;
      default:
        return <Server size={16} color="#38bdf8" />;
    }
  };

  return (
    <div style={styles.container}>
      {/* Controls Bar */}
      <div style={styles.controlsBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Network size={18} color="#38bdf8" />
          <strong style={{ fontSize: '13px', color: '#f8fafc' }}>
            Digital Twin: Live Topology & Cascade Simulator
          </strong>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => handleSimulateFailure('node-postgres')}
            style={styles.simBtn}
          >
            <Zap size={12} />
            Simulate DB Outage
          </button>
          <button
            onClick={() => handleSimulateFailure('node-gateway')}
            style={styles.simBtn}
          >
            <Radio size={12} />
            Simulate Gateway Cut
          </button>
          {simulatedFailureId && (
            <button onClick={handleReset} style={styles.resetBtn}>
              <RotateCcw size={12} />
              Reset Simulation
            </button>
          )}
        </div>
      </div>

      {/* SVG Interactive Canvas */}
      <div style={styles.canvasWrapper}>
        <svg viewBox="0 0 760 320" style={{ width: '100%', height: '100%' }}>
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="10"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#475569" />
            </marker>
            <marker
              id="arrowhead-red"
              markerWidth="10"
              markerHeight="7"
              refX="10"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
            </marker>
          </defs>

          {/* Directed Connection Edges */}
          {edges.map((e, idx) => {
            const fromNode = nodes.find((n) => n.id === e.from);
            const toNode = nodes.find((n) => n.id === e.to);
            if (!fromNode || !toNode) return null;

            const isCascade =
              (simulatedFailureId === e.from || impactedNodes.includes(e.from)) &&
              impactedNodes.includes(e.to);

            return (
              <g key={idx}>
                <line
                  x1={fromNode.x + 60}
                  y1={fromNode.y + 24}
                  x2={toNode.x}
                  y2={toNode.y + 24}
                  stroke={isCascade ? '#ef4444' : '#334155'}
                  strokeWidth={isCascade ? '2.5' : '1.5'}
                  strokeDasharray={isCascade ? '5 3' : 'none'}
                  markerEnd={isCascade ? 'url(#arrowhead-red)' : 'url(#arrowhead)'}
                />
              </g>
            );
          })}

          {/* Node Cards */}
          {nodes.map((n) => {
            const isFailureOrigin = simulatedFailureId === n.id;
            const isImpacted = impactedNodes.includes(n.id);
            const isSelected = selectedNode?.id === n.id;

            let borderColor = '#1e293b';
            let bgGlow = 'none';
            if (isFailureOrigin) {
              borderColor = '#ef4444';
              bgGlow = 'drop-shadow(0 0 10px rgba(239, 68, 68, 0.6))';
            } else if (isImpacted) {
              borderColor = '#f59e0b';
              bgGlow = 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.4))';
            } else if (isSelected) {
              borderColor = '#38bdf8';
            }

            return (
              <g
                key={n.id}
                transform={`translate(${n.x}, ${n.y})`}
                onClick={() => handleSimulateFailure(n.id)}
                style={{ cursor: 'pointer', filter: bgGlow }}
              >
                <rect
                  width="130"
                  height="54"
                  rx="8"
                  fill="#0b1329"
                  stroke={borderColor}
                  strokeWidth={isFailureOrigin || isImpacted ? '2' : '1'}
                />

                {/* Status Dot */}
                <circle
                  cx="16"
                  cy="16"
                  r="4"
                  fill={isFailureOrigin ? '#ef4444' : isImpacted ? '#f59e0b' : '#10b981'}
                />

                {/* Node Title */}
                <text x="28" y="19" fill="#f8fafc" fontSize="11" fontWeight="600">
                  {n.name}
                </text>

                {/* Host & Port */}
                <text x="16" y="36" fill="#94a3b8" fontSize="9">
                  {n.host}:{n.port}
                </text>

                {/* Cascade Badge */}
                {isFailureOrigin && (
                  <text x="16" y="48" fill="#ef4444" fontSize="8" fontWeight="700">
                    CULPRIT ORIGIN
                  </text>
                )}
                {isImpacted && (
                  <text x="16" y="48" fill="#f59e0b" fontSize="8" fontWeight="700">
                    BLAST IMPACT
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Simulator Impact Summary Bar */}
      {simulatedFailureId && (
        <div style={styles.impactBanner}>
          <ShieldAlert size={16} color="#ef4444" />
          <div style={{ fontSize: '12px', color: '#f8fafc' }}>
            <strong>Cascade Impact:</strong> Failure of <code>{selectedNode?.name}</code> directly
            cascades to <strong>{impactedNodes.length}</strong> downstream services:{' '}
            <span style={{ color: '#fbbf24' }}>
              {impactedNodes
                .map((id) => nodes.find((n) => n.id === id)?.name || id)
                .join(', ')}
            </span>
            .
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#090d16',
    borderRadius: '12px',
    border: '1px solid #1e293b',
    overflow: 'hidden',
  },
  controlsBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 16px',
    backgroundColor: '#0f172a',
    borderBottom: '1px solid #1e293b',
    flexWrap: 'wrap',
    gap: '8px',
  },
  simBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '5px 10px',
    borderRadius: '6px',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    color: '#cbd5e1',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  resetBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '5px 10px',
    borderRadius: '6px',
    backgroundColor: '#450a0a',
    border: '1px solid #dc2626',
    color: '#fca5a5',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  canvasWrapper: {
    padding: '16px',
    height: '320px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at 50% 50%, #0d172e 0%, #070b14 100%)',
  },
  impactBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    backgroundColor: '#450a0a33',
    borderTop: '1px solid #dc262644',
  },
};
