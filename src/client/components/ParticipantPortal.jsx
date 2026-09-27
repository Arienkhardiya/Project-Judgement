import React, { useState, useEffect } from 'react';

export default function ParticipantPortal({ user, onRequireLogin }) {
  const [teamData, setTeamData] = useState(null);
  const [eventData, setEventData] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

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
        // Displays backend rejection (e.g. 400 when deadline passed)
        throw new Error(data.error || 'Submission failed');
      }

      setSuccess(data.message || 'Project saved!');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!user) {
    return (
      <div className="container">
        <div className="card-panel" style={{ textAlign: 'center', padding: '3rem' }}>
          <h2>Participant Authentication Required</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Please log in or use the Seeded Fast-Switch bar at the top (click "Participant") to manage teams and submissions.
          </p>
          <button className="btn" onClick={onRequireLogin}>Log In as Participant</button>
        </div>
      </div>
    );
  }

  const isClosed = eventData?.is_closed;

  return (
    <div className="container">
      {/* Event Deadline Status Banner */}
      {eventData && (
        <div className={`banner ${isClosed ? 'danger' : 'warning'}`}>
          <div>
            <strong>Event: {eventData.name}</strong> &mdash; Deadline:{' '}
            {new Date(eventData.submissions_close).toLocaleString()} UTC
            {isClosed ? ' (DEADLINE PASSED — SUBMISSIONS CLOSED)' : ' (OPEN FOR SUBMISSIONS)'}
          </div>
          <span className="role-badge" style={{ background: isClosed ? '#991b1b' : '#065f46', color: '#fff' }}>
            {isClosed ? 'Closed' : 'Accepting'}
          </span>
        </div>
      )}

      {error && (
        <div className="banner danger" style={{ marginBottom: '1.5rem' }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      {success && (
        <div className="banner" style={{ background: '#064e3b', border: '1px solid #10b981', color: '#d1fae5', marginBottom: '1.5rem' }}>
          {success}
        </div>
      )}

      {/* Team Area */}
      {!teamData ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {/* Create Team */}
          <div className="card-panel">
            <h2>Create a Team</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
              Form a new team to submit your hackathon project. You will receive an invite link to share with teammates.
            </p>
            <form onSubmit={handleCreateTeam}>
              <div className="form-group">
                <label>Team Name</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. Quantum Raptors" 
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn">Create Team</button>
            </form>
          </div>

          {/* Join Team */}
          <div className="card-panel">
            <h2>Join Existing Team</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
              Have an invite code from your team leader? Enter it here to join their roster.
            </p>
            <form onSubmit={handleJoinTeam}>
              <div className="form-group">
                <label>Invite Code</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="inv_..." 
                  value={joinInviteCode}
                  onChange={e => setJoinInviteCode(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-secondary">Join Team</button>
            </form>
          </div>
        </div>
      ) : (
        <div>
          {/* My Team Panel */}
          <div className="card-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2>Team: {teamData.name}</h2>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Your role: <strong style={{ color: 'var(--primary)' }}>{teamData.my_role}</strong>
                </div>
              </div>
              <div style={{ background: 'var(--surface-raised)', padding: '0.5rem 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--surface-border)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>Secure Invite Code:</span>
                <code style={{ color: 'var(--primary)', fontWeight: 600 }}>{teamData.invite_code}</code>
              </div>
            </div>

            <div style={{ marginTop: '1.25rem' }}>
              <h4 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Roster ({teamData.members.length} members)</h4>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {teamData.members.map(m => (
                  <span key={m.id} className="user-pill">
                    {m.name} ({m.role})
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Submissions Panel */}
          <div className="card-panel">
            <h2>Project Submission</h2>
            
            {/* Existing projects list */}
            {teamData.projects && teamData.projects.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ marginBottom: '0.75rem' }}>Team Submissions</h4>
                {teamData.projects.map(p => (
                  <div key={p.id} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', padding: '1rem', borderRadius: 'var(--radius)', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: '1.1rem' }}>{p.title}</strong>
                      <span className={`status-badge ${p.status.toLowerCase()}`}>{p.status}</span>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0.5rem 0' }}>{p.summary}</p>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Track: {p.track_name} &bull; {p.submitted_at ? `Submitted: ${new Date(p.submitted_at).toLocaleString()}` : 'Draft saved'}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Create new project / edit draft */}
            <h3>Submit a Project</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {isClosed 
                ? 'Notice: Submissions for this event are officially closed. Late submissions will be rejected by server-side verification.'
                : 'Fill in your project details. You may save as draft or submit.'}
            </p>

            <form onSubmit={e => { e.preventDefault(); handleProjectSubmit('submit'); }}>
              <div className="form-group">
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

              <div className="form-group">
                <label>Track *</label>
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
              </div>

              <div className="form-group">
                <label>Detailed Description</label>
                <textarea 
                  className="form-control" 
                  placeholder="Describe architecture, technologies, challenges, and implementation..." 
                  value={projectForm.description}
                  onChange={e => setProjectForm({ ...projectForm, description: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Repository URL</label>
                  <input 
                    type="url" 
                    className="form-control" 
                    placeholder="https://github.com/..." 
                    value={projectForm.repo_url}
                    onChange={e => setProjectForm({ ...projectForm, repo_url: e.target.value })}
                  />
                </div>
                <div className="form-group">
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

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" className="btn">
                  Submit Project
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => handleProjectSubmit('draft')}
                >
                  Save Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
