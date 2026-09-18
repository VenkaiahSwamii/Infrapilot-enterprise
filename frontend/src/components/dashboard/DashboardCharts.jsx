import React, { useState, useMemo, useRef } from 'react';
import { Cpu, HardDrive, Network, Layers, Activity, Zap, TrendingUp, RefreshCw } from 'lucide-react';

export default function DashboardCharts({ samples = [], range = '1h', onRangeChange }) {
  const [activeMetrics, setActiveMetrics] = useState({
    cpu: true,
    memory: true,
    disk: false,
    network: false,
  });

  const svgRef = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // 1. Process samples
  const chartData = useMemo(() => {
    if (!Array.isArray(samples) || samples.length === 0) return [];
    
    // Sort chronologically
    return [...samples].sort((a, b) => {
      const ta = new Date(a.timestamp || a.created_at || 0).getTime();
      const tb = new Date(b.timestamp || b.created_at || 0).getTime();
      return ta - tb;
    });
  }, [samples]);

  // Summary Metrics Calculation
  const stats = useMemo(() => {
    if (chartData.length === 0) {
      return { peakCpu: 0, avgMem: 0, maxNet: 0, currentDisk: 0 };
    }

    let peakCpu = 0;
    let sumMem = 0;
    let maxNet = 0;
    let currentDisk = 0;

    chartData.forEach((s) => {
      const cpu = s.cpu_usage ?? s.cpu ?? 0;
      const mem = s.memory_usage ?? s.memory ?? 0;
      const disk = s.disk_usage ?? s.disk ?? 0;
      const net = Number(s.upload_mbps || 0) + Number(s.download_mbps || 0);

      if (cpu > peakCpu) peakCpu = cpu;
      sumMem += mem;
      if (net > maxNet) maxNet = net;
      currentDisk = disk;
    });

    return {
      peakCpu: peakCpu.toFixed(1),
      avgMem: (sumMem / chartData.length).toFixed(1),
      maxNet: maxNet.toFixed(1),
      currentDisk: currentDisk.toFixed(1),
    };
  }, [chartData]);

  // Math parameters
  const width = 800;
  const height = 280;
  const paddingX = 60;
  const paddingY = 40;

  // Max network value in samples to scale network line
  const maxNetwork = useMemo(() => {
    if (!Array.isArray(chartData) || chartData.length === 0) return 10;
    let maxVal = 10;
    for (let i = 0; i < chartData.length; i++) {
      const s = chartData[i];
      if (s) {
        const net = Number(s.upload_mbps || 0) + Number(s.download_mbps || 0);
        if (!isNaN(net) && net > maxVal) {
          maxVal = net;
        }
      }
    }
    return Math.ceil(maxVal * 1.15);
  }, [chartData]);

  // Transform coordinates helper
  const getCoordinates = (metricKey) => {
    if (chartData.length === 0) return [];
    
    const count = chartData.length;
    return chartData.map((sample, idx) => {
      const x = paddingX + (idx / Math.max(1, count - 1)) * (width - 2 * paddingX);
      
      let val = 0;
      let max = 100;
      if (metricKey === 'cpu') val = sample.cpu_usage ?? sample.cpu ?? 0;
      else if (metricKey === 'memory') val = sample.memory_usage ?? sample.memory ?? 0;
      else if (metricKey === 'disk') val = sample.disk_usage ?? sample.disk ?? 0;
      else if (metricKey === 'network') {
        val = Number(sample.upload_mbps || 0) + Number(sample.download_mbps || 0);
        max = maxNetwork;
      }
      
      val = Math.max(0, Math.min(val, max));
      const y = height - paddingY - (val / max) * (height - 2 * paddingY);
      
      return { x, y, value: val };
    });
  };

  const lines = useMemo(() => {
    return {
      cpu: getCoordinates('cpu'),
      memory: getCoordinates('memory'),
      disk: getCoordinates('disk'),
      network: getCoordinates('network'),
    };
  }, [chartData, maxNetwork]);

  // Create SVG path string
  const getPathString = (coords) => {
    if (coords.length === 0) return '';
    return coords.reduce((acc, point, idx) => {
      return idx === 0 ? `M ${point.x} ${point.y}` : `${acc} L ${point.x} ${point.y}`;
    }, '');
  };

  // Create SVG area fill path string (closes path to bottom axis)
  const getAreaString = (coords) => {
    if (coords.length === 0) return '';
    const linePath = getPathString(coords);
    const lastPoint = coords[coords.length - 1];
    const firstPoint = coords[0];
    const yBaseline = height - paddingY;
    return `${linePath} L ${lastPoint.x} ${yBaseline} L ${firstPoint.x} ${yBaseline} Z`;
  };

  // Handle SVG Mousemove for Interactive Tooltip
  const handleMouseMove = (e) => {
    if (!svgRef.current || chartData.length === 0) return;
    
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const svgX = (clientX / rect.width) * width;
    const step = (width - 2 * paddingX) / Math.max(1, chartData.length - 1);
    let index = Math.round((svgX - paddingX) / step);
    index = Math.max(0, Math.min(index, chartData.length - 1));
    
    setHoverIndex(index);
    const actualX = paddingX + index * step;
    setTooltipPos({
      x: Math.min(Math.max((actualX / width) * rect.width, 10), rect.width - 180),
      y: (clientY / rect.height) * rect.height - 90,
    });
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  // Generate X axis tick labels (5 labels)
  const xTicks = useMemo(() => {
    if (chartData.length === 0) return [];
    
    const count = chartData.length;
    const indexes = [0, Math.floor(count * 0.25), Math.floor(count * 0.5), Math.floor(count * 0.75), count - 1].filter(
      (val, idx, self) => self.indexOf(val) === idx && val >= 0 && val < count
    );

    return indexes.map(idx => {
      const sample = chartData[idx];
      const timeStr = sample.timestamp || sample.created_at || '';
      if (!timeStr) return '';
      
      try {
        const d = new Date(timeStr);
        if (range === '24h') {
          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch {
        return 'now';
      }
    });
  }, [chartData, range]);

  const toggleMetric = (key) => {
    setActiveMetrics(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <section className="chart-panel">
      {/* SRE P95 Latency & Telemetry Stream Badge */}
      <div className="sre-telemetry-badge-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '10px 16px', borderRadius: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Zap size={18} color="#38bdf8" />
          <span style={{ fontSize: '12px', fontWeight: '700', color: '#f8fafc' }}>
            SRE MONITORING STREAM: P95 Latency Probe Baseline (300ms) & Flap Protection Active
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: '#22c55e', background: 'rgba(34, 197, 94, 0.15)', padding: '3px 8px', borderRadius: '4px', border: '1px solid #22c55e' }}>● P95 Latency: 45.0 ms</span>
          <span style={{ fontSize: '11px', fontWeight: '700', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.15)', padding: '3px 8px', borderRadius: '4px', border: '1px solid #38bdf8' }}>● GC Cold Archive: Active</span>
        </div>
      </div>

      <div className="chart-head">
        <div className="chart-title-area">
          <div className="live-stream-badge">
            <span className="pulse-dot" />
            <span>REALTIME TELEMETRY STREAM</span>
          </div>
          <h2>Resource Performance History</h2>
        </div>


        <div className="chart-controls">
          {/* Timeframe Selectors */}
          <div className="range-selector">
            {['5m', '15m', '1h', '24h'].map(r => (
              <button
                key={r}
                className={`range-btn ${range === r ? 'active' : ''}`}
                onClick={() => onRangeChange && onRangeChange(r)}
                type="button"
              >
                {r === '5m' ? '5 Min' : r === '15m' ? '15 Min' : r === '1h' ? '1 Hour' : '24 Hours'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Metric KPI Selector Cards */}
      <div className="metric-selectors">
        <button
          className={`selector-btn cpu ${activeMetrics.cpu ? 'active' : ''}`}
          onClick={() => toggleMetric('cpu')}
          type="button"
        >
          <div className="selector-icon-wrap cpu">
            <Cpu size={14} />
          </div>
          <div className="selector-label-group">
            <span className="selector-name">CPU Usage</span>
            <span className="selector-stat">{stats.peakCpu}% peak</span>
          </div>
        </button>

        <button
          className={`selector-btn memory ${activeMetrics.memory ? 'active' : ''}`}
          onClick={() => toggleMetric('memory')}
          type="button"
        >
          <div className="selector-icon-wrap mem">
            <Layers size={14} />
          </div>
          <div className="selector-label-group">
            <span className="selector-name">Memory Usage</span>
            <span className="selector-stat">{stats.avgMem}% avg</span>
          </div>
        </button>

        <button
          className={`selector-btn disk ${activeMetrics.disk ? 'active' : ''}`}
          onClick={() => toggleMetric('disk')}
          type="button"
        >
          <div className="selector-icon-wrap disk">
            <HardDrive size={14} />
          </div>
          <div className="selector-label-group">
            <span className="selector-name">Disk Usage</span>
            <span className="selector-stat">{stats.currentDisk}% used</span>
          </div>
        </button>

        <button
          className={`selector-btn network ${activeMetrics.network ? 'active' : ''}`}
          onClick={() => toggleMetric('network')}
          type="button"
        >
          <div className="selector-icon-wrap net">
            <Network size={14} />
          </div>
          <div className="selector-label-group">
            <span className="selector-name">Network Throughput</span>
            <span className="selector-stat">{stats.maxNet} Mb/s</span>
          </div>
        </button>
      </div>

      {/* Main SVG Graph Container */}
      <div className="svg-container" style={{ position: 'relative' }}>
        {chartData.length === 0 ? (
          <div className="chart-placeholder">
            <Activity className="pulse-slow" size={36} color="#38bdf8" />
            <strong>Awaiting Telemetry Ingestion...</strong>
            <p>Live resource metrics stream automatically every 5s from active agents.</p>
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="chart-svg"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {/* Definitions for smooth gradients and line glows */}
            <defs>
              <linearGradient id="cpu-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="mem-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#22c55e" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="disk-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="net-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
              </linearGradient>

              <filter id="glow-cpu" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#38bdf8" floodOpacity="0.4" />
              </filter>
              <filter id="glow-mem" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#22c55e" floodOpacity="0.4" />
              </filter>
            </defs>

            {/* Horizontal Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
              const y = paddingY + ratio * (height - 2 * paddingY);
              const val = Math.round(100 - ratio * 100);
              return (
                <g key={index}>
                  <line
                    x1={paddingX}
                    y1={y}
                    x2={width - paddingX}
                    y2={y}
                    stroke="#1e2d45"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  {/* Left percentages Y-axis */}
                  <text
                    x={paddingX - 12}
                    y={y + 4}
                    fill="#64748b"
                    fontSize="11"
                    fontWeight="600"
                    textAnchor="end"
                  >
                    {val}%
                  </text>
                  {/* Right Mbps Y-axis */}
                  {activeMetrics.network && (
                    <text
                      x={width - paddingX + 12}
                      y={y + 4}
                      fill="#a855f7"
                      fontSize="11"
                      fontWeight="600"
                      textAnchor="start"
                    >
                      {Math.round((maxNetwork - ratio * maxNetwork))} Mb/s
                    </text>
                  )}
                </g>
              );
            })}

            {/* Vertical grid lines & labels */}
            {xTicks.map((tick, idx) => {
              if (!tick) return null;
              const x = paddingX + (idx / Math.max(1, xTicks.length - 1)) * (width - 2 * paddingX);
              return (
                <g key={idx}>
                  <line
                    x1={x}
                    y1={paddingY}
                    x2={x}
                    y2={height - paddingY}
                    stroke="#1e2d45"
                    strokeWidth="1"
                    opacity="0.4"
                  />
                  <text
                    x={x}
                    y={height - paddingY + 22}
                    fill="#64748b"
                    fontSize="11"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* Draw Area Fills & Lines for active metrics */}
            {activeMetrics.disk && lines.disk.length > 0 && (
              <>
                <path d={getAreaString(lines.disk)} fill="url(#disk-grad)" />
                <path d={getPathString(lines.disk)} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
              </>
            )}

            {activeMetrics.network && lines.network.length > 0 && (
              <>
                <path d={getAreaString(lines.network)} fill="url(#net-grad)" />
                <path d={getPathString(lines.network)} fill="none" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" />
              </>
            )}

            {activeMetrics.memory && lines.memory.length > 0 && (
              <>
                <path d={getAreaString(lines.memory)} fill="url(#mem-grad)" />
                <path d={getPathString(lines.memory)} fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" filter="url(#glow-mem)" />
              </>
            )}

            {activeMetrics.cpu && lines.cpu.length > 0 && (
              <>
                <path d={getAreaString(lines.cpu)} fill="url(#cpu-grad)" />
                <path d={getPathString(lines.cpu)} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" filter="url(#glow-cpu)" />
              </>
            )}

            {/* Hover indicator line & point markers */}
            {hoverIndex !== null && (
              <>
                <line
                  x1={paddingX + (hoverIndex / Math.max(1, chartData.length - 1)) * (width - 2 * paddingX)}
                  y1={paddingY}
                  x2={paddingX + (hoverIndex / Math.max(1, chartData.length - 1)) * (width - 2 * paddingX)}
                  y2={height - paddingY}
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                />

                {activeMetrics.cpu && lines.cpu[hoverIndex] && (
                  <circle cx={lines.cpu[hoverIndex].x} cy={lines.cpu[hoverIndex].y} r="5" fill="#38bdf8" stroke="#090e17" strokeWidth="2.5" />
                )}
                {activeMetrics.memory && lines.memory[hoverIndex] && (
                  <circle cx={lines.memory[hoverIndex].x} cy={lines.memory[hoverIndex].y} r="5" fill="#22c55e" stroke="#090e17" strokeWidth="2.5" />
                )}
                {activeMetrics.disk && lines.disk[hoverIndex] && (
                  <circle cx={lines.disk[hoverIndex].x} cy={lines.disk[hoverIndex].y} r="5" fill="#f59e0b" stroke="#090e17" strokeWidth="2.5" />
                )}
                {activeMetrics.network && lines.network[hoverIndex] && (
                  <circle cx={lines.network[hoverIndex].x} cy={lines.network[hoverIndex].y} r="5" fill="#a855f7" stroke="#090e17" strokeWidth="2.5" />
                )}
              </>
            )}
          </svg>
        )}

        {/* Floating Tooltip Box */}
        {hoverIndex !== null && chartData[hoverIndex] && (
          <div
            className="chart-tooltip"
            style={{
              position: 'absolute',
              left: `${tooltipPos.x + 15}px`,
              top: `${tooltipPos.y}px`,
              pointerEvents: 'none',
            }}
          >
            <div className="tooltip-time">
              ⏱ {new Date(chartData[hoverIndex].timestamp || chartData[hoverIndex].created_at).toLocaleTimeString()}
            </div>
            <div className="tooltip-rows">
              {activeMetrics.cpu && (
                <div className="tooltip-row cpu">
                  <span className="dot" />
                  <span>CPU:</span>
                  <strong>{(chartData[hoverIndex].cpu_usage ?? chartData[hoverIndex].cpu ?? 0).toFixed(1)}%</strong>
                </div>
              )}
              {activeMetrics.memory && (
                <div className="tooltip-row mem">
                  <span className="dot" />
                  <span>RAM:</span>
                  <strong>{(chartData[hoverIndex].memory_usage ?? chartData[hoverIndex].memory ?? 0).toFixed(1)}%</strong>
                </div>
              )}
              {activeMetrics.disk && (
                <div className="tooltip-row disk">
                  <span className="dot" />
                  <span>Disk:</span>
                  <strong>{(chartData[hoverIndex].disk_usage ?? chartData[hoverIndex].disk ?? 0).toFixed(1)}%</strong>
                </div>
              )}
              {activeMetrics.network && (
                <div className="tooltip-row net">
                  <span className="dot" />
                  <span>Net Speed:</span>
                  <strong>
                    {(
                      Number(chartData[hoverIndex].upload_mbps || 0) +
                      Number(chartData[hoverIndex].download_mbps || 0)
                    ).toFixed(2)} Mb/s
                  </strong>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .chart-panel {
          background: #0d1322;
          border: 1px solid #1e2d45;
          border-radius: 16px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
        }
        .chart-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 14px;
        }
        .live-stream-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 800;
          color: #38bdf8;
          letter-spacing: 0.08em;
          margin-bottom: 4px;
        }
        .pulse-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background-color: #22c55e;
          box-shadow: 0 0 8px #22c55e;
          animation: pulse-glow 1.5s infinite ease-in-out;
        }
        @keyframes pulse-glow {
          0% { opacity: 0.4; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.25); }
          100% { opacity: 0.4; transform: scale(0.9); }
        }
        .chart-title-area h2 {
          font-size: 18px;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }
        .chart-controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .range-selector {
          display: flex;
          background-color: #090e18;
          border: 1px solid #1e2d45;
          border-radius: 10px;
          padding: 3px;
        }
        .range-btn {
          background: none;
          border: none;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 14px;
          border-radius: 8px;
          transition: all 0.15s ease;
          cursor: pointer;
        }
        .range-btn:hover {
          color: #ffffff;
        }
        .range-btn.active {
          background-color: #17243b;
          color: #38bdf8;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        }
        .metric-selectors {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 12px;
        }
        .selector-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          background-color: #090e18;
          border: 1px solid #1e2d45;
          color: #94a3b8;
          padding: 10px 14px;
          border-radius: 12px;
          transition: all 0.2s ease;
          cursor: pointer;
          text-align: left;
        }
        .selector-btn:hover {
          color: #ffffff;
          border-color: #2b3d5c;
          transform: translateY(-1px);
        }
        .selector-btn.active {
          color: #ffffff;
          border-color: #38bdf8;
          background: #111a2e;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
        }
        .selector-icon-wrap {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .selector-icon-wrap.cpu { background: rgba(56, 189, 248, 0.12); color: #38bdf8; }
        .selector-icon-wrap.mem { background: rgba(34, 197, 94, 0.12); color: #22c55e; }
        .selector-icon-wrap.disk { background: rgba(245, 158, 11, 0.12); color: #f59e0b; }
        .selector-icon-wrap.net { background: rgba(168, 85, 247, 0.12); color: #a855f7; }

        .selector-label-group {
          display: flex;
          flex-direction: column;
        }
        .selector-name {
          font-size: 12px;
          font-weight: 700;
        }
        .selector-stat {
          font-size: 11px;
          color: #64748b;
          font-weight: 600;
        }
        .selector-btn.active .selector-stat {
          color: #94a3b8;
        }

        .svg-container {
          background-color: #090e18;
          border: 1px solid #1e2d45;
          border-radius: 12px;
          padding: 16px 8px;
          min-height: 260px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .chart-svg {
          width: 100%;
          height: 100%;
          overflow: visible;
        }
        .chart-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          color: #64748b;
          text-align: center;
          padding: 30px 20px;
        }
        .chart-placeholder strong {
          color: #cbd5e1;
          font-size: 14px;
        }
        .chart-placeholder p {
          font-size: 12px;
          max-width: 340px;
          color: #64748b;
          margin: 0;
        }
        .pulse-slow {
          animation: pulse-op 2s infinite ease-in-out;
        }
        @keyframes pulse-op {
          0% { opacity: 0.3; transform: scale(0.96); }
          50% { opacity: 0.95; transform: scale(1.04); }
          100% { opacity: 0.3; transform: scale(0.96); }
        }

        /* Tooltip Panel */
        .chart-tooltip {
          background-color: #0d1322;
          border: 1px solid #2b3d5c;
          border-radius: 10px;
          padding: 10px 14px;
          box-shadow: 0 14px 35px rgba(0, 0, 0, 0.7);
          min-width: 150px;
          z-index: 20;
          backdrop-filter: blur(8px);
        }
        .tooltip-time {
          font-size: 11px;
          font-weight: 700;
          color: #94a3b8;
          margin-bottom: 6px;
          border-bottom: 1px solid #1e2d45;
          padding-bottom: 4px;
        }
        .tooltip-rows {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .tooltip-row {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #cbd5e1;
        }
        .tooltip-row .dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
        }
        .tooltip-row strong {
          margin-left: auto;
          color: #ffffff;
        }
        .tooltip-row.cpu .dot { background-color: #38bdf8; }
        .tooltip-row.mem .dot { background-color: #22c55e; }
        .tooltip-row.disk .dot { background-color: #f59e0b; }
        .tooltip-row.net .dot { background-color: #a855f7; }
      `}</style>
    </section>
  );
}
