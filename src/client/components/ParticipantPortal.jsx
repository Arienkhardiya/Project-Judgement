import React, { useState, useEffect } from 'react';

export default function ParticipantPortal({ user, onRequireLogin }) {
  const [teamData, setTeamData] = useState(null);
  const [eventData, setEventData] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Forms
  const [newTeamName, setNewTeamName] = useState('');
  const [joinInviteCode, setJoinInviteCode] = useState('');
  const [projectForm, setProjectForm] = useState({
    title: '',
    summary: '',
    description: '',
    repo_url: '',
    demo_url: '',
    track_id: '',
    action: 'submit',
  });

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch current user's team
      const teamRes = await fetch('/api/teams/my-team');
      const teamJson = await teamRes.json();
      setTeamData(teamJson.team);

      // 2. Fetch event & tracks
      const evtRes = await fetch('/api/events');
      const evtJson = await evtRes.json();
      if (evtJson.events && evtJson.events.length > 0) {
        const primaryEvt = evtJson.events[0];
        setEventData(primaryEvt);

        const tracksRes = await fetch(`/api/events/${primaryEvt.id}`);
        const tracksJson = await tracksRes.json();
        setTracks(tracksJson.tracks || []);
        if (tracksJson.tracks && tracksJson.tracks.length > 0) {
          setProjectForm(prev => ({ ...prev, track_id: tracksJson.tracks[0].id }));
        }
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load participant data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName, event_id: eventData?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create team');
      setSuccess(`Team "${newTeamName}" created!`);
      setNewTeamName('');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleJoinTeam = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch('/api/teams/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: joinInviteCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join team');
      setSuccess(data.message);
      setJoinInviteCode('');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleProjectSubmit = async (actionType) => {
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        ...projectForm,
        team_id: teamData?.id,
        action: actionType,
      };

      const res = await fetch('/projects/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Submission failed');
      }

      setSuccess(data.message || 'Project saved!');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCopyInvite = () => {
    if (!teamData?.invite_code) return;
    navigator.clipboard.writeText(teamData.invite_code);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  if (!user) {
    return (
      <div className="container">
        <div className="card-panel" style={{ textAlign: 'center', padding: '3.5rem 2rem', maxWidth: '640px', margin: '3rem auto' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', marginBottom: '1.25rem' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <h2 style={{ fontSize: '1.65rem', marginBottom: '0.75rem' }}>Participant Authentication Required</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.75rem', lineHeight: 1.6 }}>
            Sign in as a registered participant or use the <strong>Fast-Switch</strong> bar at the top (click &ldquo;Participant&rdquo;) to manage teams, edit submissions, and access project credentials.
          </p>
          <button className="btn" onClick={onRequireLogin}>
            Log In as Participant
          </button>
        </div>
      </div>
    );
  }

  const isClosed = eventData?.is_closed;
  const activeSubmission = teamData?.projects && teamData.projects.length > 0 ? teamData.projects[0] : null;

  return (
    <div className="container">
      {/* Dashboard Header */}
      <div className="dashboard-hero">
        <div className="dashboard-header-flex">
          <div>
            <div className="dashboard-eyebrow">
              <span className="tag-version-dot" style={{ background: isClosed ? 'var(--danger)' : 'var(--success)', boxShadow: isClosed ? '0 0 8px var(--danger)' : '0 0 8px var(--success)' }}></span>
              {eventData?.name ? `Event: ${eventData.name}` : 'Participant Workspace'}
            </div>
            <h1 className="dashboard-title">Hacker Command Center</h1>
            <p className="dashboard-desc">
              Coordinate team members, track strict server-enforced submission deadlines, and submit your project deliverables.
            </p>
          </div>

          <div className="dashboard-actions">
            <div className="isolation-pill">
              <span className="isolation-dot" style={{ background: isClosed ? 'var(--danger)' : 'var(--success)' }}></span>
              <span>Submissions: <strong style={{ color: isClosed ? 'var(--danger)' : 'var(--success)' }}>{isClosed ? 'Closed' : 'Accepting'}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Real-Data Overview Stat Cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">
            <span>Team Roster</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="stat-value" style={{ fontSize: teamData ? '1.5rem' : '1.3rem' }}>
            {teamData ? teamData.name : 'No Team Yet'}
          </div>
          <div className="stat-subtext">
            {teamData ? `${teamData.members.length} member${teamData.members.length === 1 ? '' : 's'} • Role: ${teamData.my_role}` : 'Create or join a team below'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <span>Project Status</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </div>
          <div className={`stat-value ${activeSubmission?.status === 'SUBMITTED' ? 'success' : activeSubmission ? 'warning' : 'primary'}`}>
            {activeSubmission ? activeSubmission.status : 'Not Started'}
          </div>
          <div className="stat-subtext">
            {activeSubmission ? activeSubmission.title : 'Ready for draft registration'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <span>Deadline Window</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div className={`stat-value ${isClosed ? 'danger' : 'success'}`}>
            {isClosed ? 'Locked' : 'Open'}
          </div>
          <div className="stat-subtext">
            {eventData?.submissions_close ? new Date(eventData.submissions_close).toUTCString() : 'Active Event'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <span>Registered Track</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
          </div>
          <div className="stat-value" style={{ fontSize: '1.4rem' }}>
            {activeSubmission?.track_name || tracks.find(t => t.id === projectForm.track_id)?.name || 'General'}
          </div>
          <div className="stat-subtext">
            {tracks.length > 0 ? `${tracks.length} track competition categories` : 'Default Track'}
          </div>
        </div>
      </div>

      {/* Deadline Alert Banner */}
      {eventData && (
        <div className={`banner ${isClosed ? 'danger' : 'warning'}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>{isClosed ? '⚠️' : '⏱️'}</span>
            <div>
              <strong>Event: {eventData.name}</strong> &mdash; Deadline: {new Date(eventData.submissions_close).toUTCString()}
              <div style={{ fontSize: '0.8rem', opacity: 0.9, marginTop: '0.15rem' }}>
                {isClosed
                  ? 'The submission deadline has officially elapsed. Server-side verification strictly rejects late submissions.'
                  : 'Submissions are currently OPEN. You may save progress as draft and submit before the cutoff.'}
              </div>
            </div>
          </div>
          <span className="role-badge" style={{ background: isClosed ? '#991b1b' : '#065f46', color: '#fff', padding: '0.35rem 0.75rem' }}>
            {isClosed ? 'Submissions Closed' : 'Accepting Entries'}
          </span>
        </div>
      )}

      {/* Feedback Alerts */}
      {error && (
        <div className="banner danger">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>⛔</span>
            <div><strong>Error:</strong> {error}</div>
          </div>
        </div>
      )}
      {success && (
        <div className="banner success">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>✅</span>
            <div>{success}</div>
          </div>
        </div>
      )}

      {/* Team Area: Unregistered or Formed Team */}
      {!teamData ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          {/* Create Team Card */}
          <div className="card-panel">
            <h2>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              Create a Team
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', fontSize: '0.9rem', lineHeight: 1.55 }}>
              Form a new team as leader. Once created, a secure invite code will be generated to share with teammates.
            </p>
            <form onSubmit={handleCreateTeam}>
              <div className="form-group">
                <label>Team Name *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Quantum Raptors"
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn" style={{ width: '100%' }}>
                Create Team & Become Leader
              </button>
            </form>
          </div>

          {/* Join Team Card */}
          <div className="card-panel">
            <h2>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              Join Existing Team
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', fontSize: '0.9rem', lineHeight: 1.55 }}>
              Have a cryptographic invite code from your team leader? Enter it below to join the roster.
            </p>
            <form onSubmit={handleJoinTeam}>
              <div className="form-group">
                <label>Invite Code *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="inv_..."
                  value={joinInviteCode}
                  onChange={e => setJoinInviteCode(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-secondary" style={{ width: '100%' }}>
                Join Team Roster
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div>
          {/* Formed Team Roster Card */}
          <div className="card-panel" style={{ marginBottom: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--surface-border-subtle)', paddingBottom: '1.25rem', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <h2 style={{ margin: 0, padding: 0, border: 'none' }}>Team: {teamData.name}</h2>
                  <span className={`role-badge ${teamData.my_role === 'leader' ? 'organizer' : 'participant'}`}>
                    Your Role: {teamData.my_role}
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.35rem' }}>
                  Team ID: <code style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{teamData.id}</code>
                </div>
              </div>

              {/* Secure Invite Code Treatment */}
              <div className="secure-code-box">
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Teammate Invite Code:
                  </span>
                  <span className="secure-code-val">{teamData.invite_code}</span>
                </div>
                <button
                  type="button"
                  className={`copy-btn ${copiedInvite ? 'copied' : ''}`}
                  onClick={handleCopyInvite}
                  title="Copy invite code to clipboard"
                >
                  {copiedInvite ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Members Roster */}
            <div>
              <div style={{ fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.75rem' }}>
                Active Roster ({teamData.members.length} Member{teamData.members.length === 1 ? '' : 's'})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
                {teamData.members.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', background: 'var(--surface-raised)', padding: '0.65rem 0.95rem', borderRadius: 'var(--radius)', border: '1px solid var(--surface-border-subtle)' }}>
                    <div className="user-avatar" style={{ width: 28, height: 28, fontSize: '0.75rem' }}>
                      {m.name.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-bright)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {m.role}
                      </div>
                    </div>
                    {m.role === 'leader' && (
                      <span className="tag-version" style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem' }}>Leader</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Submissions Section */}
          <div className="card-panel">
            <h2>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              Project Deliverables
            </h2>

            {/* Existing Submissions List */}
            {teamData.projects && teamData.projects.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <div style={{ fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.75rem' }}>
                  Current Team Submissions
                </div>
                {teamData.projects.map(p => (
                  <div key={p.id} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <div>
                        <span className="track-tag" style={{ marginBottom: '0.35rem' }}>{p.track_name || 'General'}</span>
                        <strong style={{ fontSize: '1.2rem', color: 'var(--text-bright)', display: 'block' }}>{p.title}</strong>
                      </div>
                      <span className={`status-badge ${p.status.toLowerCase()}`} style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-full)', fontWeight: 700 }}>
                        {p.status}
                      </span>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', margin: '0.5rem 0 0.85rem 0', lineHeight: 1.55 }}>{p.summary}</p>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <span>Track: <strong>{p.track_name}</strong></span>
                      <span>•</span>
                      <span>{p.submitted_at ? `Submitted: ${new Date(p.submitted_at).toLocaleString()}` : 'Draft saved'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Submission Form */}
            <div style={{ borderTop: teamData.projects?.length > 0 ? '1px solid var(--surface-border-subtle)' : 'none', paddingTop: teamData.projects?.length > 0 ? '1.5rem' : '0' }}>
              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-bright)', marginBottom: '0.3rem' }}>
                  {activeSubmission ? 'Update / Resubmit Project' : 'Submit a Project'}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                  {isClosed
                    ? 'Notice: Submissions for this event are officially closed. Late submissions will be rejected by server-side verification.'
                    : 'Fill in your project details. You may save your work as a draft or submit officially before the deadline.'}
                </p>
              </div>

              <form onSubmit={e => { e.preventDefault(); handleProjectSubmit('submit'); }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Project Title *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Neural Sentinel"
                      value={projectForm.title}
                      onChange={e => setProjectForm({ ...projectForm, title: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Track Category *</label>
                    <select
                      className="form-control"
                      value={projectForm.track_id}
                      onChange={e => setProjectForm({ ...projectForm, track_id: e.target.value })}
                      required
                    >
                      {tracks.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>One-Line Tagline / Summary *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="A concise summary of what your project achieves..."
                    value={projectForm.summary}
                    onChange={e => setProjectForm({ ...projectForm, summary: e.target.value })}
                    required
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.25rem', display: 'block' }}>
                    Appears on the public gallery card and judge ballot.
                  </span>
                </div>

                <div className="form-group">
                  <label>Detailed Project Description</label>
                  <textarea
                    className="form-control"
                    placeholder="Describe architecture, technologies, challenges, implementation, and future roadmap..."
                    value={projectForm.description}
                    onChange={e => setProjectForm({ ...projectForm, description: e.target.value })}
                    style={{ minHeight: '120px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Repository URL</label>
                    <input
                      type="url"
                      className="form-control"
                      placeholder="https://github.com/..."
                      value={projectForm.repo_url}
                      onChange={e => setProjectForm({ ...projectForm, repo_url: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Live Demo URL</label>
                    <input
                      type="url"
                      className="form-control"
                      placeholder="https://..."
                      value={projectForm.demo_url}
                      onChange={e => setProjectForm({ ...projectForm, demo_url: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <button type="submit" className="btn" disabled={isClosed}>
                    {isClosed ? 'Submissions Closed' : 'Submit Project'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleProjectSubmit('draft')}
                    disabled={isClosed}
                  >
                    Save Draft
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
