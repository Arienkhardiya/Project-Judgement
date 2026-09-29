import React, { useState, useEffect } from 'react';
import OrganizerPairwiseView from './OrganizerPairwiseView.jsx';

export default function OrganizerPortal({ user }) {
  const [subTab, setSubTab] = useState('dashboard'); // 'dashboard', 'normalized', 'pairwise', 'audit', 'events', 'voting', 'moderation'
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
    else if (tab === 'pairwise') { /* OrganizerPairwiseView loads on mount */ }
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

  const flaggedCount = moderationComments.filter(c => c.is_flagged).length;

  return (
    <div className="container">
      {/* Dashboard Header */}
      <div className="dashboard-hero">
        <div className="dashboard-header-flex">
          <div>
            <div className="dashboard-eyebrow">
              <span className="tag-version-dot"></span>
              Organizer Command Console
            </div>
            <h1 className="dashboard-title">Hackathon Operations Center</h1>
            <p className="dashboard-desc">
              Real-time judging telemetry, Empirical Bayes cross-judge normalization, immutable audit logs, and community voting oversight.
            </p>
          </div>

          <div className="dashboard-actions">
            <a
              href="/api/export.csv"
              download="dogfood-results.csv"
              className="btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export Results CSV
            </a>
          </div>
        </div>
      </div>

      {/* Global Alerts */}
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

      {/* Sub-Tabs Navigation */}
      <nav className="subtab-nav" aria-label="Organizer sub-navigation">
        <button
          type="button"
          className={`subtab-btn ${subTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => handleSubTabChange('dashboard')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          Judging Dashboard
        </button>
        <button
          type="button"
          className={`subtab-btn ${subTab === 'normalized' ? 'active' : ''}`}
          onClick={() => handleSubTabChange('normalized')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Cross-Judge Normalization
        </button>
        <button
          type="button"
          className={`subtab-btn ${subTab === 'pairwise' ? 'active' : ''}`}
          onClick={() => handleSubTabChange('pairwise')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><path d="M10 7h4v4"/></svg>
          Pairwise Mode (Bonus B)
        </button>
        <button
          type="button"
          className={`subtab-btn ${subTab === 'audit' ? 'active' : ''}`}
          onClick={() => handleSubTabChange('audit')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Audit Trail
        </button>
        <button
          type="button"
          className={`subtab-btn ${subTab === 'events' ? 'active' : ''}`}
          onClick={() => handleSubTabChange('events')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Event & Track Config
        </button>
        <button
          type="button"
          className={`subtab-btn ${subTab === 'voting' ? 'active' : ''}`}
          onClick={() => handleSubTabChange('voting')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
          Community Voting & Results
        </button>
        <button
          type="button"
          className={`subtab-btn ${subTab === 'moderation' ? 'active' : ''}`}
          onClick={() => handleSubTabChange('moderation')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Comment Moderation
          {flaggedCount > 0 && (
            <span className="subtab-badge">{flaggedCount}</span>
          )}
        </button>
      </nav>

      {/* ===================================================================
          SUBTAB 1: JUDGING PROGRESS DASHBOARD
          =================================================================== */}
      {subTab === 'dashboard' && dashboardData && (
        <div>
          {/* Top KPI Cards (Real Data) */}
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">
                <span>Total Assignments</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
              </div>
              <div className="stat-value">{dashboardData.totals.total}</div>
              <div className="stat-subtext">Total review pairings assigned across all judges</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <span>Submitted Reviews</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div className="stat-value success">{dashboardData.totals.submitted}</div>
              <div className="stat-subtext">Official scores locked and recorded</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <span>In Progress</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div className="stat-value warning">{dashboardData.totals.in_progress}</div>
              <div className="stat-subtext">Drafts saved or awaiting judge evaluation</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <span>Completion Rate</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 700 }}>
                  {dashboardData.totals.completion_percentage}%
                </span>
              </div>
              <div className="stat-value primary">{dashboardData.totals.completion_percentage}%</div>
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${dashboardData.totals.completion_percentage}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* 2-Column Grid: Progress by Track & Invite Judge */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem', marginBottom: '1.75rem' }}>
            {/* Progress by Track */}
            <div className="card-panel" style={{ margin: 0 }}>
              <h2>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                Progress by Competition Track
              </h2>
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Track Name</th>
                      <th>Projects</th>
                      <th>Assigned</th>
                      <th>Completed</th>
                      <th>Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardData.tracks.map(tr => {
                      const trackPercent = tr.total_assignments > 0 ? Math.round((tr.submitted / tr.total_assignments) * 100) : 0;
                      return (
                        <tr key={tr.track_id}>
                          <td style={{ fontWeight: 600 }}>{tr.track_name}</td>
                          <td>{tr.project_count}</td>
                          <td>{tr.total_assignments}</td>
                          <td style={{ color: 'var(--success)', fontWeight: 700 }}>{tr.submitted}</td>
                          <td style={{ minWidth: '100px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div className="progress-bar-track" style={{ flex: 1, margin: 0 }}>
                                <div className="progress-bar-fill success" style={{ width: `${trackPercent}%` }}></div>
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{trackPercent}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Invite Judge Card */}
            <div className="card-panel" style={{ margin: 0 }}>
              <h2>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                Invite Designated Judge
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '1.25rem', lineHeight: 1.55 }}>
                Issue access credentials to official judges for project scoring. Judges operate in isolated sandboxes.
              </p>
              <form onSubmit={handleInviteJudge}>
                <div className="form-group">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Dr. Eleanor Vance"
                    value={inviteJudgeForm.name}
                    onChange={e => setInviteJudgeForm({ ...inviteJudgeForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Email Address *</label>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="e.g. judge@hackathon.org"
                    value={inviteJudgeForm.email}
                    onChange={e => setInviteJudgeForm({ ...inviteJudgeForm, email: e.target.value })}
                    required
                  />
                </div>
                <button type="submit" className="btn" style={{ width: '100%' }}>
                  Send Judge Invitation
                </button>
              </form>
            </div>
          </div>

          {/* Full-Width Judge Workload Table */}
          <div className="card-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={{ margin: 0, padding: 0, border: 'none' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                Judge Workload & Review Status ({dashboardData.judges.length} Judges)
              </h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                Peer isolation strictly enforced
              </span>
            </div>

            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Judge Name</th>
                    <th>Email</th>
                    <th>Assigned</th>
                    <th>Completed</th>
                    <th>Remaining</th>
                    <th>Workload Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.judges.slice(0, 15).map(j => {
                    const judgePercent = j.total_assigned > 0 ? Math.round((j.completed / j.total_assigned) * 100) : 0;
                    return (
                      <tr key={j.judge_id}>
                        <td style={{ fontWeight: 600, color: 'var(--text-bright)' }}>{j.name}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{j.email}</td>
                        <td>{j.total_assigned}</td>
                        <td style={{ color: 'var(--success)', fontWeight: 700 }}>{j.completed}</td>
                        <td style={{ color: j.pending > 0 ? 'var(--warning)' : 'var(--text-dim)' }}>{j.pending}</td>
                        <td style={{ minWidth: '120px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div className="progress-bar-track" style={{ flex: 1, margin: 0 }}>
                              <div className="progress-bar-fill" style={{ width: `${judgePercent}%` }}></div>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{judgePercent}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {dashboardData.judges.length > 15 && (
              <div style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Showing first 15 of {dashboardData.judges.length} judges. Full dataset is exportable via CSV.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================
          SUBTAB 2: NORMALIZATION
          =================================================================== */}
      {subTab === 'normalized' && (
        <div>
          {normalizedData ? (
            <div>
              {/* Empirical Bayes Global Parameters Banner */}
              <div className="card-panel" style={{ marginBottom: '1.5rem', background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.25) 0%, rgba(15, 23, 42, 0.8) 100%)', borderColor: 'rgba(56, 189, 248, 0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary)', fontWeight: 700, marginBottom: '0.25rem' }}>
                      <span className="tag-version-dot"></span>
                      Empirical Bayes Model Active
                    </div>
                    <h3 style={{ fontSize: '1.25rem', color: 'var(--text-bright)', margin: 0 }}>
                      Cross-Judge Statistical Normalization
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
                      Neutralizes harsh vs lenient grading biases across judging tracks using Bayesian prior shrinkage.
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div className="stat-chip">
                      <span className="stat-chip-label">Global Mean:</span>
                      <span className="stat-chip-val" style={{ color: 'var(--primary)' }}>{normalizedData.globalStats.mean}</span>
                    </div>
                    <div className="stat-chip">
                      <span className="stat-chip-label">Global StdDev:</span>
                      <span className="stat-chip-val" style={{ color: '#38bdf8' }}>{normalizedData.globalStats.stdDev}</span>
                    </div>
                    <div className="stat-chip">
                      <span className="stat-chip-label">Evaluations:</span>
                      <span className="stat-chip-val" style={{ color: 'var(--success)' }}>{normalizedData.globalStats.totalEvaluations}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Final Leaderboard / Rankings Table */}
              <div className="card-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h2 style={{ margin: 0, padding: 0, border: 'none' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    Normalized Project Leaderboard ({normalizedData.projects.length} Entries)
                  </h2>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                    Rankings reflect Bayesian adjusted scores
                  </span>
                </div>

                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: '60px' }}>Rank</th>
                        <th>Project Title</th>
                        <th>Team Name</th>
                        <th>Track</th>
                        <th>Reviews</th>
                        <th>Raw Avg</th>
                        <th>Normalized</th>
                        <th style={{ textAlign: 'right' }}>Final Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {normalizedData.projects.map(p => {
                        const rankClass = p.rank === 1 ? 'rank-1' : p.rank === 2 ? 'rank-2' : p.rank === 3 ? 'rank-3' : '';
                        return (
                          <tr key={p.project_id}>
                            <td>
                              <span className={`rank-pill ${rankClass}`}>
                                #{p.rank}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600, color: 'var(--text-bright)' }}>{p.title}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{p.team_name}</td>
                            <td><span className="track-tag">{p.track_name}</span></td>
                            <td>{p.reviews_count}</td>
                            <td style={{ fontFamily: 'var(--font-mono)' }}>{p.raw_avg_score}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>{p.normalized_score}</td>
                            <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--success)', fontSize: '1.05rem', fontFamily: 'var(--font-mono)' }}>
                              {p.final_score}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="card-panel empty-state">
              <div className="empty-state-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </div>
              <h3>Loading Normalization Models...</h3>
              <p>Fetching empirical Bayes distributions and computing cross-judge normalizations.</p>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================
          SUBTAB: PAIRWISE COMPARISONS & BRADLEY-TERRY (BONUS B)
          =================================================================== */}
      {subTab === 'pairwise' && (
        <OrganizerPairwiseView
          user={user}
          selectedEventId={selectedEventId}
          events={events}
          eventDetails={eventDetails}
        />
      )}

      {/* ===================================================================
          SUBTAB 3: AUDIT TRAIL
          =================================================================== */}
      {subTab === 'audit' && (
        <div className="card-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h2 style={{ margin: 0, padding: 0, border: 'none' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Immutable Judging Audit Trail
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.2rem 0 0 0' }}>
                Tamper-resistant append-only ledger of all judging actions, score changes, and administrative operations.
              </p>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              {auditLogs.length} Logged Entries
            </span>
          </div>

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity Type</th>
                  <th>Payload Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(l => (
                  <tr key={l.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {new Date(l.created_at).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-bright)' }}>
                      {l.actor_name || 'System Daemon'}
                    </td>
                    <td>
                      <span className="status-badge" style={{ background: 'rgba(56, 189, 248, 0.12)', color: '#7dd3fc', border: '1px solid rgba(56, 189, 248, 0.25)', fontSize: '0.72rem' }}>
                        {l.action}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>{l.entity_type}</td>
                    <td style={{ color: 'var(--text-muted)', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                      {l.details_json}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================
          SUBTAB 4: EVENT & TRACK CONFIG
          =================================================================== */}
      {subTab === 'events' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
          {/* Create Event Card */}
          <div className="card-panel">
            <h2>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              Create New Event
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '1.25rem', lineHeight: 1.55 }}>
              Establish a new hackathon instance with strict UTC submission deadlines and lifecycle phases.
            </p>
            <form onSubmit={handleCreateEvent}>
              <div className="form-group">
                <label>Event Name *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. DOGFOOD 2026 Spring Hackathon"
                  value={eventForm.name}
                  onChange={e => setEventForm({ ...eventForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Submission Deadline (UTC) *</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={eventForm.submissions_close ? eventForm.submissions_close.slice(0, 16) : ''}
                  onChange={e => setEventForm({ ...eventForm, submissions_close: new Date(e.target.value).toISOString() })}
                  required
                />
              </div>
              <button type="submit" className="btn" style={{ width: '100%' }}>
                Create Event
              </button>
            </form>
          </div>

          {/* Existing Events List */}
          <div className="card-panel">
            <h2>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Configured Events ({events.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {events.map(ev => {
                const isEvClosed = new Date(ev.submissions_close) < new Date();
                return (
                  <div key={ev.id} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', padding: '1rem 1.15rem', borderRadius: 'var(--radius)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <strong style={{ fontSize: '1.05rem', color: 'var(--text-bright)' }}>{ev.name}</strong>
                      <span className={`status-badge ${isEvClosed ? 'draft' : 'submitted'}`} style={{ fontSize: '0.72rem' }}>
                        {isEvClosed ? 'Closed' : 'Accepting'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Deadline: {new Date(ev.submissions_close).toUTCString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          SUBTAB 5: COMMUNITY VOTING & RESULTS
          =================================================================== */}
      {subTab === 'voting' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem', marginBottom: '1.75rem' }}>
            {/* Voting Windows Table */}
            <div className="card-panel" style={{ margin: 0 }}>
              <h2>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Active Voting Windows
              </h2>
              {votingWindowsLoading ? (
                <div className="empty-state" style={{ padding: '2rem' }}>Loading voting windows...</div>
              ) : votingWindows.length === 0 ? (
                <div className="empty-state" style={{ padding: '2rem' }}>No voting windows configured for this event.</div>
              ) : (
                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Window Title</th>
                        <th>Status</th>
                        <th>Start Time</th>
                        <th>End Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {votingWindows.map(w => (
                        <tr key={w.id}>
                          <td style={{ fontWeight: 600 }}>{w.title}</td>
                          <td>
                            <span className="status-badge" style={{
                              background: w.current_status === 'OPEN' ? 'rgba(16, 185, 129, 0.15)' : w.current_status === 'UPCOMING' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(30, 41, 59, 0.8)',
                              color: w.current_status === 'OPEN' ? '#6ee7b7' : w.current_status === 'UPCOMING' ? '#93c5fd' : '#94a3b8',
                              border: `1px solid ${w.current_status === 'OPEN' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(148, 163, 184, 0.2)'}`,
                              padding: '0.2rem 0.55rem',
                              borderRadius: 'var(--radius-full)',
                              fontSize: '0.72rem',
                              fontWeight: 700
                            }}>
                              {w.current_status}
                            </span>
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{new Date(w.start_time).toLocaleString()}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{new Date(w.end_time).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Create Voting Window Card */}
            <div className="card-panel" style={{ margin: 0 }}>
              <h2>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                Create Voting Window
              </h2>
              <form onSubmit={handleCreateVotingWindow}>
                <div className="form-group">
                  <label>Window Title *</label>
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
                  <label>Start Time (Local) *</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={votingWindowForm.start_time ? votingWindowForm.start_time.slice(0, 16) : ''}
                    onChange={e => setVotingWindowForm({ ...votingWindowForm, start_time: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>End Time (Local) *</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={votingWindowForm.end_time ? votingWindowForm.end_time.slice(0, 16) : ''}
                    onChange={e => setVotingWindowForm({ ...votingWindowForm, end_time: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
                  <input
                    type="checkbox"
                    id="voting-active-checkbox"
                    checked={votingWindowForm.is_active}
                    onChange={e => setVotingWindowForm({ ...votingWindowForm, is_active: e.target.checked })}
                    style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  <label htmlFor="voting-active-checkbox" style={{ margin: 0, cursor: 'pointer' }}>Active (Visible to voters)</label>
                </div>
                <button type="submit" className="btn" style={{ width: '100%' }} disabled={votingWindowSubmitting}>
                  {votingWindowSubmitting ? 'Creating...' : 'Create Voting Window'}
                </button>
              </form>
            </div>
          </div>

          {/* Unblinded Community Voting Results */}
          <div className="card-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 style={{ margin: 0, padding: 0, border: 'none' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
                  Unblinded Community Voting Leaderboard
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
                  Live voting tallies visible exclusively to organizers. Public voting results remain sealed while the voting window is open.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={loadVotingResults}
                disabled={votingResultsLoading}
              >
                {votingResultsLoading ? 'Refreshing...' : '↻ Refresh Results'}
              </button>
            </div>

            {votingResultsError && (
              <div className="banner danger" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                {votingResultsError}
              </div>
            )}

            {votingResultsLoading && !votingResults ? (
              <div className="empty-state" style={{ padding: '2.5rem' }}>Loading unblinded voting results...</div>
            ) : !votingResults || !votingResults.results || votingResults.results.length === 0 ? (
              <div className="empty-state" style={{ padding: '2.5rem' }}>No voting results recorded for this event yet.</div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                  <div className="stat-chip">
                    <span className="stat-chip-label">Window Status:</span>
                    <span className="stat-chip-val" style={{ color: 'var(--primary)' }}>{votingResults.status}</span>
                  </div>
                  <div className="stat-chip">
                    <span className="stat-chip-label">Total Votes Cast:</span>
                    <span className="stat-chip-val" style={{ color: 'var(--success)' }}>{votingResults.total_votes}</span>
                  </div>
                  <div className="stat-chip">
                    <span className="stat-chip-label">Organizer Privilege:</span>
                    <span className="stat-chip-val" style={{ color: '#38bdf8' }}>Unblinded Real-Time</span>
                  </div>
                </div>

                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: '60px' }}>Rank</th>
                        <th>Project Title</th>
                        <th>Team Name</th>
                        <th>Track</th>
                        <th style={{ textAlign: 'right' }}>Community Votes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {votingResults.results.map((r) => {
                        const rankClass = r.rank === 1 ? 'rank-1' : r.rank === 2 ? 'rank-2' : r.rank === 3 ? 'rank-3' : '';
                        return (
                          <tr key={r.project_id}>
                            <td>
                              <span className={`rank-pill ${rankClass}`}>
                                #{r.rank}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600, color: 'var(--text-bright)' }}>{r.title}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{r.team_name}</td>
                            <td>
                              {r.track_name ? <span className="track-tag">{r.track_name}</span> : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 800, color: r.vote_count > 0 ? 'var(--success)' : 'var(--text-dim)', fontSize: '1rem', fontFamily: 'var(--font-mono)' }}>
                              {r.vote_count}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================
          SUBTAB 6: COMMENT MODERATION
          =================================================================== */}
      {subTab === 'moderation' && (
        <div className="card-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.85rem' }}>
            <div>
              <h2 style={{ margin: 0, padding: 0, border: 'none' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Community Feedback Moderation
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
                Review reported comments, inspect community feedback across projects, and permanently redact abusive content.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div style={{ display: 'inline-flex', background: 'var(--surface-raised)', borderRadius: 'var(--radius)', border: '1px solid var(--surface-border)', padding: '2px' }}>
                <button
                  type="button"
                  className="demo-btn"
                  style={{
                    background: moderationFilter === 'flagged' ? 'var(--primary)' : 'transparent',
                    color: moderationFilter === 'flagged' ? '#030712' : 'var(--text-muted)',
                    border: 'none',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-sm)'
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
                    color: moderationFilter === 'all' ? '#030712' : 'var(--text-muted)',
                    border: 'none',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-sm)'
                  }}
                  onClick={() => setModerationFilter('all')}
                >
                  All Comments ({moderationComments.length})
                </button>
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={loadModerationComments}
                disabled={moderationLoading}
              >
                {moderationLoading ? 'Refreshing...' : '↻ Refresh'}
              </button>
            </div>
          </div>

          {moderationError && (
            <div className="banner danger" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
              {moderationError}
            </div>
          )}
          {moderationSuccess && (
            <div className="banner success" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
              {moderationSuccess}
            </div>
          )}

          {moderationLoading && moderationComments.length === 0 ? (
            <div className="empty-state" style={{ padding: '3rem 1.5rem' }}>Loading comments for moderation review...</div>
          ) : moderationComments.filter(c => moderationFilter === 'flagged' ? c.is_flagged : true).length === 0 ? (
            <div className="empty-state" style={{ padding: '3rem 1.5rem' }}>
              <div className="empty-state-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <h3 style={{ fontSize: '1.15rem' }}>
                {moderationFilter === 'flagged' ? 'No Flagged Comments' : 'No Comments Found'}
              </h3>
              <p style={{ fontSize: '0.88rem' }}>
                {moderationFilter === 'flagged'
                  ? 'All community feedback is currently in good standing. No flagged reports require administrative action.'
                  : 'No community comments have been posted across projects yet.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {moderationComments
                .filter(c => moderationFilter === 'flagged' ? c.is_flagged : true)
                .map(c => (
                  <div
                    key={c.id}
                    style={{
                      background: 'var(--surface-raised)',
                      border: c.is_flagged ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--surface-border)',
                      borderRadius: 'var(--radius)',
                      padding: '1.15rem',
                      boxShadow: c.is_flagged ? '0 0 12px rgba(239, 68, 68, 0.1)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-bright)' }}>{c.author?.name || 'Anonymous User'}</span>
                          {c.author?.roles?.length > 0 && (
                            <span className={`role-badge ${c.author.roles[0] || 'visitor'}`} style={{ fontSize: '0.65rem' }}>
                              {c.author.roles[0]}
                            </span>
                          )}
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                            on project <strong style={{ color: 'var(--primary)' }}>{c.project_title}</strong>
                          </span>
                        </div>
                        <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                          {c.created_at ? new Date(c.created_at).toLocaleString() : ''}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        {c.is_flagged ? (
                          <span className="status-badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.35)', padding: '0.2rem 0.55rem', borderRadius: 'var(--radius-full)', fontSize: '0.72rem', fontWeight: 700 }}>
                            ⚠️ Flagged for Review
                          </span>
                        ) : (
                          <span className="status-badge" style={{ background: 'rgba(148, 163, 184, 0.12)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.25)', padding: '0.2rem 0.55rem', borderRadius: 'var(--radius-full)', fontSize: '0.72rem' }}>
                            Public Feedback
                          </span>
                        )}

                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteComment(c.id)}
                          disabled={deletingCommentId === c.id}
                        >
                          {deletingCommentId === c.id ? 'Deleting...' : 'Delete Comment'}
                        </button>
                      </div>
                    </div>

                    <p style={{ margin: 0, fontSize: '0.92rem', color: '#cbd5e1', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.55 }}>
                      {c.content}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
