import express from 'express';
import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { requireAuth, requireOrganizer } from '../middleware/auth.js';
import { calculateNormalization } from '../services/normalization.js';

const router = express.Router();

function calculatePhase(event, now = new Date().toISOString()) {
  if (event.status === 'DRAFT') return 'DRAFT';
  if (event.results_published) return 'RESULTS_PUBLISHED';
  if (event.start_time && now < event.start_time) return 'REGISTRATION_OPEN';
  if (now < event.submissions_close) return 'SUBMISSION_OPEN';
  if (event.end_time && now < event.end_time) return 'JUDGING_OPEN';
  return 'JUDGING_COMPLETE';
}

// GET /api/events - List all events (public + organizer filtering)
router.get('/', (req, res) => {
  const db = getDatabase();
  const { organizer_id, my_events } = req.query;

  let query = `
    SELECT
      e.id, e.name, e.description, e.start_time, e.end_time, e.submissions_close, e.created_at,
      e.organizer_id, e.slug, COALESCE(e.status, 'PUBLISHED') as status,
      COALESCE(e.judging_mode, 'BOTH') as judging_mode,
      COALESCE(e.results_published, 0) as results_published,
      (SELECT COUNT(*) FROM tracks WHERE event_id = e.id) as tracks_count,
      (SELECT COUNT(*) FROM projects p JOIN teams t ON t.id = p.team_id WHERE t.event_id = e.id AND p.status = 'SUBMITTED') as projects_count,
      (SELECT COUNT(*) FROM teams WHERE event_id = e.id) as teams_count
    FROM events e
    WHERE 1=1
  `;
  const params = [];

  if (organizer_id) {
    query += ` AND e.organizer_id = ?`;
    params.push(organizer_id);
  } else if (my_events === 'true' && req.user) {
    query += ` AND e.organizer_id = ?`;
    params.push(req.user.id);
  } else if (!req.user || (!req.user.roles.includes('organizer') && !req.user.roles.includes('admin'))) {
    // Public visitors see non-draft events
    query += ` AND (e.status IS NULL OR e.status != 'DRAFT')`;
  }

  query += ` ORDER BY e.created_at DESC`;
  const events = db.prepare(query).all(...params);

  const now = new Date().toISOString();
  const enriched = events.map(e => ({
    ...e,
    is_closed: now >= e.submissions_close,
    phase: calculatePhase(e, now),
  }));

  res.json({ events: enriched });
});

