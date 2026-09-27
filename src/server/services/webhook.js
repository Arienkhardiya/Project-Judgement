import crypto from 'node:crypto';
import { canonicalizeJson } from './verification.js';

/**
 * Delivers a single webhook event with cryptographic HMAC signature and delivery logging
 */
export async function deliverWebhook(hook, eventType, payload, db = null) {
  const timestamp = new Date().toISOString();
  const deliveryId = `whd_${crypto.randomBytes(6).toString('hex')}`;
  const bodyStr = canonicalizeJson({
    event: eventType,
    event_id: hook.event_id,
    timestamp,
    data: payload,
  });

  const hmacSig = crypto.createHmac('sha256', hook.secret).update(bodyStr, 'utf8').digest('hex');

  let statusCode = null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Judgement-Event': eventType,
        'X-Judgement-Signature': `sha256=${hmacSig}`,
        'X-Judgement-Timestamp': timestamp,
        'User-Agent': 'Dogfood-Verification-Engine/2026',
      },
      body: bodyStr,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    statusCode = res.status;
  } catch (err) {
    statusCode = 0; // Network error or timeout
  }

  if (db) {
    try {
      db.prepare(`
        INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload_json, status_code, delivered_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(deliveryId, hook.id, eventType, bodyStr, statusCode, timestamp);
    } catch (err) {
      console.warn('Warning: Failed to record webhook delivery audit:', err.message);
    }
  }

  return {
    deliveryId,
    webhookId: hook.id,
    statusCode,
    timestamp,
  };
}

/**
 * Dispatches events to all registered and active webhooks matching the event
 */
export async function dispatchWebhooks(db, eventId, eventType, payload) {
  if (!db) return [];

  try {
    const hooks = db.prepare(`
      SELECT id, event_id, url, event_type, secret
      FROM webhooks
      WHERE event_id = ? AND is_active = 1 AND (event_type = ? OR event_type = '*')
    `).all(eventId, eventType);

    if (hooks.length === 0) return [];

    const deliveries = await Promise.allSettled(
      hooks.map(hook => deliverWebhook(hook, eventType, payload, db))
    );

    return deliveries;
  } catch (err) {
    console.warn('Warning: Webhook dispatch encountered error:', err.message);
    return [];
  }
}

export default {
  deliverWebhook,
  dispatchWebhooks,
};
