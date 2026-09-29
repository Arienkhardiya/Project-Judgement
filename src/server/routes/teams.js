import express from 'express';
import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { requireAuth, requireParticipant } from '../middleware/auth.js';

const router = express.Router();

// GET /api/teams/my-team - Get current user's team and teammates
router.get('/my-team', requireAuth, (req, res) => {
  const db = getDatabase();
  const eventId = req.query.event_id;

  let query = `
    SELECT tm.team_id, tm.role, t.name as team_name, t.invite_code, t.event_id, e.name as event_name, e.submissions_close
    FROM team_members tm
    JOIN teams t ON t.id = tm.team_id
    JOIN events e ON e.id = t.event_id
    WHERE tm.user_id = ?
  `;
  const params = [req.user.id];
  if (eventId) {
    query += ' AND t.event_id = ?';
    params.push(eventId);
  }
  query += ' ORDER BY tm.created_at DESC LIMIT 1';
  const membership = db.prepare(query).get(...params);

  if (!membership) {
    return res.json({ team: null });
  }

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, tm.role, tm.created_at
    FROM team_members tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = ?
    ORDER BY tm.role DESC, tm.created_at ASC
  `).all(membership.team_id);

  const projects = db.prepare(`
    SELECT p.id, p.title, p.summary, p.status, p.track_id, p.submitted_at, tr.name as track_name
    FROM projects p
    LEFT JOIN tracks tr ON tr.id = p.track_id
    WHERE p.team_id = ?
  `).all(membership.team_id);

  res.json({
    team: {
      id: membership.team_id,
      name: membership.team_name,
      invite_code: membership.invite_code,
      invite_link: `/teams/join?code=${membership.invite_code}`,
      event_id: membership.event_id,
      event_name: membership.event_name,
      submissions_close: membership.submissions_close,
      is_closed: new Date().toISOString() >= membership.submissions_close,
      my_role: membership.role,
      members,
      projects,
    },
  });
});

// POST /api/teams - Create a new team
router.post('/', requireParticipant, (req, res) => {
  const { name, event_id } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Team name is required' });
  }

  const db = getDatabase();

  // Find target event (default to first active event or specified)
  const targetEvent = event_id
    ? db.prepare('SELECT id, submissions_close FROM events WHERE id = ?').get(event_id)
    : db.prepare('SELECT id, submissions_close FROM events ORDER BY created_at DESC LIMIT 1').get();

  if (!targetEvent) {
    return res.status(404).json({ error: 'Event not found' });
  }

  // Check if user is already in a team for this event
  const existingMembership = db.prepare(`
    SELECT tm.team_id
    FROM team_members tm
    JOIN teams t ON t.id = tm.team_id
    WHERE tm.user_id = ? AND t.event_id = ?
  `).get(req.user.id, targetEvent.id);

  if (existingMembership) {
    return res.status(400).json({ error: 'You are already a member of a team for this event' });
  }

  const teamId = 'tm_' + crypto.randomBytes(4).toString('hex');
  const inviteCode = 'inv_' + crypto.randomBytes(8).toString('hex');

  // Insert team and add creator as leader
  db.prepare(`
    INSERT INTO teams (id, event_id, name, invite_code)
    VALUES (?, ?, ?, ?)
  `).run(teamId, targetEvent.id, name.trim(), inviteCode);

  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (?, ?, 'leader')
  `).run(teamId, req.user.id);

  res.status(201).json({
    message: 'Team created successfully',
    team: {
      id: teamId,
      name: name.trim(),
      event_id: targetEvent.id,
      invite_code: inviteCode,
      invite_link: `/teams/join?code=${inviteCode}`,
    },
  });
});

// POST /api/teams/join - Join a team using invite code
router.post('/join', requireParticipant, (req, res) => {
  const { invite_code } = req.body;
  if (!invite_code || !invite_code.trim()) {
    return res.status(400).json({ error: 'Invite code is required' });
  }

  const db = getDatabase();
  const team = db.prepare(`
    SELECT id, name, event_id
    FROM teams
    WHERE invite_code = ?
  `).get(invite_code.trim());

  if (!team) {
    return res.status(404).json({ error: 'Invalid or expired invite code' });
  }

  // Check if user is already on this team
  const alreadyMember = db.prepare(`
    SELECT role FROM team_members WHERE team_id = ? AND user_id = ?
  `).get(team.id, req.user.id);

  if (alreadyMember) {
    return res.status(400).json({ error: 'You are already a member of this team' });
  }

  // Check if user is already on another team for the same event
  const otherTeam = db.prepare(`
    SELECT t.name FROM team_members tm
    JOIN teams t ON t.id = tm.team_id
    WHERE tm.user_id = ? AND t.event_id = ?
  `).get(req.user.id, team.event_id);

  if (otherTeam) {
    return res.status(400).json({
      error: `You are already a member of team "${otherTeam.name}" in this event. Leave it first to join another.`
    });
  }

  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (?, ?, 'member')
  `).run(team.id, req.user.id);

  res.json({
    message: `Successfully joined team ${team.name}`,
    team: {
      id: team.id,
      name: team.name,
      event_id: team.event_id,
    },
  });
});

export default router;
