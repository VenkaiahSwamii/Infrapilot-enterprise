import React from 'react';
import { X, Server, Activity, Radio, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export default function HostNetworkDetailModal({ hostView, onClose }) {
  if (!hostView) return null;

  return (
    <div className="sre-modal-backdrop">
      <div className="sre-modal-container">
        {/* Header */}
        <div className="sre-modal-header">
          <div className="sre-modal-title-wrap">
            <div className="sre-modal-icon">
              <Server size={22} color="#38bdf8" />
            </div>
            <div>
              <h3>Host Network Observability — {hostView.hostname}</h3>
              <p>IP: {hostView.ip_address || hostView.ip || 'N/A'} • OS: {hostView.os || 'Host OS'}</p>
            </div>
          </div>
          <button onClick={onClose} className="sre-modal-close-btn">
            <X size={18} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="sre-modal-body">
          {/* Network Interfaces Section */}
          <div className="sre-section">
            <div className="sre-sec-title">
              <Activity size={14} className="cyan-txt" />
              <span>NETWORK INTERFACES &amp; THROUGHPUT RATES</span>
            </div>

            <div className="sre-table-wrap">
              <table className="sre-table">
                <thead>
                  <tr>
                    <th>INTERFACE</th>
                    <th>STATUS</th>
                    <th>LINK SPEED</th>
                    <th>RX THROUGHPUT</th>
                    <th>TX THROUGHPUT</th>
                    <th>ERRORS / DROPS</th>
                  </tr>
                </thead>
                <tbody>
                  {hostView.interfaces.map((iface) => (
                    <tr key={iface.name}>
                      <td className="fw-bold">{iface.name}</td>
                      <td>
                        <span className={`status-tag ${iface.status.toLowerCase()}`}>
                          {iface.status}
                        </span>
                      </td>
                      <td className="muted-txt">{iface.speed}</td>
                      <td className="cyan-txt fw-bold">
                        <span className="rate-val">
                          <ArrowDownLeft size={12} /> {iface.receive_rate_mbps.toFixed(1)} MB/s
                        </span>
                      </td>
                      <td className="indigo-txt fw-bold">
                        <span className="rate-val">
                          <ArrowUpRight size={12} /> {iface.transmit_rate_mbps.toFixed(1)} MB/s
                        </span>
                      </td>
                      <td className="muted-txt">{iface.errors} err / {iface.drops} drop</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Service Endpoint Connectivity (Ports & Unix Sockets) */}
          <div className="sre-section">
            <div className="sre-sec-title">
              <Radio size={14} className="indigo-txt" />
              <span>MONITORED SERVICE ENDPOINTS (PORTS &amp; UNIX SOCKETS)</span>
            </div>

            <div className="sre-table-wrap">
              <table className="sre-table">
                <thead>
                  <tr>
                    <th>SERVICE ENDPOINT</th>
                    <th>TYPE</th>
                    <th>TARGET ADDRESS / PATH</th>
                    <th>STATUS</th>
                    <th>MEASURED LATENCY</th>
                    <th>PACKET LOSS %</th>
                  </tr>
                </thead>
                <tbody>
                  {hostView.connectivities.map((conn) => (
                    <tr key={conn.id}>
                      <td className="fw-bold">{conn.name}</td>
                      <td>
                        <span className="type-badge">{conn.type}</span>
                      </td>
                      <td className="mono-txt muted-txt">{conn.target}</td>
                      <td>
                        <span className={`status-tag ${conn.status.toLowerCase()}`}>
                          {conn.status}
                        </span>
                      </td>
                      <td className="cyan-txt fw-bold">
                        {conn.latency_ms > 0 ? `${conn.latency_ms.toFixed(1)} ms` : '--'}
                      </td>
                      <td className="muted-txt">
                        {conn.type === 'UNIX_SOCKET' ? 'N/A (Unix Socket)' : `${conn.packet_loss_pct.toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sre-modal-footer">
          <button onClick={onClose} className="sre-btn-secondary">
            Close View
          </button>
        </div>
      </div>

      <style>{`
        .sre-modal-backdrop {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(4px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .sre-modal-container {
          width: 100%;
          max-width: 860px;
          background: #111827;
          border: 1px solid #1f293d;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          max-height: 85vh;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          color: #f1f5f9;
        }
        .sre-modal-header {
          padding: 18px 24px;
          background: #0b0f19;
          border-bottom: 1px solid #1f293d;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .sre-modal-title-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .sre-modal-icon {
          background: rgba(56, 189, 248, 0.1);
          border: 1px solid rgba(56, 189, 248, 0.2);
          padding: 8px;
          border-radius: 8px;
        }
        .sre-modal-title-wrap h3 {
          font-size: 16px;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
        }
        .sre-modal-title-wrap p {
          font-size: 12px;
          color: #64748b;
          font-family: monospace;
          margin: 2px 0 0 0;
        }
        .sre-modal-close-btn {
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
        }
        .sre-modal-close-btn:hover { background: #1e293b; color: #ffffff; }

        .sre-modal-body {
          padding: 24px;
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .sre-section {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .sre-sec-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 800;
          color: #94a3b8;
          letter-spacing: 0.04em;
        }

        .sre-table-wrap {
          background: #0b0f19;
          border: 1px solid #1f293d;
          border-radius: 10px;
          overflow: hidden;
        }
        .sre-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 12px;
        }
        .sre-table th {
          background: #111827;
          color: #64748b;
          padding: 10px 14px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.04em;
          border-bottom: 1px solid #1f293d;
        }
        .sre-table td {
          padding: 12px 14px;
          border-bottom: 1px solid #1a2333;
          color: #e2e8f0;
        }
        .fw-bold { font-weight: 700; color: #ffffff; }
        .muted-txt { color: #94a3b8; }
        .cyan-txt { color: #38bdf8; }
        .indigo-txt { color: #818cf8; }
        .mono-txt { font-family: monospace; }
        .rate-val { display: flex; align-items: center; gap: 4px; }

        .status-tag {
          font-size: 10px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 4px;
        }
        .status-tag.up, .status-tag.healthy {
          background: rgba(34, 197, 94, 0.15);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }
        .status-tag.down, .status-tag.critical {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .type-badge {
          background: #1e293b;
          color: #94a3b8;
          border: 1px solid #334155;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .sre-modal-footer {
          padding: 16px 24px;
          background: #0b0f19;
          border-top: 1px solid #1f293d;
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }
        .sre-btn-secondary {
          background: #1e293b;
          border: 1px solid #334155;
          color: #f1f5f9;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .sre-btn-secondary:hover { background: #334155; }
      `}</style>
    </div>
  );
}
