import React, { useState, useEffect } from 'react';

export default function JudgePortal({ user, onRequireLogin }) {
  const [assignments, setAssignments] = useState([]);
  const [rubric, setRubric] = useState(null);
  const [activeProject, setActiveProject] = useState(null);
  const [scoringForm, setScoringForm] = useState({ criteria: {}, comment: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadAssignments();
  }, [user]);

  const loadAssignments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/judge/assignments');
      if (!res.ok) throw new Error('Failed to load assignments');
      const data = await res.json();
      setAssignments(data.assignments || []);
      setRubric(data.rubric || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectProjectForScoring = async (projectId) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/judge/assignments/${projectId}`);
      if (!res.ok) throw new Error('Failed to load project details for scoring');
      const data = await res.json();
      setActiveProject(data);

      // Initialize form with existing score or default middle values
      const initialCriteria = {};
      if (data.rubric && data.rubric.criteria) {
        for (const c of data.rubric.criteria) {
          initialCriteria[c.criterion_key] = data.existingScore?.criteria?.[c.criterion_key] ?? Math.round((c.min_score + c.max_score) / 2);
        }
      }
      setScoringForm({
        criteria: initialCriteria,
        comment: data.existingScore?.comment || '',
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleScoreSubmit = async (status = 'SUBMITTED') => {
    if (!activeProject) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/judge/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: activeProject.project.id,
          criteria: scoringForm.criteria,
          comment: scoringForm.comment,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit score');
      setSuccess(status === 'SUBMITTED' ? 'Score successfully recorded!' : 'Draft score saved.');
      loadAssignments();
      selectProjectForScoring(activeProject.project.id);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!user) {
    return (
      <div className="container">
        <div className="card-panel" style={{ textAlign: 'center', padding: '3rem' }}>
          <h2>Judge Authentication Required</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Please log in as a judge or click "Judge A" in the fast-switch bar above to access your assigned queue.
          </p>
          <button className="btn" onClick={onRequireLogin}>Log In as Judge</button>
        </div>
      </div>
    );
  }

  const completedCount = assignments.filter(a => a.assignment_status === 'SUBMITTED' || a.score_status === 'SUBMITTED').length;

  return (
    <div className="container">
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>Judge Review Workbench</h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Welcome, <strong>{user.name}</strong>. Score your assigned projects according to the weighted rubric. Peer scores are strictly isolated.
          </p>
        </div>
        <div style={{ background: 'var(--surface-raised)', padding: '0.75rem 1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--surface-border)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Workload Progress:</span>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)' }}>
            {completedCount} / {assignments.length} Completed
          </div>
        </div>
      </div>

      {error && <div className="banner danger">{error}</div>}
      {success && <div className="banner" style={{ background: '#064e3b', border: '1px solid #10b981', color: '#d1fae5' }}>{success}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: activeProject ? '1fr 1.3fr' : '1fr', gap: '1.5rem' }}>
        {/* Assigned Projects List */}
        <div className="card-panel">
          <h2>Assigned Projects ({assignments.length})</h2>
          {assignments.length === 0 ? (
            <div className="empty-state">No projects assigned to your judging queue yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {assignments.map(a => {
                const isCompleted = a.assignment_status === 'SUBMITTED' || a.score_status === 'SUBMITTED';
                const isSelected = activeProject?.project?.id === a.project_id;
                return (
                  <div
                    key={a.assignment_id}
                    onClick={() => selectProjectForScoring(a.project_id)}
                    style={{
                      background: isSelected ? '#1e3a8a33' : 'var(--surface-raised)',
                      border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--surface-border)'}`,
                      borderRadius: 'var(--radius)',
                      padding: '1rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <span className="track-tag">{a.track_name || 'General'}</span>
                      <span className={`status-badge ${isCompleted ? 'submitted' : 'draft'}`}>
                        {isCompleted ? 'Completed' : 'Pending Review'}
                      </span>
                    </div>
                    <strong style={{ fontSize: '1.05rem', color: 'var(--text-main)', display: 'block', margin: '0.3rem 0' }}>
                      {a.project_title}
                    </strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Team: {a.team_name} &bull; Batch: {a.batch_id}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Scoring Panel for Selected Project */}
        {activeProject && (
          <div className="card-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <span className="track-tag">{activeProject.project.track_name}</span>
                <h2 style={{ fontSize: '1.5rem', marginTop: '0.4rem', borderBottom: 'none', paddingBottom: 0 }}>
                  {activeProject.project.title}
                </h2>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Team: {activeProject.project.team_name}
                </div>
              </div>
              <button className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} onClick={() => setActiveProject(null)}>
                &times;
              </button>
            </div>

            <p style={{ color: '#cbd5e1', fontSize: '0.95rem', marginBottom: '1rem' }}>
              {activeProject.project.summary}
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {activeProject.project.repo_url && (
                <a href={activeProject.project.repo_url} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>
                  Repository &rarr;
                </a>
              )}
              {activeProject.project.demo_url && (
                <a href={activeProject.project.demo_url} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>
                  Live Demo &rarr;
                </a>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Official Weighted Rubric</h3>

              {activeProject.rubric?.criteria?.map(c => {
                const val = scoringForm.criteria[c.criterion_key] ?? c.min_score;
                return (
                  <div key={c.criterion_key} style={{ marginBottom: '1.25rem', background: 'var(--surface-raised)', padding: '1rem', borderRadius: 'var(--radius)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <strong>{c.name} (Weight: {c.weight}x)</strong>
                      <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '1.1rem' }}>
                        {val} / {c.max_score}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                      {c.description}
                    </p>
                    <input 
                      type="range"
                      min={c.min_score}
                      max={c.max_score}
                      step="1"
                      value={val}
                      style={{ width: '100%', cursor: 'pointer' }}
                      onChange={e => {
                        const newCriteria = { ...scoringForm.criteria, [c.criterion_key]: Number(e.target.value) };
                        setScoringForm({ ...scoringForm, criteria: newCriteria });
                      }}
                    />
                  </div>
                );
              })}

              <div className="form-group" style={{ marginTop: '1.25rem' }}>
                <label>Judge Evaluation Feedback & Comments</label>
                <textarea 
                  className="form-control" 
                  placeholder="Provide constructive feedback on functionality, architecture, and innovation..."
                  value={scoringForm.comment}
                  onChange={e => setScoringForm({ ...scoringForm, comment: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button type="button" className="btn" onClick={() => handleScoreSubmit('SUBMITTED')}>
                  Submit Final Score
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => handleScoreSubmit('DRAFT')}>
                  Save Draft
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