// GET /api/events/:id - Get event details with tracks and prizes (public by ID or slug)
router.get('/:id', (req, res) => {
  const db = getDatabase();
  const param = req.params.id;

  const event = db.prepare(`
    SELECT
      id, name, description, start_time, end_time, submissions_close, created_at,
      organizer_id, slug, COALESCE(status, 'PUBLISHED') as status,
      COALESCE(judging_mode, 'BOTH') as judging_mode,
      COALESCE(results_published, 0) as results_published
    FROM events
    WHERE id = ? OR slug = ?
  `).get(param, param);

  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const tracks = db.prepare(`
    SELECT id, name, description
    FROM tracks
    WHERE event_id = ?
    ORDER BY name ASC
  `).all(event.id);

  const prizes = db.prepare(`
    SELECT id, track_id, name, description, amount
    FROM prizes
    WHERE event_id = ?
    ORDER BY amount DESC
  `).all(event.id);

  // Rubric
  const rubric = db.prepare(`
    SELECT id, name, is_locked FROM rubrics WHERE event_id = ? LIMIT 1
  `).get(event.id);

  let criteria = [];
  if (rubric) {
    criteria = db.prepare(`
      SELECT id, criterion_key, name, description, weight, min_score, max_score
      FROM rubric_criteria WHERE rubric_id = ? ORDER BY criterion_key ASC
    `).all(rubric.id);
  }

  // Counts
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM teams WHERE event_id = ?) as teams_count,
      (SELECT COUNT(*) FROM projects p JOIN teams t ON t.id = p.team_id WHERE t.event_id = ?) as total_projects,
      (SELECT COUNT(*) FROM projects p JOIN teams t ON t.id = p.team_id WHERE t.event_id = ? AND p.status = 'SUBMITTED') as submitted_projects
  `).get(event.id, event.id, event.id);

  const now = new Date().toISOString();
  let isRegistered = false;
  if (req.user) {
    const reg = db.prepare('SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ?').get(event.id, req.user.id);
    const inTeam = db.prepare('SELECT tm.team_id FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE t.event_id = ? AND tm.user_id = ?').get(event.id, req.user.id);
    isRegistered = Boolean(reg || inTeam);
  }

  res.json({
    event: {
      ...event,
      is_closed: now >= event.submissions_close,
      is_registered: isRegistered,
      phase: calculatePhase(event, now),
      teams_count: counts.teams_count || 0,
      total_projects: counts.total_projects || 0,
      submitted_projects: counts.submitted_projects || 0,
    },
    tracks,
    prizes,
    rubric: rubric ? { ...rubric, criteria } : null,
  });
});

// POST /api/events - Create new event (organizer only)
router.post('/', requireOrganizer, (req, res) => {
  const {
    name,
    description,
    start_time,
    end_time,
    submissions_close,
    slug: rawSlug,
    status = 'PUBLISHED',
    judging_mode = 'BOTH',
    tracks = [],
    prizes = [],
    rubric_criteria = [],
  } = req.body;

  if (!name || !submissions_close) {
    return res.status(400).json({ error: 'Event name and submissions_close deadline are required' });
  }

  // Validate ISO timestamp
  if (isNaN(Date.parse(submissions_close))) {
    return res.status(400).json({ error: 'Invalid submissions_close timestamp format. Use ISO 8601 (e.g. 2026-03-01T18:00:00Z)' });
  }

  const db = getDatabase();
  const eventId = 'evt_' + crypto.randomBytes(4).toString('hex');

  // Slug generation
  let baseSlug = (rawSlug || name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  if (!baseSlug) baseSlug = eventId;

  let slug = baseSlug;
  const existingSlug = db.prepare('SELECT id FROM events WHERE slug = ?').get(slug);
  if (existingSlug) {
    slug = `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`;
  }

  const startTime = start_time || new Date().toISOString();
  const endTime = end_time || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO events (
      id, name, description, start_time, end_time, submissions_close,
      organizer_id, slug, status, judging_mode, results_published
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    eventId,
    name.trim(),
    description || '',
    startTime,
    endTime,
    submissions_close,
    req.user ? req.user.id : null,
    slug,
    status,
    judging_mode
  );

  // Default Rubric Creation
  const rubricId = 'rub_' + crypto.randomBytes(4).toString('hex');
  db.prepare(`
    INSERT INTO rubrics (id, event_id, name, is_locked)
    VALUES (?, ?, ?, 0)
  `).run(rubricId, eventId, `${name.trim()} Rubric`);

  const criteriaToInsert = Array.isArray(rubric_criteria) && rubric_criteria.length > 0
    ? rubric_criteria
    : [
        { criterion_key: 'tech', name: 'Technical Execution', description: 'Architecture, engineering complexity, and code quality', weight: 1.5, min_score: 1, max_score: 5 },
        { criterion_key: 'impact', name: 'Impact & Utility', description: 'Real-world relevance, practical value, and problem-solution fit', weight: 1.0, min_score: 1, max_score: 5 },
        { criterion_key: 'design', name: 'UX & Design', description: 'Intuitiveness, aesthetic polish, and workflow clarity', weight: 1.0, min_score: 1, max_score: 5 },
        { criterion_key: 'novelty', name: 'Originality & Novelty', description: 'Fresh perspective, creativity, and unique insight', weight: 1.0, min_score: 1, max_score: 5 },
      ];

  const insertCrit = db.prepare(`
    INSERT INTO rubric_criteria (id, rubric_id, criterion_key, name, description, weight, min_score, max_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const c of criteriaToInsert) {
    insertCrit.run(
      'crit_' + crypto.randomBytes(4).toString('hex'),
      rubricId,
      c.criterion_key,
      c.name,
      c.description || '',
      Number(c.weight) || 1.0,
      Number(c.min_score) || 1.0,
      Number(c.max_score) || 5.0
    );
  }

  // Insert initial tracks if provided
  if (Array.isArray(tracks) && tracks.length > 0) {
    const insertTrack = db.prepare(`
      INSERT INTO tracks (id, event_id, name, description)
      VALUES (?, ?, ?, ?)
    `);
    for (const t of tracks) {
      if (t.name && t.name.trim()) {
        insertTrack.run(
          t.id || 'trk_' + crypto.randomBytes(4).toString('hex'),
          eventId,
          t.name.trim(),
          t.description || ''
        );
      }
    }
  }

  // Insert initial prizes if provided
  if (Array.isArray(prizes) && prizes.length > 0) {
    const insertPrize = db.prepare(`
      INSERT INTO prizes (id, event_id, track_id, name, description, amount)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const p of prizes) {
      if (p.name && p.name.trim()) {
        insertPrize.run(
          p.id || 'prz_' + crypto.randomBytes(4).toString('hex'),
          eventId,
          p.track_id || null,
          p.name.trim(),
          p.description || '',
          Number(p.amount) || 0
        );
      }
    }
  }

  // Log in audit trail
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'aud_' + crypto.randomBytes(6).toString('hex'),
    req.user ? req.user.id : null,
    'EVENT_CREATED',
    'events',
    eventId,
    JSON.stringify({ name, submissions_close, slug, status })
  );

  const created = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  res.status(201).json({
    message: 'Event created successfully',
    event: {
      ...created,
      phase: calculatePhase(created),
    },
  });
});

// PUT /api/events/:id - Update event details (organizer only)
router.put('/:id', requireOrganizer, (req, res) => {
  const db = getDatabase();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const {
    name,
    description,
    start_time,
    end_time,
    submissions_close,
    status,
    judging_mode,
    results_published,
  } = req.body;

  db.prepare(`
    UPDATE events
    SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      start_time = COALESCE(?, start_time),
      end_time = COALESCE(?, end_time),
      submissions_close = COALESCE(?, submissions_close),
      status = COALESCE(?, status),
      judging_mode = COALESCE(?, judging_mode),
      results_published = COALESCE(?, results_published)
    WHERE id = ?
  `).run(
    name !== undefined ? name.trim() : null,
    description !== undefined ? description : null,
    start_time || null,
    end_time || null,
    submissions_close || null,
    status || null,
    judging_mode || null,
    results_published !== undefined ? Number(results_published) : null,
    event.id
  );

  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(event.id);
  res.json({ message: 'Event updated successfully', event: updated });
});

// POST /api/events/:id/publish-results - Publish official results (organizer only)
router.post('/:id/publish-results', requireOrganizer, (req, res) => {
  const db = getDatabase();
  const event = db.prepare('SELECT id, name FROM events WHERE id = ?').get(req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  db.prepare(`UPDATE events SET results_published = 1 WHERE id = ?`).run(event.id);

  // Log in audit trail
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, 'RESULTS_PUBLISHED', 'events', ?, ?)
  `).run(
    'aud_' + crypto.randomBytes(6).toString('hex'),
    req.user ? req.user.id : null,
    event.id,
    JSON.stringify({ eventName: event.name, publishedAt: new Date().toISOString() })
  );

  res.json({ message: 'Results published successfully', event_id: event.id, results_published: 1 });
});

