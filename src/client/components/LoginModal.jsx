import React, { useState } from 'react';

export default function LoginModal({ isOpen, onClose, onLoginSuccess, isDemoMode = false }) {
  const [tab, setTab] = useState('signin'); // 'signin' | 'signup' | 'forgot' | 'verify' | 'reset'

  // Sign In fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Sign Up fields
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupRole, setSignupRole] = useState('organizer'); // 'organizer' | 'participant'

  // Forgot / Reset fields
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetSuccess, setResetSuccess] = useState(null);

  // Verification state
  const [verificationState, setVerificationState] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifiedSuccess, setVerifiedSuccess] = useState(false);

  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
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

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: signupName.trim(),
          email: signupEmail.trim(),
          password: signupPassword,
          role: signupRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');

      // Store created user
      const createdUser = data.user;

      if (data.verificationToken) {
        setVerificationState({
          email: signupEmail.trim(),
          token: data.verificationToken,
          link: data.verificationLink,
          configured: data.emailConfigured,
          delivered: data.emailDelivered,
          error: data.emailError,
          user: createdUser,
        });
        setTab('verify');
      } else {
        onLoginSuccess(createdUser);
        onClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (tokenToUse) => {
    const t = tokenToUse || verificationState?.token;
    if (!t) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      setVerifiedSuccess(true);
      setTimeout(() => {
        if (verificationState?.user) {
          onLoginSuccess({ ...verificationState.user, is_verified: true });
        }
        onClose();
      }, 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      if (data.resetToken) {
        const text = data.emailConfigured
          ? `⚠️ Reset email could not be sent (${data.emailError || 'Email delivery failed'}). Use the direct token below to reset your password:`
          : 'Email delivery is not configured on this host. Use the direct token below to reset your password:';
        setInfo({
          text,
          token: data.resetToken,
        });
        setResetToken(data.resetToken);
      } else {
        setInfo({ text: 'If an account exists with that email, reset instructions have been sent.' });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken.trim(), newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Password reset failed');
      setResetSuccess(data.message || 'Password reset successfully!');
      setTimeout(() => {
        setTab('signin');
        setResetSuccess(null);
        setInfo(null);
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="login-modal-title">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px', padding: '2rem' }}>
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
                {tab === 'signin' && 'Sign In to VERIDICT'}
                {tab === 'signup' && 'Create a VERIDICT Account'}
                {tab === 'forgot' && 'Reset Your Password'}
                {tab === 'verify' && 'Verify Your Email'}
                {tab === 'reset' && 'Choose New Password'}
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

        {/* Tab switcher (only when on signin or signup) */}
        {(tab === 'signin' || tab === 'signup') && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--surface-border)', paddingBottom: '0.75rem' }}>
            <button
              type="button"
              className={`btn btn-xs ${tab === 'signin' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setTab('signin'); setError(null); }}
              style={{ flex: 1, padding: '0.5rem' }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`btn btn-xs ${tab === 'signup' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setTab('signup'); setError(null); }}
              style={{ flex: 1, padding: '0.5rem' }}
            >
              Create New Account
            </button>
          </div>
        )}

        {error && (
          <div className="banner danger" style={{ padding: '0.65rem 0.95rem', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span>⛔</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {info && (
          <div className="banner" style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '0.75rem 1rem', fontSize: '0.85rem', marginBottom: '1.25rem', color: '#cbd5e1' }}>
            <div>{info.text}</div>
            {info.token && (
              <div style={{ marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  onClick={() => { setTab('reset'); setResetToken(info.token); }}
                >
                  Set New Password Now &rarr;
                </button>
              </div>
            )}
          </div>
        )}

        {resetSuccess && (
          <div className="banner success" style={{ padding: '0.65rem 0.95rem', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            <span>✅ {resetSuccess}</span>
          </div>
        )}

        {/* VIEW 1: SIGN IN */}
        {tab === 'signin' && (
          <form onSubmit={handleSignIn}>
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

            <div className="form-group" style={{ marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)', margin: 0 }}>Password *</label>
                <button
                  type="button"
                  onClick={() => { setTab('forgot'); setError(null); setInfo(null); }}
                  style={{ background: 'none', border: 'none', color: 'var(--brand-accent, #38bdf8)', fontSize: '0.75rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                className="form-control"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1.25rem' }} disabled={loading}>
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        )}

        {/* VIEW 2: SIGN UP */}
        {tab === 'signup' && (
          <form onSubmit={handleSignUp}>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)' }}>Full Name *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Maya Patel"
                value={signupName}
                onChange={e => setSignupName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)' }}>Email Address *</label>
              <input
                type="email"
                className="form-control"
                placeholder="e.g. maya@example.org"
                value={signupEmail}
                onChange={e => setSignupEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)' }}>Password *</label>
              <input
                type="password"
                className="form-control"
                placeholder="At least 6 characters"
                value={signupPassword}
                onChange={e => setSignupPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
                Account Purpose *
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div
                  className={`mode-select-card ${signupRole === 'organizer' ? 'active' : ''}`}
                  onClick={() => setSignupRole('organizer')}
                  style={{ padding: '0.75rem', textAlign: 'center', cursor: 'pointer' }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>👑 Organizer</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Host &amp; manage events</div>
                </div>
                <div
                  className={`mode-select-card ${signupRole === 'participant' ? 'active' : ''}`}
                  onClick={() => setSignupRole('participant')}
                  style={{ padding: '0.75rem', textAlign: 'center', cursor: 'pointer' }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>🚀 Hacker</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Build &amp; submit projects</div>
                </div>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        )}

        {/* VIEW 3: VERIFY EMAIL PROMPT */}
        {tab === 'verify' && verificationState && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✉️</div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Verify Your Email</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
              An account was created for <strong style={{ color: 'var(--text-bright)' }}>{verificationState.email}</strong>.
            </p>

            {verifiedSuccess ? (
              <div className="banner success" style={{ marginBottom: '1rem' }}>
                ✅ Email address verified successfully! Signing you in...
              </div>
            ) : verificationState.delivered ? (
              <div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  A verification email has been delivered to your inbox. Click the link in that email to activate your account.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => { onLoginSuccess(verificationState.user); onClose(); }}
                >
                  Continue to VERIDICT
                </button>
              </div>
            ) : verificationState.configured ? (
              <div style={{ background: 'rgba(255, 180, 0, 0.05)', border: '1px solid rgba(255, 180, 0, 0.3)', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.82rem', color: '#f59e0b', marginBottom: '0.75rem', lineHeight: '1.4' }}>
                  ⚠️ <em>Verification email could not be sent ({verificationState.error || 'Email delivery failed'}). You can verify your account directly:</em>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => handleVerifyEmail()}
                  disabled={verifying}
                  style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {verifying ? 'Verifying...' : 'Verify Email Address Now'}
                </button>
              </div>
            ) : (
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
                  ⚡ <em>Email delivery is not configured on this host. You can verify your account directly:</em>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => handleVerifyEmail()}
                  disabled={verifying}
                  style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {verifying ? 'Verifying...' : 'Verify Email Address Now'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* VIEW 4: FORGOT PASSWORD */}
        {tab === 'forgot' && (
          <form onSubmit={handleForgotPassword}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: '1.5', marginBottom: '1.25rem' }}>
              Enter your account's email address and we'll generate password reset instructions.
            </p>
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)' }}>Email Address *</label>
              <input
                type="email"
                className="form-control"
                placeholder="e.g. organizer@example.org"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setTab('signin'); setError(null); setInfo(null); }}
                style={{ flex: 1 }}
              >
                Back to Sign In
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ flex: 1 }}
              >
                {loading ? 'Sending...' : 'Request Reset'}
              </button>
            </div>
          </form>
        )}

        {/* VIEW 5: RESET PASSWORD FORM */}
        {tab === 'reset' && (
          <form onSubmit={handleResetPassword}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '1.25rem' }}>
              Choose a new password for your VERIDICT account.
            </p>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)' }}>Reset Token *</label>
              <input
                type="text"
                className="form-control"
                value={resetToken}
                onChange={e => setResetToken(e.target.value)}
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)' }}>New Password *</label>
              <input
                type="password"
                className="form-control"
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setTab('signin'); setError(null); }}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ flex: 1 }}
              >
                {loading ? 'Updating...' : 'Set Password'}
              </button>
            </div>
          </form>
        )}

        {/* DEMO MODE ONLY: Quick-Fill Seeded Credentials */}
        {isDemoMode && (tab === 'signin' || tab === 'signup') && (
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--surface-border-subtle)', paddingTop: '1.15rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', color: 'var(--text-bright)', fontWeight: 600 }}>
              <span>⚡</span>
              <span>Evaluator Mode Seeded Shortcuts:</span>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              <button
                type="button"
                className="demo-btn"
                onClick={() => { setTab('signin'); setEmail('organizer@example.org'); setPassword('organizer123'); setError(null); }}
              >
                Lead Organizer
              </button>
              <button
                type="button"
                className="demo-btn"
                onClick={() => { setTab('signin'); setEmail('tomas.varga@example.org'); setPassword('judge123'); setError(null); }}
              >
                Judge Tomas
              </button>
              <button
                type="button"
                className="demo-btn"
                onClick={() => { setTab('signin'); setEmail('priya1@example.org'); setPassword('participant123'); setError(null); }}
              >
                Participant Priya
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
