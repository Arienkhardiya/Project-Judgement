import React, { useState, useEffect } from 'react';

export default function PublicEventPage({
  eventId,
  eventSlug,
  user,
  onNavigateTab,
  onOpenLogin,
  onBackToHome,
}) {
  const [eventData, setEventData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const identifier = eventSlug || eventId;
  const [activeSubTab, setActiveSubTab] = useState('overview'); // 'overview' | 'projects' | 'results'

  // Projects state
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTrack, setSelectedTrack] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);

  // Results state
  const [results, setResults] = useState(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registrationMsg, setRegistrationMsg] = useState(null);

  useEffect(() => {
    loadEventDetails();
  }, [identifier]);

  const handleRegisterForEvent = async () => {
    if (!user) {
      onOpenLogin();
      return;
    }
    setRegistering(true);
    setRegistrationMsg(null);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventData?.event?.id || identifier)}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to register');
      }
      setRegistrationMsg({ type: 'success', text: data.message });
      setEventData(prev => ({
        ...prev,
        event: {
          ...prev.event,
          is_registered: true,
        },
      }));
    } catch (err) {
      setRegistrationMsg({ type: 'error', text: err.message });
    } finally {
      setRegistering(false);
    }
  };

  const loadEventDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(identifier)}`);
      if (!res.ok) {
        throw new Error(`Event not found (HTTP ${res.status})`);
      }
      const data = await res.json();
      setEventData(data);
      loadProjects(data.event.id);
      if (data.event.results_published) {
        loadResults(data.event.id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async (targetEventId) => {
    setLoadingProjects(true);
    try {
      const res = await fetch(`/api/projects?event_id=${encodeURIComponent(targetEventId)}`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (err) {
      console.error('Error fetching event projects:', err);
    } finally {
      setLoadingProjects(false);
    }
  };

  const loadResults = async (targetEventId) => {
    setLoadingResults(true);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(targetEventId)}/results`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      }
    } catch (err) {
      console.error('Error loading results:', err);
    } finally {
      setLoadingResults(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
        <div className="empty-state-icon" style={{ margin: '0 auto 1.5rem' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <h2>Loading Hackathon Portal...</h2>
        <p style={{ color: 'var(--text-muted)' }}>Retrieving event specifications and tracks...</p>
      </div>
    );
  }

  if (error || !eventData) {
    return (
      <div className="container" style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
        <div className="empty-state-icon" style={{ margin: '0 auto 1.5rem' }}>⛔</div>
        <h2>Hackathon Not Found</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>{error || 'Unable to locate event'}</p>
        <button type="button" className="btn btn-secondary" onClick={onBackToHome}>
          &larr; Back to Hackathons Directory
        </button>
      </div>
    );
  }

  const { event, tracks, prizes, rubric } = eventData;
  const now = new Date().toISOString();
  const isSubmissionClosed = now >= event.submissions_close;

  // Filter projects
  const filteredProjects = projects.filter(p => {
    if (selectedTrack && p.track_id !== selectedTrack) return false;
    if (searchQuery.trim()) {
      const term = searchQuery.toLowerCase();
      const matchTitle = (p.title || '').toLowerCase().includes(term);
      const matchSummary = (p.summary || '').toLowerCase().includes(term);
      const matchTeam = (p.team_name || '').toLowerCase().includes(term);
      if (!matchTitle && !matchSummary && !matchTeam) return false;
    }
    return true;
  });

  return (
    <div className="public-event-container">
      {/* Back button */}
      <div style={{ marginBottom: '1.25rem' }}>
        <button
          type="button"
          className="btn btn-secondary btn-xs"
          onClick={onBackToHome}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          &larr; All Hackathons
        </button>
      </div>

      {/* ===== EVENT HERO HEADER ===== */}
      <div className="event-hero-card">
        <div className="event-hero-content">
          <div className="event-hero-eyebrow">
            <span className="tag-version-dot"></span>
            {event.phase?.replace(/_/g, ' ')} &bull; {event.slug || event.id}
          </div>

          <h1 className="event-hero-title">{event.name}</h1>
          <p className="event-hero-desc">{event.description || 'Welcome to the official hackathon workspace.'}</p>

          {/* Schedule Badges */}
          <div className="event-hero-meta-strip">
            <div className="meta-pill">
              <span className="meta-pill-label">Deadline:</span>
              <span className="meta-pill-val">
                {event.submissions_close ? new Date(event.submissions_close).toLocaleString() : 'Open'}
              </span>
            </div>
            <div className="meta-pill">
              <span className="meta-pill-label">Tracks:</span>
              <span className="meta-pill-val">{tracks.length} Categories</span>
            </div>
            <div className="meta-pill">
              <span className="meta-pill-label">Submissions:</span>
              <span className="meta-pill-val">{projects.length} Dossiers</span>
            </div>
          </div>
        </div>

        {/* Action Callout */}
        <div className="event-hero-action-box">
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            {isSubmissionClosed ? 'Submissions Closed' : 'Registration & Submissions Live'}
          </div>

          {registrationMsg && (
            <div
              className={`banner ${registrationMsg.type === 'success' ? 'success' : 'danger'}`}
              style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem', marginBottom: '0.65rem', textAlign: 'left' }}
            >
              {registrationMsg.text}
            </div>
          )}

          {user ? (
            user.roles.includes('organizer') ? (
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => onNavigateTab('organizer')}
              >
                Organizer Console &rarr;
              </button>
            ) : user.roles.includes('judge') ? (
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => onNavigateTab('judge')}
              >
                Judge Workbench &rarr;
              </button>
            ) : event.is_registered ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.82rem',
                  color: 'var(--success)',
                  fontWeight: 600,
                  justifyContent: 'center',
                  background: 'rgba(16, 185, 129, 0.1)',
                  padding: '0.35rem 0.6rem',
                  borderRadius: 'var(--radius)',
                  border: '1px solid rgba(16, 185, 129, 0.25)'
                }}>
                  ✓ Registered Participant
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => onNavigateTab('participant')}
                >
                  {isSubmissionClosed ? 'View My Project' : 'Participant Workspace & Submit &rarr;'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={handleRegisterForEvent}
                disabled={registering || isSubmissionClosed}
              >
                {registering ? 'Registering...' : isSubmissionClosed ? 'Registration Closed' : 'Register for Hackathon &rarr;'}
              </button>
            )
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={onOpenLogin}
            >
              Sign In to Register &amp; Participate &rarr;
            </button>
          )}

          {event.results_published && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={() => setActiveSubTab('results')}
            >
              View Official Results
            </button>
          )}
        </div>
      </div>

      {/* ===== EVENT NAVIGATION TABS ===== */}
      <div className="event-tabs-nav">
        <button
          type="button"
          className={`event-tab-btn ${activeSubTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('overview')}
        >
          Event Overview &amp; Tracks
        </button>
        <button
          type="button"
          className={`event-tab-btn ${activeSubTab === 'projects' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('projects')}
        >
          Project Showcase ({projects.length})
        </button>
        <button
          type="button"
          className={`event-tab-btn ${activeSubTab === 'results' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('results')}
        >
          Official Results
          {event.results_published && <span className="tab-dot-badge"></span>}
        </button>
      </div>

      {/* ===== SUBTAB 1: OVERVIEW ===== */}
      {activeSubTab === 'overview' && (
        <div className="event-tab-content">
          {/* Tracks Section */}
          <div className="card-panel">
            <h2>Competition Tracks</h2>
            <div className="tracks-grid">
              {tracks.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No specialized tracks defined. General submission track.</p>
              ) : (
                tracks.map(trk => (
                  <div key={trk.id} className="track-card">
                    <span className="track-tag" style={{ marginBottom: '0.65rem' }}>{trk.name}</span>
                    <h3 style={{ fontSize: '1.05rem', margin: '0.35rem 0' }}>{trk.name}</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      {trk.description || 'Projects focusing on innovations in this track.'}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Prizes Section */}
          {prizes.length > 0 && (
            <div className="card-panel">
              <h2>Prize Pool &amp; Awards</h2>
              <div className="prizes-grid">
                {prizes.map((prz, idx) => (
                  <div key={prz.id} className="prize-card">
                    <div className="prize-badge">{idx === 0 ? '🏆 GRAND PRIZE' : '🎖️ AWARD'}</div>
                    <h3 className="prize-name">{prz.name}</h3>
                    <div className="prize-amount">
                      {prz.amount > 0 ? `$${Number(prz.amount).toLocaleString()}` : 'Recognition & Mentorship'}
                    </div>
                    <p className="prize-desc">{prz.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Evaluation Criteria */}
          {rubric && rubric.criteria && rubric.criteria.length > 0 && (
            <div className="card-panel">
              <h2>Judging Rubric &amp; Weighting</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                All projects are evaluated blindly against these weighted dimensions:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                {rubric.criteria.map(crit => (
                  <div key={crit.id} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <strong style={{ color: 'var(--text-bright)' }}>{crit.name}</strong>
                      <span className="rubric-weight-chip">{crit.weight}x Weight</span>
                    </div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                      {crit.description || 'Scored on a 1-5 scale.'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== SUBTAB 2: PROJECT SHOWCASE ===== */}
      {activeSubTab === 'projects' && (
        <div className="event-tab-content">
          {/* Filter Bar */}
          <div className="showcase-toolbar">
            <input
              type="text"
              className="form-control"
              placeholder="Search projects by title, summary, or team..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ maxWidth: '360px' }}
            />

            <div className="track-filter-pills">
              <button
                type="button"
                className={`filter-pill ${selectedTrack === '' ? 'active' : ''}`}
                onClick={() => setSelectedTrack('')}
              >
                All Tracks ({projects.length})
              </button>
              {tracks.map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={`filter-pill ${selectedTrack === t.id ? 'active' : ''}`}
                  onClick={() => setSelectedTrack(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {loadingProjects ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading projects...</div>
          ) : filteredProjects.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📂</div>
              <h3>No Projects Found</h3>
              <p>
                {projects.length === 0
                  ? 'No submissions have been published for this hackathon yet.'
                  : 'No projects match your current search or track filter.'}
              </p>
            </div>
          ) : (
            <div className="projects-grid">
              {filteredProjects.map((p) => (
                <div
                  key={p.id}
                  className="project-card"
                  onClick={() => setSelectedProject(p)}
                >
                  <div className="card-top">
                    <span className="track-tag">{p.track_name || 'General'}</span>
                    <span className="team-pill">{p.team_name}</span>
                  </div>

                  <h3 className="card-title">{p.title}</h3>
                  <p className="card-summary">{p.summary}</p>

                  <div className="card-bottom">
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      {p.submitted_at ? new Date(p.submitted_at).toLocaleDateString() : 'Submitted'}
                    </span>
                    <span className="card-action-link">View Dossier &rarr;</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== SUBTAB 3: RESULTS ===== */}
      {activeSubTab === 'results' && (
        <div className="event-tab-content">
          {event.results_published ? (
            <div>
              <div className="banner success" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>🏆</span>
                  <div>
                    <strong>Official Certified Results</strong>
                    <div style={{ fontSize: '0.85rem' }}>
                      All evaluations have concluded, cross-judge normalization has been executed, and winners have been certified.
                    </div>
                  </div>
                </div>
              </div>

              {loadingResults ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading certified results...</div>
              ) : results && results.projects ? (
                <div className="card-panel">
                  <h2>Official Competition Leaderboard</h2>
                  <div className="data-table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Project</th>
                          <th>Team</th>
                          <th>Track</th>
                          <th>Raw Score</th>
                          <th>Normalized Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.projects.map((item, idx) => (
                          <tr key={item.project_id}>
                            <td style={{ fontWeight: 800 }}>
                              {idx === 0 ? '🥇 1st' : idx === 1 ? '🥈 2nd' : idx === 2 ? '🥉 3rd' : `#${idx + 1}`}
                            </td>
                            <td style={{ fontWeight: 700, color: 'var(--text-bright)' }}>{item.title}</td>
                            <td>{item.team_name || 'Team'}</td>
                            <td><span className="track-tag">{item.track_name || 'Track'}</span></td>
                            <td>{Number(item.raw_average || 0).toFixed(2)}</td>
                            <td style={{ fontWeight: 800, color: 'var(--primary)' }}>
                              {Number(item.final_score || 0).toFixed(4)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>Leaderboard data is compiling.</p>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">🔒</div>
              <h3>Results Under Deliberation</h3>
              <p>
                Official rankings and awards will be published once judging and cross-judge normalization
                are certified by the event organizers.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Project Details Modal */}
      {selectedProject && (
        <div className="modal-overlay" onClick={() => setSelectedProject(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <div>
                <span className="track-tag" style={{ marginBottom: '0.4rem' }}>{selectedProject.track_name}</span>
                <h3 className="modal-title">{selectedProject.title}</h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>By {selectedProject.team_name}</span>
              </div>
              <button type="button" className="modal-close-btn" onClick={() => setSelectedProject(null)}>✕</button>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <div className="modal-section">
                <span className="modal-section-title">Executive Summary</span>
                <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--text-main)' }}>{selectedProject.summary}</p>
              </div>

              {selectedProject.description && selectedProject.description !== selectedProject.summary && (
                <div className="modal-section">
                  <span className="modal-section-title">Technical Architecture &amp; Implementation</span>
                  <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-muted)' }}>{selectedProject.description}</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                {selectedProject.repo_url && (
                  <a href={selectedProject.repo_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                    View Code Repository &rarr;
                  </a>
                )}
                {selectedProject.demo_url && (
                  <a href={selectedProject.demo_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                    View Live Demo &rarr;
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
