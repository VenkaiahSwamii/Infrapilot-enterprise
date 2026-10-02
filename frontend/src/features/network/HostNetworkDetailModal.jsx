import React from 'react';
import { X, Server, Activity, Radio, HardDrive, CheckCircle2, AlertTriangle, XCircle, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export default function HostNetworkDetailModal({ hostView, onClose }) {
  if (!hostView) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <Server size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Host Network Observability — {hostView.hostname}
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                IP: {hostView.ip_address || '10.10.20.15'} • OS: {hostView.os || 'Linux'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Network Interfaces Section */}
          <div>
            <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wider mb-3 flex items-center gap-2">
              <Activity size={14} className="text-cyan-400" /> Network Interfaces & Throughput Rates
            </h3>
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Interface</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Link Speed</th>
                    <th className="px-4 py-3">RX Throughput</th>
                    <th className="px-4 py-3">TX Throughput</th>
                    <th className="px-4 py-3">Errors / Drops</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {hostView.interfaces.map((iface) => (
                    <tr key={iface.name} className="hover:bg-slate-900/40 font-mono">
                      <td className="px-4 py-3 font-semibold text-white">{iface.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            iface.status === 'UP'
                              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                              : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                          }`}
                        >
                          {iface.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{iface.speed}</td>
                      <td className="px-4 py-3 text-cyan-400 font-bold">
                        <span className="inline-flex items-center gap-1">
                          <ArrowDownLeft size={12} /> {iface.receive_rate_mbps.toFixed(1)} MB/s
                        </span>
                      </td>
                      <td className="px-4 py-3 text-indigo-400 font-bold">
                        <span className="inline-flex items-center gap-1">
                          <ArrowUpRight size={12} /> {iface.transmit_rate_mbps.toFixed(1)} MB/s
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {iface.errors} err / {iface.drops} drop
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Service Endpoint Connectivity (Ports & Unix Sockets) */}
          <div>
            <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wider mb-3 flex items-center gap-2">
              <Radio size={14} className="text-indigo-400" /> Monitored Service Endpoints (Ports & Unix Sockets)
            </h3>
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Service Endpoint Name</th>
                    <th className="px-4 py-3">Endpoint Type</th>
                    <th className="px-4 py-3">Target Address / Path</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Measured Latency</th>
                    <th className="px-4 py-3">Packet Loss %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {hostView.connectivities.map((conn) => (
                    <tr key={conn.id} className="hover:bg-slate-900/40 font-mono">
                      <td className="px-4 py-3 font-semibold text-white">{conn.name}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-indigo-300 border border-slate-700">
                          {conn.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 max-w-xs truncate">{conn.target}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            conn.status === 'HEALTHY'
                              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                              : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                          }`}
                        >
                          {conn.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-cyan-400 font-bold">
                        {conn.latency_ms > 0 ? `${conn.latency_ms.toFixed(1)} ms` : '--'}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
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
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Close View
          </button>
        </div>
      </div>
    </div>
  );
}
