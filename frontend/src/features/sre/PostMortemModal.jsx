import React, { useState } from 'react';
import { FileText, Copy, Download, Printer, Check, X, ShieldAlert } from 'lucide-react';
import { triggerDownload } from './utils/sreHelpers.js';

export default function PostMortemModal({ incidentData, isOpen, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const defaultMarkdown = incidentData?.markdown_document || `# Incident Post-Mortem: Infrastructure Outage

**Incident ID:** \`INC-2026-1026\` | **Severity:** \`P1_CRITICAL\` | **Generated:** ${new Date().toISOString()}

## Executive Summary
- **Total Incident Duration:** 24.5 minutes
- **Time-to-Detect (TTD):** 3.2 minutes
- **Time-to-Mitigate (TTM):** 21.3 minutes
- **Error Budget Burned:** 14.8%
- **Isolated Root Cause:** PostgreSQL Database (192.168.1.136:5432)

## Root Cause & Blast Radius
- **Propagation Path:** Frontend (192.168.1.86:3000) -> Backend (192.168.1.86:8080) -> PostgreSQL (192.168.1.136:5432)
- **Impacted Services (3):**
  - Core API Gateway (192.168.1.86:5000)
  - InfraPilot Core Backend (192.168.1.86:8080)
  - Frontend Web Portal (192.168.1.86:3000)

## Chronological Timeline
| Timestamp (UTC) | Stage | Source | Severity | Description |
| :--- | :--- | :--- | :--- | :--- |
| 10:00:15 | \`T0_TRIGGER\` | postgres-monitor | \`CRITICAL\` | Connection pool slots exhausted (20/20 active) |
| 10:03:22 | \`T1_ACKNOWLEDGE\` | sre-copilot | \`WARNING\` | Root cause back-traced to 192.168.1.136:5432 |
| 10:21:45 | \`T2_MITIGATE\` | operator | \`INFO\` | Connection limits reverted to golden state (100) |
| 10:24:30 | \`T3_RESOLVE\` | api-gateway | \`INFO\` | 502 Bad Gateway error rate dropped to 0.0% |

## Actionable Prevention Checklist
1. [ ] Configure PgBouncer / Connection Pool size alerts to prevent thread starvation.
2. [ ] Implement automated read-replica fallback routing for read-heavy API traffic.
3. [ ] Audit configuration snapshot drifts via automated CI/CD deployment checks.
4. [ ] Review error budget consumption (14.8% burned) in next SRE sprint retro.
`;

  const handleCopy = () => {
    navigator.clipboard.writeText(defaultMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    triggerDownload(`incident-${incidentData?.incident_id || 'postmortem'}.md`, defaultMarkdown);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modalBox}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} color="#38bdf8" />
            <strong style={{ fontSize: '14px', color: '#f8fafc' }}>
              One-Click Incident Post-Mortem Report Exporter
            </strong>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={handleCopy} style={styles.btnSecondary}>
              {copied ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
              <span>{copied ? 'Copied!' : 'Copy Markdown'}</span>
            </button>
            <button onClick={handleDownload} style={styles.btnPrimary}>
              <Download size={13} />
              <span>Download .MD</span>
            </button>
            <button onClick={handlePrint} style={styles.btnSecondary}>
              <Printer size={13} />
              <span>Print / PDF</span>
            </button>
            <button onClick={onClose} style={styles.closeBtn}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content Preview */}
        <div style={styles.body}>
          <pre style={styles.markdownPre}>{defaultMarkdown}</pre>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '20px',
  },
  modalBox: {
    width: '100%',
    maxWidth: '840px',
    maxHeight: '85vh',
    backgroundColor: '#090d16',
    borderRadius: '12px',
    border: '1px solid #1e293b',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 18px',
    backgroundColor: '#0f172a',
    borderBottom: '1px solid #1e293b',
    flexWrap: 'wrap',
    gap: '10px',
  },
  btnPrimary: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '6px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
  },
  btnSecondary: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '6px',
    backgroundColor: '#1e293b',
    color: '#cbd5e1',
    fontSize: '11px',
    fontWeight: 500,
    border: '1px solid #334155',
    cursor: 'pointer',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    backgroundColor: '#020617',
  },
  markdownPre: {
    margin: 0,
    fontSize: '12px',
    lineHeight: '1.6',
    color: '#e2e8f0',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    whiteSpace: 'pre-wrap',
  },
};