// GET /api/events/:id/results - Public official competition results (only if results_published or organizer)
router.get('/:id/results', (req, res) => {
  const db = getDatabase();
  const param = req.params.id;
  const event = db.prepare('SELECT id, name, results_published FROM events WHERE id = ? OR slug = ?').get(param, param);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const isOrganizer = req.user && (req.user.roles.includes('organizer') || req.user.roles.includes('admin'));
  if (!event.results_published && !isOrganizer) {
    return res.status(403).json({ error: 'Results have not been published for this event yet' });
  }

  const result = calculateNormalization(event.id, db);
  res.json({
    event_id: event.id,
    event_name: event.name,
    results_published: !!event.results_published,
    ...result
  });
});

// POST /api/events/:id/tracks - Add track (organizer only)
router.post('/:id/tracks', requireOrganizer, (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Track name is required' });
  }

  const db = getDatabase();
  const event = db.prepare('SELECT id FROM events WHERE id = ?').get(req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const trackId = 'trk_' + crypto.randomBytes(4).toString('hex');
  db.prepare(`
    INSERT INTO tracks (id, event_id, name, description)
    VALUES (?, ?, ?, ?)
  `).run(trackId, event.id, name.trim(), description || '');

  res.status(201).json({
    message: 'Track added successfully',
    track: { id: trackId, event_id: event.id, name: name.trim(), description: description || '' },
  });
});

// DELETE /api/events/:id/tracks/:trackId - Delete track (organizer only)
router.delete('/:id/tracks/:trackId', requireOrganizer, (req, res) => {
  const db = getDatabase();
  const { id: eventId, trackId } = req.params;

  const inUse = db.prepare(`
    SELECT COUNT(*) as count FROM projects WHERE track_id = ?
  `).get(trackId);

  if (inUse && inUse.count > 0) {
    return res.status(400).json({ error: 'Cannot delete track: projects have already been submitted under this track' });
  }

  db.prepare('DELETE FROM tracks WHERE id = ? AND event_id = ?').run(trackId, eventId);
  res.json({ message: 'Track deleted successfully' });
});

