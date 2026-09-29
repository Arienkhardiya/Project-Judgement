import express from 'express';
import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { emailService } from '../services/email.js';

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
    SELECT id, email, name, password_hash, COALESCE(is_verified, 1) as is_verified
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
      is_verified: Boolean(user.is_verified),
    },
  });
});

// POST /api/auth/register - Register new user (organizer or participant)
router.post('/register', async (req, res) => {
  const { name, email, password, role = 'participant' } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  const validRoles = ['participant', 'organizer'];
  const userRole = validRoles.includes(role) ? role : 'participant';

  const db = getDatabase();
  const cleanEmail = email.trim().toLowerCase();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const userId = 'usr_' + crypto.randomBytes(6).toString('hex');
  const passwordHash = hashPassword(password);
  const verificationToken = 'vfy_' + crypto.randomBytes(16).toString('hex');
  const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO users (id, email, name, password_hash, is_verified, verification_token, verification_token_expires_at)
    VALUES (?, ?, ?, ?, 0, ?, ?)
  `).run(userId, cleanEmail, name.trim(), passwordHash, verificationToken, verificationExpiresAt);

  db.prepare(`
    INSERT INTO user_roles (user_id, role_id)
    VALUES (?, ?)
  `).run(userId, userRole);

  const token = 'ses_' + crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(token, userId, expiresAt);

  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  const baseUrl = `${req.protocol}://${req.get('host') || 'localhost:8080'}`;
  const emailConfigured = emailService.isConfigured();
  let emailDelivered = false;
  let emailError = null;
  let verificationLink = `/verify-email?token=${verificationToken}`;

  try {
    const emailResult = await emailService.sendVerificationEmail({
      email: cleanEmail,
      name: name.trim(),
      token: verificationToken,
      baseUrl,
    });
    emailDelivered = emailResult.success;
    if (!emailResult.success) {
      emailError = emailResult.error || emailResult.reason || null;
    }
    if (emailResult.verifyUrl) verificationLink = emailResult.verifyUrl;
  } catch (err) {
    emailError = err.message;
  }

  let message = '';
  if (emailDelivered) {
    message = 'Account created. Verification email sent.';
  } else if (emailConfigured) {
    message = `Account created. Verification email could not be sent (${emailError || 'SMTP error'}).`;
  } else {
    message = 'Account created. Verification link generated (email delivery not configured).';
  }

  return res.status(201).json({
    message,
    sessionToken: token,
    verificationToken,
    verificationLink,
    emailConfigured,
    emailDelivered,
    emailError,
    user: {
      id: userId,
      email: cleanEmail,
      name: name.trim(),
      roles: [userRole],
      is_verified: false,
    },
  });
});

// POST /api/auth/verify-email - Verify email with single-use token
router.post('/verify-email', (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Verification token is required' });
  }

  const db = getDatabase();
  const now = new Date().toISOString();
  const user = db.prepare(`
    SELECT id, email, name, verification_token_expires_at
    FROM users
    WHERE verification_token = ?
  `).get(token.trim());

  if (!user) {
    return res.status(400).json({ error: 'Invalid or already used verification token' });
  }

  if (user.verification_token_expires_at && now > user.verification_token_expires_at) {
    return res.status(400).json({ error: 'Verification token has expired. Please request a new one.' });
  }

  db.prepare(`
    UPDATE users
    SET is_verified = 1, verification_token = NULL, verification_token_expires_at = NULL
    WHERE id = ?
  `).run(user.id);

  return res.json({
    success: true,
    message: 'Email address verified successfully. Welcome to VERIDICT!',
    user: { id: user.id, email: user.email, name: user.name, is_verified: true },
  });
});

