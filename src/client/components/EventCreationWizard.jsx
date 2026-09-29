import React, { useState } from 'react';

export default function EventCreationWizard({
  user,
  onEventCreated,
  onCancel,
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [publishedEvent, setPublishedEvent] = useState(null);

  // Form State
  const [basics, setBasics] = useState({
    name: '',
    description: '',
    slug: '',
    organization: '',
  });

  const [schedule, setSchedule] = useState({
    start_time: new Date().toISOString().slice(0, 16),
    submissions_close: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    end_time: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  });

  const [tracks, setTracks] = useState([
    { name: 'AI & Machine Learning', description: 'Intelligent agents, LLMs, and computer vision systems' },
    { name: 'Open Infrastructure', description: 'Developer tooling, security, and decentralized systems' },
  ]);
  const [newTrackName, setNewTrackName] = useState('');
  const [newTrackDesc, setNewTrackDesc] = useState('');

  const [prizes, setPrizes] = useState([
    { name: 'Grand Champion', amount: 5000, description: 'Best overall innovation across all tracks' },
    { name: 'Runner Up', amount: 2000, description: 'Second highest scoring overall submission' },
  ]);
  const [newPrizeName, setNewPrizeName] = useState('');
  const [newPrizeAmount, setNewPrizeAmount] = useState('1000');
  const [newPrizeDesc, setNewPrizeDesc] = useState('');

  const [judgingConfig, setJudgingConfig] = useState({
    mode: 'BOTH', // 'RUBRIC' | 'PAIRWISE' | 'BOTH'
    criteria: [
      { criterion_key: 'tech', name: 'Technical Execution', weight: 1.5, description: 'Architecture, engineering complexity, and code quality' },
      { criterion_key: 'impact', name: 'Impact & Utility', weight: 1.0, description: 'Practical value and problem-solution fit' },
      { criterion_key: 'design', name: 'UX & Design', weight: 1.0, description: 'Intuitiveness and workflow clarity' },
      { criterion_key: 'novelty', name: 'Originality & Novelty', weight: 1.0, description: 'Fresh perspective and creativity' },
    ],
  });

  const handleAddTrack = () => {
    if (!newTrackName.trim()) return;
    setTracks(prev => [...prev, { name: newTrackName.trim(), description: newTrackDesc.trim() }]);
    setNewTrackName('');
    setNewTrackDesc('');
  };

  const handleRemoveTrack = (idx) => {
    setTracks(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAddPrize = () => {
    if (!newPrizeName.trim()) return;
    setPrizes(prev => [...prev, {
      name: newPrizeName.trim(),
      amount: Number(newPrizeAmount) || 0,
      description: newPrizeDesc.trim(),
    }]);
    setNewPrizeName('');
    setNewPrizeAmount('1000');
    setNewPrizeDesc('');
  };

  const handleRemovePrize = (idx) => {
    setPrizes(prev => prev.filter((_, i) => i !== idx));
  };

  const validateStep = (step) => {
    if (step === 1) {
      if (!basics.name.trim()) return 'Hackathon name is required';
    }
    if (step === 2) {
      if (!schedule.submissions_close) return 'Submission deadline is required';
      const subTime = new Date(schedule.submissions_close).getTime();
      const startTime = new Date(schedule.start_time).getTime();
      const endTime = new Date(schedule.end_time).getTime();
      if (subTime <= startTime) return 'Submissions must close after the start time';
      if (endTime <= subTime) return 'Judging must conclude after submissions close';
    }
    if (step === 3) {
      if (tracks.length === 0) return 'At least one competition track is required';
    }
    return null;
  };

  const nextStep = () => {
    const err = validateStep(currentStep);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setCurrentStep(prev => prev + 1);
  };

  const prevStep = () => {
    setError(null);
    setCurrentStep(prev => Math.max(1, prev - 1));
  };

  const handlePublish = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        name: basics.name.trim(),
        description: basics.description.trim(),
        slug: basics.slug.trim() || undefined,
        start_time: new Date(schedule.start_time).toISOString(),
        submissions_close: new Date(schedule.submissions_close).toISOString(),
        end_time: new Date(schedule.end_time).toISOString(),
        status: 'PUBLISHED',
        judging_mode: judgingConfig.mode,
        tracks: tracks.map(t => ({ name: t.name, description: t.description })),
        prizes: prizes.map(p => ({ name: p.name, amount: p.amount, description: p.description })),
        rubric_criteria: judgingConfig.criteria,
      };

      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Creation failed with HTTP ${res.status}`);
      }

      setPublishedEvent(data.event);
      if (onEventCreated) {
        onEventCreated(data.event);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Celebration view when published
  if (publishedEvent) {
    const publicUrl = `${window.location.origin}/#event=${publishedEvent.slug || publishedEvent.id}`;
    return (
      <div className="wizard-celebration-card">
        <div className="celebration-badge">🚀 HACKATHON LIVE &bull; PUBLISHED</div>
        <h2 style={{ fontSize: '2.2rem', marginBottom: '0.75rem', color: 'var(--text-bright)' }}>
          {publishedEvent.name} is Published!
        </h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: '580px', margin: '0 auto 1.75rem', lineHeight: 1.6 }}>
          Your event is now live and accepting participant registrations.
          Share the official public link with hackers and community members.
        </p>

        <div className="share-link-box">
          <input
            type="text"
            readOnly
            value={publicUrl}
            className="form-control"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              navigator.clipboard?.writeText(publicUrl);
              alert('Copied public event link to clipboard!');
            }}
          >
            Copy Link
          </button>
        </div>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onEventCreated && onEventCreated(publishedEvent)}
          >
            Open Organizer Workspace &rarr;
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard-container">
      {/* Wizard Header */}
      <div className="wizard-header">
        <div>
          <span className="section-eyebrow">ORGANIZER ONBOARDING</span>
          <h2 className="wizard-title">Create a New Hackathon</h2>
          <p className="wizard-subtitle">
            Configure your competition architecture, tracks, schedule, and judging rubrics.
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
          ✕ Exit Wizard
        </button>
      </div>

      {/* Progress Steps Indicator */}
      <div className="wizard-steps-track">
        {[
          { num: 1, label: 'Basics' },
          { num: 2, label: 'Schedule' },
          { num: 3, label: 'Tracks' },
          { num: 4, label: 'Prizes' },
          { num: 5, label: 'Judging' },
          { num: 6, label: 'Review' },
        ].map((s) => (
          <div
            key={s.num}
            className={`wizard-step-pill ${currentStep === s.num ? 'active' : currentStep > s.num ? 'completed' : ''}`}
            onClick={() => s.num < currentStep && setCurrentStep(s.num)}
          >
            <span className="step-num">{currentStep > s.num ? '✓' : s.num}</span>
            <span className="step-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Error alert */}
      {error && (
        <div className="banner danger" style={{ margin: '1rem 0' }}>
          <span>⛔</span>
          <div><strong>Validation Error:</strong> {error}</div>
        </div>
      )}

      {/* Step Contents */}
      <div className="wizard-card-body">
        {/* STEP 1: BASICS */}
        {currentStep === 1 && (
          <div className="wizard-step-content">
            <h3>Step 1: Event Identity &amp; Mission</h3>
            <p className="step-helper">Define the public name, overview, and URL slug for your hackathon.</p>

            <div className="form-group">
              <label className="form-label">
                Hackathon Name <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Build Bharat 2026, Nexus AI Hackathon"
                value={basics.name}
                onChange={(e) => {
                  const val = e.target.value;
                  setBasics(prev => ({
                    ...prev,
                    name: val,
                    slug: prev.slug === '' || prev.slug === prev.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                      ? val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                      : prev.slug,
                  }));
                }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description / Mission Statement</label>
              <textarea
                className="form-control"
                placeholder="Explain the hackathon theme, target participants, and challenges..."
                rows={4}
                value={basics.description}
                onChange={(e) => setBasics(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Custom URL Slug (Optional)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  /hackathons/
                </span>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. build-bharat-2026"
                  value={basics.slug}
                  onChange={(e) => setBasics(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                />
              </div>
              <span className="field-hint">Used for public links: {window.location.origin}/#event={basics.slug || 'my-hackathon'}</span>
            </div>
          </div>
        )}

        {/* STEP 2: SCHEDULE */}
        {currentStep === 2 && (
          <div className="wizard-step-content">
            <h3>Step 2: Lifecycle Timeline &amp; Deadlines</h3>
            <p className="step-helper">
              Strict automated enforcement. Submissions lock automatically once the deadline arrives.
            </p>

            <div className="form-group">
              <label className="form-label">Registration &amp; Hackathon Start</label>
              <input
                type="datetime-local"
                className="form-control"
                value={schedule.start_time}
                onChange={(e) => setSchedule(prev => ({ ...prev, start_time: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                Submissions Close Deadline <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="datetime-local"
                className="form-control"
                value={schedule.submissions_close}
                onChange={(e) => setSchedule(prev => ({ ...prev, submissions_close: e.target.value }))}
              />
              <span className="field-hint">Projects cannot be submitted or edited after this exact moment.</span>
            </div>

            <div className="form-group">
              <label className="form-label">Judging Concludes / Results Ready</label>
              <input
                type="datetime-local"
                className="form-control"
                value={schedule.end_time}
                onChange={(e) => setSchedule(prev => ({ ...prev, end_time: e.target.value }))}
              />
            </div>
          </div>
        )}

        {/* STEP 3: TRACKS */}
        {currentStep === 3 && (
          <div className="wizard-step-content">
            <h3>Step 3: Competition Tracks</h3>
            <p className="step-helper">Participants submit dossiers targeting one specific competition track.</p>

            <div className="tracks-builder-list">
              {tracks.map((t, idx) => (
                <div key={idx} className="builder-item-row">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-bright)' }}>{t.name}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t.description}</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => handleRemoveTrack(idx)}
                  >
                    ✕ Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="builder-add-card">
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem' }}>+ Add Track</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '0.75rem', alignItems: 'center' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Track Name (e.g. FinTech)"
                  value={newTrackName}
                  onChange={(e) => setNewTrackName(e.target.value)}
                />
                <input
                  type="text"
                  className="form-control"
                  placeholder="Track Description..."
                  value={newTrackDesc}
                  onChange={(e) => setNewTrackDesc(e.target.value)}
                />
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddTrack}>
                  Add Track
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: PRIZES */}
        {currentStep === 4 && (
          <div className="wizard-step-content">
            <h3>Step 4: Prize Pool &amp; Recognitions</h3>
            <p className="step-helper">Incentivize top engineering talent with verified bounties and awards.</p>

            <div className="tracks-builder-list">
              {prizes.map((p, idx) => (
                <div key={idx} className="builder-item-row">
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <strong style={{ color: 'var(--text-bright)' }}>{p.name}</strong>
                      <span className="prize-amount-pill">${Number(p.amount).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{p.description}</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => handleRemovePrize(idx)}
                  >
                    ✕ Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="builder-add-card">
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem' }}>+ Add Prize</div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: '0.75rem', alignItems: 'center' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Prize Title (e.g. Best AI App)"
                  value={newPrizeName}
                  onChange={(e) => setNewPrizeName(e.target.value)}
                />
                <input
                  type="number"
                  className="form-control"
                  placeholder="Amount ($)"
                  value={newPrizeAmount}
                  onChange={(e) => setNewPrizeAmount(e.target.value)}
                />
                <input
                  type="text"
                  className="form-control"
                  placeholder="Criteria or description..."
                  value={newPrizeDesc}
                  onChange={(e) => setNewPrizeDesc(e.target.value)}
                />
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddPrize}>
                  Add Prize
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: JUDGING */}
        {currentStep === 5 && (
          <div className="wizard-step-content">
            <h3>Step 5: Judging Architecture</h3>
            <p className="step-helper">Configure evaluation dimensions and enable Pairwise comparison arena.</p>

            <div className="form-group">
              <label className="form-label">Evaluation Engine Mode</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                {[
                  { id: 'BOTH', title: 'Hybrid: Rubric + Pairwise', desc: 'Full rubric scores + Bradley-Terry pairwise validation' },
                  { id: 'RUBRIC', title: 'Rubric Scoring Only', desc: 'Standard weighted 1-5 criteria evaluations' },
                  { id: 'PAIRWISE', title: 'Pairwise Arena Only', desc: 'Pure head-to-head project comparisons' },
                ].map((modeOption) => (
                  <div
                    key={modeOption.id}
                    className={`mode-select-card ${judgingConfig.mode === modeOption.id ? 'active' : ''}`}
                    onClick={() => setJudgingConfig(prev => ({ ...prev, mode: modeOption.id }))}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--text-bright)', marginBottom: '0.3rem' }}>
                      {modeOption.title}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{modeOption.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <label className="form-label">Scoring Criteria Dimensions</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {judgingConfig.criteria.map((c, i) => (
                  <div key={i} className="builder-item-row">
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-bright)' }}>{c.name}</span>
                        <span className="rubric-weight-chip">{c.weight}x Weight</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{c.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 6: REVIEW & PUBLISH */}
        {currentStep === 6 && (
          <div className="wizard-step-content">
            <h3>Step 6: Review &amp; Launch</h3>
            <p className="step-helper">Verify your competition settings before publishing to the live directory.</p>

            <div className="review-summary-box">
              <div className="review-section">
                <span className="review-label">Hackathon Name</span>
                <span className="review-value" style={{ fontWeight: 800 }}>{basics.name}</span>
              </div>
              <div className="review-section">
                <span className="review-label">Public Slug</span>
                <span className="review-value">/hackathons/{basics.slug || 'auto'}</span>
              </div>
              <div className="review-section">
                <span className="review-label">Submission Deadline</span>
                <span className="review-value">{new Date(schedule.submissions_close).toLocaleString()}</span>
              </div>
              <div className="review-section">
                <span className="review-label">Competition Tracks</span>
                <span className="review-value">{tracks.map(t => t.name).join(', ')}</span>
              </div>
              <div className="review-section">
                <span className="review-label">Total Prize Categories</span>
                <span className="review-value">{prizes.length} awards (${prizes.reduce((a, b) => a + b.amount, 0).toLocaleString()} total pool)</span>
              </div>
              <div className="review-section">
                <span className="review-label">Judging Engine</span>
                <span className="review-value">{judgingConfig.mode}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Wizard Footer Controls */}
      <div className="wizard-footer">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={prevStep}
          disabled={currentStep === 1 || submitting}
        >
          &larr; Back
        </button>

        {currentStep < 6 ? (
          <button type="button" className="btn btn-primary" onClick={nextStep}>
            Next Step &rarr;
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handlePublish}
            disabled={submitting}
          >
            {submitting ? 'Publishing Hackathon...' : '🚀 Publish Hackathon Live'}
          </button>
        )}
      </div>
    </div>
  );
}
