import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, MessageSquare, Bot, User, Trash2 } from 'lucide-react';
import { apiPost } from '../../api/client.js';

export default function AIChat() {
  const [messages, setMessages] = useState([
    {
      sender: 'ai',
      text: 'Hello! I am your InfraPilot AI Copilot. Ask me where your agents are running, inspect live CPU & memory metrics, check active alerts, or monitor containers.',
      citations: [],
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, {
      sender: 'user',
      text: userMsg,
      timestamp: new Date().toLocaleTimeString()
    }]);
    setLoading(true);

    try {
      const res = await apiPost('/ai/chat', {
        session_id: 'chat-session-default',
        query: userMsg
      });

      setMessages((prev) => [...prev, {
        sender: 'ai',
        text: res.answer,
        citations: res.citations || [],
        timestamp: new Date().toLocaleTimeString()
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        sender: 'ai',
        text: `Failed to retrieve analysis: ${err.message}`,
        citations: [],
        timestamp: new Date().toLocaleTimeString()
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestion = (suggestion) => {
    setInput(suggestion);
  };

  const clearChat = () => {
    setMessages([
      {
        sender: 'ai',
        text: 'Chat history cleared. How can I assist you with your infrastructure today?',
        citations: [],
        timestamp: new Date().toLocaleTimeString()
      }
    ]);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '600px',
      backgroundColor: '#0f172a',
      border: '1px solid #1e293b',
      borderRadius: '12px',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        borderBottom: '1px solid #1e293b',
        backgroundColor: '#1e293b33'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sparkles size={20} color="#3b82f6" />
          <h3 style={{ margin: 0, fontSize: '15px', color: '#f8fafc', fontWeight: '600' }}>
            InfraPilot AI Copilot
          </h3>
        </div>
        <button
          onClick={clearChat}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Clear Chat"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Messages */}
      <div style={{
        flexGrow: 1,
        padding: '20px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {messages.map((m, index) => {
          const isAI = m.sender === 'ai';
          return (
            <div key={index} style={{
              display: 'flex',
              gap: '12px',
              alignSelf: isAI ? 'flex-start' : 'flex-end',
              flexDirection: isAI ? 'row' : 'row-reverse',
              maxWidth: '80%'
            }}>
              {/* Avatar */}
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: isAI ? '#1e3a8a' : '#334155',
                border: '1px solid ' + (isAI ? '#3b82f6' : '#475569'),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {isAI ? <Bot size={16} color="#3b82f6" /> : <User size={16} color="#cbd5e1" />}
              </div>

              {/* Bubble */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '12px',
                  backgroundColor: isAI ? '#1e293b' : '#3b82f6',
                  color: '#f8fafc',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                  whiteSpace: 'pre-line'
                }}>
                  {m.text}

                  {/* Citations */}
                  {isAI && m.citations && m.citations.length > 0 && (
                    <div style={{
                      marginTop: '12px',
                      paddingTop: '8px',
                      borderTop: '1px solid #334155',
                      fontSize: '11px',
                      color: '#94a3b8'
                    }}>
                      <strong style={{ color: '#64748b', display: 'block', marginBottom: '4px' }}>Sources Referenced:</strong>
                      <ul style={{ margin: 0, paddingLeft: '14px' }}>
                        {m.citations.map((cit, idx) => (
                          <li key={idx}>{cit}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: '10px',
                  color: '#64748b',
                  alignSelf: isAI ? 'flex-start' : 'flex-end'
                }}>
                  {m.timestamp}
                </span>
              </div>
            </div>
          );
        })}
        {loading && (
          <div style={{ display: 'flex', gap: '12px', alignSelf: 'flex-start' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#1e3a8a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Bot size={16} color="#3b82f6" />
            </div>
            <div style={{
              padding: '12px 16px',
              borderRadius: '12px',
              backgroundColor: '#1e293b',
              color: '#94a3b8',
              fontSize: '14px'
            }}>
              Typing response...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Chips */}
      <div style={{
        padding: '0 20px 12px 20px',
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        backgroundColor: 'transparent'
      }}>
        <button
          onClick={() => handleSuggestion('Where are my agents running?')}
          style={{
            backgroundColor: '#1e293b',
            color: '#94a3b8',
            border: '1px solid #334155',
            borderRadius: '16px',
            padding: '6px 12px',
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'background 0.2s'
          }}
        >
          Where are my agents running?
        </button>
        <button
          onClick={() => handleSuggestion('Show CPU and memory usage')}
          style={{
            backgroundColor: '#1e293b',
            color: '#94a3b8',
            border: '1px solid #334155',
            borderRadius: '16px',
            padding: '6px 12px',
            fontSize: '12px',
            cursor: 'pointer'
          }}
        >
          Show CPU & memory usage
        </button>
        <button
          onClick={() => handleSuggestion('Are there any active alerts?')}
          style={{
            backgroundColor: '#1e293b',
            color: '#94a3b8',
            border: '1px solid #334155',
            borderRadius: '16px',
            padding: '6px 12px',
            fontSize: '12px',
            cursor: 'pointer'
          }}
        >
          Are there any active alerts?
        </button>
        <button
          onClick={() => handleSuggestion('Show Docker container status')}
          style={{
            backgroundColor: '#1e293b',
            color: '#94a3b8',
            border: '1px solid #334155',
            borderRadius: '16px',
            padding: '6px 12px',
            fontSize: '12px',
            cursor: 'pointer'
          }}
        >
          Show Docker container status
        </button>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} style={{
        display: 'flex',
        padding: '16px 20px',
        borderTop: '1px solid #1e293b',
        backgroundColor: '#1e293b33',
        gap: '12px'
      }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask AI assistant about your infrastructure..."
          style={{
            flexGrow: 1,
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '10px 16px',
            color: '#f8fafc',
            fontSize: '14px',
            outline: 'none'
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          style={{
            backgroundColor: '#3b82f6',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: input.trim() && !loading ? 'pointer' : 'default',
            opacity: input.trim() && !loading ? 1 : 0.6
          }}
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
