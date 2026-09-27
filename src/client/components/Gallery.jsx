import React, { useState, useEffect } from 'react';

export default function Gallery() {
  const [projects, setProjects] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTrack, setSelectedTrack] = useState('');
  const [activeProject, setActiveProject] = useState(null);

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
          </div>
        </div>
      )}
    </div>
  );
}
