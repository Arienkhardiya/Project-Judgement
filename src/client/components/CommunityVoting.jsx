import React, { useState, useEffect } from 'react';

export default function CommunityVoting({ user, onRequireLogin }) {
  const [eventId, setEventId] = useState('');
  const [windows, setWindows] = useState([]);
  const [ballotData, setBallotData] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submittingVote, setSubmittingVote] = useState(false);
  const [voteSuccess, setVoteSuccess] = useState(null);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setVoteSuccess(null);
    setEventId('');
    setWindows([]);
    setBallotData(null);
    setSelectedProjectId('');
    try {
      const eventsRes = await fetch('/api/events');
      const eventsData = await eventsRes.json();
      if (!eventsRes.ok) throw new Error(eventsData.error || 'Failed to load events');

      const primaryEventId = eventsData.events?.[0]?.id;
      if (!primaryEventId) {
        setEventId('');
        setWindows([]);
        setBallotData(null);
        setSelectedProjectId('');
        setError('No event is currently available for voting.');
        return;
      }

      setEventId(primaryEventId);
      const [windowsRes, ballotRes] = await Promise.all([
        fetch(`/api/voting/windows?event_id=${encodeURIComponent(primaryEventId)}`),
        fetch(`/api/voting/ballot?event_id=${encodeURIComponent(primaryEventId)}`)
      ]);

      const windowsData = await windowsRes.json();
      const ballotJson = await ballotRes.json();
      if (!windowsRes.ok) throw new Error(windowsData.error || 'Failed to load voting windows');
      if (!ballotRes.ok) throw new Error(ballotJson.error || 'Failed to load ballot');

      setWindows(windowsData.windows || []);
      setBallotData(ballotJson);
      setSelectedProjectId(ballotJson.voted_project_id || '');
    } catch (err) {
      setError(err.message || 'Failed to load community voting');
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async () => {
    if (!user) {
      onRequireLogin();
      return;
    }
    if (!eventId || !selectedProjectId) return;

    setSubmittingVote(true);
    setError(null);
    setVoteSuccess(null);

    try {
      const res = await fetch('/api/voting/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, project_id: selectedProjectId })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit vote');
      }

      setVoteSuccess(data.message || 'Your vote has been cast successfully!');
      setBallotData(prev => ({
        ...prev,
        has_voted: true,
        voted_project_id: data.project_id
      }));
      setSelectedProjectId(data.project_id);
    } catch (err) {
      setError(err.message || 'Failed to submit vote');
    } finally {
      setSubmittingVote(false);
    }
  };

  const activeWindow = windows.find(w => w.is_active) || windows[0];
  const votedProject = ballotData?.projects?.find(project => project.id === ballotData.voted_project_id);
  const selectedProject = ballotData?.projects?.find(project => project.id === selectedProjectId);

  if (loading) {
    return (
      <div className="container">
        <div className="dashboard-hero">
          <div className="dashboard-header-flex">
            <div>
              <div className="dashboard-eyebrow">
                <span className="tag-version-dot"></span>
                Community Choice Awards
              </div>
              <h1 className="dashboard-title">Community Voting</h1>
              <p className="dashboard-desc">Loading randomized ballot and competition entries...</p>
            </div>
          </div>
        </div>

        <div className="projects-grid">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="skeleton-card" style={{ height: '240px' }}>
              <div className="skeleton-shimmer" style={{ width: '40%', height: '16px' }}></div>
              <div className="skeleton-shimmer" style={{ width: '70%', height: '24px' }}></div>
              <div className="skeleton-shimmer" style={{ width: '95%', height: '48px' }}></div>
              <div className="skeleton-shimmer" style={{ width: '30%', height: '16px', marginTop: 'auto' }}></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const isOpen = activeWindow?.current_status === 'OPEN';

  return (
    <div className="container">
      {/* Dashboard Hero Header */}
      <div className="dashboard-hero">
        <div className="dashboard-header-flex">
          <div>
            <div className="dashboard-eyebrow">
              <span className="tag-version-dot" style={{ background: isOpen ? 'var(--success)' : 'var(--warning)', boxShadow: isOpen ? '0 0 8px var(--success)' : '0 0 8px var(--warning)' }}></span>
              Community Choice Awards
            </div>
            <h1 className="dashboard-title">Community Voting</h1>
            <p className="dashboard-desc">
              Explore competition deliverables and cast your ballot for the Community Choice Award. Randomized ballots mitigate positional bias; duplicate votes and self-voting are strictly rejected.
            </p>
          </div>

          <div className="dashboard-actions">
            <div className="isolation-pill">
              <span className="isolation-dot" style={{ background: isOpen ? 'var(--success)' : 'var(--warning)' }}></span>
              <span>Ballot Window: <strong style={{ color: isOpen ? 'var(--success)' : 'var(--warning)' }}>{activeWindow?.current_status || 'CLOSED'}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Voting Window Status Card */}
      <div className="voting-status-card">
        <div>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.25rem' }}>
            Voting Window Details
          </div>
          {activeWindow ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '1.1rem', color: 'var(--text-bright)' }}>{activeWindow.title}</strong>
              <span className="status-badge" style={{
                background: isOpen ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                color: isOpen ? '#6ee7b7' : '#93c5fd',
                border: `1px solid ${isOpen ? 'rgba(16, 185, 129, 0.35)' : 'rgba(56, 189, 248, 0.3)'}`,
                padding: '0.2rem 0.6rem',
                borderRadius: 'var(--radius-full)',
                fontWeight: 700,
                fontSize: '0.75rem'
              }}>
                {activeWindow.current_status}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {activeWindow.current_status === 'OPEN' && `Open until ${new Date(activeWindow.end_time).toLocaleString()}`}
                {activeWindow.current_status === 'UPCOMING' && `Opens at ${new Date(activeWindow.start_time).toLocaleString()}`}
                {activeWindow.current_status === 'CLOSED' && `Closed at ${new Date(activeWindow.end_time).toLocaleString()}`}
                {activeWindow.current_status === 'INACTIVE' && 'Inactive'}
              </span>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No active voting window at this time.</div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: 'var(--text-dim)', background: 'var(--surface-raised)', padding: '0.4rem 0.8rem', borderRadius: 'var(--radius)', border: '1px solid var(--surface-border-subtle)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>Anti-Abuse Active: 1 vote/user • Sealed results • Self-vote blocked</span>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="banner danger" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>⛔</span>
            <div><strong>Notice:</strong> {error}</div>
          </div>
        </div>
      )}

      {(voteSuccess || ballotData?.has_voted) && (
        <div className="banner success" role="status" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ fontSize: '1.25rem' }}>✅</span>
            <div>
              <strong>Vote Confirmed:</strong> {voteSuccess || `You have already cast your official ballot${votedProject ? ` for "${votedProject.title}"` : ''}. Thank you for participating.`}
              <div style={{ fontSize: '0.8rem', opacity: 0.9, marginTop: '0.15rem' }}>
                Per contest rules, live community vote totals remain sealed until the voting window officially concludes.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Projects Ballot Grid */}
      {ballotData?.projects?.length ? (
        <div className="projects-grid">
          {ballotData.projects.map(project => {
            const isVoted = ballotData.voted_project_id === project.id;
            const isOwnTeam = project.is_own_team;
            const canSelect = activeWindow?.current_status === 'OPEN'
              && !ballotData.has_voted
              && !isOwnTeam
              && !submittingVote;
            const isSelected = selectedProjectId === project.id;

            return (
              <label
                key={project.id}
                className={`voting-card ${canSelect ? 'selectable' : ''} ${isSelected ? 'selected' : ''} ${isVoted ? 'voted' : ''}`}
                style={{
                  cursor: canSelect ? 'pointer' : 'default',
                  opacity: (!canSelect && !isVoted) ? 0.65 : 1
                }}
              >
                {/* Top Metadata Row */}
                <div className="card-top">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span className="track-tag">{project.track_name || 'General Track'}</span>
                    <span className="team-pill">By {project.team_name}</span>
                  </div>

                  {isVoted && (
                    <span className="status-badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7', border: '1px solid rgba(16, 185, 129, 0.4)', padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: '0.72rem' }}>
                      ✓ Your Cast Vote
                    </span>
                  )}
                  {isOwnTeam && (
                    <span className="status-badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fcd34d', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '0.2rem 0.55rem', borderRadius: 'var(--radius-full)', fontSize: '0.7rem' }}>
                      Your Team
                    </span>
                  )}
                </div>

                {/* Title & Custom Radio Selector */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', margin: '0.4rem 0 0.65rem 0' }}>
                  {canSelect && (
                    <div className="voting-radio-custom" aria-hidden="true">
                      <div className="voting-radio-dot"></div>
                    </div>
                  )}
                  <input
                    type="radio"
                    name="community-vote-project"
                    value={project.id}
                    checked={isSelected}
                    disabled={!canSelect}
                    onChange={() => setSelectedProjectId(project.id)}
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                  />
                  <h3 className="card-title" style={{ margin: 0, fontSize: '1.25rem', color: isSelected ? 'var(--primary)' : 'var(--text-bright)' }}>
                    {project.title}
                  </h3>
                </div>

                {/* Summary */}
                <p className="card-summary" style={{ marginBottom: '1rem', flex: 1 }}>
                  {project.summary}
                </p>

                {/* Card Bottom Links & Status */}
                <div className="card-bottom">
                  <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                    {project.repo_url && (
                      <a
                        href={project.repo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                        onClick={e => e.stopPropagation()}
                      >
                        Code &rarr;
                      </a>
                    )}
                    {project.demo_url && (
                      <a
                        href={project.demo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                        onClick={e => e.stopPropagation()}
                      >
                        Demo &rarr;
                      </a>
                    )}
                  </div>

                  {isOwnTeam ? (
                    <span style={{ fontSize: '0.76rem', color: 'var(--warning)', fontWeight: 500 }}>
                      Self-vote blocked
                    </span>
                  ) : canSelect && (
                    <span style={{ fontSize: '0.78rem', color: isSelected ? 'var(--primary)' : 'var(--text-dim)', fontWeight: 600 }}>
                      {isSelected ? 'Selected for ballot' : 'Click to select'}
                    </span>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      ) : !error && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
          </div>
          <h3>No Projects Available for Voting</h3>
          <p>Eligible projects will appear on the ballot once submissions are published.</p>
        </div>
      )}

      {/* Sticky Bottom Action Bar when voting is active */}
      {ballotData?.projects?.length > 0 && !ballotData.has_voted && activeWindow?.current_status === 'OPEN' && (
        <div className="voting-bar-sticky">
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
              Selected Entry:
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: selectedProject ? 'var(--text-bright)' : 'var(--text-dim)' }}>
              {selectedProject ? selectedProject.title : 'No project selected yet'}
            </div>
          </div>

          <div>
            {!user ? (
              <button
                type="button"
                className="btn"
                onClick={onRequireLogin}
              >
                Sign In to Vote
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                disabled={!selectedProjectId || submittingVote}
                onClick={handleVote}
              >
                {submittingVote ? 'Submitting Ballot...' : 'Submit Official Vote'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
