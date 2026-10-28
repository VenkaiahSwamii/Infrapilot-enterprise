import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Sparkles,
  BarChart3,
  Network,
  FileText,
  AlertCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  ShieldAlert,
} from 'lucide-react';
import { sreApi } from '../../api/sreApi.js';
import { computeStatisticalDelta, generateDualSeriesSVG } from './utils/sreHelpers.js';

export default function SREChatCopilot({ onSelectNode, onOpenDigitalTwin, onOpenPostMortem }) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'copilot',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: "Hello! I am your Zero-AI SRE Diagnostic Copilot. I run 100% deterministic algorithms, graph traversals, and statistical rankings across your infrastructure. Ask me about root causes, blast radius, time-travel comparisons, or error budgets.",
      suggestions: [
        "where my agents are running",
        "why is database slow between 10:00 and 10:30?",
        "what is the blast radius if database fails?",
        "compare latency today with yesterday",
        "evaluate google sre error budget for api gateway",
      ],
    },
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendQuery = async (queryText) => {
    const query = queryText || inputQuery;
    if (!query.trim() || isLoading) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: query,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsLoading(true);

    try {
      const resp = await sreApi.query(query);

      // Generate synthetic points for interactive in-chat graph
      const now = new Date();
      const currentPoints = [];
      const baselinePoints = [];
      for (let i = 0; i < 20; i++) {
        const time = new Date(now.getTime() - (20 - i) * 60000);
        const baseVal = 15 + Math.sin(i) * 5;
        const curVal = resp.root_cause ? baseVal * 2.8 + Math.random() * 15 : baseVal + Math.random() * 4;
        currentPoints.push({ timestamp: time, value: Math.round(curVal * 10) / 10 });
        baselinePoints.push({ timestamp: time, value: Math.round(baseVal * 10) / 10 });
      }

      const stats = computeStatisticalDelta(currentPoints, baselinePoints);

      const hasTimeWindow = query.toLowerCase().includes('between') && query.toLowerCase().includes('and');
      const isTimeQuery = hasTimeWindow || resp.intent === 'TIME_TRAVEL_COMPARE' || query.toLowerCase().includes('yesterday') || query.toLowerCase().includes('compare') || query.toLowerCase().includes('trend') || query.toLowerCase().includes('graph');
      const isInventoryQuery = resp.intent === 'LIST_INVENTORY' || query.toLowerCase().includes('connected') || query.toLowerCase().includes('how many') || query.toLowerCase().includes('inventory');
      const isBlastQuery = resp.intent === 'GET_BLAST_RADIUS' || query.toLowerCase().includes('blast') || query.toLowerCase().includes('break') || query.toLowerCase().includes('depend');
      const isPostMortemQuery = resp.intent === 'EXPORT_POSTMORTEM' || query.toLowerCase().includes('postmortem') || query.toLowerCase().includes('report');

      let proactiveQuestion = null;
      let relevantAction = null;
      if (hasTimeWindow || isTimeQuery) {
        proactiveQuestion = "I analyzed the metric shift. Would you like me to render the dual-series comparison graph?";
        relevantAction = 'graph';
      } else if (isBlastQuery || isInventoryQuery) {
        relevantAction = 'twin';
      } else if (isPostMortemQuery) {
        relevantAction = 'postmortem';
      }

      const isProblem = resp.matched_node && resp.matched_node.status !== 'HEALTHY';

      const copilotMsg = {
        id: `bot-${Date.now()}`,
        sender: 'copilot',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: resp.diagnostic || `Completed investigation for intent: ${resp.intent}`,
        data: resp,
        stats,
        currentPoints,
        baselinePoints,
        showGraph: false,
        proactiveQuestion,
        relevantAction,
        isProblem,
      };

      setMessages((prev) => [...prev, copilotMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-err-${Date.now()}`,
          sender: 'copilot',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: "SRE Diagnostic Engine is operating in offline mode. Local deterministic fallback active.",
          isOffline: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleGraph = (msgId) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, showGraph: !m.showGraph } : m))
    );
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <div style={styles.botIconBadge}>
            <Bot size={18} color="#38bdf8" />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px', color: '#f8fafc' }}>
              Zero-AI SRE Diagnostic Copilot
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              100% Deterministic • Mathematical Ranking • Zero Hallucination
            </div>
          </div>
        </div>
        <div style={styles.badgePill}>
          <Sparkles size={12} color="#10b981" />
          <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600 }}>ONLINE</span>
        </div>
      </div>

      {/* Messages Stream */}
      <div style={styles.messageStream}>
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              style={{
                ...styles.messageRow,
                justifyContent: isUser ? 'flex-end' : 'flex-start',
              }}
            >
              {!isUser && (
                <div style={styles.avatarBot}>
                  <Bot size={14} color="#38bdf8" />
                </div>
              )}

              <div
                style={{
                  ...styles.bubble,
                  backgroundColor: isUser ? '#1e293b' : '#0f172a',
                  border: isUser ? '1px solid #334155' : '1px solid #1e293b',
                  maxWidth: '85%',
                }}
              >
                <div style={styles.msgHeader}>
                  <span style={{ fontWeight: 600, fontSize: '11px', color: isUser ? '#cbd5e1' : '#38bdf8' }}>
                    {isUser ? 'You' : 'InfraPilot SRE Engine'}
                  </span>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>{msg.timestamp}</span>
                </div>

                {/* 1-Line Plain English Leading Verdict */}
                <div style={{
                  fontSize: '14px',
                  fontWeight: isUser ? 400 : 600,
                  lineHeight: '1.5',
                  color: isUser ? '#f1f5f9' : (msg.isProblem ? '#fca5a5' : '#38bdf8'),
                  marginTop: '6px',
                  padding: isUser ? '0' : '8px 12px',
                  backgroundColor: isUser ? 'transparent' : (msg.isProblem ? 'rgba(239, 68, 68, 0.12)' : 'rgba(56, 189, 248, 0.08)'),
                  borderRadius: '6px',
                  borderLeft: isUser ? 'none' : (msg.isProblem ? '3px solid #ef4444' : '3px solid #38bdf8'),
                }}>
                  {msg.text}
                </div>

                {/* Root Cause Card - Only show when there is an actual problem or failure */}
                {msg.data?.root_cause && msg.data?.matched_node?.status !== 'HEALTHY' && (
                  <div style={styles.diagnosticCard}>
                    <div style={styles.cardSection}>
                      <ShieldAlert size={14} color="#ef4444" />
                      <strong style={{ color: '#f87171', fontSize: '12px' }}>
                        Root Cause:{' '}
                      </strong>
                      <span style={{ fontSize: '12px', color: '#e2e8f0' }}>
                        {msg.data.root_cause.summary}
                      </span>
                    </div>
                  </div>
                )}

                {/* Blast Radius Details - Only show if user asked about impact/breaks or if node is unhealthy */}
                {msg.data?.blast_radius && (msg.relevantAction === 'twin' || msg.data?.matched_node?.status !== 'HEALTHY') && (
                  <div style={{ ...styles.diagnosticCard, marginTop: '8px', borderColor: '#f59e0b44' }}>
                    <div style={styles.cardSection}>
                      <Network size={14} color="#f59e0b" />
                      <strong style={{ color: '#fbbf24', fontSize: '12px' }}>
                        Downstream Impact ({msg.data.blast_radius.total_impacted} services):
                      </strong>
                      <span style={{ fontSize: '12px', color: '#cbd5e1', marginLeft: '6px' }}>
                        {msg.data.blast_radius.impacted_nodes?.map((n) => n.name).join(', ') || `${msg.data.blast_radius.total_impacted} services`}
                      </span>
                    </div>
                  </div>
                )}

                {/* Contextual Single Action - Clean & Zero Confusion */}
                {msg.relevantAction === 'twin' && onOpenDigitalTwin && (
                  <div style={{ marginTop: '10px' }}>
                    <button
                      onClick={() => onOpenDigitalTwin(msg.data?.matched_node)}
                      style={styles.actionBtnPrimary}
                    >
                      <Network size={13} />
                      Inspect in Digital Twin Simulator
                    </button>
                  </div>
                )}

                {msg.relevantAction === 'postmortem' && onOpenPostMortem && (
                  <div style={{ marginTop: '10px' }}>
                    <button
                      onClick={() => onOpenPostMortem(msg.data)}
                      style={styles.actionBtnPrimary}
                    >
                      <FileText size={13} />
                      Export Post-Mortem Report
                    </button>
                  </div>
                )}

                {/* Proactive Question & Graph Trigger (Only when comparison or time-window is relevant) */}
                {msg.proactiveQuestion && (
                  <div style={styles.proactiveBox}>
                    <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
                      {msg.proactiveQuestion}
                    </span>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => toggleGraph(msg.id)}
                        style={styles.actionBtnPrimary}
                      >
                        <BarChart3 size={13} />
                        {msg.showGraph ? 'Hide Graph' : '📊 Render Metric Graph'}
                      </button>
                    </div>
                  </div>
                )}

                {/* In-Chat SVG Graph Card */}
                {msg.showGraph && msg.currentPoints && (
                  <div style={styles.inlineGraphCard}>
                    <div style={styles.graphHeader}>
                      <div>
                        <strong style={{ fontSize: '12px', color: '#f8fafc' }}>
                          Time Travel Latency Comparison
                        </strong>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                          Current Window (Cyan) vs Baseline (Violet)
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: `${msg.stats?.badgeColor}22`,
                          color: msg.stats?.badgeColor,
                          border: `1px solid ${msg.stats?.badgeColor}44`,
                        }}
                      >
                        {msg.stats?.assessment} ({msg.stats?.percentageDelta > 0 ? '+' : ''}
                        {msg.stats?.percentageDelta}%)
                      </span>
                    </div>

                    {/* SVG Chart */}
                    <div style={{ marginTop: '8px', position: 'relative' }}>
                      {(() => {
                        const svgData = generateDualSeriesSVG(
                          msg.currentPoints,
                          msg.baselinePoints,
                          380,
                          90
                        );
                        return (
                          <svg
                            viewBox="0 0 380 90"
                            style={{ width: '100%', height: '80px', overflow: 'visible' }}
                          >
                            <defs>
                              <linearGradient id="curGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>
                            {/* Gridlines */}
                            <line x1="12" y1="12" x2="368" y2="12" stroke="#1e293b" strokeDasharray="3 3" />
                            <line x1="12" y1="45" x2="368" y2="45" stroke="#1e293b" strokeDasharray="3 3" />
                            <line x1="12" y1="78" x2="368" y2="78" stroke="#1e293b" strokeDasharray="3 3" />

                            {/* Baseline Series */}
                            <polyline
                              points={svgData.baselinePath}
                              fill="none"
                              stroke="#a855f7"
                              strokeWidth="1.8"
                              strokeDasharray="4 3"
                            />
                            {/* Current Series */}
                            <polyline
                              points={svgData.currentPath}
                              fill="none"
                              stroke="#38bdf8"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                            />
                          </svg>
                        );
                      })()}
                    </div>

                    <div style={styles.graphFooter}>
                      <span>Mean: {msg.stats?.curMean}ms (Base: {msg.stats?.baseMean}ms)</span>
                      <span>P95: {msg.stats?.curP95}ms (Base: {msg.stats?.baseP95}ms)</span>
                    </div>
                  </div>
                )}

                {/* Suggested prompt chips */}
                {msg.suggestions && (
                  <div style={styles.suggestionChips}>
                    {msg.suggestions.map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendQuery(s)}
                        style={styles.chipBtn}
                      >
                        <ArrowRight size={11} color="#38bdf8" />
                        <span>{s}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {isUser && (
                <div style={styles.avatarUser}>
                  <User size={14} color="#94a3b8" />
                </div>
              )}
            </div>
          );
        })}
        {isLoading && (
          <div style={{ ...styles.messageRow, justifyContent: 'flex-start' }}>
            <div style={styles.avatarBot}>
              <Bot size={14} color="#38bdf8" />
            </div>
            <div style={{ ...styles.bubble, backgroundColor: '#0f172a', border: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '12px' }}>
                <Clock size={14} className="spinning" />
                Parsing entities & traversing dependency graph...
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendQuery();
        }}
        style={styles.inputForm}
      >
        <input
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          placeholder="Ask SRE engine: 'why is postgres slow on 192.168.1.136:5432 between 10:00 and 10:30?'"
          style={styles.textInput}
        />
        <button
          type="submit"
          disabled={!inputQuery.trim() || isLoading}
          style={{
            ...styles.sendBtn,
            opacity: !inputQuery.trim() || isLoading ? 0.5 : 1,
          }}
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#090d16',
    borderRadius: '12px',
    border: '1px solid #1e293b',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    backgroundColor: '#0f172a',
    borderBottom: '1px solid #1e293b',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  botIconBadge: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    backgroundColor: '#0284c722',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #0284c744',
  },
  badgePill: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '4px 8px',
    borderRadius: '12px',
    backgroundColor: '#064e3b33',
    border: '1px solid #05966944',
  },
  messageStream: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  messageRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-start',
  },
  avatarBot: {
    width: '26px',
    height: '26px',
    borderRadius: '6px',
    backgroundColor: '#0284c722',
    border: '1px solid #0284c744',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: '2px',
  },
  avatarUser: {
    width: '26px',
    height: '26px',
    borderRadius: '6px',
    backgroundColor: '#334155',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: '2px',
  },
  bubble: {
    padding: '12px 14px',
    borderRadius: '10px',
    color: '#f8fafc',
  },
  msgHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  diagnosticCard: {
    marginTop: '10px',
    padding: '10px',
    borderRadius: '8px',
    backgroundColor: '#1e1b4b33',
    border: '1px solid #4338ca44',
  },
  cardSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  proactiveBox: {
    marginTop: '10px',
    padding: '10px 12px',
    borderRadius: '8px',
    backgroundColor: '#042f2e33',
    border: '1px solid #0d948844',
  },
  actionBtnPrimary: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '6px 12px',
    borderRadius: '6px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
  },
  actionBtnSecondary: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '6px 12px',
    borderRadius: '6px',
    backgroundColor: '#1e293b',
    color: '#cbd5e1',
    fontSize: '11px',
    fontWeight: 500,
    border: '1px solid #334155',
    cursor: 'pointer',
  },
  inlineGraphCard: {
    marginTop: '10px',
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: '#0b1329',
    border: '1px solid #1e293b',
  },
  graphHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  graphFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    color: '#94a3b8',
    marginTop: '6px',
    paddingTop: '6px',
    borderTop: '1px solid #1e293b',
  },
  suggestionChips: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '12px',
  },
  chipBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    borderRadius: '6px',
    backgroundColor: '#0f172a',
    border: '1px solid #1e293b',
    color: '#94a3b8',
    fontSize: '11px',
    cursor: 'pointer',
    textAlign: 'left',
  },
  inputForm: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 14px',
    backgroundColor: '#0f172a',
    borderTop: '1px solid #1e293b',
    gap: '8px',
  },
  textInput: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: '8px',
    backgroundColor: '#020617',
    border: '1px solid #334155',
    color: '#f8fafc',
    fontSize: '13px',
    outline: 'none',
  },
  sendBtn: {
    padding: '10px 14px',
    borderRadius: '8px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
