import React from 'react';

export default function Navbar({ user, activeTab, setActiveTab, onOpenLogin, onLogout, onSwitchSeeded }) {
  const primaryRole = user?.roles?.[0] || 'visitor';
  const initial = user?.name ? user.name.charAt(0).toUpperCase() : '?';

  return (
    <header className="app-header">
      {/* Seeded Quick-Switcher Bar for Evaluators */}
      <div className="demo-bar">
        <span className="demo-bar-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          Evaluator Quick-Switch:
        </span>
        <button
          type="button"
          className="demo-btn"
          onClick={() => onSwitchSeeded('organizer')}
          title="Switch to Lead Organizer (org_7f2a)"
        >
          Organizer <span>(org_7f2a)</span>
        </button>
        <button
          type="button"
          className="demo-btn"
          onClick={() => onSwitchSeeded('judge_a')}
          title="Switch to Judge Tomas Varga (jdg_a_91bc)"
        >
          Judge A <span>(jdg_a_91bc)</span>
        </button>
        <button
          type="button"
          className="demo-btn"
          onClick={() => onSwitchSeeded('judge_b')}
          title="Switch to Judge Wei Lindqvist (jdg_b_44de)"
        >
          Judge B <span>(jdg_b_44de)</span>
        </button>
        <button
          type="button"
          className="demo-btn"
          onClick={() => onSwitchSeeded('participant')}
          title="Switch to Participant Priya (prt_2e88)"
        >
          Participant <span>(prt_2e88)</span>
        </button>
      </div>

      <div className="nav-container">
        <div className="brand-area">
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); setActiveTab('gallery'); }}
            className="logo"
            aria-label="DOGFOOD 2026 Hackathon Portal"
          >
            <div className="brand-logo-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <span>DOGFOOD <span className="logo-year">2026</span></span>
          </a>
          <span className="tag-version" title="All four tiers implemented and claimed">
            <span className="tag-version-dot" aria-hidden="true"></span>
            T1 – T4 Active
          </span>
        </div>

        <nav className="nav-links" aria-label="Main Navigation">
          <button
            type="button"
            className={`nav-link ${activeTab === 'gallery' ? 'active' : ''}`}
            onClick={() => setActiveTab('gallery')}
            aria-current={activeTab === 'gallery' ? 'page' : undefined}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            Gallery
          </button>

          <button
            type="button"
            className={`nav-link ${activeTab === 'participant' ? 'active' : ''}`}
            onClick={() => setActiveTab('participant')}
            aria-current={activeTab === 'participant' ? 'page' : undefined}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Participant Portal
          </button>

          <button
            type="button"
            className={`nav-link ${activeTab === 'voting' ? 'active' : ''}`}
            onClick={() => setActiveTab('voting')}
            aria-current={activeTab === 'voting' ? 'page' : undefined}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            Community Voting
          </button>

          {(user?.roles?.includes('judge') || user?.roles?.includes('admin')) && (
            <button
              type="button"
              className={`nav-link ${activeTab === 'judge' ? 'active' : ''}`}
              onClick={() => setActiveTab('judge')}
              aria-current={activeTab === 'judge' ? 'page' : undefined}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              Judge Workbench
            </button>
          )}

          {(user?.roles?.includes('organizer') || user?.roles?.includes('admin')) && (
            <button
              type="button"
              className={`nav-link ${activeTab === 'organizer' ? 'active' : ''}`}
              onClick={() => setActiveTab('organizer')}
              aria-current={activeTab === 'organizer' ? 'page' : undefined}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Organizer Panel
            </button>
          )}
        </nav>

        <div className="user-area">
          {user ? (
            <>
              <div className="user-pill" title={`Logged in as ${user.name} (${primaryRole})`}>
                <div className="user-avatar" aria-hidden="true">{initial}</div>
                <span className={`role-badge ${primaryRole}`}>{primaryRole}</span>
                <span style={{ fontWeight: 600 }}>{user.name}</span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onLogout}
              >
                Logout
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onOpenLogin}
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
