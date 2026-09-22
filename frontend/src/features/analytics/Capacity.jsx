import React from 'react';
import { Gauge, AlertCircle, ArrowUpRight, CheckCircle2 } from 'lucide-react';

export default function Capacity({ predictions }) {
  const list = Array.isArray(predictions?.capacity_predictions)
    ? predictions.capacity_predictions
    : Array.isArray(predictions)
    ? predictions
    : [];

  return (
    <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: 0, color: '#f0f6fc', fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Gauge size={20} color="#ffa657" />
          Predictive Capacity Planning &amp; Forecasting
        </h3>
        <span style={{ fontSize: '13px', color: '#8b949e' }}>Linear regression forecasting resource saturation dates and scaling actions</span>
      </div>

      {list.length === 0 ? (
        <div style={{ background: '#0d1117', border: '1px dashed #30363d', borderRadius: '10px', padding: '48px 24px', textAlign: 'center' }}>
          <AlertCircle size={40} color="#ffa657" style={{ margin: '0 auto 12px auto', display: 'block' }} />
          <h4 style={{ color: '#f0f6fc', fontSize: '16px', margin: '0 0 8px 0', fontWeight: 700 }}>No Predictive Capacity Data</h4>
          <p style={{ color: '#8b949e', fontSize: '13px', maxWidth: '480px', margin: '0 auto', lineHeight: 1.5 }}>
            No capacity forecasting dataset is available yet. Machine metric trends are calculated as telemetry flows from active connected agents.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          {list.map((item, idx) => {
            const isHighRisk = item.predicted_usage_pct >= 90;
            return (
              <div key={idx} style={{
                background: '#0d1117',
                border: `1px solid ${isHighRisk ? '#f78166' : '#30363d'}`,
                borderRadius: '10px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ textTransform: 'uppercase', fontWeight: 700, color: '#f0f6fc', fontSize: '14px' }}>
                      {item.resource_type} Capacity
                    </span>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: isHighRisk ? 'rgba(247, 129, 102, 0.15)' : 'rgba(255, 166, 87, 0.15)',
                      color: isHighRisk ? '#f78166' : '#ffa657',
                    }}>
                      {item.prediction_days} Days Horizon
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', margin: '14px 0' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#8b949e' }}>CURRENT</div>
                      <div style={{ fontSize: '24px', fontWeight: 700, color: '#c9d1d9' }}>{item.current_usage_pct}%</div>
                    </div>
                    <ArrowUpRight size={20} color={isHighRisk ? '#f78166' : '#58a6ff'} />
                    <div>
                      <div style={{ fontSize: '11px', color: '#8b949e' }}>PREDICTED</div>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: isHighRisk ? '#f78166' : '#ffa657' }}>
                        {item.predicted_usage_pct}%
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ width: '100%', height: '8px', background: '#21262d', borderRadius: '4px', overflow: 'hidden', marginBottom: '16px' }}>
                    <div style={{
                      width: `${Math.min(item.predicted_usage_pct, 100)}%`,
                      height: '100%',
                      background: isHighRisk ? '#f78166' : '#ffa657'
                    }} />
                  </div>
                </div>

                <div style={{ background: '#161b22', padding: '12px', borderRadius: '6px', borderLeft: `3px solid ${isHighRisk ? '#f78166' : '#58a6ff'}` }}>
                  <div style={{ fontSize: '11px', color: '#8b949e', fontWeight: 700, marginBottom: '2px' }}>RECOMMENDED ACTION</div>
                  <div style={{ fontSize: '13px', color: '#c9d1d9' }}>{item.recommended_action}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
