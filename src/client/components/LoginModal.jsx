import React, { useState } from 'react';

export default function LoginModal({ isOpen, onClose, onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      onLoginSuccess(data.user);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="login-modal-title">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', padding: '2rem' }}>
        <div className="modal-header" style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="brand-logo-icon" aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 6 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <div>
              <h2 id="login-modal-title" style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-bright)' }}>
                Portal Authentication
              </h2>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.5, margin: '0 0 1.25rem 0' }}>
          Sign in with your registered account credentials to submit project deliverables, score entries, or access organizer controls.
        </p>

        {error && (
          <div className="banner danger" style={{ padding: '0.65rem 0.95rem', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span>⛔</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '1.15rem' }}>
            <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)' }}>Email Address *</label>
            <input
              type="email"
              className="form-control"
              placeholder="e.g. organizer@example.org"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)' }}>Password *</label>
            <input
              type="password"
              className="form-control"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--surface-border-subtle)', paddingTop: '1.15rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', color: 'var(--text-bright)', fontWeight: 600 }}>
            <span>⚡</span>
            <span>Quick-Fill Seeded Credentials:</span>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <button
              type="button"
              className="demo-btn"
              onClick={() => { setEmail('organizer@example.org'); setPassword('organizer123'); setError(null); }}
              title="Fill Organizer credentials"
            >
              Organizer (organizer123)
            </button>
            <button
              type="button"
              className="demo-btn"
              onClick={() => { setEmail('tomas.varga@example.org'); setPassword('judge123'); setError(null); }}
              title="Fill Judge Tomas Varga credentials"
            >
              Judge (judge123)
            </button>
            <button
              type="button"
              className="demo-btn"
              onClick={() => { setEmail('priya1@example.org'); setPassword('participant123'); setError(null); }}
              title="Fill Participant Priya credentials"
            >
              Participant (participant123)
            </button>
          </div>
          <p style={{ margin: 0, color: 'var(--text-dim)', lineHeight: 1.45 }}>
            You can also use the evaluator fast-switch bar at the top of the page to assume sessions instantly.
          </p>
        </div>
      </div>
    </div>
  );
}
