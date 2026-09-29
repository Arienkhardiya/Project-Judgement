import React, { useState, useEffect } from 'react';

export default function JudgePairwiseView({ user }) {
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'pending' | 'completed'

  // Focused Pair State
  const [selectedPairId, setSelectedPairId] = useState(null);
  const [pairDetail, setPairDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Decision Form State
  const [decision, setDecision] = useState(null); // 'A' | 'B' | 'TIE' | null
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (user) {
      loadPairAssignments();
    }
  }, [user]);

  // Keyboard navigation & decision shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;

      if (!pairDetail || pairDetail.pair_status === 'COMPLETED' || pairDetail.comparison_id) {
        if (e.key === 'Escape') {
          setSelectedPairId(null);
        }
        return;
      }

      if (e.key === '1') {
        e.preventDefault();
        setDecision('A');
      } else if (e.key === '2') {
        e.preventDefault();
        setDecision('B');
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setDecision('TIE');
      } else if (e.key === 'Enter' && decision && !submitting) {
        e.preventDefault();
        handleSubmitComparison();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedPairId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pairDetail, decision, submitting]);

  const loadPairAssignments = async (selectNextId = null) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/judge/pairwise/assignments');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}: Failed to load pairwise assignments`);
      }
      const data = await res.json();
      const list = data.pairs || [];
      setPairs(list);

      // Auto-select first pending pair or keep selected if valid
      if (selectNextId) {
        loadPairDetail(selectNextId);
      } else if (list.length > 0 && !selectedPairId) {
        const firstPending = list.find(p => p.pair_status === 'PENDING');
        if (firstPending) {
          loadPairDetail(firstPending.pair_id);
        } else {
          loadPairDetail(list[0].pair_id);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPairDetail = async (pairId) => {
    if (!pairId) return;
    setSelectedPairId(pairId);
    setLoadingDetail(true);
    setFormError(null);
    setDecision(null);
    setComment('');
    try {
      const res = await fetch(`/api/judge/pairwise/assignments/${encodeURIComponent(pairId)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}: Failed to fetch pair details`);
      }
      const data = await res.json();
      const p = data.pair;
      setPairDetail(p);

      // If already completed, populate previous verdict
      if (p.pair_status === 'COMPLETED' || p.comparison_id) {
        if (p.is_tie === 1 || p.is_tie === true) {
          setDecision('TIE');
        } else if (p.winner_id === p.project_a_id) {
          setDecision('A');
        } else if (p.winner_id === p.project_b_id) {
          setDecision('B');
        }
        setComment(p.comment || '');
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSubmitComparison = async () => {
    if (!pairDetail || submitting || !decision) return;
    setSubmitting(true);
    setFormError(null);
    setSuccess(null);

    const isTie = decision === 'TIE';
    let winnerId = null;
    if (!isTie) {
      winnerId = decision === 'A' ? pairDetail.project_a_id : pairDetail.project_b_id;
    }

    try {
      const res = await fetch('/api/judge/pairwise/comparisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair_id: pairDetail.pair_id,
          winner_id: winnerId,
          is_tie: isTie,
          comment: comment.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Submission failed with HTTP ${res.status}`);
      }

      setSuccess('Pairwise comparison successfully recorded and locked!');

      // Find next pending pair
      const remainingPending = pairs.filter(
        p => p.pair_status === 'PENDING' && p.pair_id !== pairDetail.pair_id
      );
      const nextPairId = remainingPending.length > 0 ? remainingPending[0].pair_id : pairDetail.pair_id;

      // Reload assignments list and advance
      await loadPairAssignments(nextPairId);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Metrics
  const completedPairs = pairs.filter(p => p.pair_status === 'COMPLETED');
  const pendingPairs = pairs.filter(p => p.pair_status === 'PENDING');
  const completionPercentage = pairs.length > 0 ? Math.round((completedPairs.length / pairs.length) * 100) : 0;

  // Filtered List
  const filteredPairs = pairs.filter(p => {
    if (filter === 'pending') return p.pair_status === 'PENDING';
    if (filter === 'completed') return p.pair_status === 'COMPLETED';
    return true;
  });

  const isCurrentPairCompleted = pairDetail && (pairDetail.pair_status === 'COMPLETED' || Boolean(pairDetail.comparison_id));

  return (
    <div className="pairwise-workbench">
      {/* Pairwise Stat Cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">
            <span>Pairwise Assignments</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
              <path d="M10 7h4v4"/>
            </svg>
          </div>
          <div className="stat-value">{pairs.length}</div>
          <div className="stat-subtext">Total head-to-head pairs assigned</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <span>Completed Comparisons</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div className="stat-value success">{completedPairs.length}</div>
          <div className="stat-subtext">Decisions locked into Bradley-Terry model</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <span>Pending Comparisons</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div className="stat-value warning">{pendingPairs.length}</div>
          <div className="stat-subtext">Pairs awaiting your evaluation</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <span>Pairwise Progress</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 700 }}>
              {completionPercentage}%
            </span>
          </div>
          <div className="stat-value primary">{completionPercentage}%</div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${completionPercentage}%` }}></div>
          </div>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="banner danger" style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>⛔</span>
            <div><strong>Error:</strong> {error}</div>
          </div>
        </div>
      )}

      {success && (
        <div className="banner success" style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>✅</span>
            <div>{success}</div>
          </div>
        </div>
      )}

      {/* Main Split Grid: Queue on Left, Arena on Right */}
      <div className={`workbench-grid ${selectedPairId ? '' : 'single'}`}>
        {/* Left Column: Assigned Pairwise Queue */}
        <div className="card-panel" style={{ height: 'fit-content' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--surface-border-subtle)', paddingBottom: '0.85rem', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0, padding: 0, border: 'none', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"/>
                <line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/>
                <line x1="3" y1="12" x2="3.01" y2="12"/>
                <line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              Comparison Queue ({pairs.length})
            </h2>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              {completedPairs.length} of {pairs.length} done
            </span>
          </div>

          {/* Filter Bar */}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem' }}>
            <button
              type="button"
              className={`btn btn-xs ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter('all')}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
            >
              All ({pairs.length})
            </button>
            <button
              type="button"
              className={`btn btn-xs ${filter === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter('pending')}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
            >
              Pending ({pendingPairs.length})
            </button>
            <button
              type="button"
              className={`btn btn-xs ${filter === 'completed' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter('completed')}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
            >
              Completed ({completedPairs.length})
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
              Loading assigned comparison pairs...
            </div>
          ) : filteredPairs.length === 0 ? (
            <div className="empty-state" style={{ padding: '2.5rem 1rem' }}>
              <div className="empty-state-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <h3 style={{ fontSize: '1.1rem' }}>
                {filter === 'all'
                  ? 'No Pairwise Assignments'
                  : filter === 'pending'
                  ? 'No Pending Pairs'
                  : 'No Completed Pairs'}
              </h3>
              <p style={{ fontSize: '0.85rem' }}>
                {filter === 'all'
                  ? 'Your pairwise queue is clear. The event organizer will generate and distribute comparison pairs.'
                  : filter === 'pending'
                  ? 'Great work! You have completed all assigned pairwise comparisons in this queue.'
                  : 'Submit comparisons to populate this view.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filteredPairs.map((p, index) => {
                const isCompleted = p.pair_status === 'COMPLETED';
                const isSelected = selectedPairId === p.pair_id;
                return (
                  <div
                    key={p.pair_id}
                    onClick={() => loadPairDetail(p.pair_id)}
                    style={{
                      background: isSelected ? 'rgba(56, 189, 248, 0.08)' : 'var(--surface-raised)',
                      border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--surface-border)'}`,
                      borderRadius: 'var(--radius)',
                      padding: '0.9rem 1.1rem',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                      boxShadow: isSelected ? '0 0 0 1px var(--primary), var(--shadow-sm)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                        Pair #{index + 1}
                      </span>
                      <span className={`status-badge ${isCompleted ? 'submitted' : 'draft'}`} style={{ fontSize: '0.72rem' }}>
                        {isCompleted ? '✓ Completed' : '● Pending'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.3rem 0' }}>
                      <strong style={{ fontSize: '0.95rem', color: isSelected ? 'var(--primary)' : 'var(--text-bright)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.project_a_title}
                      </strong>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', padding: '0.1rem 0.35rem', background: 'var(--surface-card)', borderRadius: '4px' }}>
                        VS
                      </span>
                      <strong style={{ fontSize: '0.95rem', color: isSelected ? 'var(--primary)' : 'var(--text-bright)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {p.project_b_title}
                      </strong>
                    </div>

                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem' }}>
                      <span>Track: <strong>{p.track_id || 'General'}</strong></span>
                      {isCompleted && (
                        <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                          {p.is_tie ? 'Result: Tie' : p.winner_id === p.project_a_id ? 'Winner: Proj A' : 'Winner: Proj B'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Head-to-Head Comparison Arena */}
        {selectedPairId ? (
          <div className="card-panel">
            {loadingDetail ? (
              <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
                Loading head-to-head project deliverables...
              </div>
            ) : pairDetail ? (
              <div>
                {/* Arena Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--surface-border-subtle)', paddingBottom: '1rem', marginBottom: '1.5rem', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
                      <span className="track-tag">{pairDetail.track_id || 'General Track'}</span>
                      <span className={`status-badge ${isCurrentPairCompleted ? 'submitted' : 'draft'}`}>
                        {isCurrentPairCompleted ? '✓ Comparison Recorded' : '● Pending Decision'}
                      </span>
                    </div>
                    <h2 style={{ fontSize: '1.45rem', margin: '0.2rem 0', border: 'none', padding: 0 }}>
                      Head-to-Head Pairwise Comparison
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', margin: 0 }}>
                      Evaluate both submissions side-by-side. Decisions directly feed the Bradley-Terry maximum-likelihood solver.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSelectedPairId(null)}
                    title="Close comparison workspace"
                  >
                    ✕ Close
                  </button>
                </div>

                {/* Side-by-Side Deliverable Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                  {/* Project A Card (Canonical Left) */}
                  <div
                    style={{
                      background: decision === 'A' ? 'rgba(56, 189, 248, 0.08)' : 'var(--surface-raised)',
                      border: `2px solid ${decision === 'A' ? 'var(--primary)' : 'var(--surface-border)'}`,
                      borderRadius: 'var(--radius-lg)',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'all var(--transition-fast)',
                      position: 'relative',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(56, 189, 248, 0.15)', color: '#7dd3fc', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
                          Project A
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                          {pairDetail.project_a_id}
                        </span>
                      </div>

                      <h3 style={{ fontSize: '1.25rem', color: 'var(--text-bright)', margin: '0.35rem 0 0.25rem 0' }}>
                        {pairDetail.project_a_title}
                      </h3>

                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
                        Team: <strong style={{ color: 'var(--text-bright)' }}>{pairDetail.team_a_name || 'Independent'}</strong>
                      </div>

                      <div style={{ fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.55, background: 'var(--surface-card)', padding: '0.85rem', borderRadius: 'var(--radius)', border: '1px solid var(--surface-border-subtle)', marginBottom: '1rem' }}>
                        {pairDetail.project_a_summary}
                      </div>

                      {pairDetail.project_a_description && pairDetail.project_a_description !== pairDetail.project_a_summary && (
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '1rem', maxHeight: '120px', overflowY: 'auto' }}>
                          {pairDetail.project_a_description}
                        </div>
                      )}

                      {/* Links */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                        {pairDetail.project_a_repo_url && (
                          <a
                            href={pairDetail.project_a_repo_url}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary btn-xs"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem' }}
                          >
                            Repository &rarr;
                          </a>
                        )}
                        {pairDetail.project_a_demo_url && (
                          <a
                            href={pairDetail.project_a_demo_url}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary btn-xs"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem' }}
                          >
                            Live Demo &rarr;
                          </a>
                        )}
                      </div>
                    </div>

                    {!isCurrentPairCompleted && (
                      <button
                        type="button"
                        className={`btn ${decision === 'A' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setDecision('A')}
                        style={{ width: '100%', marginTop: '0.5rem', fontWeight: 700 }}
                      >
                        {decision === 'A' ? '✓ Project A Selected as Winner' : 'Vote Project A as Winner'}
                        <span className="kbd-badge" style={{ marginLeft: '0.4rem' }}>[1]</span>
                      </button>
                    )}
                  </div>

                  {/* Project B Card (Canonical Right) */}
                  <div
                    style={{
                      background: decision === 'B' ? 'rgba(56, 189, 248, 0.08)' : 'var(--surface-raised)',
                      border: `2px solid ${decision === 'B' ? 'var(--primary)' : 'var(--surface-border)'}`,
                      borderRadius: 'var(--radius-lg)',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'all var(--transition-fast)',
                      position: 'relative',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(168, 85, 247, 0.15)', color: '#d8b4fe', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
                          Project B
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                          {pairDetail.project_b_id}
                        </span>
                      </div>

                      <h3 style={{ fontSize: '1.25rem', color: 'var(--text-bright)', margin: '0.35rem 0 0.25rem 0' }}>
                        {pairDetail.project_b_title}
                      </h3>

                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
                        Team: <strong style={{ color: 'var(--text-bright)' }}>{pairDetail.team_b_name || 'Independent'}</strong>
                      </div>

                      <div style={{ fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.55, background: 'var(--surface-card)', padding: '0.85rem', borderRadius: 'var(--radius)', border: '1px solid var(--surface-border-subtle)', marginBottom: '1rem' }}>
                        {pairDetail.project_b_summary}
                      </div>

                      {pairDetail.project_b_description && pairDetail.project_b_description !== pairDetail.project_b_summary && (
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '1rem', maxHeight: '120px', overflowY: 'auto' }}>
                          {pairDetail.project_b_description}
                        </div>
                      )}

                      {/* Links */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                        {pairDetail.project_b_repo_url && (
                          <a
                            href={pairDetail.project_b_repo_url}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary btn-xs"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem' }}
                          >
                            Repository &rarr;
                          </a>
                        )}
                        {pairDetail.project_b_demo_url && (
                          <a
                            href={pairDetail.project_b_demo_url}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary btn-xs"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem' }}
                          >
                            Live Demo &rarr;
                          </a>
                        )}
                      </div>
                    </div>

                    {!isCurrentPairCompleted && (
                      <button
                        type="button"
                        className={`btn ${decision === 'B' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setDecision('B')}
                        style={{ width: '100%', marginTop: '0.5rem', fontWeight: 700 }}
                      >
                        {decision === 'B' ? '✓ Project B Selected as Winner' : 'Vote Project B as Winner'}
                        <span className="kbd-badge" style={{ marginLeft: '0.4rem' }}>[2]</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Verdict Section */}
                <div style={{ borderTop: '1px solid var(--surface-border-subtle)', paddingTop: '1.25rem' }}>
                  {formError && (
                    <div className="banner danger" style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>⛔</span>
                        <div><strong>Error:</strong> {formError}</div>
                      </div>
                    </div>
                  )}

                  {isCurrentPairCompleted ? (
                    <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius)', padding: '1.25rem', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--success)', fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.4rem' }}>
                        <span>✓</span> Comparison Recorded & Sealed
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
                        {pairDetail.is_tie ? (
                          <span>Verdict: <strong>Tied (Equally Matched)</strong></span>
                        ) : pairDetail.winner_id === pairDetail.project_a_id ? (
                          <span>Verdict: <strong>Project A ({pairDetail.project_a_title}) won</strong></span>
                        ) : (
                          <span>Verdict: <strong>Project B ({pairDetail.project_b_title}) won</strong></span>
                        )}
                      </p>
                      {pairDetail.comment && (
                        <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#cbd5e1', fontStyle: 'italic', background: 'var(--surface-card)', padding: '0.6rem 0.85rem', borderRadius: 'var(--radius)' }}>
                          &ldquo;{pairDetail.comment}&rdquo;
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-bright)', display: 'block', marginBottom: '0.6rem' }}>
                          Select Comparative Verdict
                        </label>

                        {/* Three Choice Buttons */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                          <button
                            type="button"
                            className={`btn ${decision === 'A' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setDecision('A')}
                            style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}
                          >
                            <span style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                              Project A Wins <span className="kbd-badge">[1]</span>
                            </span>
                            <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>{pairDetail.project_a_title}</span>
                          </button>

                          <button
                            type="button"
                            className={`btn ${decision === 'TIE' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setDecision('TIE')}
                            style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}
                          >
                            <span style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                              Tie / Even Match <span className="kbd-badge">[T]</span>
                            </span>
                            <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>Both projects are equally merited</span>
                          </button>

                          <button
                            type="button"
                            className={`btn ${decision === 'B' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setDecision('B')}
                            style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}
                          >
                            <span style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                              Project B Wins <span className="kbd-badge">[2]</span>
                            </span>
                            <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>{pairDetail.project_b_title}</span>
                          </button>
                        </div>
                      </div>

                      {/* Optional Comment Field */}
                      <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                        <label style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-bright)' }}>
                          Comparative Rationale & Notes (Optional)
                        </label>
                        <textarea
                          className="form-control"
                          placeholder="Note key architectural differences, execution quality, or rationale behind this head-to-head comparison..."
                          value={comment}
                          onChange={e => setComment(e.target.value)}
                          style={{ minHeight: '85px' }}
                          disabled={submitting}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.25rem', display: 'block' }}>
                          Notes are recorded in the event audit log and assist organizers in final deliberation.
                        </span>
                      </div>

                      {/* Submit Action */}
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={handleSubmitComparison}
                          disabled={submitting || !decision}
                        >
                          {submitting ? 'Recording Verdict...' : 'Submit Final Verdict'}
                          <span className="kbd-badge" style={{ marginLeft: '0.35rem' }}>[Enter]</span>
                        </button>

                        {!decision && (
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            Please select a verdict (Project A, Tie, or Project B) to proceed.
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="card-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center' }}>
            <div className="empty-state-icon" style={{ width: 56, height: 56 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <path d="M10 7h4v4"/>
              </svg>
            </div>
            <h3 style={{ fontSize: '1.35rem', marginBottom: '0.5rem', color: 'var(--text-bright)' }}>
              Select a Pair to Begin Comparison
            </h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: '440px', fontSize: '0.92rem', lineHeight: 1.6 }}>
              Choose an assigned head-to-head pair from your queue on the left to inspect deliverables side-by-side and record your comparative judgment.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
