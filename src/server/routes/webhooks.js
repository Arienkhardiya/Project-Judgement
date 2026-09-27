import express from 'express';
import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { requireRole } from '../middleware/auth.js';
import { deliverWebhook } from '../services/webhook.js';

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
      created_at: new Date().toISOString(),
    },
  });
});

// 3. GET /api/webhooks/deliveries - List recent webhook deliveries (Organizer only)
router.get('/deliveries', requireRole('organizer', 'admin'), (req, res) => {
  const db = getDatabase();
  const { webhook_id, limit = 50 } = req.query;

  let query = `
    SELECT wd.id, wd.webhook_id, wd.event_type, wd.status_code, wd.delivered_at, w.url
    FROM webhook_deliveries wd
    JOIN webhooks w ON w.id = wd.webhook_id
    WHERE 1=1
  `;
  const params = [];

  if (webhook_id) {
    query += ` AND wd.webhook_id = ?`;
    params.push(webhook_id);
  }

  query += ` ORDER BY wd.delivered_at DESC LIMIT ?`;
  params.push(Number(limit));

  const deliveries = db.prepare(query).all(...params);
  res.json({ deliveries });
});

// 4. POST /api/webhooks/:id/test - Trigger immediate test ping for a registered webhook (Organizer only)
router.post('/:id/test', requireRole('organizer', 'admin'), async (req, res) => {
  const db = getDatabase();
  const { id } = req.params;

  const hook = db.prepare('SELECT id, event_id, url, event_type, secret FROM webhooks WHERE id = ?').get(id);
  if (!hook) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  const testPayload = {
    test: true,
    ping_id: `ping_${crypto.randomBytes(4).toString('hex')}`,
    triggered_by: req.user.id,
    message: 'DOGFOOD 2026 webhook test delivery ping',
  };

  const deliveryResult = await deliverWebhook(hook, 'webhook.test', testPayload, db);

  res.json({
    message: 'Webhook test executed',
    delivery: deliveryResult,
  });
});

// 5. DELETE /api/webhooks/:id - Remove webhook (Organizer only)
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