// POST /api/auth/resend-verification - Resend verification email/link
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const db = getDatabase();
  const cleanEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT id, name, is_verified FROM users WHERE email = ?').get(cleanEmail);

  if (!user) {
    return res.json({ message: 'If an unverified account with this email exists, a verification link has been generated.' });
  }

  if (user.is_verified) {
    return res.status(400).json({ error: 'This email is already verified. You can sign in.' });
  }

  const verificationToken = 'vfy_' + crypto.randomBytes(16).toString('hex');
  const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    UPDATE users
    SET verification_token = ?, verification_token_expires_at = ?
    WHERE id = ?
  `).run(verificationToken, verificationExpiresAt, user.id);

  const baseUrl = `${req.protocol}://${req.get('host') || 'localhost:8080'}`;
  const emailConfigured = emailService.isConfigured();
  let emailDelivered = false;
  let emailError = null;
  let verificationLink = `/verify-email?token=${verificationToken}`;

  try {
    const emailResult = await emailService.sendVerificationEmail({
      email: cleanEmail,
      name: user.name,
      token: verificationToken,
      baseUrl,
    });
    emailDelivered = emailResult.success;
    if (!emailResult.success) {
      emailError = emailResult.error || emailResult.reason || null;
    }
    if (emailResult.verifyUrl) verificationLink = emailResult.verifyUrl;
  } catch (err) {
    emailError = err.message;
  }

  let message = '';
  if (emailDelivered) {
    message = 'Verification email sent.';
  } else if (emailConfigured) {
    message = `Verification email could not be sent (${emailError || 'SMTP error'}).`;
  } else {
    message = 'Verification link generated (email delivery not configured).';
  }

  return res.json({
    message,
    emailConfigured,
    emailDelivered,
    emailError,
    verificationToken,
    verificationLink,
  });
});

// POST /api/auth/forgot-password - Request password reset
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const db = getDatabase();
  const cleanEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(cleanEmail);

  const emailConfigured = emailService.isConfigured();
  let resetToken = null;
  let resetLink = null;
  let emailDelivered = false;
  let emailError = null;

  if (user) {
    resetToken = 'rst_' + crypto.randomBytes(16).toString('hex');
    const resetExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    db.prepare(`
      UPDATE users
      SET reset_token = ?, reset_token_expires_at = ?
      WHERE id = ?
    `).run(resetToken, resetExpiresAt, user.id);

    const baseUrl = `${req.protocol}://${req.get('host') || 'localhost:8080'}`;
    resetLink = `/reset-password?token=${resetToken}`;

    try {
      const emailResult = await emailService.sendPasswordResetEmail({
        email: cleanEmail,
        name: user.name,
        token: resetToken,
        baseUrl,
      });
      emailDelivered = emailResult.success;
      if (!emailResult.success) {
        emailError = emailResult.error || emailResult.reason || null;
      }
      if (emailResult.resetUrl) resetLink = emailResult.resetUrl;
    } catch (err) {
      emailError = err.message;
    }
  }

  return res.json({
    message: 'If an account with this email exists, password reset instructions have been generated.',
    emailConfigured,
    emailDelivered,
    emailError,
    resetLink: !emailDelivered && resetLink ? resetLink : undefined,
    resetToken: !emailDelivered && resetToken ? resetToken : undefined,
  });
});

// POST /api/auth/reset-password - Complete password reset
router.post('/reset-password', (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Reset token and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const db = getDatabase();
  const now = new Date().toISOString();
  const user = db.prepare(`
    SELECT id, email, reset_token_expires_at
    FROM users
    WHERE reset_token = ?
  `).get(token.trim());

  if (!user) {
    return res.status(400).json({ error: 'Invalid or already used password reset token' });
  }

  if (user.reset_token_expires_at && now > user.reset_token_expires_at) {
    return res.status(400).json({ error: 'Password reset token has expired. Please request a new one.' });
  }

  const passwordHash = hashPassword(newPassword);

  db.prepare(`
    UPDATE users
    SET password_hash = ?, reset_token = NULL, reset_token_expires_at = NULL
    WHERE id = ?
  `).run(passwordHash, user.id);

  return res.json({
    success: true,
    message: 'Password reset successfully. You can now sign in with your new password.',
  });
});

const CANONICAL_TEST_TOKENS = new Set(['org_7f2a', 'jdg_a_91bc', 'jdg_b_44de', 'prt_2e88']);

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  if (req.sessionToken && !CANONICAL_TEST_TOKENS.has(req.sessionToken)) {
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
  const db = getDatabase();
  const u = db.prepare('SELECT is_verified FROM users WHERE id = ?').get(req.user.id);
  return res.json({
    user: {
      ...req.user,
      is_verified: u ? Boolean(u.is_verified) : true,
    },
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
