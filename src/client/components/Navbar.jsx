import React from 'react';

export default function Navbar({
  user,
  activeTab,
  setActiveTab,
  onOpenLogin,
  onLogout,
  onSwitchSeeded,
  onCreateEvent,
  isDemoMode,
  onToggleDemoMode,
}) {
  const primaryRole = user?.roles?.[0] || 'visitor';
  const initial = user?.name ? user.name.charAt(0).toUpperCase() : '?';

  return (
    <header className="app-header">
      {/* Seeded Quick-Switcher Bar for Evaluators (DEMO MODE ONLY) */}
      {isDemoMode && (
        <div className="demo-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="demo-bar-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              Evaluator Quick-Switch:
            </span>
            <button
              type="button"
              className={`demo-btn ${user?.id === 'org_7f2a' ? 'active' : ''}`}
              onClick={() => onSwitchSeeded('organizer')}
              title="Switch to Lead Organizer (org_7f2a)"
            >
              {user?.id === 'org_7f2a' && <span className="demo-btn-active-dot" aria-hidden="true"></span>}
              Organizer <span>(org_7f2a)</span>
            </button>
            <button
              type="button"
              className={`demo-btn ${user?.id === 'jdg_a_91bc' ? 'active' : ''}`}
              onClick={() => onSwitchSeeded('judge_a')}
              title="Switch to Judge Tomas Varga (jdg_a_91bc)"
            >
              {user?.id === 'jdg_a_91bc' && <span className="demo-btn-active-dot" aria-hidden="true"></span>}
              Judge A <span>(jdg_a_91bc)</span>
            </button>
            <button
              type="button"
              className={`demo-btn ${user?.id === 'jdg_b_44de' ? 'active' : ''}`}
              onClick={() => onSwitchSeeded('judge_b')}
              title="Switch to Judge Wei Lindqvist (jdg_b_44de)"
            >
              {user?.id === 'jdg_b_44de' && <span className="demo-btn-active-dot" aria-hidden="true"></span>}
              Judge B <span>(jdg_b_44de)</span>
            </button>
            <button
              type="button"
              className={`demo-btn ${user?.id === 'prt_2e88' ? 'active' : ''}`}
              onClick={() => onSwitchSeeded('participant')}
              title="Switch to Participant Priya (prt_2e88)"
            >
              {user?.id === 'prt_2e88' && <span className="demo-btn-active-dot" aria-hidden="true"></span>}
              Participant <span>(prt_2e88)</span>
            </button>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--warning)', fontWeight: 700 }}>
              ⚡ DEMO MODE
            </span>
            <button
              type="button"
              className="btn btn-xs btn-secondary"
              onClick={onToggleDemoMode}
              title="Switch to clean Production SaaS view"
              style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem' }}
            >
              Switch to Production Mode
            </button>
          </div>
        </div>
      )}

      {/* Main SaaS Navbar */}
      <div className="nav-container">
        <div className="brand-area">
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); setActiveTab('home'); }}
            className="logo"
            aria-label="VERIDICT - Hackathon Operating Platform"
          >
            <div className="brand-logo-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <span className="veridict-brand-title">VERIDICT</span>
          </a>

          {isDemoMode ? (
            <span className="tag-version" title="Tiers 1, 2, 3, and 4 Verified &amp; Active">
              <span className="tag-version-dot" aria-hidden="true"></span>
              T1–T4 Active
            </span>
          ) : (
            <span className="platform-tagline">
              Hackathon OS
            </span>
          )}
        </div>

        <nav className="nav-links" aria-label="Main Navigation">
          <button
            type="button"
            className={`nav-link ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveTab('home')}
            aria-current={activeTab === 'home' ? 'page' : undefined}
          >
            Explore
          </button>

          <button
            type="button"
            className="nav-link"
            onClick={() => {
              if (activeTab !== 'home') setActiveTab('home');
              setTimeout(() => {
                const el = document.getElementById('hackathons-directory');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }, 50);
            }}
          >
            Hackathons
          </button>

          <button
            type="button"
            className={`nav-link ${activeTab === 'gallery' ? 'active' : ''}`}
            onClick={() => setActiveTab('gallery')}
            aria-current={activeTab === 'gallery' ? 'page' : undefined}
          >
            Showcase
          </button>

          {/* Participant Portal (Strictly authenticated) */}
          {user?.roles?.includes('participant') && (
            <button
              type="button"
              className={`nav-link ${activeTab === 'participant' ? 'active' : ''}`}
              onClick={() => setActiveTab('participant')}
              aria-current={activeTab === 'participant' ? 'page' : undefined}
            >
              Participant Portal
            </button>
          )}

          {/* Community Voting */}
          <button
            type="button"
            className={`nav-link ${activeTab === 'voting' ? 'active' : ''}`}
            onClick={() => setActiveTab('voting')}
            aria-current={activeTab === 'voting' ? 'page' : undefined}
          >
            Community Voting
          </button>

          {/* Judge Workbench (Strictly RBAC gated) */}
          {(user?.roles?.includes('judge') || user?.roles?.includes('admin')) && (
            <button
              type="button"
              className={`nav-link ${activeTab === 'judge' ? 'active' : ''}`}
              onClick={() => setActiveTab('judge')}
              aria-current={activeTab === 'judge' ? 'page' : undefined}
            >
              Judge Workbench
            </button>
          )}

          {/* Organizer Console (Strictly RBAC gated) */}
          {(user?.roles?.includes('organizer') || user?.roles?.includes('admin')) && (
            <button
              type="button"
              className={`nav-link ${activeTab === 'organizer' ? 'active' : ''}`}
              onClick={() => setActiveTab('organizer')}
              aria-current={activeTab === 'organizer' ? 'page' : undefined}
            >
              Organizer Console
            </button>
          )}
        </nav>

        <div className="user-area">
          {/* Action to create hackathon */}
          {user?.roles?.includes('organizer') ? (
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={onCreateEvent}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '0.5rem' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Hackathon
            </button>
          ) : !user && (
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={onCreateEvent}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '0.5rem' }}
            >
              Create Hackathon
            </button>
          )}

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
