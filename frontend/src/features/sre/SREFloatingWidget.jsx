import React, { useState } from 'react';
import { Bot, X, Sparkles, Maximize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SREChatCopilot from './SREChatCopilot.jsx';

export default function SREFloatingWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div style={styles.container}>
      {/* Expanded SRE Assistant Drawer */}
      {isOpen && (
        <div style={styles.drawer}>
          <div style={styles.drawerHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bot size={16} color="#38bdf8" />
              <strong style={{ fontSize: '13px', color: '#f8fafc' }}>
                SRE Diagnostic Copilot
              </strong>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/sre-studio');
                }}
                title="Expand to Full SRE Studio"
                style={styles.headerBtn}
              >
                <Maximize2 size={13} />
              </button>
              <button onClick={() => setIsOpen(false)} style={styles.headerBtn}>
                <X size={15} />
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'hidden' }}>
            <SREChatCopilot
              onOpenDigitalTwin={() => {
                setIsOpen(false);
                navigate('/sre-studio');
              }}
              onOpenPostMortem={() => {
                setIsOpen(false);
                navigate('/sre-studio');
              }}
            />
          </div>
        </div>
      )}

      {/* Floating Pill Toggle Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        style={styles.floatingBtn}
        aria-label="Toggle SRE Diagnostic Copilot"
      >
        <div style={styles.iconPulse}>
          <Bot size={20} color="#ffffff" />
        </div>
        <span style={styles.btnLabel}>SRE Copilot</span>
        <span style={styles.onlineDot} />
      </button>
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: 9999,
  },
  floatingBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    borderRadius: '24px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: '1px solid #38bdf8',
    boxShadow: '0 10px 25px -5px rgba(2, 132, 199, 0.5), 0 8px 10px -6px rgba(2, 132, 199, 0.3)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  btnLabel: {
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.3px',
  },
  iconPulse: {
    display: 'flex',
    alignItems: 'center',
  },
  onlineDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: '#34d399',
    boxShadow: '0 0 8px #34d399',
  },
  drawer: {
    position: 'absolute',
    bottom: '56px',
    right: '0',
    width: '420px',
    height: '560px',
    maxWidth: 'calc(100vw - 48px)',
    maxHeight: 'calc(100vh - 100px)',
    backgroundColor: '#090d16',
    borderRadius: '16px',
    border: '1px solid #1e293b',
    boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.8)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    marginBottom: '8px',
  },
  drawerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    backgroundColor: '#0f172a',
    borderBottom: '1px solid #1e293b',
  },
  headerBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
  },
};
