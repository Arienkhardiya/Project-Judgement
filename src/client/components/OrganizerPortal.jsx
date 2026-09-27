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

  const handleSubTabChange = (tab) => {
    setSubTab(tab);
    setError(null);
    setSuccess(null);
    if (tab === 'dashboard') loadDashboard();
    else if (tab === 'normalized') loadNormalized();
    else if (tab === 'audit') loadAudit();
    else if (tab === 'events') loadEvents();
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
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--surface-border)', marginBottom: '1.5rem' }}>
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
    </div>
  );
}
