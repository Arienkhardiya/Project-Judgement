import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar.jsx';
import LandingPage from './components/LandingPage.jsx';
import PublicEventPage from './components/PublicEventPage.jsx';
import EventCreationWizard from './components/EventCreationWizard.jsx';
import Gallery from './components/Gallery.jsx';
import ParticipantPortal from './components/ParticipantPortal.jsx';
import JudgePortal from './components/JudgePortal.jsx';
import OrganizerPortal from './components/OrganizerPortal.jsx';
import CommunityVoting from './components/CommunityVoting.jsx';
import LoginModal from './components/LoginModal.jsx';
import JudgeInviteModal from './components/JudgeInviteModal.jsx';
import CustomCursor from './components/CustomCursor.jsx';
import BackgroundSignature from './components/BackgroundSignature.jsx';

export default function App() {
  const [user, setUser] = useState(null);

  // Invitation Token State
  const [inviteToken, setInviteToken] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('invite_token')) return urlParams.get('invite_token');
      if (urlParams.get('invite')) return urlParams.get('invite');
      if (window.location.pathname.startsWith('/invite/judge/')) {
        return window.location.pathname.replace('/invite/judge/', '').replace(/\/$/, '');
      }
      if (window.location.hash.startsWith('#invite=')) {
        return decodeURIComponent(window.location.hash.replace('#invite=', ''));
      }
    } catch {}
    return null;
  });
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(() => Boolean(
    (() => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('invite_token') || urlParams.get('invite') ||
          (window.location.pathname.startsWith('/invite/judge/') ? window.location.pathname.replace('/invite/judge/', '').replace(/\/$/, '') : null) ||
          (window.location.hash.startsWith('#invite=') ? decodeURIComponent(window.location.hash.replace('#invite=', '')) : null);
      } catch { return null; }
    })()
  ));

  // Deterministic Demo / Evaluator Mode Gate
  const [isDemoMode, setIsDemoMode] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('demo') === '1' || urlParams.get('mode') === 'demo') return true;
      if (urlParams.get('demo') === '0' || urlParams.get('mode') === 'production') return false;
      if (window.location.hash === '#demo') return true;
      const saved = localStorage.getItem('veridict_mode');
      if (saved) return saved === 'demo';
      // Default: clean production mode
      return false;
    } catch {
      return false;
    }
  });

  const toggleDemoMode = () => {
    setIsDemoMode(prev => {
      const next = !prev;
      try {
        localStorage.setItem('veridict_mode', next ? 'demo' : 'production');
      } catch {}
      return next;
    });
  };

  // Navigation State
  const [activeTab, setActiveTabState] = useState(() => {
    try {
      if (window.location.hash.startsWith('#event=')) return 'event';
      if (window.location.hash === '#create-event') return 'create-event';
      const saved = localStorage.getItem('dogfood_active_tab');
      // If user saved gallery or home, honor it, otherwise default to 'home'
      return saved || 'home';
    } catch {
      return 'home';
    }
  });

  const [selectedEventId, setSelectedEventId] = useState(() => {
    try {
      if (window.location.hash.startsWith('#event=')) {
        return decodeURIComponent(window.location.hash.replace('#event=', ''));
      }
    } catch {}
    return 'evt_01';
  });

  const [events, setEvents] = useState([]);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  const setActiveTab = (tab) => {
    setActiveTabState(tab);
    try {
      localStorage.setItem('dogfood_active_tab', tab);
      if (tab === 'home') window.location.hash = '';
      else if (tab === 'gallery') window.location.hash = '#gallery';
      else if (tab === 'create-event') window.location.hash = '#create-event';
      else if (tab === 'event' && selectedEventId) window.location.hash = `#event=${selectedEventId}`;
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    checkCurrentUser();
    loadEvents();

    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#event=')) {
        const evId = decodeURIComponent(hash.replace('#event=', ''));
        setSelectedEventId(evId);
        setActiveTabState('event');
      } else if (hash.startsWith('#invite=')) {
        const tok = decodeURIComponent(hash.replace('#invite=', ''));
        setInviteToken(tok);
        setIsInviteModalOpen(true);
      } else if (hash === '#create-event') {
        setActiveTabState('create-event');
      } else if (hash === '#gallery') {
        setActiveTabState('gallery');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const loadEvents = async () => {
    try {
      const res = await fetch('/api/events');
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      console.error('Failed to load events:', err);
    }
  };

  const checkCurrentUser = () => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        setUser(data.user);
        const userRoles = data.user?.roles || [];
        setActiveTabState(currentTab => {
          if (currentTab === 'organizer' && !userRoles.includes('organizer') && !userRoles.includes('admin')) {
            try { localStorage.setItem('dogfood_active_tab', 'home'); } catch {}
            return 'home';
          }
          if (currentTab === 'judge' && !userRoles.includes('judge') && !userRoles.includes('admin')) {
            try { localStorage.setItem('dogfood_active_tab', 'home'); } catch {}
            return 'home';
          }
          return currentTab;
        });
      })
      .catch(err => console.error('Auth check error:', err));
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setActiveTab('home');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleSwitchSeeded = async (roleKey) => {
    try {
      const res = await fetch('/api/auth/switch-seeded', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleKey }),
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        if (roleKey === 'organizer') setActiveTab('organizer');
        else if (roleKey === 'participant') setActiveTab('participant');
        else if (roleKey === 'judge_a' || roleKey === 'judge_b') setActiveTab('judge');
        else setActiveTab('gallery');
      }
    } catch (err) {
      console.error('Fast switch error:', err);
    }
  };

  const handleSelectEvent = (evt) => {
    setSelectedEventId(evt.slug || evt.id);
    setActiveTab('event');
    window.location.hash = `#event=${evt.slug || evt.id}`;
  };

  const handleCreateEventClick = () => {
    if (!user) {
      setIsLoginOpen(true);
      return;
    }
    setActiveTab('create-event');
    window.location.hash = '#create-event';
  };

  const handleEventCreated = (newEvent) => {
    loadEvents();
    setSelectedEventId(newEvent.slug || newEvent.id);
    setActiveTab('organizer');
  };

  const handleInviteAcceptSuccess = (loggedUser, eventId) => {
    setUser(loggedUser);
    setIsInviteModalOpen(false);
    setInviteToken(null);
    if (eventId) setSelectedEventId(eventId);
    setActiveTab('judge');
    try {
      if (window.history.pushState) {
        window.history.pushState(null, '', window.location.pathname.startsWith('/invite') ? '/' : window.location.pathname);
      }
    } catch {}
  };

  return (
    <div className="app-shell">
      <CustomCursor />
      <BackgroundSignature />

      <Navbar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenLogin={() => setIsLoginOpen(true)}
        onLogout={handleLogout}
        onSwitchSeeded={handleSwitchSeeded}
        onCreateEvent={handleCreateEventClick}
        isDemoMode={isDemoMode}
        onToggleDemoMode={toggleDemoMode}
      />

      <main className="app-main">
        {/* VIEW 1: REAL SAAS LANDING PAGE */}
        {activeTab === 'home' && (
          <LandingPage
            user={user}
            events={events}
            onSelectEvent={handleSelectEvent}
            onCreateEvent={handleCreateEventClick}
            onOpenLogin={() => setIsLoginOpen(true)}
            onExploreProjects={() => setActiveTab('gallery')}
          />
        )}

        {/* VIEW 2: DEDICATED PUBLIC EVENT PAGE */}
        {activeTab === 'event' && (
          <PublicEventPage
            eventId={selectedEventId}
            eventSlug={selectedEventId}
            user={user}
            onNavigateTab={setActiveTab}
            onOpenLogin={() => setIsLoginOpen(true)}
            onBackToHome={() => setActiveTab('home')}
          />
        )}

        {/* VIEW 3: EVENT CREATION WIZARD */}
        {activeTab === 'create-event' && (
          <EventCreationWizard
            user={user}
            onEventCreated={handleEventCreated}
            onCancel={() => setActiveTab('organizer')}
          />
        )}

        {/* VIEW 4: PUBLIC SHOWCASE / GALLERY */}
        {activeTab === 'gallery' && (
          <Gallery
            user={user}
            onRequireLogin={() => setIsLoginOpen(true)}
          />
        )}

        {/* VIEW 5: PARTICIPANT PORTAL */}
        {activeTab === 'participant' && (
          <ParticipantPortal
            user={user}
            onRequireLogin={() => setIsLoginOpen(true)}
          />
        )}

        {/* VIEW 6: JUDGE WORKBENCH */}
        {activeTab === 'judge' && (
          <JudgePortal
            user={user}
            onRequireLogin={() => setIsLoginOpen(true)}
          />
        )}

        {/* VIEW 7: ORGANIZER CONSOLE */}
        {activeTab === 'organizer' && (
          <OrganizerPortal
            user={user}
            onCreateNewEvent={handleCreateEventClick}
            initialEventId={selectedEventId}
          />
        )}

        {/* VIEW 8: COMMUNITY VOTING */}
        {activeTab === 'voting' && (
          <CommunityVoting
            user={user}
            onRequireLogin={() => setIsLoginOpen(true)}
          />
        )}
      </main>

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-status-strip">
            <span className="footer-status-beacon" aria-hidden="true">
              <span className="beacon-ping"></span>
              <span className="beacon-dot"></span>
            </span>
            <span className="footer-status-text">
              {isDemoMode
                ? 'DOGFOOD 2026 Evaluator Console Operational'
                : 'VERIDICT Platform &bull; All Competition Engines Operational'}
            </span>
          </div>

          <div className="footer-meta-badges">
            <span className="footer-pill">Multi-Event Isolation</span>
            <span className="footer-pill">Blind Rubric Scoring</span>
            <span className="footer-pill">Pairwise Comparisons</span>
            <span className="footer-pill">Deterministic Rankings</span>
          </div>

          <div className="footer-copyright">
            VERIDICT &bull; Self-Hostable Hackathon Operating Platform &bull; Production Ready
          </div>

          {isDemoMode && (
            <div style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={toggleDemoMode}
                style={{ fontSize: '0.72rem', opacity: 0.8 }}
              >
                Exit Evaluator Mode (Switch to Production)
              </button>
            </div>
          )}
        </div>
      </footer>

      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        isDemoMode={isDemoMode}
        onLoginSuccess={(loggedUser) => {
          setUser(loggedUser);
          if (activeTab === 'home' || activeTab === 'gallery') {
            if (loggedUser.roles.includes('organizer')) setActiveTab('organizer');
            else if (loggedUser.roles.includes('judge')) setActiveTab('judge');
            else if (loggedUser.roles.includes('participant')) setActiveTab('participant');
          }
        }}
      />

      <JudgeInviteModal
        isOpen={isInviteModalOpen}
        token={inviteToken}
        currentUser={user}
        onClose={() => {
          setIsInviteModalOpen(false);
          setInviteToken(null);
        }}
        onAcceptSuccess={handleInviteAcceptSuccess}
      />
    </div>
  );
}
