import React from 'react';

export default function Navbar({ user, activeTab, setActiveTab, onOpenLogin, onLogout, onSwitchSeeded }) {
  const primaryRole = user?.roles?.[0] || 'visitor';

  return (
    <header className="app-header">
      {/* Seeded Quick-Switcher Bar for Evaluators */}
      <div className="demo-bar">
        <span style={{ color: '#94a3b8' }}>Seeded Fast-Switch:</span>
        <button className="demo-btn" onClick={() => onSwitchSeeded('organizer')}>Organizer (org_7f2a)</button>
        <button className="demo-btn" onClick={() => onSwitchSeeded('judge_a')}>Judge A (jdg_a_91bc)</button>
        <button className="demo-btn" onClick={() => onSwitchSeeded('judge_b')}>Judge B (jdg_b_44de)</button>
        <button className="demo-btn" onClick={() => onSwitchSeeded('participant')}>Participant (prt_2e88)</button>
      </div>

      <div className="nav-container">
        <div className="brand-area">
          <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('gallery'); }} className="logo">
            DOGFOOD 2026
          </a>
          <span className="tag-version">T1 + T2 Active</span>
        </div>

        <nav className="nav-links">
          <button 
            className={`nav-link ${activeTab === 'gallery' ? 'active' : ''}`}
            onClick={() => setActiveTab('gallery')}
          >
            Gallery
          </button>
          
          <button 
            className={`nav-link ${activeTab === 'participant' ? 'active' : ''}`}
            onClick={() => setActiveTab('participant')}
          >
            Participant Portal
          </button>

          <button 
            className={`nav-link ${activeTab === 'voting' ? 'active' : ''}`}
            onClick={() => setActiveTab('voting')}
          >
            Community Voting
          </button>

          {(user?.roles?.includes('judge') || user?.roles?.includes('admin')) && (
            <button 
              className={`nav-link ${activeTab === 'judge' ? 'active' : ''}`}
              onClick={() => setActiveTab('judge')}
            >
              Judge Workbench
            </button>
          )}

          {(user?.roles?.includes('organizer') || user?.roles?.includes('admin')) && (
            <button 
              className={`nav-link ${activeTab === 'organizer' ? 'active' : ''}`}
              onClick={() => setActiveTab('organizer')}
            >
              Organizer Panel
            </button>
          )}
        </nav>

        <div className="user-area">
          {user ? (
            <>
              <div className="user-pill">
                <span className={`role-badge ${primaryRole}`}>{primaryRole}</span>
                <span>{user.name}</span>
              </div>
              <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={onLogout}>
                Logout
              </button>
            </>
          ) : (
            <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={onOpenLogin}>
              Login
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
