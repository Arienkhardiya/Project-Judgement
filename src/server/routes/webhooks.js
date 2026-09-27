import express from 'express';
import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

// 1. GET /api/webhooks - List webhooks (Organizer only)
router.get('/', requireRole('organizer', 'admin'), (req, res) => {
  const db = getDatabase();
  const eventId = req.query.event_id || 'evt_01';

  const hooks = db.prepare(`
    SELECT id, event_id, url, event_type, is_active, created_at
    FROM webhooks
    WHERE event_id = ?
    ORDER BY created_at DESC
  `).all(eventId);

  res.json({ webhooks: hooks });
});

// 2. POST /api/webhooks - Register new webhook (Organizer only)
router.post('/', requireRole('organizer', 'admin'), (req, res) => {
  const db = getDatabase();
  const { event_id = 'evt_01', url, event_type = '*' } = req.body;

  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return res.status(400).json({ error: 'Valid HTTP/HTTPS url is required' });
  }

  const hookId = `whk_${crypto.randomBytes(6).toString('hex')}`;
  const secret = `whsec_${crypto.randomBytes(16).toString('hex')}`;

  db.prepare(`
    INSERT INTO webhooks (id, event_id, url, event_type, secret, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(hookId, event_id, url, event_type, secret);

  res.status(201).json({
    message: 'Webhook registered successfully',
    webhook: {
      id: hookId,
      event_id,
      url,
      event_type,
      secret, // Provided once on creation for signature validation
      created_at: new Date().toISOString()
    }
  });
});

// 3. DELETE /api/webhooks/:id - Remove webhook (Organizer only)
router.delete('/:id', requireRole('organizer', 'admin'), (req, res) => {
  const db = getDatabase();
  const { id } = req.params;

  const hook = db.prepare('SELECT id FROM webhooks WHERE id = ?').get(id);
  if (!hook) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  db.prepare('DELETE FROM webhooks WHERE id = ?').run(id);
  res.json({ message: 'Webhook deleted successfully', id });
});

export default router;