// POST /api/events/:id/prizes - Add prize (organizer only)
router.post('/:id/prizes', requireOrganizer, (req, res) => {
  const { name, description, amount, track_id } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Prize name is required' });
  }

  const db = getDatabase();
  const event = db.prepare('SELECT id FROM events WHERE id = ?').get(req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const prizeId = 'prz_' + crypto.randomBytes(4).toString('hex');
  db.prepare(`
    INSERT INTO prizes (id, event_id, track_id, name, description, amount)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(prizeId, event.id, track_id || null, name.trim(), description || '', Number(amount) || 0);

  res.status(201).json({
    message: 'Prize added successfully',
    prize: { id: prizeId, event_id: event.id, track_id, name: name.trim(), description: description || '', amount: Number(amount) || 0 },
  });
});

// DELETE /api/events/:id/prizes/:prizeId - Delete prize (organizer only)
router.delete('/:id/prizes/:prizeId', requireOrganizer, (req, res) => {
  const db = getDatabase();
  const { id: eventId, prizeId } = req.params;

  db.prepare('DELETE FROM prizes WHERE id = ? AND event_id = ?').run(prizeId, eventId);
  res.json({ message: 'Prize deleted successfully' });
});

// POST /api/events/:id/register - Register participant for event
router.post('/:id/register', requireAuth, (req, res) => {
  const db = getDatabase();
  const param = req.params.id;
  const event = db.prepare('SELECT id, name, status, submissions_close FROM events WHERE id = ? OR slug = ?').get(param, param);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const regId = 'reg_' + crypto.randomBytes(6).toString('hex');
  db.prepare(`
    INSERT OR IGNORE INTO event_registrations (id, event_id, user_id)
    VALUES (?, ?, ?)
  `).run(regId, event.id, req.user.id);

  // Ensure role includes participant
  db.prepare(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, 'participant')`).run(req.user.id);

  // Log in audit trail
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, 'EVENT_REGISTERED', 'events', ?, ?)
  `).run('aud_' + crypto.randomBytes(6).toString('hex'), req.user.id, event.id, JSON.stringify({ eventName: event.name }));

  res.status(201).json({
    message: `Successfully registered for ${event.name}! You can now join or create a team and start building.`,
    event_id: event.id,
    is_registered: true,
  });
});

// GET /api/events/:id/my-registration - Check if current user is registered
router.get('/:id/my-registration', requireAuth, (req, res) => {
  const db = getDatabase();
  const param = req.params.id;
  const event = db.prepare('SELECT id FROM events WHERE id = ? OR slug = ?').get(param, param);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const reg = db.prepare('SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ?').get(event.id, req.user.id);
  const inTeam = db.prepare('SELECT tm.team_id FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE t.event_id = ? AND tm.user_id = ?').get(event.id, req.user.id);

  res.json({
    event_id: event.id,
    isRegistered: Boolean(reg || inTeam),
  });
});

// PATCH /api/events/:id/status - Update event lifecycle phase (organizer only)
router.patch('/:id/status', requireOrganizer, (req, res) => {
  const { status } = req.body;
  const validStatuses = [
    'DRAFT', 'PUBLISHED', 'REGISTRATION_OPEN', 'SUBMISSION_OPEN',
    'SUBMISSION_CLOSED', 'JUDGING_OPEN', 'JUDGING_COMPLETE', 'RESULTS_PUBLISHED', 'ARCHIVED'
  ];

  if (!status || !validStatuses.includes(status.toUpperCase())) {
    return res.status(400).json({ error: `Invalid status. Valid phases: ${validStatuses.join(', ')}` });
  }

  const db = getDatabase();
  const event = db.prepare('SELECT id, name FROM events WHERE id = ?').get(req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const newStatus = status.toUpperCase();
  const resultsPublished = newStatus === 'RESULTS_PUBLISHED' ? 1 : undefined;

  if (resultsPublished !== undefined) {
    db.prepare(`UPDATE events SET status = ?, results_published = ? WHERE id = ?`).run(newStatus, resultsPublished, event.id);
  } else {
    db.prepare(`UPDATE events SET status = ? WHERE id = ?`).run(newStatus, event.id);
  }

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, 'EVENT_STATUS_CHANGED', 'events', ?, ?)
  `).run('aud_' + crypto.randomBytes(6).toString('hex'), req.user.id, event.id, JSON.stringify({ oldStatus: event.status, newStatus }));

  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(event.id);
  res.json({
    message: `Event lifecycle status updated to ${newStatus}`,
    event: updated,
  });
});

export default router;
