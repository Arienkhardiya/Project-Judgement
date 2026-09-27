import { getDatabase } from '../db/database.js';

export function extractSessionToken(req) {
  // 1. Check Cookie header (raw or parsed)
  if (req.cookies && req.cookies.session) {
    return req.cookies.session;
  }
  const rawCookie = req.headers.cookie;
  if (rawCookie) {
    const match = rawCookie.match(/(?:^|;\s*)session=([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
  }

  // 2. Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && (parts[0].toLowerCase() === 'bearer' || parts[0].toLowerCase() === 'session')) {
      return parts[1];
    }
    const match = authHeader.match(/session=([a-zA-Z0-9_-]+)/i);
    if (match) return match[1];
  }

  // 3. Check custom header
  if (req.headers['x-session-token']) {
    return req.headers['x-session-token'];
  }

  return null;
}

export function sessionMiddleware(req, res, next) {
  const token = extractSessionToken(req);
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const db = getDatabase();
    const session = db.prepare(`
      SELECT s.token, s.user_id, s.expires_at, u.email, u.name
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND datetime(s.expires_at) > datetime('now', 'utc')
    `).get(token);

    if (!session) {
      req.user = null;
      return next();
    }

    const rolesRows = db.prepare(`
      SELECT role_id FROM user_roles WHERE user_id = ?
    `).all(session.user_id);

    const roles = rolesRows.map(r => r.role_id);

    req.user = {
      id: session.user_id,
      email: session.email,
      name: session.name,
      roles,
    };
    req.sessionToken = token;
  } catch (err) {
    console.error('Session middleware error:', err);
    req.user = null;
  }

  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!req.user.roles.includes(role) && !req.user.roles.includes('admin')) {
      return res.status(403).json({ error: `Forbidden: role '${role}' required` });
    }
    next();
  };
}

export const requireParticipant = requireRole('participant');
export const requireJudge = requireRole('judge');
export const requireOrganizer = requireRole('organizer');
export const requireAdmin = requireRole('admin');
