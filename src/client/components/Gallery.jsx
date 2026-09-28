import React, { useState, useEffect } from 'react';

export default function Gallery({ user, onRequireLogin }) {
  const [projects, setProjects] = useState([]);
  const [tracks, setTracks] = useState([]);
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
    // Fetch tracks
    fetch('/api/events')
      .then(res => res.json())
      .then(data => {
        if (data.events && data.events.length > 0) {
          fetch(`/api/events/${data.events[0].id}`)
            .then(r => r.json())
            .then(evtData => setTracks(evtData.tracks || []));
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
        [commentId]: { status: 'success', message: 'Reported for review' }
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

  return (
    <div className="container">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>Hackathon Project Gallery</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Public gallery featuring all submitted projects from the hackathon tracks.
        </p>
      </div>

      <div className="filter-row">
        <input 
          type="text" 
          className="search-input" 
          placeholder="Search by title, keywords, or team..." 
          value={search}
          onChange={handleSearchChange}
        />
        <select 
          className="track-select" 
          value={selectedTrack} 
          onChange={handleTrackChange}
        >
          <option value="">All Tracks</option>
          {tracks.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="empty-state">Loading gallery projects...</div>
      ) : projects.length === 0 ? (
        <div className="empty-state">No projects found matching your search.</div>
      ) : (
        <div className="projects-grid">
          {projects.map(p => (
            <div 
              key={p.id} 
              className="project-card" 
              onClick={() => setActiveProject(p)}
            >
              <div className="card-top">
                <span className="track-tag">{p.track_name || 'General'}</span>
                <span>{p.team_name}</span>
              </div>
              <h3 className="card-title">{p.title}</h3>
              <p className="card-summary">{p.summary}</p>
              <div className="card-bottom">
                <span style={{ color: 'var(--success)' }}>Submitted</span>
                <span>{p.submitted_at ? new Date(p.submitted_at).toLocaleDateString() : ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Project Detail Modal */}
      {activeProject && (
        <div className="modal-overlay" onClick={() => setActiveProject(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <span className="track-tag">{activeProject.track_name || 'General'}</span>
                <h2 style={{ fontSize: '1.6rem', marginTop: '0.5rem' }}>{activeProject.title}</h2>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Team: {activeProject.team_name}</div>
              </div>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '0.2rem 0.5rem' }} 
                onClick={() => setActiveProject(null)}
              >
                &times;
              </button>
            </div>

            <p style={{ fontSize: '1.05rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              {activeProject.summary}
            </p>

            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
              {activeProject.repo_url && (
                <a href={activeProject.repo_url} target="_blank" rel="noreferrer" className="btn" style={{ fontSize: '0.85rem' }}>
                  Source Code &rarr;
                </a>
              )}
              {activeProject.demo_url && (
                <a href={activeProject.demo_url} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
                  Live Demo &rarr;
                </a>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '1rem' }}>
              <h4 style={{ marginBottom: '0.5rem' }}>Description</h4>
              <p style={{ whiteSpace: 'pre-line', color: '#cbd5e1' }}>
                {activeProject.description || activeProject.summary}
              </p>
            </div>

            <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '1.25rem', marginTop: '1.25rem' }}>
              <h4 style={{ marginBottom: '0.75rem', fontSize: '1.1rem' }}>
                Community Feedback ({comments.length})
              </h4>

              {/* Comments List */}
              {commentsLoading ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '0.75rem 0' }}>
                  Loading community comments...
                </div>
              ) : commentsError ? (
                <div className="banner danger" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  {commentsError}
                </div>
              ) : comments.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', marginBottom: '1rem' }}>
                  No comments yet. Be the first to share constructive feedback!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  {comments.map(c => {
                    const flagInfo = flagFeedback[c.id];
                    return (
                      <div
                        key={c.id}
                        style={{
                          background: 'var(--surface-raised)',
                          border: '1px solid var(--surface-border)',
                          borderRadius: 'var(--radius)',
                          padding: '0.75rem 1rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{c.author?.name || 'Community Member'}</span>
                            {c.author?.roles?.length > 0 && (
                              <span className={`role-badge ${c.author.roles[0] || 'visitor'}`} style={{ fontSize: '0.65rem' }}>
                                {c.author.roles[0]}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>
                              {c.created_at ? new Date(c.created_at).toLocaleDateString() : ''}
                            </span>
                            {flagInfo?.status === 'success' ? (
                              <span style={{ color: 'var(--warning)', fontSize: '0.75rem' }}>Reported</span>
                            ) : (
                              <button
                                type="button"
                                className="demo-btn"
                                style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}
                                onClick={() => handleFlagComment(c.id)}
                                disabled={flaggingId === c.id}
                                title="Report inappropriate comment"
                                aria-label={`Report comment by ${c.author?.name || 'user'}`}
                              >
                                {flaggingId === c.id ? 'Reporting...' : 'Report'}
                              </button>
                            )}
                          </div>
                        </div>
                        {flagInfo?.status === 'error' && (
                          <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                            {flagInfo.message}
                          </div>
                        )}
                        <p style={{ margin: 0, fontSize: '0.9rem', color: '#cbd5e1', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {c.content}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Comment Submission or Login Notice */}
              {user ? (
                <form onSubmit={handleCommentSubmit} style={{ marginTop: '1rem' }}>
                  {commentError && (
                    <div className="banner danger" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                      {commentError}
                    </div>
                  )}
                  {commentSuccess && (
                    <div className="banner" style={{ background: '#064e3b', border: '1px solid #10b981', color: '#d1fae5', padding: '0.5rem 1rem', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                      {commentSuccess}
                    </div>
                  )}
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label htmlFor="project-comment-input">Leave Constructive Feedback</label>
                    <textarea
                      id="project-comment-input"
                      className="form-control"
                      placeholder="Share constructive observations or questions about this project (3-2000 characters)..."
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      disabled={commentSubmitting}
                      rows={3}
                      style={{ minHeight: '70px', fontSize: '0.9rem' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button
                      type="submit"
                      className="btn"
                      disabled={commentSubmitting || commentText.trim().length < 3}
                      style={{ fontSize: '0.85rem', padding: '0.45rem 1rem' }}
                    >
                      {commentSubmitting ? 'Posting...' : 'Post Comment'}
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Sign in to post comments or report feedback.
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
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
