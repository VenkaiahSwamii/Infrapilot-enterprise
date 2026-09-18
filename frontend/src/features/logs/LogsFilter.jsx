import React from 'react';
import { Search, Filter, Calendar, Server } from 'lucide-react';

export default function LogsFilter({
  searchQuery,
  onSearchChange,
  selectedLevel,
  onLevelChange,
  selectedSource,
  onSourceChange,
  selectedTimeRange,
  onTimeRangeChange,
  onSubmit,
}) {
  return (
    <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
      <form onSubmit={onSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 180px 180px 160px 100px', gap: '14px', alignItems: 'center' }}>
        {/* Full Text Search */}
        <div style={{ position: 'relative' }}>
          <Search size={16} color="#8b949e" style={{ position: 'absolute', left: '12px', top: '10px' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search log messages (e.g. error, sshd, disk, redis)..."
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              background: '#0d1117',
              border: '1px solid #30363d',
              color: '#fff',
              borderRadius: '6px',
              fontSize: '13px'
            }}
          />
        </div>

        {/* Severity Level Filter */}
        <div>
          <select
            value={selectedLevel}
            onChange={(e) => onLevelChange(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', background: '#0d1117', border: '1px solid #30363d', color: '#fff', borderRadius: '6px', fontSize: '13px' }}
          >
            <option value="ALL">All Levels</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
        </div>

        {/* Log Source Filter */}
        <div>
          <select
            value={selectedSource}
            onChange={(e) => onSourceChange(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', background: '#0d1117', border: '1px solid #30363d', color: '#fff', borderRadius: '6px', fontSize: '13px' }}
          >
            <option value="ALL">All Log Sources</option>
            <option value="syslog">syslog</option>
            <option value="auth">auth</option>
            <option value="kernel">kernel</option>
            <option value="system">system</option>
            <option value="security">security</option>
            <option value="application">application</option>
            <option value="docker">docker</option>
            <option value="kubernetes">kubernetes</option>
          </select>
        </div>

        {/* Time Range Filter */}
        <div>
          <select
            value={selectedTimeRange}
            onChange={(e) => onTimeRangeChange(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', background: '#0d1117', border: '1px solid #30363d', color: '#fff', borderRadius: '6px', fontSize: '13px' }}
          >
            <option value="15m">Last 15 Minutes</option>
            <option value="1h">Last 1 Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>
        </div>

        {/* Search Submit Button */}
        <button
          type="submit"
          style={{
            backgroundColor: '#1f6feb',
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '13px'
          }}
        >
          Apply Filters
        </button>
      </form>
    </div>
  );
}
