import React, { useState, useEffect } from 'react';

export default function JudgePortal({ user, onRequireLogin }) {
  const [assignments, setAssignments] = useState([]);
  const [rubric, setRubric] = useState(null);
  const [activeProject, setActiveProject] = useState(null);
  const [scoringForm, setScoringForm] = useState({ criteria: {}, comment: '' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
    if (!activeProject || submitting) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);
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
      setSuccess(status === 'SUBMITTED' ? 'Score successfully recorded & locked!' : 'Draft score saved.');
      loadAssignments();
      selectProjectForScoring(activeProject.project.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="container">
        <div className="card-panel" style={{ textAlign: 'center', padding: '3.5rem 2rem', maxWidth: '640px', margin: '3rem auto' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', marginBottom: '1.25rem' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </div>
          <h2 style={{ fontSize: '1.65rem', marginBottom: '0.75rem' }}>Judge Authentication Required</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.75rem', lineHeight: 1.6 }}>
            Please log in as a designated judge or use the <strong>Fast-Switch</strong> bar at the top (click &ldquo;Judge A&rdquo; or &ldquo;Judge B&rdquo;) to access your assigned evaluation queue.
          </p>
          <button className="btn" onClick={onRequireLogin}>
            Log In as Judge
          </button>
        </div>
      </div>
    );
  }

  const completedCount = assignments.filter(a => a.assignment_status === 'SUBMITTED' || a.score_status === 'SUBMITTED').length;
  const pendingCount = assignments.length - completedCount;
  const completionPercentage = assignments.length > 0 ? Math.round((completedCount / assignments.length) * 100) : 0;

  // Real data calculations for score summary
  const totalWeightedScore = activeProject?.rubric?.criteria
    ? activeProject.rubric.criteria.reduce((sum, c) => sum + ((scoringForm.criteria[c.criterion_key] ?? c.min_score) * c.weight), 0)
    : 0;
  const maxPossibleWeighted = activeProject?.rubric?.criteria
    ? activeProject.rubric.criteria.reduce((sum, c) => sum + (c.max_score * c.weight), 0)
    : 0;
  const weightedPercentage = maxPossibleWeighted > 0 ? Math.round((totalWeightedScore / maxPossibleWeighted) * 100) : 0;

  return (
    <div className="container">
      {/* Dashboard Header */}
      <div className="dashboard-hero">
        <div className="dashboard-header-flex">
          <div>
            <div className="dashboard-eyebrow">
              <span className="tag-version-dot"></span>
              Judge Evaluation Workbench
            </div>
            <h1 className="dashboard-title">Review & Scoring Console</h1>
            <p className="dashboard-desc">
              Welcome, <strong>{user.name}</strong>. Evaluate assigned submissions against the official weighted rubric. Blind judging is enforced with cryptographic isolation.
            </p>
          </div>

          <div className="dashboard-actions">
            <div className="isolation-pill">
              <span className="isolation-dot"></span>
              <span>Isolation: <strong>Strict (Peer Scores Sealed)</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Real-Data Overview Stat Cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">
            <span>Assigned Projects</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          </div>
          <div className="stat-value">{assignments.length}</div>
          <div className="stat-subtext">Total submissions assigned to your queue</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <span>Completed Reviews</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div className="stat-value success">{completedCount}</div>
          <div className="stat-subtext">Official scores locked and recorded</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <span>Pending Evaluation</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div className="stat-value warning">{pendingCount}</div>
          <div className="stat-subtext">Submissions requiring your review</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <span>Workload Progress</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 700 }}>{completionPercentage}%</span>
          </div>
          <div className="stat-value primary">{completionPercentage}%</div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${completionPercentage}%` }}></div>
          </div>
        </div>
      </div>

      {/* Alerts */}
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

      {/* Split Workbench Grid: Project List (Left) + Focused Scoring (Right) */}
      <div className={`workbench-grid ${activeProject ? '' : 'single'}`}>
        {/* Left Column: Assigned Queue */}
        <div className="card-panel" style={{ height: 'fit-content' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--surface-border-subtle)', paddingBottom: '0.85rem', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0, padding: 0, border: 'none', fontSize: '1.25rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              Assigned Queue ({assignments.length})
            </h2>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              {completedCount} of {assignments.length} reviewed
            </span>
          </div>

          {assignments.length === 0 ? (
            <div className="empty-state" style={{ padding: '2.5rem 1rem' }}>
              <div className="empty-state-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <h3 style={{ fontSize: '1.1rem' }}>No Projects Assigned</h3>
              <p style={{ fontSize: '0.85rem' }}>Your evaluation queue is currently clear. Assignments are managed by the event organizer.</p>
            </div>
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
                      background: isSelected ? 'rgba(56, 189, 248, 0.08)' : 'var(--surface-raised)',
                      border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--surface-border)'}`,
                      borderRadius: 'var(--radius)',
                      padding: '1rem 1.15rem',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                      boxShadow: isSelected ? '0 0 0 1px var(--primary), var(--shadow-sm)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <span className="track-tag" style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem' }}>
                        {a.track_name || 'General'}
                      </span>
                      <span className={`status-badge ${isCompleted ? 'submitted' : 'draft'}`} style={{ fontSize: '0.72rem' }}>
                        {isCompleted ? '✓ Completed' : '● Pending'}
                      </span>
                    </div>

                    <strong style={{ fontSize: '1.05rem', color: isSelected ? 'var(--primary)' : 'var(--text-bright)', display: 'block', margin: '0.25rem 0 0.35rem 0', lineHeight: 1.3 }}>
                      {a.project_title}
                    </strong>

                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Team: <strong>{a.team_name}</strong></span>
                      <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Batch: {a.batch_id}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Focused Project Scoring Workspace */}
        {activeProject ? (
          <div className="card-panel">
            {/* Project Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--surface-border-subtle)', paddingBottom: '1.25rem', marginBottom: '1.25rem', gap: '1rem' }}>
              <div>
                <span className="track-tag" style={{ marginBottom: '0.35rem' }}>{activeProject.project.track_name || 'General Track'}</span>
                <h2 style={{ fontSize: '1.65rem', margin: '0.3rem 0 0.25rem 0', border: 'none', padding: 0 }}>
                  {activeProject.project.title}
                </h2>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                  Team: <strong style={{ color: 'var(--text-bright)' }}>{activeProject.project.team_name}</strong>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setActiveProject(null)}
                title="Close review workspace"
              >
                ✕ Close
              </button>
            </div>

            {/* Pitch & Summary */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.4rem' }}>
                Project Overview & Tagline
              </div>
              <p style={{ color: '#cbd5e1', fontSize: '0.96rem', lineHeight: 1.6, background: 'var(--surface-raised)', padding: '0.9rem 1.15rem', borderRadius: 'var(--radius)', border: '1px solid var(--surface-border-subtle)' }}>
                {activeProject.project.summary}
              </p>
            </div>

            {/* External Links */}
            {(activeProject.project.repo_url || activeProject.project.demo_url) && (
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                {activeProject.project.repo_url && (
                  <a href={activeProject.project.repo_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
                    Source Code &rarr;
                  </a>
                )}
                {activeProject.project.demo_url && (
                  <a href={activeProject.project.demo_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    Live Demo &rarr;
                  </a>
                )}
              </div>
            )}

            {/* Rubric Criteria Section */}
            <div style={{ borderTop: '1px solid var(--surface-border-subtle)', paddingTop: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.25rem', color: 'var(--text-bright)', margin: 0 }}>
                    Official Weighted Rubric
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.2rem 0 0 0' }}>
                    Adjust sliders according to criteria. Normalization applies weighting downstream.
                  </p>
                </div>

                {/* Score Summary Badge */}
                <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius)', padding: '0.5rem 0.95rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Calculated Total:</span>
                  <span style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1.2rem', fontFamily: 'var(--font-mono)' }}>
                    {totalWeightedScore} <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem', fontWeight: 500 }}>/ {maxPossibleWeighted} ({weightedPercentage}%)</span>
                  </span>
                </div>
              </div>

              {activeProject.rubric?.criteria?.map(c => {
                const val = scoringForm.criteria[c.criterion_key] ?? c.min_score;
                return (
                  <div key={c.criterion_key} className="rubric-card">
                    <div className="rubric-card-top">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <strong style={{ fontSize: '1.02rem', color: 'var(--text-bright)' }}>{c.name}</strong>
                        <span className="rubric-weight-chip">Weight: {c.weight}x</span>
                      </div>
                      <div className="rubric-score-display">
                        <span className="rubric-score-num">{val}</span>
                        <span className="rubric-score-max">/ {c.max_score}</span>
                      </div>
                    </div>

                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '0.35rem 0 0.65rem 0', lineHeight: 1.5 }}>
                      {c.description}
                    </p>

                    <input
                      type="range"
                      min={c.min_score}
                      max={c.max_score}
                      step="1"
                      value={val}
                      className="rubric-slider"
                      onChange={e => {
                        const newCriteria = { ...scoringForm.criteria, [c.criterion_key]: Number(e.target.value) };
                        setScoringForm({ ...scoringForm, criteria: newCriteria });
                      }}
                    />

                    <div className="rubric-ticks">
                      <span>Min: {c.min_score}</span>
                      <span>Mid: {Math.round((c.min_score + c.max_score) / 2)}</span>
                      <span>Max: {c.max_score}</span>
                    </div>
                  </div>
                );
              })}

              {/* Feedback Textarea */}
              <div className="form-group" style={{ marginTop: '1.5rem' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-bright)' }}>
                  Evaluation Comments & Constructive Feedback
                </label>
                <textarea
                  className="form-control"
                  placeholder="Provide constructive feedback highlighting technical execution, architectural novelty, and areas for improvement..."
                  value={scoringForm.comment}
                  onChange={e => setScoringForm({ ...scoringForm, comment: e.target.value })}
                  style={{ minHeight: '110px' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.25rem', display: 'block' }}>
                  Comments are archived in the audit log and factored into final deliberation reviews.
                </span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => handleScoreSubmit('SUBMITTED')}
                  disabled={submitting}
                >
                  {submitting ? 'Submitting...' : 'Submit Final Score'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleScoreSubmit('DRAFT')}
                  disabled={submitting}
                >
                  Save Draft Score
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="card-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center' }}>
            <div className="empty-state-icon" style={{ width: 56, height: 56 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </div>
            <h3 style={{ fontSize: '1.35rem', marginBottom: '0.5rem', color: 'var(--text-bright)' }}>Select a Project to Begin Review</h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: '440px', fontSize: '0.92rem', lineHeight: 1.6 }}>
              Choose an assigned submission from your queue on the left to inspect deliverables, check the live demo, and record your official rubric scores.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
