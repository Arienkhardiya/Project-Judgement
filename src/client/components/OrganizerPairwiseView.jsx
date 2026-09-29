import React, { useState, useEffect } from 'react';

export default function OrganizerPairwiseView({ user, selectedEventId, events = [], eventDetails }) {
  const [statusData, setStatusData] = useState(null);
  const [rankingsData, setRankingsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Filters
  const [selectedTrack, setSelectedTrack] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Generation Modal & Form
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateTrack, setGenerateTrack] = useState('');
  const [comparisonsPerProject, setComparisonsPerProject] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [generateResult, setGenerateResult] = useState(null);

  const activeEventId = selectedEventId || (events.length > 0 ? events[0].id : 'evt_01');

  // Load Status and Rankings on mount or event change
  useEffect(() => {
    loadPairwiseData();
  }, [activeEventId, selectedTrack]);

  const loadPairwiseData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const eventParam = activeEventId ? `?event_id=${encodeURIComponent(activeEventId)}` : '';
      const trackParam = selectedTrack ? `&track_id=${encodeURIComponent(selectedTrack)}` : '';

      const [statusRes, rankingsRes] = await Promise.all([
        fetch(`/api/organizer/pairwise/status${eventParam}`),
        fetch(`/api/organizer/pairwise/rankings${eventParam}${trackParam}`),
      ]);

      if (!statusRes.ok) {
        const errData = await statusRes.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${statusRes.status}: Failed to fetch pairwise status`);
      }
      if (!rankingsRes.ok) {
        const errData = await rankingsRes.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${rankingsRes.status}: Failed to fetch pairwise rankings`);
      }

      const statusJson = await statusRes.json();
      const rankingsJson = await rankingsRes.json();

      setStatusData(statusJson);
      setRankingsData(rankingsJson);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleGenerateAssignments = async (e) => {
    e.preventDefault();
    setGenerating(true);
    setGenerateError(null);
    setGenerateResult(null);

    try {
      const res = await fetch('/api/organizer/pairwise/assignments/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: activeEventId,
          track_id: generateTrack || undefined,
          comparisons_per_project: Number(comparisonsPerProject) || 5,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Assignment generation failed with HTTP ${res.status}`);
      }

      setGenerateResult(data);
      setSuccess(`Assignment generated: Created ${data.createdCount} pair assignments.`);
      // Reload both status and rankings
      await loadPairwiseData(true);
    } catch (err) {
      setGenerateError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const tracks = eventDetails?.tracks || [];

  // Filter rankings by search query
  const projects = rankingsData?.projects || [];
  const filteredProjects = projects.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.title?.toLowerCase().includes(q) ||
      p.project_id?.toLowerCase().includes(q) ||
      p.team_name?.toLowerCase().includes(q) ||
      p.track_name?.toLowerCase().includes(q)
    );
  });

  const totals = statusData?.totals || { total: 0, completed: 0, pending: 0, completion_percentage: 0 };
  const judges = statusData?.judges || [];

  return (
    <div className="pairwise-organizer-panel">
      {/* Top Banner / Hero Controls */}
      <div className="card-panel" style={{ marginBottom: '1.75rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="dashboard-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
              <span className="tag-version-dot"></span>
              Pairwise Judging Control Plane &bull; Bonus B
            </div>
            <h2 style={{ fontSize: '1.75rem', margin: '0 0 0.4rem 0', border: 'none', padding: 0 }}>
              Bradley-Terry Pairwise Evaluation Engine
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', maxWidth: '720px', lineHeight: 1.55, margin: 0 }}>
              Algorithmic pair distribution using regular circulant chord graphs. Head-to-head comparisons are solved via iterative Minorization-Maximization into regularized Bradley-Terry project strengths (&lambda;).
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => loadPairwiseData(true)}
              disabled={refreshing || loading}
              title="Refresh Pairwise Status & Rankings"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6"/>
                <path d="M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              {refreshing ? 'Refreshing...' : 'Refresh State'}
            </button>

            <button
              type="button"
              className="btn"
              onClick={() => {
                setGenerateError(null);
                setGenerateResult(null);
                setShowGenerateModal(true);
              }}
              style={{ fontWeight: 700 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Generate Pair Assignments
            </button>
          </div>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="banner danger" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>⛔</span>
            <div><strong>Error:</strong> {error}</div>
          </div>
        </div>
      )}

      {success && (
        <div className="banner success" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>✅</span>
            <div>{success}</div>
          </div>
        </div>
      )}

      {/* Under-Coverage Notification Banner (if reported) */}
      {generateResult?.metadata?.underCoverageReason && (
        <div className="banner warning" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
            <span style={{ fontSize: '1.25rem' }}>⚠️</span>
            <div>
              <strong>Under-Coverage Advisory:</strong>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.88rem', lineHeight: 1.5 }}>
                {generateResult.metadata.underCoverageReason}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Event Overview KPI Cards */}
      <div className="stat-grid" style={{ marginBottom: '1.75rem' }}>
        <div className="stat-card">
          <div className="stat-label">
            <span>Total Assigned Pairs</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
              <path d="M10 7h4v4"/>
            </svg>
          </div>
          <div className="stat-value">{totals.total}</div>
          <div className="stat-subtext">Circulant pairwise assignments distributed</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <span>Completed Comparisons</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div className="stat-value success">{totals.completed}</div>
          <div className="stat-subtext">Head-to-head outcomes recorded by judges</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <span>Pending Comparisons</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div className="stat-value warning">{totals.pending}</div>
          <div className="stat-subtext">Pairs awaiting judge deliberation</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <span>Completion Rate</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 700 }}>
              {totals.completion_percentage}%
            </span>
          </div>
          <div className="stat-value primary">{totals.completion_percentage}%</div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${totals.completion_percentage}%` }}></div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <span>Active Judges</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div className="stat-value">{judges.length}</div>
          <div className="stat-subtext">Evaluators with allocated comparison queues</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <span>Bradley-Terry Solver</span>
            <span className={`status-badge ${rankingsData?.converged ? 'submitted' : 'draft'}`} style={{ fontSize: '0.7rem' }}>
              {rankingsData?.converged ? 'Converged' : 'Pending'}
            </span>
          </div>
          <div className="stat-value" style={{ fontSize: '1.4rem' }}>
            {rankingsData?.iterations || 0} <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontWeight: 500 }}>iter</span>
          </div>
          <div className="stat-subtext">{rankingsData?.total_comparisons || 0} comparisons solved</div>
        </div>
      </div>

      {/* 2-Column Section: Judge Progress Table (Left) + Model Diagnostics (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '1.75rem' }}>
        {/* Judge Pairwise Progress Table */}
        <div className="card-panel" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ margin: 0, padding: 0, border: 'none', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              Judge Allocation & Workload ({judges.length})
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              Blind judging enforced
            </span>
          </div>

          {judges.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem 1rem' }}>
              <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                No pairwise assignments generated yet. Click &ldquo;Generate Pair Assignments&rdquo; above to distribute comparisons.
              </p>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Judge</th>
                    <th>Assigned</th>
                    <th>Completed</th>
                    <th>Pending</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {judges.map((j) => {
                    const pct = j.total_assigned > 0 ? Math.round((j.completed / j.total_assigned) * 100) : 0;
                    return (
                      <tr key={j.judge_id}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-bright)' }}>{j.judge_name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{j.judge_id}</div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{j.total_assigned}</td>
                        <td style={{ color: 'var(--success)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{j.completed}</td>
                        <td style={{ color: j.pending > 0 ? 'var(--warning)' : 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{j.pending}</td>
                        <td style={{ minWidth: '100px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <div className="progress-bar-track" style={{ flex: 1, margin: 0 }}>
                              <div className="progress-bar-fill" style={{ width: `${pct}%` }}></div>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Model Diagnostics & Solver Parameters */}
        <div className="card-panel" style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, padding: 0, border: 'none', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                Bradley-Terry Solver Diagnostics
              </h3>
              <span className="track-tag" style={{ fontSize: '0.7rem' }}>MM Algorithm</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ background: 'var(--surface-raised)', padding: '0.85rem 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--surface-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Convergence Status:</span>
                <span className={`status-badge ${rankingsData?.converged ? 'submitted' : 'draft'}`}>
                  {rankingsData?.converged ? '✓ Converged (Tol &le; 1e-6)' : '● In Progress / Max Iter'}
                </span>
              </div>

              <div style={{ background: 'var(--surface-raised)', padding: '0.85rem 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--surface-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Solver Iterations:</span>
                <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-bright)' }}>
                  {rankingsData?.iterations || 0} / 200
                </span>
              </div>

              <div style={{ background: 'var(--surface-raised)', padding: '0.85rem 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--surface-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Comparisons Factored:</span>
                <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>
                  {rankingsData?.total_comparisons || 0}
                </span>
              </div>

              <div style={{ background: 'var(--surface-raised)', padding: '0.85rem 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--surface-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Model Prior Regularization:</span>
                <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-bright)' }}>
                  Bradley-Terry with 0.5 Tie Splitting + Anchor Prior
                </span>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', borderTop: '1px solid var(--surface-border-subtle)', paddingTop: '0.75rem' }}>
            Bradley-Terry models pairwise probabilities as P(i &gt; j) = exp(&lambda;<sub>i</sub>) / [exp(&lambda;<sub>i</sub>) + exp(&lambda;<sub>j</sub>)]. Zero reviews receive neutral log-strength &lambda; = 0.
          </div>
        </div>
      </div>

      {/* Pairwise Bradley-Terry Global Rankings Table */}
      <div className="card-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.85rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.25rem 0', padding: 0, border: 'none', fontSize: '1.4rem' }}>
              Regularized Bradley-Terry Project Rankings
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              Computed globally across all validated head-to-head judge decisions. Higher &lambda; corresponds to higher comparative caliber.
            </p>
          </div>

          {/* Filter Row: Track Selector + Search Input */}
          <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {tracks.length > 0 && (
              <select
                className="form-control"
                value={selectedTrack}
                onChange={(e) => setSelectedTrack(e.target.value)}
                style={{ width: 'auto', minWidth: '150px', fontSize: '0.85rem', padding: '0.45rem 0.75rem' }}
              >
                <option value="">All Competition Tracks</option>
                {tracks.map((tr) => (
                  <option key={tr.id} value={tr.id}>{tr.name}</option>
                ))}
              </select>
            )}

            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search projects or teams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '220px', fontSize: '0.85rem', padding: '0.45rem 0.75rem' }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
            Calculating regularized Bradley-Terry parameters...
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="empty-state" style={{ padding: '3.5rem 1rem' }}>
            <div className="empty-state-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.4rem' }}>
              {searchQuery ? 'No Matching Projects' : 'No Pairwise Rankings Available'}
            </h3>
            <p style={{ fontSize: '0.88rem', maxWidth: '480px', margin: '0 auto' }}>
              {searchQuery
                ? `No submissions matched "${searchQuery}". Clear your search query to see all projects.`
                : 'No head-to-head comparisons have been recorded yet. Once judges complete evaluations, Bradley-Terry rankings will populate here in real time.'}
            </p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '60px', textAlign: 'center' }}>Rank</th>
                  <th>Project Deliverable</th>
                  <th>Track</th>
                  <th>Log-Strength (&lambda;)</th>
                  <th>Raw Strength (&pi;)</th>
                  <th>Win Prob (vs Base)</th>
                  <th style={{ textAlign: 'center' }}>Record (W - L - T)</th>
                  <th style={{ textAlign: 'center' }}>Comparisons</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((p) => {
                  const lambdaStr = p.lambda >= 0 ? `+${p.lambda.toFixed(4)}` : p.lambda.toFixed(4);
                  const rawStr = typeof p.raw_strength === 'number' ? p.raw_strength.toFixed(4) : '1.0000';
                  const probStr = typeof p.probability_vs_baseline === 'number'
                    ? `${(p.probability_vs_baseline * 100).toFixed(1)}%`
                    : '50.0%';

                  return (
                    <tr key={p.project_id}>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`rank-pill ${p.rank === 1 ? 'rank-1' : p.rank === 2 ? 'rank-2' : p.rank === 3 ? 'rank-3' : ''}`}>
                          {p.rank}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text-bright)', fontSize: '0.96rem' }}>
                          {p.title}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          Team: <strong style={{ color: 'var(--text-main)' }}>{p.team_name || 'Independent'}</strong>
                          <span style={{ color: 'var(--text-dim)', marginLeft: '0.5rem', fontFamily: 'var(--font-mono)' }}>({p.project_id})</span>
                        </div>
                      </td>

                      <td>
                        <span className="track-tag" style={{ fontSize: '0.72rem' }}>
                          {p.track_name || 'General'}
                        </span>
                      </td>

                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: p.lambda > 0 ? 'var(--primary)' : p.lambda < 0 ? 'var(--text-dim)' : 'var(--text-main)' }}>
                        {lambdaStr}
                      </td>

                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {rawStr}
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.84rem' }}>{probStr}</span>
                          <div className="progress-bar-track" style={{ width: '50px', margin: 0, height: '4px' }}>
                            <div className="progress-bar-fill" style={{ width: probStr }}></div>
                          </div>
                        </div>
                      </td>

                      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ color: 'var(--success)', fontWeight: 700 }}>{p.wins}W</span>
                        {' - '}
                        <span style={{ color: p.losses > 0 ? 'var(--danger)' : 'var(--text-dim)' }}>{p.losses}L</span>
                        {' - '}
                        <span style={{ color: 'var(--text-dim)' }}>{p.ties}T</span>
                      </td>

                      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {p.total_comparisons}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assignment Generation Modal */}
      {showGenerateModal && (
        <div className="modal-overlay" onClick={() => !generating && setShowGenerateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px', padding: '2rem' }}>
            <div className="modal-header" style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="brand-logo-icon" aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 6 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="3" width="7" height="7"/>
                    <rect x="14" y="14" width="7" height="7"/>
                    <path d="M10 7h4v4"/>
                  </svg>
                </div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-bright)' }}>
                  Generate Pairwise Assignments
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !generating && setShowGenerateModal(false)}
                disabled={generating}
              >
                &times;
              </button>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', lineHeight: 1.5, margin: '0 0 1.25rem 0' }}>
              Computes a connected circulant chord graph of comparison pairs across submitted projects and allocates them evenly across eligible judges without duplicate pairs per judge.
            </p>

            {generateError && (
              <div className="banner danger" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>⛔</span>
                  <div>{generateError}</div>
                </div>
              </div>
            )}

            {generateResult && (
              <div className="banner success" style={{ marginBottom: '1rem' }}>
                <div>
                  <strong>{generateResult.message}</strong>
                  <div style={{ fontSize: '0.78rem', marginTop: '0.25rem' }}>
                    Projects: {generateResult.metadata?.projectCount} &bull; Judges: {generateResult.metadata?.judgeCount} &bull; Total Assignments: {generateResult.metadata?.totalAssignments}
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleGenerateAssignments}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-bright)' }}>
                  Target Comparisons Per Project:
                </label>
                <select
                  className="form-control"
                  value={comparisonsPerProject}
                  onChange={(e) => setComparisonsPerProject(Number(e.target.value))}
                  disabled={generating}
                >
                  <option value={3}>3 Comparisons per project (Light workload)</option>
                  <option value={5}>5 Comparisons per project (Recommended balanced)</option>
                  <option value={7}>7 Comparisons per project (Higher precision)</option>
                  <option value={10}>10 Comparisons per project (High density)</option>
                </select>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.25rem', display: 'block' }}>
                  Determines the circulant chord degree per project graph node.
                </span>
              </div>

              {tracks.length > 0 && (
                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-bright)' }}>
                    Track Scope Filter:
                  </label>
                  <select
                    className="form-control"
                    value={generateTrack}
                    onChange={(e) => setGenerateTrack(e.target.value)}
                    disabled={generating}
                  >
                    <option value="">All Tracks (Global event-wide pool)</option>
                    {tracks.map((tr) => (
                      <option key={tr.id} value={tr.id}>{tr.name}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.25rem', display: 'block' }}>
                    When restricted to a track, only projects and judges assigned to that track are paired.
                  </span>
                </div>
              )}

              <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border-subtle)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <strong>Idempotency Safety:</strong> Existing assigned pairs are preserved using canonical ordering key indexing. New pairs are added additively.
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowGenerateModal(false)}
                  disabled={generating}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={generating}
                >
                  {generating ? 'Generating Pairs...' : 'Confirm & Generate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
