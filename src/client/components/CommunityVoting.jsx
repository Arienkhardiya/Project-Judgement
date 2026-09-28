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

  if (loading) {
    return (
      <div className="container">
        <h1>Community Voting</h1>
        <div className="empty-state">Loading voting experience...</div>
      </div>
    );
  }

  const activeWindow = windows.find(w => w.is_active) || windows[0];
  const votedProject = ballotData?.projects?.find(project => project.id === ballotData.voted_project_id);
  
  return (
    <div className="container">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Community Voting</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
          Explore the projects and cast your vote for the Community Choice Award.
        </p>
      </div>

      <div className="card-panel" style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: '0 0 0.5rem 0' }}>Voting Status</h2>
          {activeWindow ? (
            <p style={{ margin: 0 }}>
              <strong>{activeWindow.title}</strong>: 
              {activeWindow.current_status === 'OPEN' && <span style={{ color: 'var(--success)', marginLeft: '0.5rem' }}>Open until {new Date(activeWindow.end_time).toLocaleString()}</span>}
              {activeWindow.current_status === 'UPCOMING' && <span style={{ color: 'var(--primary)', marginLeft: '0.5rem' }}>Opens at {new Date(activeWindow.start_time).toLocaleString()}</span>}
              {activeWindow.current_status === 'CLOSED' && <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>Closed at {new Date(activeWindow.end_time).toLocaleString()}</span>}
              {activeWindow.current_status === 'INACTIVE' && <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>Inactive</span>}
            </p>
          ) : (
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>No active voting window at this time.</p>
          )}
        </div>
      </div>

      {error && <div className="banner danger" style={{ marginBottom: '1.5rem' }}>{error}</div>}
      {(voteSuccess || ballotData?.has_voted) && (
        <div className="banner" role="status" style={{ background: '#064e3b', border: '1px solid #10b981', color: '#d1fae5', marginBottom: '1.5rem' }}>
          {voteSuccess || `You have already cast your vote${votedProject ? ` for ${votedProject.title}` : ''}. Thank you for participating.`}
        </div>
      )}

      {ballotData?.projects?.length ? (
        <div className="gallery-grid">
          {ballotData.projects.map(project => {
            const isVoted = ballotData.voted_project_id === project.id;
            const isOwnTeam = project.is_own_team;
            const canSelect = activeWindow?.current_status === 'OPEN'
              && !ballotData.has_voted
              && !isOwnTeam
              && !submittingVote;
            const isSelected = selectedProjectId === project.id;
            
            return (
              <label key={project.id} className="card-panel" style={{
                display: 'flex', flexDirection: 'column',
                border: isSelected ? '2px solid var(--primary)' : undefined,
                boxShadow: isSelected ? '0 0 0 1px var(--primary)' : undefined,
                cursor: canSelect ? 'pointer' : 'not-allowed',
                opacity: (!canSelect && !isVoted) ? 0.7 : 1
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="radio"
                        name="community-vote-project"
                        value={project.id}
                        checked={isSelected}
                        disabled={!canSelect}
                        onChange={() => setSelectedProjectId(project.id)}
                      />
                      <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{project.title}</h3>
                    </div>
                    {isVoted && <span className="status-badge" style={{ background: 'var(--primary)', color: 'white' }}>Your Vote</span>}
                  </div>
                  
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    By {project.team_name}
                  </p>
                  
                  {project.track_name && (
                    <div style={{ marginBottom: '1rem' }}>
                      <span className="track-tag">{project.track_name}</span>
                    </div>
                  )}
                  
                  <p style={{ fontSize: '0.95rem', lineHeight: '1.5' }}>
                    {project.summary}
                  </p>
                  
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                    {project.repo_url && (
                      <a href={project.repo_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.85rem', color: 'var(--primary)' }}>
                        Repository
                      </a>
                    )}
                    {project.demo_url && (
                      <a href={project.demo_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.85rem', color: 'var(--primary)' }}>
                        Live Demo
                      </a>
                    )}
                  </div>
                </div>

                {isOwnTeam && <div style={{ marginTop: '1rem', color: 'var(--warning)', fontSize: '0.9rem' }}>Self-voting is not permitted.</div>}
              </label>
            );
          })}
        </div>
      ) : !error && <div className="empty-state">No projects available for voting yet.</div>}

      {ballotData?.projects?.length > 0 && !ballotData.has_voted && activeWindow?.current_status === 'OPEN' && (
        <button
          className="btn"
          style={{ marginTop: '1.5rem' }}
          disabled={!selectedProjectId || submittingVote}
          onClick={handleVote}
        >
          {!user ? 'Sign In to Vote' : submittingVote ? 'Submitting Vote...' : 'Submit Vote'}
        </button>
      )}
    </div>
  );
}
