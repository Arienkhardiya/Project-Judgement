import React, { useState, useEffect } from 'react';

export default function CommunityVoting({ user, onRequireLogin }) {
  const [windows, setWindows] = useState([]);
  const [ballotData, setBallotData] = useState(null);
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
    try {
      const [windowsRes, ballotRes] = await Promise.all([
        fetch('/api/voting/windows?event_id=evt_01'),
        fetch('/api/voting/ballot?event_id=evt_01')
      ]);

      if (!windowsRes.ok) throw new Error('Failed to load voting windows');
      if (!ballotRes.ok) throw new Error('Failed to load ballot');

      const windowsData = await windowsRes.json();
      const ballotJson = await ballotRes.json();

      setWindows(windowsData.windows || []);
      setBallotData(ballotJson);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (projectId) => {
    if (!user) {
      onRequireLogin();
      return;
    }

    setSubmittingVote(true);
    setError(null);
    setVoteSuccess(null);

    try {
      const res = await fetch('/api/voting/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: 'evt_01', project_id: projectId })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit vote');
      }

      setVoteSuccess('Your vote has been cast successfully!');
      setBallotData(prev => ({
        ...prev,
        has_voted: true,
        voted_project_id: projectId
      }));
    } catch (err) {
      setError(err.message);
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

  const activeWindow = windows.find(w => w.is_active);
  
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
            </p>
          ) : (
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>No active voting window at this time.</p>
          )}
        </div>
      </div>

      {error && <div className="banner danger" style={{ marginBottom: '1.5rem' }}>{error}</div>}
      {voteSuccess && <div className="banner" style={{ background: '#064e3b', border: '1px solid #10b981', color: '#d1fae5', marginBottom: '1.5rem' }}>{voteSuccess}</div>}

      {ballotData?.has_voted && (
        <div className="banner" style={{ background: '#172554', border: '1px solid #1e40af', color: '#bfdbfe', marginBottom: '2rem' }}>
          <strong>You have already cast your vote!</strong> Thank you for participating.
        </div>
      )}

      {!ballotData?.projects || ballotData.projects.length === 0 ? (
        <div className="empty-state">No projects available for voting yet.</div>
      ) : (
        <div className="gallery-grid">
          {ballotData.projects.map(project => {
            const isVoted = ballotData.voted_project_id === project.id;
            const isOwnTeam = project.is_own_team;
            const canVote = activeWindow?.current_status === 'OPEN' && !ballotData.has_voted && !isOwnTeam;
            
            return (
              <div key={project.id} className="card-panel" style={{ 
                display: 'flex', flexDirection: 'column',
                border: isVoted ? '2px solid var(--primary)' : undefined,
                boxShadow: isVoted ? '0 0 0 1px var(--primary)' : undefined,
                opacity: (ballotData.has_voted && !isVoted) ? 0.7 : 1
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{project.title}</h3>
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

                <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--surface-border)' }}>
                  {isOwnTeam ? (
                    <div style={{ textAlign: 'center', color: 'var(--warning)', fontSize: '0.9rem', padding: '0.5rem' }}>
                      Self-voting is not permitted
                    </div>
                  ) : (
                    <button 
                      className="btn" 
                      style={{ 
                        width: '100%', 
                        background: isVoted ? 'var(--surface-border)' : 'var(--primary)',
                        color: isVoted ? 'var(--text-muted)' : 'white',
                        cursor: (canVote && !submittingVote) ? 'pointer' : 'not-allowed',
                        opacity: (canVote && !submittingVote) ? 1 : 0.6
                      }}
                      disabled={!canVote || submittingVote}
                      onClick={() => handleVote(project.id)}
                    >
                      {submittingVote ? 'Submitting...' : isVoted ? 'Voted' : ballotData.has_voted ? 'Voting Closed' : activeWindow?.current_status !== 'OPEN' ? 'Window Closed' : 'Vote for Project'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
