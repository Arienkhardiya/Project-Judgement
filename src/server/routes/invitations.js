import express from 'express';
import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';

const router = express.Router();

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// GET /api/invitations/:token - Inspect invitation details (public)
router.get('/:token', (req, res) => {
  const { token } = req.params;
  const db = getDatabase();

  const invite = db.prepare(`
    SELECT 
      i.id, i.event_id, i.email, i.name, i.role, i.token, i.status,
      i.track_ids_json, i.expires_at, i.created_at,
      e.name as event_name, e.slug as event_slug, e.description as event_description
    FROM event_invitations i
    JOIN events e ON e.id = i.event_id
    WHERE i.token = ?
  `).get(token);

  if (!invite) {
    return res.status(404).json({ error: 'Invitation not found or invalid token.' });
  }

  const now = new Date().toISOString();
  const isExpired = now >= invite.expires_at;

  let tracks = [];
  try {
    if (invite.track_ids_json) {
      const trackIds = JSON.parse(invite.track_ids_json);
      if (Array.isArray(trackIds) && trackIds.length > 0) {
        tracks = db.prepare(`SELECT id, name FROM tracks WHERE id IN (${trackIds.map(() => '?').join(',')})`).all(...trackIds);
      }
    }
  } catch {}

  res.json({
    invitation: {
      id: invite.id,
      event_id: invite.event_id,
      event_name: invite.event_name,
      event_slug: invite.event_slug,
      event_description: invite.event_description,
      email: invite.email,
      name: invite.name,
      role: invite.role,
      status: isExpired && invite.status === 'PENDING' ? 'EXPIRED' : invite.status,
      expires_at: invite.expires_at,
      tracks,
    },
  });
});

// POST /api/invitations/:token/accept - Accept invitation
router.post('/:token/accept', (req, res) => {
  const { token } = req.params;
  const { password, name } = req.body;
  const db = getDatabase();

  const invite = db.prepare(`
    SELECT * FROM event_invitations WHERE token = ?
  `).get(token);

  if (!invite) {
    return res.status(404).json({ error: 'Invitation not found.' });
  }

  const now = new Date().toISOString();
  if (now >= invite.expires_at || invite.status === 'EXPIRED') {
    return res.status(400).json({ error: 'This invitation has expired.' });
  }

  if (invite.status === 'ACCEPTED') {
    return res.status(400).json({ error: 'This invitation has already been accepted.' });
  }

  if (invite.status === 'REVOKED') {
    return res.status(400).json({ error: 'This invitation has been revoked by the organizer.' });
  }

  let targetUserId = null;
  let newSessionToken = null;

  if (req.user) {
    // Authenticated user accepting invitation
    targetUserId = req.user.id;
  } else {
    // Non-authenticated flow: check if account with email exists
    const cleanEmail = invite.email.trim().toLowerCase();
    const existing = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(cleanEmail);

    if (existing) {
      // User exists (or was pre-registered via invitation): update password if supplied
      if (password) {
        if (password.length < 6) {
          return res.status(400).json({ error: 'Please provide a password of at least 6 characters.' });
        }
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), existing.id);
      }
      targetUserId = existing.id;
    } else {
      // Create new user account with judge role
      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Please provide a secure password of at least 6 characters.' });
      }

      targetUserId = 'jdg_' + crypto.randomBytes(4).toString('hex');
      db.prepare(`
        INSERT INTO users (id, email, name, password_hash, is_verified)
        VALUES (?, ?, ?, ?, 1)
      `).run(targetUserId, cleanEmail, (name || invite.name).trim(), hashPassword(password));
    }

    // Create session for the user
    newSessionToken = 'ses_' + crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO sessions (token, user_id, expires_at)
      VALUES (?, ?, ?)
    `).run(newSessionToken, targetUserId, expiresAt);

    res.cookie('session', newSessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  // Assign judge role
  db.prepare(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)`).run(targetUserId, invite.role || 'judge');

  // Assign designated tracks if provided
  try {
    if (invite.track_ids_json) {
      const trackIds = JSON.parse(invite.track_ids_json);
      if (Array.isArray(trackIds)) {
        const insertTrack = db.prepare(`INSERT OR IGNORE INTO judge_tracks (judge_user_id, track_id) VALUES (?, ?)`);
        for (const tid of trackIds) {
          insertTrack.run(targetUserId, tid);
        }
      }
    }
  } catch {}

  // Mark invitation as accepted
  db.prepare(`
    UPDATE event_invitations
    SET status = 'ACCEPTED', accepted_at = datetime('now', 'utc'), accepted_by_user_id = ?
    WHERE id = ?
  `).run(targetUserId, invite.id);

  // Log in audit trail
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, 'INVITATION_ACCEPTED', 'event_invitations', ?, ?)
  `).run(
    'aud_' + crypto.randomBytes(6).toString('hex'),
    targetUserId,
    invite.id,
    JSON.stringify({ event_id: invite.event_id, email: invite.email, role: invite.role })
  );

  const roles = db.prepare(`SELECT role_id FROM user_roles WHERE user_id = ?`).all(targetUserId).map(r => r.role_id);
  const user = db.prepare(`SELECT id, email, name FROM users WHERE id = ?`).get(targetUserId);

  res.json({
    message: `Invitation accepted successfully. You are now designated as an official judge for this event.`,
    event_id: invite.event_id,
    sessionToken: newSessionToken,
    user: {
      ...user,
      roles,
    },
  });
});

export default router;
