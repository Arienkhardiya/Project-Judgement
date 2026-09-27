import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar.jsx';
import Gallery from './components/Gallery.jsx';
import ParticipantPortal from './components/ParticipantPortal.jsx';
import JudgePortal from './components/JudgePortal.jsx';
import OrganizerPortal from './components/OrganizerPortal.jsx';
import LoginModal from './components/LoginModal.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('gallery');
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  useEffect(() => {
    checkCurrentUser();
  }, []);

  const checkCurrentUser = () => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        setUser(data.user);
      })
      .catch(err => console.error('Auth check error:', err));
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setActiveTab('gallery');
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

  return (
    <div>
      <Navbar 
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenLogin={() => setIsLoginOpen(true)}
        onLogout={handleLogout}
        onSwitchSeeded={handleSwitchSeeded}
      />

      <main>
        {activeTab === 'gallery' && <Gallery />}
        {activeTab === 'participant' && (
          <ParticipantPortal 
            user={user} 
            onRequireLogin={() => setIsLoginOpen(true)}
          />
        )}
        {activeTab === 'judge' && (
          <JudgePortal 
            user={user} 
            onRequireLogin={() => setIsLoginOpen(true)}
          />
        )}
        {activeTab === 'organizer' && <OrganizerPortal user={user} />}
      </main>

      <LoginModal 
        isOpen={isLoginOpen} 
        onClose={() => setIsLoginOpen(false)} 
        onLoginSuccess={(loggedUser) => {
          setUser(loggedUser);
          if (loggedUser.roles.includes('organizer')) setActiveTab('organizer');
          else if (loggedUser.roles.includes('judge')) setActiveTab('judge');
          else if (loggedUser.roles.includes('participant')) setActiveTab('participant');
        }}
      />
    </div>
  );
}
