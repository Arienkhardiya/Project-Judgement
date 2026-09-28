import express from 'express';
import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Memory store for voter submission velocity rate limiting (IP / User ID)
const recentVotes = new Map();

export function _resetVotingRateLimits() {
  recentVotes.clear();
}

export function getRateLimitWindowMs() {
  if (process.env.RATE_LIMIT_WINDOW_MS !== undefined) {
    return parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10);
  }
  return process.env.NODE_ENV === 'test' ? 0 : 2000;
}

export function isRateLimited(key) {
  const now = Date.now();
  const windowMs = getRateLimitWindowMs();
  const lastTime = recentVotes.get(key) || 0;
  if (now - lastTime < windowMs) {
    return true;
  }
  recentVotes.set(key, now);
  return false;
}

/**
 * Deterministic PRNG-based Fisher-Yates shuffle to randomize ballots per user
 * Prevents first-entry positional bias while maintaining consistent order for the voter during session
 */
function deterministicShuffle(array, seedStr) {
  const copy = [...array];
  let hash = crypto.createHash('sha256').update(seedStr).digest();
  let hashIdx = 0;

  function nextInt(max) {
    if (hashIdx + 4 > hash.length) {
      hash = crypto.createHash('sha256').update(hash).digest();
      hashIdx = 0;
    }
    const val = hash.readUInt32BE(hashIdx);
    hashIdx += 4;
    return val % max;
  }

  for (let i = copy.length - 1; i > 0; i--) {
    const j = nextInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

// 1. GET /api/voting/windows - List voting windows
router.get('/windows', (req, res) => {
  const db = getDatabase();
  const eventId = req.query.event_id || 'evt_01';

  const windows = db.prepare(`
    SELECT id, event_id, title, start_time, end_time, is_active, created_at
    FROM voting_windows
    WHERE event_id = ?
    ORDER BY created_at DESC
  `).all(eventId);

  const now = new Date().toISOString();
  const annotated = windows.map(w => {
    let status = 'CLOSED';
    if (!w.is_active) {
      status = 'INACTIVE';
    } else if (now < w.start_time) {
      status = 'UPCOMING';
    } else if (now <= w.end_time) {
      status = 'OPEN';
    }
    return { ...w, current_status: status };
  });

  res.json({ windows: annotated });
});

// 2. POST /api/voting/windows - Create or open voting window (Organizer only)
router.post('/windows', requireRole('organizer', 'admin'), (req, res) => {
  const db = getDatabase();
  const { event_id = 'evt_01', title, start_time, end_time, is_active = 1 } = req.body;

  if (!title || !start_time || !end_time) {
    return res.status(400).json({ error: 'Title, start_time, and end_time are required' });
  }

  const windowId = `vwin_${crypto.randomBytes(6).toString('hex')}`;
  db.prepare(`
    INSERT INTO voting_windows (id, event_id, title, start_time, end_time, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(windowId, event_id, title, start_time, end_time, is_active ? 1 : 0);

  res.status(201).json({
    message: 'Voting window created successfully',
    window: { id: windowId, event_id, title, start_time, end_time, is_active }
  });
});

// 3. GET /api/voting/ballot - Retrieve randomized ballot for voter
router.get('/ballot', (req, res) => {
  const db = getDatabase();
  const eventId = req.query.event_id || 'evt_01';
  const trackId = req.query.track_id;

  let query = `
    SELECT 
      p.id, p.title, p.summary, p.repo_url, p.demo_url, p.team_id,
      t.name as team_name, tr.name as track_name, tr.id as track_id
    FROM projects p
    JOIN teams t ON t.id = p.team_id
    LEFT JOIN tracks tr ON tr.id = p.track_id
    WHERE t.event_id = ? AND p.status = 'SUBMITTED'
  `;
  const params = [eventId];
  if (trackId) {
    query += ` AND p.track_id = ?`;
    params.push(trackId);
  }

  const projects = db.prepare(query).all(...params);

  // Identify voter's own teams to flag self-voting prevention in UI
  let ownTeamIds = new Set();
  if (req.user) {
    const userTeams = db.prepare(`
      SELECT team_id FROM team_members WHERE user_id = ?
    `).all(req.user.id);
    ownTeamIds = new Set(userTeams.map(t => t.team_id));
  }

  const annotated = projects.map(p => ({
    ...p,
    is_own_team: ownTeamIds.has(p.team_id),
  }));

  // Seed for shuffle: use voter ID if authenticated, or session token / client IP
  const seed = req.user?.id || req.sessionToken || req.ip || 'anonymous_seed';
  const randomizedBallot = deterministicShuffle(annotated, seed);

  // Check if voter has already cast a vote
  let userVote = null;
  if (req.user) {
    userVote = db.prepare(`
      SELECT project_id, created_at FROM votes WHERE event_id = ? AND voter_user_id = ?
    `).get(eventId, req.user.id);
  }

  res.json({
    event_id: eventId,
    ballot_count: randomizedBallot.length,
    has_voted: Boolean(userVote),
    voted_project_id: userVote?.project_id || null,
    projects: randomizedBallot
  });
});

// 4. POST /api/voting/vote - Cast a community vote with anti-abuse enforcement
router.post('/vote', requireAuth, (req, res) => {
  const db = getDatabase();
  const { event_id = 'evt_01', project_id } = req.body;
  const voterId = req.user.id;

  if (!project_id) {
    return res.status(400).json({ error: 'project_id is required' });
  }

  // Rate limiting check
  if (isRateLimited(voterId)) {
    return res.status(429).json({ error: 'Too many voting attempts. Please slow down.' });
  }

  // Check project validity and status
  const project = db.prepare(`
    SELECT p.id, p.team_id, p.status, t.event_id
    FROM projects p
    JOIN teams t ON t.id = p.team_id
    WHERE p.id = ?
  `).get(project_id);

  if (!project || project.status !== 'SUBMITTED') {
    return res.status(404).json({ error: 'Project not found or not submitted' });
  }

  if (project.event_id !== event_id) {
    return res.status(400).json({ error: 'Project belongs to a different event' });
  }

  // Check voting window status
  const now = new Date().toISOString();
  const activeWindow = db.prepare(`
    SELECT id, start_time, end_time, is_active
    FROM voting_windows
    WHERE event_id = ? AND is_active = 1
    ORDER BY created_at DESC
    LIMIT 1
  `).get(event_id);

  if (activeWindow) {
    if (now < activeWindow.start_time) {
      return res.status(400).json({ error: 'Voting window has not opened yet' });
    }
    if (now > activeWindow.end_time) {
      return res.status(400).json({ error: 'Voting window is closed' });
    }
  }

  // Anti-abuse Rule 1: Self-Voting Strictly Prohibited
  const isMemberOfTeam = db.prepare(`
    SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?
  `).get(project.team_id, voterId);

  if (isMemberOfTeam) {
    return res.status(403).json({
      error: 'Self-voting is strictly prohibited. You cannot vote for your own team’s project.'
    });
  }

  // Anti-abuse Rule 2: Exactly 1 vote per user per event
  const existingVote = db.prepare(`
    SELECT id, project_id FROM votes WHERE event_id = ? AND voter_user_id = ?
  `).get(event_id, voterId);

  if (existingVote) {
    return res.status(409).json({
      error: 'You have already voted in this event. Duplicate votes are rejected.'
    });
  }

  // Insert vote
  const voteId = `vote_${crypto.randomBytes(8).toString('hex')}`;
  try {
    db.prepare(`
      INSERT INTO votes (id, event_id, project_id, voter_user_id)
      VALUES (?, ?, ?, ?)
    `).run(voteId, event_id, project_id, voterId);
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Duplicate vote rejected by constraint' });
    }
    throw err;
  }

  res.status(201).json({
    message: 'Vote cast successfully',
    vote_id: voteId,
    project_id,
    timestamp: new Date().toISOString()
  });
});

// 5. GET /api/voting/results - Blind voting window results
router.get('/results', (req, res) => {
  const db = getDatabase();
  const eventId = req.query.event_id || 'evt_01';

  // Check if active voting window is currently OPEN
  const now = new Date().toISOString();
  const activeWindow = db.prepare(`
    SELECT id, title, start_time, end_time, is_active
    FROM voting_windows
    WHERE event_id = ? AND is_active = 1
    ORDER BY created_at DESC
    LIMIT 1
  `).get(eventId);

  const isWindowOpen = activeWindow && now >= activeWindow.start_time && now <= activeWindow.end_time;
  const isOrganizer = req.user?.roles?.includes('organizer') || req.user?.roles?.includes('admin');

  // Blind voting enforcement: If window is open and user is not organizer, withhold totals
  if (isWindowOpen && !isOrganizer) {
    return res.json({
      event_id: eventId,
      is_blind: true,
      status: 'OPEN',
      window_closes_at: activeWindow.end_time,
      message: 'Voting is currently active. Results remain sealed until the voting window closes to ensure impartiality.'
    });
  }

  // Tally votes per project
  const results = db.prepare(`
    SELECT 
      p.id as project_id,
      p.title,
      t.name as team_name,
      tr.name as track_name,
      COUNT(v.id) as vote_count
    FROM projects p
    JOIN teams t ON t.id = p.team_id
    LEFT JOIN tracks tr ON tr.id = p.track_id
    LEFT JOIN votes v ON v.project_id = p.id AND v.event_id = ?
    WHERE t.event_id = ? AND p.status = 'SUBMITTED'
    GROUP BY p.id
    ORDER BY vote_count DESC, p.title ASC
  `).all(eventId, eventId);

  const totalVotes = db.prepare(`
    SELECT COUNT(*) as count FROM votes WHERE event_id = ?
  `).get(eventId).count;

  // Compute rank
  let rank = 1;
  const rankedResults = results.map((r, i) => {
    if (i > 0 && r.vote_count < results[i - 1].vote_count) {
      rank = i + 1;
    }
    return {
      rank,
      project_id: r.project_id,
      title: r.title,
      team_name: r.team_name,
      track_name: r.track_name,
      vote_count: Number(r.vote_count)
    };
  });

  res.json({
    event_id: eventId,
    is_blind: false,
    status: isWindowOpen ? 'OPEN (ORGANIZER VIEW)' : 'CLOSED',
    total_votes: totalVotes,
    results: rankedResults
  });
});

export default router;
