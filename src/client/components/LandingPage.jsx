import React, { useState, useEffect } from 'react';

export default function LandingPage({
  user,
  events = [],
  onSelectEvent,
  onCreateEvent,
  onOpenLogin,
  onExploreProjects,
}) {
  const [stats, setStats] = useState({
    activeEvents: 0,
    totalProjects: 0,
    totalTeams: 0,
  });

  useEffect(() => {
    // Real metrics computed from backend events
    const active = events.filter(e => e.status !== 'DRAFT').length;
    const projCount = events.reduce((acc, e) => acc + (e.projects_count || 0), 0);
    const teamCount = events.reduce((acc, e) => acc + (e.teams_count || 0), 0);
    setStats({
      activeEvents: active,
      totalProjects: projCount,
      totalTeams: teamCount,
    });
  }, [events]);

  const getPhaseBadge = (phase, isClosed) => {
    switch (phase) {
      case 'REGISTRATION_OPEN':
        return <span className="status-badge" style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}>Registration Open</span>;
      case 'SUBMISSION_OPEN':
        return <span className="status-badge" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>Submissions Live</span>;
      case 'JUDGING_OPEN':
        return <span className="status-badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>Judging Active</span>;
      case 'RESULTS_PUBLISHED':
        return <span className="status-badge" style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.3)' }}>Results Published</span>;
      case 'JUDGING_COMPLETE':
        return <span className="status-badge" style={{ background: 'rgba(148,163,184,0.15)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.3)' }}>Judging Complete</span>;
      case 'DRAFT':
        return <span className="status-badge draft">Draft Mode</span>;
      default:
        return isClosed
          ? <span className="status-badge" style={{ background: 'rgba(148,163,184,0.15)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.3)' }}>Submissions Closed</span>
          : <span className="status-badge" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>Active</span>;
    }
  };

  return (
    <div className="landing-container">
      {/* ===== HERO SECTION ===== */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="hero-dot"></span>
            VERIDICT &bull; HACKATHON OPERATING PLATFORM
          </div>

          <h1 className="hero-title">
            Run your hackathon <br />
            <span className="hero-gradient-text">from registration to results.</span>
          </h1>

          <p className="hero-subtitle">
            A self-hostable platform built for competition organizers. Create events,
            manage teams, collect project dossiers, configure rubric or pairwise judging,
            and publish verified results with zero spreadsheet chaos.
          </p>

          <div className="hero-actions">
            <button
              type="button"
              className="btn btn-primary hero-btn"
              onClick={onCreateEvent}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              Create a Hackathon
            </button>

            <button
              type="button"
              className="btn btn-secondary hero-btn"
              onClick={() => {
                const el = document.getElementById('hackathons-directory');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Explore Hackathons
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>

          {/* Real Platform Telemetry */}
          <div className="hero-telemetry-strip">
            <div className="telemetry-item">
              <span className="telemetry-val">{stats.activeEvents}</span>
              <span className="telemetry-label">Active Events</span>
            </div>
            <div className="telemetry-divider" aria-hidden="true"></div>
            <div className="telemetry-item">
              <span className="telemetry-val">{stats.totalTeams}</span>
              <span className="telemetry-label">Registered Teams</span>
            </div>
            <div className="telemetry-divider" aria-hidden="true"></div>
            <div className="telemetry-item">
              <span className="telemetry-val">{stats.totalProjects}</span>
              <span className="telemetry-label">Submissions</span>
            </div>
            <div className="telemetry-divider" aria-hidden="true"></div>
            <div className="telemetry-item">
              <span className="telemetry-val">100%</span>
              <span className="telemetry-label">Self-Hostable</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== HOW VERIDICT WORKS ===== */}
      <section className="landing-section">
        <div className="section-eyebrow">ORGANIZER WORKFLOW</div>
        <h2 className="section-title">How VERIDICT Works</h2>
        <p className="section-subtitle">
          From first announcement to final awards, manage every phase in one unified operating system.
        </p>

        <div className="lifecycle-timeline">
          <div className="timeline-step">
            <div className="timeline-num">01</div>
            <h4>Launch &amp; Configure</h4>
            <p>Define tracks, prize pools, submission criteria, and automated scoring rubrics in minutes.</p>
          </div>

          <div className="timeline-step">
            <div className="timeline-num">02</div>
            <h4>Team Collaboration</h4>
            <p>Participants create teams with instant invite codes, draft repositories, and submit live demos.</p>
          </div>

          <div className="timeline-step">
            <div className="timeline-num">03</div>
            <h4>Rigorous Judging</h4>
            <p>Judges evaluate assigned projects via weighted rubrics or head-to-head pairwise matchups.</p>
          </div>

          <div className="timeline-step">
            <div className="timeline-num">04</div>
            <h4>Publish &amp; Export</h4>
            <p>Generate normalized rankings, export RFC 4180 CSVs, and publish verified leaderboards.</p>
          </div>
        </div>
      </section>

      {/* ===== LIVE HACKATHONS DIRECTORY ===== */}
      <section id="hackathons-directory" className="landing-section">
        <div className="section-header-flex">
          <div>
            <div className="section-eyebrow">LIVE DIRECTORY</div>
            <h2 className="section-title">Active Hackathons</h2>
            <p className="section-subtitle">
              Browse public competitions currently hosted on this VERIDICT instance.
            </p>
          </div>
          {user?.roles?.includes('organizer') && (
            <button type="button" className="btn btn-sm btn-primary" onClick={onCreateEvent}>
              + Create Hackathon
            </button>
          )}
        </div>

        <div className="hackathons-grid">
          {events.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <h3>No Published Hackathons Yet</h3>
              <p>Be the first organizer to launch a competition on VERIDICT.</p>
              <button type="button" className="btn btn-primary btn-sm" onClick={onCreateEvent}>
                Launch Hackathon
              </button>
            </div>
          ) : (
            events.map((evt) => (
              <div
                key={evt.id}
                className="hackathon-card"
                onClick={() => onSelectEvent(evt)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelectEvent(evt); }}
              >
                <div className="hackathon-card-top">
                  <div className="hackathon-badge-row">
                    {getPhaseBadge(evt.phase, evt.is_closed)}
                    <span className="hackathon-id-pill">{evt.slug || evt.id}</span>
                  </div>
                  <span className="hackathon-arrow" aria-hidden="true">&rarr;</span>
                </div>

                <h3 className="hackathon-card-title">{evt.name}</h3>
                <p className="hackathon-card-desc">
                  {evt.description || 'Open engineering competition on VERIDICT.'}
                </p>

                <div className="hackathon-meta-row">
                  <div className="hackathon-meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <span>
                      {evt.submissions_close
                        ? `Deadline: ${new Date(evt.submissions_close).toLocaleDateString()}`
                        : 'Open'}
                    </span>
                  </div>
                  <div className="hackathon-meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    <span>{evt.tracks_count !== undefined ? evt.tracks_count : 0} Tracks</span>
                  </div>
                  <div className="hackathon-meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    <span>{evt.projects_count !== undefined ? evt.projects_count : 0} Projects</span>
                  </div>
                </div>

                <div className="hackathon-card-footer">
                  <span className="card-action-text">View Event Portal &amp; Projects &rarr;</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ===== PLATFORM CAPABILITIES ===== */}
      <section className="landing-section">
        <div className="section-eyebrow">PLATFORM CAPABILITIES</div>
        <h2 className="section-title">Built for Real Competition Integrity</h2>
        <p className="section-subtitle">
          Eliminate subjective bias and manual spreadsheet errors with automated judging infrastructure.
        </p>

        <div className="capabilities-grid">
          <div className="capability-card">
            <div className="capability-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </div>
            <h3>Multi-Event Isolation</h3>
            <p>
              Host multiple independent hackathons simultaneously. Participants, submissions,
              and judging rubrics are strictly isolated per event.
            </p>
          </div>

          <div className="capability-card">
            <div className="capability-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <h3>Double-Blind Evaluation</h3>
            <p>
              Judges evaluate assigned dossiers without exposure to peer scoring.
              Role-based authorization prevents score tampering.
            </p>
          </div>

          <div className="capability-card">
            <div className="capability-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
            <h3>Fair Score Normalization</h3>
            <p>
              Cross-judge normalization accounts for reviewer severity and leniency,
              ensuring projects are evaluated fairly across different judges.
            </p>
          </div>

          <div className="capability-card">
            <div className="capability-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><path d="M10 7h4v4"/></svg>
            </div>
            <h3>Pairwise Comparison Mode</h3>
            <p>
              Head-to-head project comparisons resolved via a deterministic Bradley-Terry solver
              for high-velocity judging rounds.
            </p>
          </div>
        </div>
      </section>

      {/* ===== CALL TO ACTION FOOTER BANNER ===== */}
      <section className="cta-banner">
        <h2>Ready to host your hackathon?</h2>
        <p>Deploy in seconds with Docker. 100% self-hosted with persistent SQLite storage and zero cloud lock-in.</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={onCreateEvent}>
            Launch Your Competition &rarr;
          </button>
          <button type="button" className="btn btn-secondary" onClick={onExploreProjects}>
            View Project Showcase
          </button>
        </div>
      </section>
    </div>
  );
}
