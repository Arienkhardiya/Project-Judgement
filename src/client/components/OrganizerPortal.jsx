import React, { useState, useEffect } from 'react';

export default function OrganizerPortal({ user }) {
  const [subTab, setSubTab] = useState('dashboard'); // 'dashboard', 'normalized', 'audit', 'events'
  const [dashboardData, setDashboardData] = useState(null);
  const [normalizedData, setNormalizedData] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [eventDetails, setEventDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Voting Windows & Results State
  const [votingWindows, setVotingWindows] = useState([]);
  const [votingWindowsLoading, setVotingWindowsLoading] = useState(false);
  const [votingWindowForm, setVotingWindowForm] = useState({ title: '', start_time: '', end_time: '', is_active: true });
  const [votingWindowSubmitting, setVotingWindowSubmitting] = useState(false);
  const [votingResults, setVotingResults] = useState(null);
  const [votingResultsLoading, setVotingResultsLoading] = useState(false);
  const [votingResultsError, setVotingResultsError] = useState(null);

  // Comment Moderation State
  const [moderationComments, setModerationComments] = useState([]);
  const [moderationLoading, setModerationLoading] = useState(false);
  const [moderationError, setModerationError] = useState(null);
  const [moderationSuccess, setModerationSuccess] = useState(null);
  const [moderationFilter, setModerationFilter] = useState('flagged'); // 'flagged' | 'all'
  const [deletingCommentId, setDeletingCommentId] = useState(null);

  // Forms
  const [eventForm, setEventForm] = useState({ name: '', description: '', start_time: '', end_time: '', submissions_close: '' });
  const [trackForm, setTrackForm] = useState({ name: '', description: '' });
  const [prizeForm, setPrizeForm] = useState({ name: '', description: '', amount: '', track_id: '' });
  const [inviteJudgeForm, setInviteJudgeForm] = useState({ name: '', email: '', track_ids: [] });

  useEffect(() => {
    loadDashboard();
    loadEvents();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/organizer/dashboard');
      if (res.ok) {
        const data = await res.json();
        setDashboardData(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadNormalized = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/organizer/normalized');
      if (res.ok) {
        const data = await res.json();
        setNormalizedData(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadAudit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/organizer/audit');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async () => {
    try {
      const res = await fetch('/api/events');
      const data = await res.json();
      setEvents(data.events || []);
      if (data.events && data.events.length > 0 && !selectedEventId) {
        setSelectedEventId(data.events[0].id);
        loadEventDetails(data.events[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadEventDetails = async (id) => {
    try {
      const res = await fetch(`/api/events/${id}`);
      const data = await res.json();
      setEventDetails(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadVotingWindows = async () => {
    setVotingWindowsLoading(true);
    try {
      const res = await fetch(`/api/voting/windows?event_id=${selectedEventId || 'evt_01'}`);
      if (res.ok) {
        const data = await res.json();
        setVotingWindows(data.windows || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setVotingWindowsLoading(false);
    }
  };

  const loadVotingResults = async () => {
    setVotingResultsLoading(true);
    setVotingResultsError(null);
    try {
      const res = await fetch(`/api/voting/results?event_id=${encodeURIComponent(selectedEventId || 'evt_01')}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load voting results');
      setVotingResults(data);
    } catch (err) {
      setVotingResultsError(err.message || 'Failed to load voting results');
    } finally {
      setVotingResultsLoading(false);
    }
  };

  const loadModerationComments = async () => {
    setModerationLoading(true);
    setModerationError(null);
    try {
      const projRes = await fetch('/api/projects');
      const projData = await projRes.json();
      const projects = projData.projects || [];

      const commentPromises = projects.map(async (p) => {
        try {
          const res = await fetch(`/api/projects/${encodeURIComponent(p.id)}/comments`);
          if (!res.ok) return [];
          const data = await res.json();
          return (data.comments || []).map(c => ({
            ...c,
            project_title: p.title,
            project_id: p.id
          }));
        } catch {
          return [];
        }
      });

      const results = await Promise.all(commentPromises);
      const allComments = results.flat().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setModerationComments(allComments);
    } catch (err) {
      setModerationError(err.message || 'Failed to load comments for moderation');
    } finally {
      setModerationLoading(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (deletingCommentId) return;
    setDeletingCommentId(commentId);
    setModerationError(null);
    setModerationSuccess(null);
    try {
      const res = await fetch(`/api/comments/${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete comment');
      setModerationSuccess('Comment deleted successfully.');
      setModerationComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err) {
      setModerationError(err.message || 'Failed to delete comment');
    } finally {
      setDeletingCommentId(null);
    }
  };

  const handleSubTabChange = (tab) => {
    setSubTab(tab);
    setError(null);
    setSuccess(null);
    if (tab === 'dashboard') loadDashboard();
    else if (tab === 'normalized') loadNormalized();
    else if (tab === 'audit') loadAudit();
    else if (tab === 'events') loadEvents();
    else if (tab === 'voting') {
      loadVotingWindows();
      loadVotingResults();
    }
    else if (tab === 'moderation') loadModerationComments();
  };

  const handleCreateVotingWindow = async (e) => {
    e.preventDefault();
    if (votingWindowSubmitting) return;
    setError(null);
    setSuccess(null);
    setVotingWindowSubmitting(true);
    try {
      const payload = {
        event_id: selectedEventId || 'evt_01',
        title: votingWindowForm.title,
        start_time: new Date(votingWindowForm.start_time).toISOString(),
        end_time: new Date(votingWindowForm.end_time).toISOString(),
        is_active: votingWindowForm.is_active ? 1 : 0
      };
      const res = await fetch('/api/voting/windows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create voting window');
      setSuccess('Voting window created successfully');
      setVotingWindowForm({ title: '', start_time: '', end_time: '', is_active: true });
      loadVotingWindows();
    } catch (err) {
      setError(err.message);
    } finally {
      setVotingWindowSubmitting(false);
    }
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create event');
      setSuccess(`Event "${data.event.name}" created!`);
      setEventForm({ name: '', description: '', start_time: '', end_time: '', submissions_close: '' });
      loadEvents();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleInviteJudge = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/organizer/judges/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteJudgeForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to invite judge');
      setSuccess(data.message);
      setInviteJudgeForm({ name: '', email: '', track_ids: [] });
      loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="container">
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>Organizer Command Console</h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Real-time judging progress, cross-judge normalization, audit trails, and official CSV exports.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <a href="/api/export.csv" download="dogfood-results.csv" className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>&darr;</span> Export Results CSV
          </a>
        </div>
      </div>

      {error && <div className="banner danger">{error}</div>}
      {success && <div className="banner" style={{ background: '#064e3b', border: '1px solid #10b981', color: '#d1fae5' }}>{success}</div>}

      {/* Sub Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--surface-border)', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button className={`nav-link ${subTab === 'dashboard' ? 'active' : ''}`} onClick={() => handleSubTabChange('dashboard')}>
          Judging Progress Dashboard
        </button>
        <button className={`nav-link ${subTab === 'normalized' ? 'active' : ''}`} onClick={() => handleSubTabChange('normalized')}>
          Cross-Judge Normalization
        </button>
        <button className={`nav-link ${subTab === 'audit' ? 'active' : ''}`} onClick={() => handleSubTabChange('audit')}>
          Audit Trail
        </button>
        <button className={`nav-link ${subTab === 'events' ? 'active' : ''}`} onClick={() => handleSubTabChange('events')}>
          Event & Track Config
        </button>
        <button className={`nav-link ${subTab === 'voting' ? 'active' : ''}`} onClick={() => handleSubTabChange('voting')}>
          Community Voting & Results
        </button>
        <button className={`nav-link ${subTab === 'moderation' ? 'active' : ''}`} onClick={() => handleSubTabChange('moderation')}>
          Comment Moderation
        </button>
      </div>

      {/* TAB 1: DASHBOARD */}
      {subTab === 'dashboard' && dashboardData && (
        <div>
          {/* Top Progress Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="card-panel" style={{ padding: '1.25rem', marginBottom: 0 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Assignments</span>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                {dashboardData.totals.total}
              </div>
            </div>
            <div className="card-panel" style={{ padding: '1.25rem', marginBottom: 0 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Submitted Reviews</span>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--success)', marginTop: '0.2rem' }}>
                {dashboardData.totals.submitted}
              </div>
            </div>
            <div className="card-panel" style={{ padding: '1.25rem', marginBottom: 0 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>In Progress</span>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--warning)', marginTop: '0.2rem' }}>
                {dashboardData.totals.in_progress}
              </div>
            </div>
            <div className="card-panel" style={{ padding: '1.25rem', marginBottom: 0 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Completion Rate</span>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--primary)', marginTop: '0.2rem' }}>
                {dashboardData.totals.completion_percentage}%
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {/* Tracks Matrix */}
            <div className="card-panel">
              <h2>Progress by Track</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem 0' }}>Track</th>
                    <th>Projects</th>
                    <th>Assigned</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.tracks.map(tr => (
                    <tr key={tr.track_id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                      <td style={{ padding: '0.5rem 0', fontWeight: 600 }}>{tr.track_name}</td>
                      <td>{tr.project_count}</td>
                      <td>{tr.total_assignments}</td>
                      <td style={{ color: 'var(--success)' }}>{tr.submitted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Invite Judge Form */}
            <div className="card-panel">
              <h2>Invite Judge</h2>
              <form onSubmit={handleInviteJudge}>
                <div className="form-group">
                  <label>Full Name</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={inviteJudgeForm.name} 
                    onChange={e => setInviteJudgeForm({ ...inviteJudgeForm, name: e.target.value })} 
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>Email Address</label>
                  <input 
                    type="email" 
                    className="form-control" 
                    value={inviteJudgeForm.email} 
                    onChange={e => setInviteJudgeForm({ ...inviteJudgeForm, email: e.target.value })} 
                    required 
                  />
                </div>
                <button type="submit" className="btn">Send Judge Invitation</button>
              </form>
            </div>
          </div>

          {/* Judges Workload Table */}
          <div className="card-panel">
            <h2>Judge Workload & Review Status ({dashboardData.judges.length} Judges)</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem 0' }}>Judge</th>
                  <th>Email</th>
                  <th>Assigned</th>
                  <th>Completed</th>
                  <th>Remaining</th>
                </tr>
              </thead>
              <tbody>
                {dashboardData.judges.slice(0, 15).map(j => (
                  <tr key={j.judge_id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                    <td style={{ padding: '0.5rem 0', fontWeight: 600 }}>{j.name}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{j.email}</td>
                    <td>{j.total_assigned}</td>
                    <td style={{ color: 'var(--success)' }}>{j.completed}</td>
                    <td>{j.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dashboardData.judges.length > 15 && (
              <div style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Showing first 15 of {dashboardData.judges.length} judges. Full data accessible via CSV export.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: NORMALIZATION */}
      {subTab === 'normalized' && (
        <div>
          {normalizedData ? (
            <div>
              <div className="banner" style={{ background: '#172554', border: '1px solid #1e40af', color: '#bfdbfe', marginBottom: '1.5rem' }}>
                <div>
                  <strong>Empirical Bayes Normalization Active:</strong> Global Mean = <strong>{normalizedData.globalStats.mean}</strong>, Global StdDev = <strong>{normalizedData.globalStats.stdDev}</strong> across {normalizedData.globalStats.totalEvaluations} evaluations.
                </div>
              </div>

              <div className="card-panel">
                <h2>Final Project Rankings & Normalization Results</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem 0' }}>Rank</th>
                      <th>Project Title</th>
                      <th>Team</th>
                      <th>Track</th>
                      <th>Reviews</th>
                      <th>Raw Avg</th>
                      <th>Normalized</th>
                      <th>Final Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {normalizedData.projects.map(p => (
                      <tr key={p.project_id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                        <td style={{ padding: '0.5rem 0', fontWeight: 700, color: p.rank <= 3 ? 'var(--primary)' : 'inherit' }}>
                          #{p.rank}
                        </td>
                        <td style={{ fontWeight: 600 }}>{p.title}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{p.team_name}</td>
                        <td><span className="track-tag">{p.track_name}</span></td>
                        <td>{p.reviews_count}</td>
                        <td>{p.raw_avg_score}</td>
                        <td>{p.normalized_score}</td>
                        <td style={{ fontWeight: 700, color: 'var(--success)' }}>{p.final_score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="empty-state">Loading normalization models...</div>
          )}
        </div>
      )}

      {/* TAB 3: AUDIT TRAIL */}
      {subTab === 'audit' && (
        <div className="card-panel">
          <h2>Judging Audit Trail</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem 0' }}>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                  <td style={{ padding: '0.45rem 0', color: 'var(--text-muted)' }}>
                    {new Date(l.created_at).toLocaleString()}
                  </td>
                  <td style={{ fontWeight: 600 }}>{l.actor_name || 'System'}</td>
                  <td>
                    <span className="status-badge" style={{ background: '#1e293b', color: '#93c5fd' }}>
                      {l.action}
                    </span>
                  </td>
                  <td>{l.entity_type}</td>
                  <td style={{ color: 'var(--text-muted)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {l.details_json}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: EVENT CONFIG */}
      {subTab === 'events' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
          <div className="card-panel">
            <h2>Create Event</h2>
            <form onSubmit={handleCreateEvent}>
              <div className="form-group">
                <label>Event Name</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={eventForm.name} 
                  onChange={e => setEventForm({ ...eventForm, name: e.target.value })} 
                  required 
                />
              </div>
              <div className="form-group">
                <label>Submission Deadline (UTC)</label>
                <input 
                  type="datetime-local" 
                  className="form-control" 
                  value={eventForm.submissions_close ? eventForm.submissions_close.slice(0, 16) : ''}
                  onChange={e => setEventForm({ ...eventForm, submissions_close: new Date(e.target.value).toISOString() })}
                  required 
                />
              </div>
              <button type="submit" className="btn">Create Event</button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 5: COMMUNITY VOTING & RESULTS */}
      {subTab === 'voting' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="card-panel" style={{ marginBottom: 0 }}>
              <h2>Voting Windows</h2>
              {votingWindowsLoading ? (
                <div className="empty-state">Loading voting windows...</div>
              ) : votingWindows.length === 0 ? (
                <div className="empty-state">No voting windows configured for this event.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem 0' }}>Title</th>
                      <th>Status</th>
                      <th>Start</th>
                      <th>End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {votingWindows.map(w => (
                      <tr key={w.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                        <td style={{ padding: '0.5rem 0', fontWeight: 600 }}>{w.title}</td>
                        <td>
                          <span className="status-badge" style={{
                            background: w.current_status === 'OPEN' ? '#064e3b' : w.current_status === 'UPCOMING' ? '#1e3a8a' : '#1e293b',
                            color: w.current_status === 'OPEN' ? '#10b981' : w.current_status === 'UPCOMING' ? '#93c5fd' : '#94a3b8',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 'bold'
                          }}>
                            {w.current_status}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{new Date(w.start_time).toLocaleString()}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{new Date(w.end_time).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card-panel" style={{ marginBottom: 0 }}>
              <h2>Create Voting Window</h2>
              <form onSubmit={handleCreateVotingWindow}>
                <div className="form-group">
                  <label>Window Title</label>
                  <input
                    type="text"
                    className="form-control"
                    value={votingWindowForm.title}
                    onChange={e => setVotingWindowForm({ ...votingWindowForm, title: e.target.value })}
                    required
                    placeholder="e.g. Community Choice Award Voting"
                  />
                </div>
                <div className="form-group">
                  <label>Start Time (Local)</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={votingWindowForm.start_time ? votingWindowForm.start_time.slice(0, 16) : ''}
                    onChange={e => setVotingWindowForm({ ...votingWindowForm, start_time: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>End Time (Local)</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={votingWindowForm.end_time ? votingWindowForm.end_time.slice(0, 16) : ''}
                    onChange={e => setVotingWindowForm({ ...votingWindowForm, end_time: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <input
                    type="checkbox"
                    id="voting-active-checkbox"
                    checked={votingWindowForm.is_active}
                    onChange={e => setVotingWindowForm({ ...votingWindowForm, is_active: e.target.checked })}
                  />
                  <label htmlFor="voting-active-checkbox" style={{ margin: 0 }}>Active (Visible to users)</label>
                </div>
                <button type="submit" className="btn" disabled={votingWindowSubmitting}>
                  {votingWindowSubmitting ? 'Creating...' : 'Create Voting Window'}
                </button>
              </form>
            </div>
          </div>

          {/* Unblinded Community Voting Results */}
          <div className="card-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h2 style={{ margin: 0 }}>Unblinded Community Voting Leaderboard</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
                  Live voting tallies visible exclusively to organizers. Public voting results remain sealed while the voting window is open.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                onClick={loadVotingResults}
                disabled={votingResultsLoading}
              >
                {votingResultsLoading ? 'Refreshing...' : 'Refresh Results'}
              </button>
            </div>

            {votingResultsError && (
              <div className="banner danger" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                {votingResultsError}
              </div>
            )}

            {votingResultsLoading && !votingResults ? (
              <div className="empty-state">Loading unblinded voting results...</div>
            ) : !votingResults || !votingResults.results || votingResults.results.length === 0 ? (
              <div className="empty-state">No voting results available for this event yet.</div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                  <div style={{ background: 'var(--surface-raised)', padding: '0.75rem 1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--surface-border)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Window Status</div>
                    <div style={{ fontWeight: 700, color: 'var(--primary)', marginTop: '0.2rem' }}>
                      {votingResults.status}
                    </div>
                  </div>
                  <div style={{ background: 'var(--surface-raised)', padding: '0.75rem 1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--surface-border)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Votes Cast</div>
                    <div style={{ fontWeight: 700, color: 'var(--success)', marginTop: '0.2rem' }}>
                      {votingResults.total_votes}
                    </div>
                  </div>
                  <div style={{ background: 'var(--surface-raised)', padding: '0.75rem 1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--surface-border)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Organizer Privilege</div>
                    <div style={{ fontWeight: 700, color: '#38bdf8', marginTop: '0.2rem' }}>
                      Unblinded Real-Time
                    </div>
                  </div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem 0' }}>Rank</th>
                      <th>Project Title</th>
                      <th>Team Name</th>
                      <th>Track</th>
                      <th style={{ textAlign: 'right' }}>Community Votes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {votingResults.results.map((r) => (
                      <tr key={r.project_id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                        <td style={{ padding: '0.5rem 0', fontWeight: 700, color: r.rank <= 3 ? 'var(--primary)' : 'inherit' }}>
                          #{r.rank}
                        </td>
                        <td style={{ fontWeight: 600 }}>{r.title}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{r.team_name}</td>
                        <td>
                          {r.track_name ? <span className="track-tag">{r.track_name}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: r.vote_count > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                          {r.vote_count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: COMMENT MODERATION */}
      {subTab === 'moderation' && (
        <div>
          <div className="card-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 style={{ margin: 0 }}>Community Feedback Moderation</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
                  Review reported comments, inspect feedback across projects, and permanently delete inappropriate content.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <div style={{ display: 'inline-flex', background: 'var(--surface-raised)', borderRadius: 'var(--radius)', border: '1px solid var(--surface-border)', padding: '2px' }}>
                  <button
                    type="button"
                    className="demo-btn"
                    style={{
                      background: moderationFilter === 'flagged' ? 'var(--primary)' : 'transparent',
                      color: moderationFilter === 'flagged' ? '#000' : 'var(--text-muted)',
                      border: 'none',
                      fontWeight: 600
                    }}
                    onClick={() => setModerationFilter('flagged')}
                  >
                    Flagged ({moderationComments.filter(c => c.is_flagged).length})
                  </button>
                  <button
                    type="button"
                    className="demo-btn"
                    style={{
                      background: moderationFilter === 'all' ? 'var(--primary)' : 'transparent',
                      color: moderationFilter === 'all' ? '#000' : 'var(--text-muted)',
                      border: 'none',
                      fontWeight: 600
                    }}
                    onClick={() => setModerationFilter('all')}
                  >
                    All Comments ({moderationComments.length})
                  </button>
                </div>

                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                  onClick={loadModerationComments}
                  disabled={moderationLoading}
                >
                  {moderationLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>

            {moderationError && (
              <div className="banner danger" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                {moderationError}
              </div>
            )}
            {moderationSuccess && (
              <div className="banner" style={{ background: '#064e3b', border: '1px solid #10b981', color: '#d1fae5', marginBottom: '1rem', fontSize: '0.85rem' }}>
                {moderationSuccess}
              </div>
            )}

            {moderationLoading && moderationComments.length === 0 ? (
              <div className="empty-state">Loading comments for moderation review...</div>
            ) : moderationComments.filter(c => moderationFilter === 'flagged' ? c.is_flagged : true).length === 0 ? (
              <div className="empty-state">
                {moderationFilter === 'flagged'
                  ? 'No flagged comments requiring organizer review. All community feedback is currently in good standing.'
                  : 'No community comments have been posted across projects yet.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {moderationComments
                  .filter(c => moderationFilter === 'flagged' ? c.is_flagged : true)
                  .map(c => (
                    <div
                      key={c.id}
                      style={{
                        background: 'var(--surface-raised)',
                        border: c.is_flagged ? '1px solid var(--danger)' : '1px solid var(--surface-border)',
                        borderRadius: 'var(--radius)',
                        padding: '1rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{c.author?.name || 'Anonymous User'}</span>
                            {c.author?.roles?.length > 0 && (
                              <span className={`role-badge ${c.author.roles[0] || 'visitor'}`} style={{ fontSize: '0.65rem' }}>
                                {c.author.roles[0]}
                              </span>
                            )}
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                              on project <strong>{c.project_title}</strong>
                            </span>
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            {c.created_at ? new Date(c.created_at).toLocaleString() : ''}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {c.is_flagged ? (
                            <span className="status-badge" style={{ background: '#7f1d1d', color: '#fca5a5', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                              Flagged for Review
                            </span>
                          ) : (
                            <span className="status-badge" style={{ background: '#1e293b', color: '#94a3b8', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                              Public
                            </span>
                          )}

                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                            onClick={() => handleDeleteComment(c.id)}
                            disabled={deletingCommentId === c.id}
                          >
                            {deletingCommentId === c.id ? 'Deleting...' : 'Delete Comment'}
                          </button>
                        </div>
                      </div>

                      <p style={{ margin: 0, fontSize: '0.9rem', color: '#cbd5e1', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {c.content}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
