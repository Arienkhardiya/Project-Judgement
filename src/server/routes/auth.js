import express from 'express';
import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const db = getDatabase();
  const passwordHash = hashPassword(password);

  const user = db.prepare(`
    SELECT id, email, name, password_hash
    FROM users
    WHERE email = ?
  `).get(email.trim().toLowerCase());

  if (!user || user.password_hash !== passwordHash) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = 'ses_' + crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(token, user.id, expiresAt);

  const roles = db.prepare(`
    SELECT role_id FROM user_roles WHERE user_id = ?
  `).all(user.id).map(r => r.role_id);

  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return res.json({
    message: 'Logged in successfully',
    sessionToken: token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      roles,
    },
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  if (req.sessionToken) {
    const db = getDatabase();
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.sessionToken);
  }
  res.clearCookie('session');
  return res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.user) {
    return res.json({ user: null, role: 'visitor' });
  }
  return res.json({
    user: req.user,
    primaryRole: req.user.roles[0] || 'visitor',
  });
});

// POST /api/auth/switch-seeded (for UI demo user quick switcher)
router.post('/switch-seeded', (req, res) => {
  const { roleKey } = req.body;
  const tokenMap = {
    organizer: 'org_7f2a',
    judge_a: 'jdg_a_91bc',
    judge_b: 'jdg_b_44de',
    participant: 'prt_2e88',
  };

  const token = tokenMap[roleKey];
  if (!token) {
    return res.status(400).json({ error: 'Unknown seeded role key' });
  }

  const db = getDatabase();
  const session = db.prepare(`
    SELECT s.token, s.user_id, u.email, u.name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token);

  if (!session) {
    return res.status(404).json({ error: 'Seeded session not found' });
  }

  const roles = db.prepare(`
    SELECT role_id FROM user_roles WHERE user_id = ?
  `).all(session.user_id).map(r => r.role_id);

  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return res.json({
    message: `Switched to seeded ${roleKey}`,
    sessionToken: token,
    user: {
      id: session.user_id,
      email: session.email,
      name: session.name,
      roles,
    },
  });
});

export default router;
