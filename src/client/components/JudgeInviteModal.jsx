import React, { useState, useEffect } from 'react';

export default function JudgeInviteModal({
  token,
  isOpen,
  onClose,
  onAcceptSuccess,
  currentUser,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [invitation, setInvitation] = useState(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    if (token && isOpen) {
      loadInvitation(token);
    }
  }, [token, isOpen]);

  const loadInvitation = async (tok) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invitations/${encodeURIComponent(tok)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid or expired invitation link');
      }
      setInvitation(data.invitation);
      setName(data.invitation.name || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    if (!currentUser) {
      if (!password || password.length < 6) {
        setSubmitError('Please choose a password with at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setSubmitError('Passwords do not match.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/invitations/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          password: password || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to accept invitation');
      }
      onAcceptSuccess(data.user, data.event_id);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="invite-title">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px', width: '100%' }}>
        <div className="modal-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
              <span className="tag-version-dot"></span>
              <span style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                VERIDICT Official Invitation
              </span>
            </div>
            <h2 id="invite-title" className="modal-title">Judge Onboarding</h2>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            <div className="empty-state-icon" style={{ margin: '0 auto 1rem' }}>⏳</div>
            <p>Validating cryptographic invitation token...</p>
          </div>
        ) : error ? (
          <div style={{ padding: '1rem 0' }}>
            <div className="banner danger" style={{ marginBottom: '1.25rem' }}>
              <strong>Invitation Error:</strong> {error}
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
              This link may have been revoked, expired, or mistyped. Please contact the hackathon organizers to receive an active invitation.
            </p>
            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ width: '100%' }}>
              Close
            </button>
          </div>
        ) : invitation ? (
          <div style={{ marginTop: '0.75rem' }}>
            {/* Event Summary Card */}
            <div style={{
              background: 'var(--surface-raised)',
              border: '1px solid var(--surface-border)',
              borderRadius: 'var(--radius)',
              padding: '1.2rem',
              marginBottom: '1.25rem'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                Event
              </div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-bright)' }}>
                {invitation.event_name}
              </h3>
              {invitation.event_description && (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.35rem 0 0 0', lineHeight: 1.45 }}>
                  {invitation.event_description}
                </p>
              )}

              {/* Tracks Badges */}
              {invitation.tracks && invitation.tracks.length > 0 && (
                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {invitation.tracks.map(t => (
                    <span key={t.id} className="track-tag" style={{ fontSize: '0.75rem' }}>
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Status alerts */}
            {invitation.status === 'EXPIRED' && (
              <div className="banner danger" style={{ marginBottom: '1.25rem' }}>
                This invitation expired on {new Date(invitation.expires_at).toLocaleDateString()}. Please request a renewed link from the organizer.
              </div>
            )}

            {invitation.status === 'ACCEPTED' && (
              <div className="banner success" style={{ marginBottom: '1.25rem' }}>
                This invitation has already been accepted for <strong>{invitation.email}</strong>.
              </div>
            )}

            {submitError && (
              <div className="banner danger" style={{ marginBottom: '1rem' }}>
                {submitError}
              </div>
            )}

            {invitation.status === 'PENDING' && (
              <form onSubmit={handleAccept}>
                <div className="form-group">
                  <label>Judge Full Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Invited Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={invitation.email}
                    disabled
                    style={{ opacity: 0.75, cursor: 'not-allowed' }}
                  />
                </div>

                {!currentUser && (
                  <>
                    <div className="form-group">
                      <label>Set Password for your Judge Account *</label>
                      <input
                        type="password"
                        className="form-control"
                        placeholder="At least 6 characters"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        minLength={6}
                      />
                    </div>
                    <div className="form-group">
                      <label>Confirm Password *</label>
                      <input
                        type="password"
                        className="form-control"
                        placeholder="Repeat chosen password"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        required
                        minLength={6}
                      />
                    </div>
                  </>
                )}

                <div style={{ marginTop: '1.5rem' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '0.75rem' }}
                    disabled={submitting}
                  >
                    {submitting ? 'Accepting & Entering Workbench...' : 'Accept Invitation & Enter Judge Workbench \u2192'}
                  </button>
                </div>
              </form>
            )}

            {invitation.status === 'ACCEPTED' && (
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={onClose}
              >
                Proceed to Sign In &rarr;
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
