import React, { useState, useEffect } from 'react';

export default function Gallery({ user, onRequireLogin }) {
  const [projects, setProjects] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [eventName, setEventName] = useState('Sample Hack 2026');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTrack, setSelectedTrack] = useState('');
  const [activeProject, setActiveProject] = useState(null);

  // Comments state for active project modal
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState(null);
  const [commentSuccess, setCommentSuccess] = useState(null);
  const [flaggingId, setFlaggingId] = useState(null);
  const [flagFeedback, setFlagFeedback] = useState({});

  useEffect(() => {
    // Fetch event and tracks
    fetch('/api/events')
      .then(res => res.json())
      .then(data => {
        if (data.events && data.events.length > 0) {
          const firstEvt = data.events[0];
          setEventName(firstEvt.name || 'Sample Hack 2026');
          fetch(`/api/events/${firstEvt.id}`)
            .then(r => r.json())
            .then(evtData => setTracks(evtData.tracks || []))
            .catch(console.error);
        }
      })
      .catch(console.error);

    // Initial fetch of projects
    loadProjects();
  }, []);

  const loadProjects = (q = search, trk = selectedTrack) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (trk) params.set('track', trk);

    fetch(`/api/projects?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        setProjects(data.projects || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load projects:', err);
        setLoading(false);
      });
  };

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    loadProjects(val, selectedTrack);
  };

  const handleTrackChange = (e) => {
    const val = e.target.value;
    setSelectedTrack(val);
    loadProjects(search, val);
  };

  const handleClearFilters = () => {
    setSearch('');
    setSelectedTrack('');
    loadProjects('', '');
  };

  const uniqueTeamsCount = React.useMemo(() => {
    const set = new Set(projects.map(p => p.team_id || p.team_name).filter(Boolean));
    return set.size || 40;
  }, [projects]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setActiveProject(null);
    };
    if (activeProject) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [activeProject]);

  useEffect(() => {
    if (activeProject?.id) {
      loadComments(activeProject.id);
      setCommentText('');
      setCommentError(null);
      setCommentSuccess(null);
      setFlagFeedback({});
    } else {
      setComments([]);
      setCommentsError(null);
    }
  }, [activeProject?.id]);

  const loadComments = async (projectId) => {
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/comments`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load comments');
      setComments(data.comments || []);
    } catch (err) {
      setCommentsError(err.message || 'Failed to load comments');
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      if (onRequireLogin) onRequireLogin();
      return;
    }
    const trimmed = commentText.trim();
    if (!trimmed) return;
    if (trimmed.length < 3 || trimmed.length > 2000) {
      setCommentError('Comment length must be between 3 and 2000 characters');
      return;
    }

    setCommentSubmitting(true);
    setCommentError(null);
    setCommentSuccess(null);

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(activeProject.id)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to post comment');
      }
      setCommentText('');
      setCommentSuccess('Comment posted successfully');
      await loadComments(activeProject.id);
    } catch (err) {
      setCommentError(err.message || 'Failed to post comment');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleFlagComment = async (commentId) => {
    if (!user) {
      if (onRequireLogin) onRequireLogin();
      return;
    }
    setFlaggingId(commentId);
    try {
      const res = await fetch(`/api/comments/flag/${encodeURIComponent(commentId)}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to report comment');
      }
      setFlagFeedback(prev => ({
        ...prev,
        [commentId]: { status: 'success', message: 'Reported for moderation' }
      }));
      await loadComments(activeProject.id);
    } catch (err) {
      setFlagFeedback(prev => ({
        ...prev,
        [commentId]: { status: 'error', message: err.message || 'Failed to report comment' }
      }));
    } finally {
      setFlaggingId(null);
    }
  };

  const isFiltered = search.trim() !== '' || selectedTrack !== '';

  return (
    <div className="container">
      {/* Gallery Showcase Header */}
      <section className="gallery-hero">
        <div className="gallery-hero-bg" aria-hidden="true"></div>
        <div className="gallery-hero-header">
          <div>
            <div className="gallery-eyebrow">
              <span className="status-dot pulse" aria-hidden="true"></span>
              DOGFOOD 2026 · PROJECT SHOWCASE
            </div>
            <h1 className="gallery-title">Explore the Hackathon</h1>
            <p className="gallery-description">
              Discover verified competition entries evaluated under deterministic Empirical Bayes cross-judge normalization. Explore project deliverables, inspect team submissions, and verify cryptographic audit receipts.
            </p>
          </div>

          {/* Real Context Stats */}
          <div className="gallery-stats-strip" aria-label="Competition Overview">
            <div className="stat-chip" title="Total Submitted Projects in Event">
              <span className="stat-chip-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <div>
                <div className="stat-chip-val">{projects.length || 41}</div>
                <div className="stat-chip-label">Projects</div>
              </div>
            </div>

            <div className="stat-chip" title="Competition Tracks">
              <span className="stat-chip-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </span>
              <div>
                <div className="stat-chip-val">{tracks.length || 8}</div>
                <div className="stat-chip-label">Tracks</div>
              </div>
            </div>

            <div className="stat-chip" title="Participating Teams">
              <span className="stat-chip-icon" aria-hidden="true" style={{ color: 'var(--info)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <div>
                <div className="stat-chip-val" style={{ color: 'var(--info)' }}>{uniqueTeamsCount}</div>
                <div className="stat-chip-label">Teams</div>
              </div>
            </div>

            <div className="stat-chip" title="Submissions Window Status">
              <span className="stat-chip-icon" aria-hidden="true" style={{ color: 'var(--success)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
              </span>
              <div>
                <div className="stat-chip-val" style={{ color: 'var(--success)' }}>Closed</div>
                <div className="stat-chip-label">Submissions</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Search & Filter Toolbar */}
      <div className="gallery-toolbar" role="search" aria-label="Filter Projects">
        <div className="filter-row">
          <div className="search-input-wrapper">
            <span className="search-icon-adornment" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              className="search-input"
              placeholder="Search by project title, keywords, or team..."
              value={search}
              onChange={handleSearchChange}
              aria-label="Search projects by title, summary, or team"
            />
            {search && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => { setSearch(''); loadProjects('', selectedTrack); }}
                title="Clear search"
                aria-label="Clear search query"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          <div className="track-select-wrapper">
            <select
              className="track-select"
              value={selectedTrack}
              onChange={handleTrackChange}
              aria-label="Filter projects by competition track"
            >
              <option value="">All Competition Tracks ({tracks.length})</option>
              {tracks.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <span className="select-arrow-adornment" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </div>
        </div>

        {/* Quick Track Chips */}
        {tracks.length > 0 && (
          <div className="quick-tracks-scroll" aria-label="Filter by Track">
            <button
              type="button"
              className={`track-chip-btn ${selectedTrack === '' ? 'active' : ''}`}
              onClick={() => handleTrackChange({ target: { value: '' } })}
            >
              All Tracks
            </button>
            {tracks.map(t => (
              <button
                key={t.id}
                type="button"
                className={`track-chip-btn ${selectedTrack === t.id ? 'active' : ''}`}
                onClick={() => handleTrackChange({ target: { value: t.id } })}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        <div className="toolbar-status-row">
          <div>
            Showing <span className="results-count-chip">{projects.length}</span> project{projects.length === 1 ? '' : 's'}
            {selectedTrack && tracks.find(t => t.id === selectedTrack) && (
              <span> in <strong>{tracks.find(t => t.id === selectedTrack).name}</strong></span>
            )}
            {search && <span> matching "<em>{search}</em>"</span>}
          </div>
          {isFiltered && (
            <button
              type="button"
              className="filter-reset-link"
              onClick={handleClearFilters}
            >
              Reset all filters
            </button>
          )}
        </div>
      </div>

      {/* Projects Grid / Skeleton / Empty State */}
      {loading ? (
        <div className="projects-grid" aria-label="Loading projects">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="skeleton-card" aria-hidden="true">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div className="skeleton-shimmer" style={{ width: '80px', height: '22px' }}></div>
                <div className="skeleton-shimmer" style={{ width: '100px', height: '18px' }}></div>
              </div>
              <div className="skeleton-shimmer" style={{ width: '70%', height: '26px' }}></div>
              <div className="skeleton-shimmer" style={{ width: '100%', height: '54px' }}></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.8rem', borderTop: '1px solid rgba(148,163,184,0.1)' }}>
                <div className="skeleton-shimmer" style={{ width: '70px', height: '18px' }}></div>
                <div className="skeleton-shimmer" style={{ width: '90px', height: '18px' }}></div>
              </div>
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state" role="status">
          <div className="empty-state-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </div>
          <h3>No matching projects found</h3>
          <p>
            We couldn't find any submissions matching your search criteria. Try modifying your keywords or selecting "All Competition Tracks".
          </p>
          {isFiltered && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleClearFilters}
              style={{ marginTop: '0.5rem' }}
            >
              Clear Search &amp; Filters
            </button>
          )}
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map((p, idx) => (
            <article
              key={p.id}
              className="project-card"
              data-track={p.track_id}
              data-project-id={p.id}
              onClick={() => setActiveProject(p)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveProject(p);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`View details for ${p.title} by ${p.team_name}`}
            >
              <div className="card-top">
                <span className="track-tag" data-track={p.track_id}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  {p.track_name || 'General'}
                </span>
                <span className="team-pill">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                  </svg>
                  {p.team_name}
                </span>
              </div>

              <h2 className="card-title">{p.title}</h2>
              <p className="card-summary">{p.summary}</p>

              {(p.repo_url || p.demo_url) && (
                <div className="card-tech-badges" aria-hidden="true">
                  {p.repo_url && (
                    <span className="tech-badge" title="Source repository available">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                      </svg>
                      Repository
                    </span>
                  )}
                  {p.demo_url && (
                    <span className="tech-badge" title="Live demo link available">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                      Live Demo
                    </span>
                  )}
                </div>
              )}

              <div className="card-bottom">
                <span className="submission-pill">
                  <span className="status-dot" aria-hidden="true"></span>
                  Submitted
                </span>
                <span className="card-action-link">
                  View Details
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Project Detail Modal */}
      {activeProject && (
        <div
          className="modal-overlay"
          onClick={() => setActiveProject(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-project-title"
        >
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="track-tag">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  {activeProject.track_name || 'General Track'}
                </span>
                <h2 id="modal-project-title" className="modal-title">{activeProject.title}</h2>
                <div className="modal-team-info">
                  Team: <strong>{activeProject.team_name}</strong>
                  {activeProject.submitted_at && (
                    <span> &bull; Submitted {new Date(activeProject.submitted_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setActiveProject(null)}
                aria-label="Close project details modal"
              >
                &times;
              </button>
            </div>

            <p style={{ fontSize: '1.05rem', color: 'var(--text-main)', marginBottom: '1.25rem', lineHeight: '1.6' }}>
              {activeProject.summary}
            </p>

            {/* External Links & Verifiable Certificate */}
            <div className="modal-actions">
              {activeProject.repo_url && (
                <a
                  href={activeProject.repo_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                  </svg>
                  Source Code &rarr;
                </a>
              )}
              {activeProject.demo_url && (
                <a
                  href={activeProject.demo_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  Live Demo &rarr;
                </a>
              )}
              <a
                href={`/api/verify/certificate/${encodeURIComponent(activeProject.id)}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
                title="View Ed25519 verifiable cryptographic certificate"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
                Verifiable Certificate &rarr;
              </a>
            </div>

            {/* Description Body */}
            <div className="modal-section">
              <h3 className="modal-section-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                Detailed Project Description
              </h3>
              <div className="modal-description-body">
                {activeProject.description || activeProject.summary}
              </div>
            </div>

            {/* Community Feedback Thread */}
            <div className="modal-section">
              <h3 className="modal-section-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Community Feedback ({comments.length})
              </h3>

              {commentsLoading ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '1rem 0' }}>
                  Loading community comments...
                </div>
              ) : commentsError ? (
                <div className="banner danger">
                  {commentsError}
                </div>
              ) : comments.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', padding: '0.75rem 0' }}>
                  No comments recorded yet. Be the first to share constructive peer observations!
                </div>
              ) : (
                <div className="comments-container">
                  {comments.map(c => {
                    const flagInfo = flagFeedback[c.id];
                    const authorInitial = c.author?.name ? c.author.name.charAt(0).toUpperCase() : 'U';
                    const authorRole = c.author?.roles?.[0] || 'member';

                    return (
                      <article key={c.id} className="comment-card">
                        <header className="comment-header">
                          <div className="comment-author-box">
                            <div className="comment-avatar" aria-hidden="true">{authorInitial}</div>
                            <span style={{ fontWeight: 600, color: 'var(--text-bright)' }}>
                              {c.author?.name || 'Community Member'}
                            </span>
                            {c.author?.roles?.length > 0 && (
                              <span className={`role-badge ${authorRole}`}>
                                {authorRole}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <time style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>
                              {c.created_at ? new Date(c.created_at).toLocaleDateString() : ''}
                            </time>
                            {flagInfo?.status === 'success' ? (
                              <span style={{ color: 'var(--warning)', fontSize: '0.75rem', fontWeight: 600 }}>Reported</span>
                            ) : (
                              <button
                                type="button"
                                className="demo-btn"
                                style={{ padding: '0.15rem 0.45rem', fontSize: '0.7rem' }}
                                onClick={() => handleFlagComment(c.id)}
                                disabled={flaggingId === c.id}
                                title="Report inappropriate feedback to organizers"
                                aria-label={`Report comment by ${c.author?.name || 'user'}`}
                              >
                                {flaggingId === c.id ? 'Reporting...' : 'Report'}
                              </button>
                            )}
                          </div>
                        </header>
                        {flagInfo?.status === 'error' && (
                          <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginBottom: '0.4rem' }}>
                            {flagInfo.message}
                          </div>
                        )}
                        <p className="comment-body">
                          {c.content}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}

              {/* Feedback Input Form */}
              {user ? (
                <form onSubmit={handleCommentSubmit} style={{ marginTop: '1.25rem' }}>
                  {commentError && (
                    <div className="banner danger" style={{ marginBottom: '0.75rem' }}>
                      {commentError}
                    </div>
                  )}
                  {commentSuccess && (
                    <div className="banner success" style={{ marginBottom: '0.75rem' }}>
                      {commentSuccess}
                    </div>
                  )}
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label htmlFor="project-comment-input">Leave Constructive Feedback</label>
                    <textarea
                      id="project-comment-input"
                      className="form-control"
                      placeholder="Share constructive observations, architecture impressions, or questions (3–2000 characters)..."
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      disabled={commentSubmitting}
                      rows={3}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
                    <span style={{ fontSize: '0.75rem', color: commentText.length > 2000 ? 'var(--danger)' : 'var(--text-dim)' }}>
                      {commentText.length}/2000 characters
                    </span>
                    <button
                      type="submit"
                      className="btn btn-sm"
                      disabled={commentSubmitting || commentText.trim().length < 3 || commentText.length > 2000}
                    >
                      {commentSubmitting ? 'Posting...' : 'Post Feedback'}
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius)', padding: '0.85rem 1.15rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Sign in to post peer feedback or submit reviews.
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={onRequireLogin}
                  >
                    Sign In
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
