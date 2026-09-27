import express from 'express';
import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { requireOrganizer } from '../middleware/auth.js';

const router = express.Router();

// GET /api/events - List all events (public)
router.get('/', (req, res) => {
  const db = getDatabase();
  const events = db.prepare(`
    SELECT id, name, description, start_time, end_time, submissions_close, created_at
    FROM events
    ORDER BY created_at DESC
  `).all();

  // Add calculated deadline status
  const now = new Date().toISOString();
  const enriched = events.map(e => ({
    ...e,
    is_closed: now >= e.submissions_close,
  }));

  res.json({ events: enriched });
});

// GET /api/events/:id - Get event details with tracks and prizes (public)
router.get('/:id', (req, res) => {
  const db = getDatabase();
  const event = db.prepare(`
    SELECT id, name, description, start_time, end_time, submissions_close, created_at
    FROM events
    WHERE id = ?
  `).get(req.params.id);

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

  const now = new Date().toISOString();
  res.json({
    event: {
      ...event,
      is_closed: now >= event.submissions_close,
    },
    tracks,
    prizes,
  });
});

// POST /api/events - Create new event (organizer only)
router.post('/', requireOrganizer, (req, res) => {
  const { name, description, start_time, end_time, submissions_close } = req.body;

  if (!name || !submissions_close) {
    return res.status(400).json({ error: 'Event name and submissions_close deadline are required' });
  }

  // Validate ISO timestamp
  if (isNaN(Date.parse(submissions_close))) {
    return res.status(400).json({ error: 'Invalid submissions_close timestamp format. Use ISO 8601 (e.g. 2026-03-01T18:00:00Z)' });
  }

  const db = getDatabase();
  const eventId = 'evt_' + crypto.randomBytes(4).toString('hex');

  db.prepare(`
    INSERT INTO events (id, name, description, start_time, end_time, submissions_close)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    eventId,
    name.trim(),
    description || '',
    start_time || new Date().toISOString(),
    end_time || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    submissions_close
  );

  // Log in audit trail
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'aud_' + crypto.randomBytes(6).toString('hex'),
    req.user.id,
    'EVENT_CREATED',
    'events',
    eventId,
    JSON.stringify({ name, submissions_close })
  );

  const created = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  res.status(201).json({ message: 'Event created successfully', event: created });
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
    track: { id: trackId, event_id: event.id, name, description },
  });
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
    prize: { id: prizeId, event_id: event.id, track_id, name, description, amount },
  });
});

export default router;
