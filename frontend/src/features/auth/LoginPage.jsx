import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { API_BASE } from '../../api/client.js';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Login failed');
      }

      const data = await res.json();
      // Backend returns "token" (not "access_token")
      if (data.token) {
        localStorage.setItem('token', data.token);
      }
      if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token);
      }
      // Backend returns user as a plain string (username)
      if (data.user) {
        localStorage.setItem('user', JSON.stringify({ username: data.user, email: data.email, id: data.user_id }));
      }

      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <Activity size={40} className="login-logo" />
          <h1>InfraPilot</h1>
          <p className="login-subtitle">Enterprise Monitoring Platform</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          {error && <div className="login-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="infrapilotadmin@gmail.com"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin@123"
              required
            />
          </div>

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          <p style={{ margin: '0 0 4px 0', color: '#64748b', fontSize: '11px' }}>
            Default credentials: <strong style={{ color: '#94a3b8' }}>infrapilotadmin@gmail.com</strong> / <strong style={{ color: '#94a3b8' }}>Admin@123</strong>
          </p>
          <p style={{ margin: 0 }}>InfraPilot Enterprise v1.0</p>
        </div>
      </div>

      <style>{`
        .login-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .login-card {
          background: #1e293b;
          border-radius: 16px;
          padding: 48px 40px;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4);
          border: 1px solid #334155;
        }

        .login-header {
          text-align: center;
          margin-bottom: 36px;
        }

        .login-logo {
          color: #06b6d4;
          margin-bottom: 16px;
        }

        .login-header h1 {
          color: #f1f5f9;
          font-size: 28px;
          font-weight: 700;
          margin: 0 0 8px;
        }

        .login-subtitle {
          color: #94a3b8;
          font-size: 14px;
          margin: 0;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .login-error {
          background: #7f1d1d;
          color: #fca5a5;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
          border: 1px solid #991b1b;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          color: #cbd5e1;
          font-size: 14px;
          font-weight: 500;
        }

        .form-group input {
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid #334155;
          background: #0f172a;
          color: #f1f5f9;
          font-size: 15px;
          outline: none;
          transition: border-color 0.2s;
        }

        .form-group input:focus {
          border-color: #06b6d4;
        }

        .form-group input::placeholder {
          color: #475569;
        }

        .login-button {
          padding: 12px 24px;
          background: linear-gradient(135deg, #06b6d4, #0891b2);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s;
          margin-top: 8px;
        }

        .login-button:hover:not(:disabled) {
          opacity: 0.9;
        }

        .login-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .login-footer {
          text-align: center;
          margin-top: 32px;
          color: #475569;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}