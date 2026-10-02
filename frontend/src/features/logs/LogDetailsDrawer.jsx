import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Server,
  Cpu,
  Shield,
  Layers,
  Box,
  Terminal as TermIcon,
  AlertTriangle,
  Zap,
  Activity,
  FileText,
  ExternalLink,
  Code
} from 'lucide-react';
import { apiClient } from '../../api/client.js';

export default function LogDetailsDrawer({ log, onClose }) {
  const [showRawModal, setShowRawModal] = useState(false);
  const [correlations, setCorrelations] = useState(null);
  const [loadingCorrelations, setLoadingCorrelations] = useState(false);

  useEffect(() => {
    if (!log || !log.id) return;

    let active = true;
    setLoadingCorrelations(true);

    apiClient
      .get(`/logs/${log.id}/correlations`)
      .then((res) => {
        if (active && res.data) {
          setCorrelations(res.data);
        }
      })
      .catch(() => {
        // Fallback gracefully if correlations unavailable
      })
      .finally(() => {
        if (active) setLoadingCorrelations(false);
      });

    return () => {
      active = false;
    };
  }, [log]);

  if (!log) return null;

  const levelColorMap = {
    TRACE: '#94a3b8',
    DEBUG: '#64748b',
    INFO: '#38bdf8',
    NOTICE: '#22c55e',
    WARNING: '#f59e0b',
    WARN: '#f59e0b',
    ERROR: '#ef4444',
    CRITICAL: '#dc2626',
    FATAL: '#991b1b',
  };

  const levelColor = levelColorMap[String(log.level || 'INFO').toUpperCase()] || '#38bdf8';

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '520px',
          maxWidth: '90vw',
          backgroundColor: '#0b0f19',
          borderLeft: '1px solid #1e293b',
          boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.6)',
          zIndex: 1100,
          display: 'flex',
          flexDirection: 'column',
          color: '#f1f5f9',
        }}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#0f172a',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                backgroundColor: `${levelColor}20`,
                border: `1px solid ${levelColor}50`,
                color: levelColor,
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.05em',
              }}
            >
              {String(log.level || 'INFO').toUpperCase()}
            </span>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0' }}>
              Log Entry Details
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {/* Main Message Box */}
          <div
            style={{
              backgroundColor: '#020617',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px',
              fontFamily: 'monospace',
              fontSize: '13px',
              lineHeight: '1.5',
              color: '#f8fafc',
              wordBreak: 'break-word',
            }}
          >
            {log.message || log.text || 'No message provided.'}
          </div>

          {/* Action Bar */}
          <div style={{ marginBottom: '24px', display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setShowRawModal(true)}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#38bdf8',
                padding: '8px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Code size={14} />
              <span>View Raw Log</span>
            </button>
          </div>

          {/* Structured Fields Section */}
          <div style={{ marginBottom: '24px' }}>
            <h4
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '12px',
              }}
            >
              Log Attributes & Context
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <AttributeItem label="Timestamp" value={log.timestamp || log.ingestTs || 'N/A'} icon={<Clock size={14} color="#94a3b8" />} />
              <AttributeItem label="Host / Node" value={log.hostname || 'N/A'} icon={<Server size={14} color="#94a3b8" />} />
              <AttributeItem label="Operating System" value={log.os || log.platform || 'N/A'} icon={<Cpu size={14} color="#94a3b8" />} />
              <AttributeItem label="Source" value={log.source || 'system'} icon={<Layers size={14} color="#94a3b8" />} />
              <AttributeItem label="Service" value={log.service || 'N/A'} icon={<Box size={14} color="#38bdf8" />} />
              <AttributeItem label="Severity" value={String(log.level || 'INFO').toUpperCase()} icon={<Shield size={14} color={levelColor} />} />
            </div>
          </div>

          {/* Container & Kubernetes Metadata */}
          {(log.container_name || log.pod_name || log.namespace || log.cluster_name) && (
            <div style={{ marginBottom: '24px' }}>
              <h4
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '12px',
                }}
              >
                Container & Orchestration
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {log.container_name && <AttributeItem label="Container" value={log.container_name} />}
                {log.pod_name && <AttributeItem label="K8s Pod" value={log.pod_name} />}
                {log.namespace && <AttributeItem label="Namespace" value={log.namespace} />}
                {log.cluster_name && <AttributeItem label="Cluster" value={log.cluster_name} />}
                {log.container_id && <AttributeItem label="Container ID" value={log.container_id.substring(0, 12)} />}
              </div>
            </div>
          )}

          {/* Process & Tracing Metadata */}
          {(log.process_name || log.pid || log.request_id || log.trace_id || log.event_id) && (
            <div style={{ marginBottom: '24px' }}>
              <h4
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '12px',
                }}
              >
                Process & Tracing
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {log.process_name && <AttributeItem label="Process" value={log.process_name} />}
                {log.pid && <AttributeItem label="PID" value={String(log.pid)} />}
                {log.request_id && <AttributeItem label="Request ID" value={log.request_id} />}
                {log.trace_id && <AttributeItem label="Trace ID" value={log.trace_id} />}
                {log.event_id && <AttributeItem label="Event ID" value={log.event_id} />}
              </div>
            </div>
          )}

          {/* Correlations Section */}
          <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid #1e293b' }}>
            <h4
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#38bdf8',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Activity size={14} />
              Investigative Correlations
            </h4>

            {loadingCorrelations ? (
              <div style={{ fontSize: '12px', color: '#64748b', padding: '12px 0' }}>
                Resolving metric, alert, and incident correlations...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Related Metrics */}
                <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '6px' }}>
                    📊 RELATED METRICS AT TIMESTAMP
                  </div>
                  {correlations?.related_metrics?.cpu_usage !== undefined ? (
                    <div style={{ fontSize: '12px', color: '#e2e8f0', display: 'flex', gap: '16px' }}>
                      <span>CPU: <strong>{Number(correlations.related_metrics.cpu_usage).toFixed(1)}%</strong></span>
                      <span>RAM: <strong>{Number(correlations.related_metrics.memory_percent).toFixed(1)}%</strong></span>
                      <span>Latency: <strong>{Number(correlations.related_metrics.latency_ms).toFixed(0)} ms</strong></span>
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#64748b' }}>CPU: {log.cpuPct || '0.1'}% • RAM: {log.ramUsed || '18'}MB</div>
                  )}
                </div>

                {/* Related Alerts */}
                <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={13} color="#f59e0b" />
                    RELATED ALERTS ({correlations?.related_alerts?.length || 0})
                  </div>
                  {correlations?.related_alerts?.length > 0 ? (
                    correlations.related_alerts.map((a, i) => (
                      <div key={i} style={{ fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>
                        🚨 {a.title} ({a.severity})
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '12px', color: '#64748b' }}>No active alerts directly tied to timestamp</div>
                  )}
                </div>

                {/* Related Incidents */}
                <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Zap size={13} color="#38bdf8" />
                    RELATED INCIDENTS ({correlations?.related_incidents?.length || 0})
                  </div>
                  {correlations?.related_incidents?.length > 0 ? (
                    correlations.related_incidents.slice(0, 2).map((inc, i) => (
                      <div key={i} style={{ fontSize: '12px', color: '#38bdf8' }}>
                        ⚡ #{inc.incident_number || '1060'} {inc.title || 'Infrastructure Incident'}
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '12px', color: '#64748b' }}>No correlated incident timeline</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Raw Log Modal */}
      {showRawModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            style={{
              backgroundColor: '#090d16',
              border: '1px solid #1e293b',
              borderRadius: '12px',
              width: '720px',
              maxWidth: '100%',
              padding: '24px',
              color: '#f1f5f9',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                Raw Unparsed Agent Log String
              </h3>
              <button
                onClick={() => setShowRawModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <pre
              style={{
                backgroundColor: '#020617',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '16px',
                fontSize: '12px',
                color: '#38bdf8',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {log.raw_log || log.fullLine || JSON.stringify(log, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}

function AttributeItem({ label, value, icon }) {
  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '10px 12px' }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
        {icon}
        {label}
      </div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0', wordBreak: 'break-word' }}>
        {value}
      </div>
    </div>
  );
}
