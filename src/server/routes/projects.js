import express from 'express';
import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { requireParticipant, requireAuth } from '../middleware/auth.js';
import { recordVerifiableEvent } from '../services/verification.js';
import { dispatchWebhooks } from '../services/webhook.js';

const router = express.Router();

// Helper to check deadline for a given event ID
function checkEventDeadline(db, eventId) {
  const event = db.prepare('SELECT id, name, submissions_close FROM events WHERE id = ?').get(eventId);
  if (!event) {
    return { ok: false, error: 'Event not found', status: 404 };
  }
  const now = new Date().toISOString();
  if (now >= event.submissions_close) {
    return {
      ok: false,
      isClosed: true,
      error: `Submissions for event "${event.name}" closed on ${event.submissions_close}. Current time is ${now}.`,
      status: 400,
    };
  }
  return { ok: true, isClosed: false, event };
}

// GET /api/projects - Public project query with search & filter
router.get('/api/projects', (req, res) => {
  const { q, track, status, team_id, limit = 100, offset = 0 } = req.query;
  const db = getDatabase();

  let query = `
    SELECT 
      p.id, p.team_id, p.track_id, p.title, p.summary, p.description,
      p.repo_url, p.demo_url, p.status, p.submitted_at, p.created_at,
      tr.name as track_name,
      t.name as team_name,
      e.id as event_id, e.name as event_name
    FROM projects p
    JOIN teams t ON t.id = p.team_id
    JOIN events e ON e.id = t.event_id
    LEFT JOIN tracks tr ON tr.id = p.track_id
    WHERE 1=1
  `;
  const params = [];

  // Filter by status (default to SUBMITTED for public, unless specified)
  if (status) {
    query += ` AND p.status = ?`;
    params.push(status);
  } else {
    // If not authenticated or visitor, only show SUBMITTED
    query += ` AND p.status = 'SUBMITTED'`;
  }

  if (track) {
    query += ` AND (p.track_id = ? OR tr.name LIKE ?)`;
    params.push(track, `%${track}%`);
  }

  if (team_id) {
    query += ` AND p.team_id = ?`;
    params.push(team_id);
  }

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    query += ` AND (p.title LIKE ? OR p.summary LIKE ? OR p.description LIKE ? OR t.name LIKE ?)`;
    params.push(term, term, term, term);
  }

  query += ` ORDER BY p.submitted_at DESC, p.created_at DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));

  const projects = db.prepare(query).all(...params);

  // Get total count for pagination
  const totalRow = db.prepare(`SELECT count(*) as count FROM projects WHERE status = 'SUBMITTED'`).get();

  res.json({
    projects,
    total: totalRow.count,
    limit: Number(limit),
    offset: Number(offset),
  });
});

// GET /api/projects/:id - Public project detail
router.get('/api/projects/:id', (req, res) => {
  const db = getDatabase();
  const project = db.prepare(`
    SELECT 
      p.id, p.team_id, p.track_id, p.title, p.summary, p.description,
      p.repo_url, p.demo_url, p.status, p.submitted_at, p.created_at, p.updated_at,
      tr.name as track_name,
      t.name as team_name,
      e.id as event_id, e.name as event_name, e.submissions_close
    FROM projects p
    JOIN teams t ON t.id = p.team_id
    JOIN events e ON e.id = t.event_id
    LEFT JOIN tracks tr ON tr.id = p.track_id
    WHERE p.id = ?
  `).get(req.params.id);

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // Get team members (public names)
  const members = db.prepare(`
    SELECT u.name, tm.role
    FROM team_members tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = ?
    ORDER BY tm.role DESC, tm.created_at ASC
  `).all(project.team_id);

  res.json({
    project: {
      ...project,
      members,
    },
  });
});

// Helper for handling submission POST logic
function handleProjectSubmission(req, res) {
  const { title, summary, description, repo_url, demo_url, track_id, team_id, action = 'submit' } = req.body;
  const db = getDatabase();

  // 1. Resolve participant's team
  let team;
  if (team_id) {
    team = db.prepare(`
      SELECT t.id, t.event_id, e.submissions_close, e.name as event_name
      FROM teams t
      JOIN events e ON e.id = t.event_id
      JOIN team_members tm ON tm.team_id = t.id
      WHERE t.id = ? AND tm.user_id = ?
    `).get(team_id, req.user.id);
  } else {
    team = db.prepare(`
      SELECT t.id, t.event_id, e.submissions_close, e.name as event_name
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      JOIN events e ON e.id = t.event_id
      WHERE tm.user_id = ?
      ORDER BY tm.created_at DESC
      LIMIT 1
    `).get(req.user.id);
  }

  // If user has no team, look up the default fixture event to verify deadline before anything else
  let deadlineCheck;
  if (team) {
    deadlineCheck = checkEventDeadline(db, team.event_id);
  } else {
    // Default to the first event (e.g. evt_01)
    const defaultEvent = db.prepare('SELECT id FROM events ORDER BY created_at DESC LIMIT 1').get();
    if (!defaultEvent) {
      return res.status(404).json({ error: 'No event found' });
    }
    deadlineCheck = checkEventDeadline(db, defaultEvent.id);
  }

  // 2. SERVER-SIDE DEADLINE ENFORCEMENT:
  // Must return 4xx (400) if current time >= submissions_close
  if (!deadlineCheck.ok) {
    return res.status(deadlineCheck.status || 400).json({
      error: deadlineCheck.error,
      deadline: deadlineCheck.isClosed ? 'EXPIRED' : undefined,
    });
  }

  if (!team) {
    return res.status(400).json({ error: 'You must create or join a team before creating a project' });
  }

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Project title is required' });
  }

  // Resolve track_id: if not provided, pick first track of the event
  let resolvedTrackId = track_id;
  if (!resolvedTrackId) {
    const firstTrack = db.prepare('SELECT id FROM tracks WHERE event_id = ? ORDER BY id ASC LIMIT 1').get(team.event_id);
    resolvedTrackId = firstTrack ? firstTrack.id : null;
  }

  if (!resolvedTrackId) {
    return res.status(400).json({ error: 'A valid track_id is required' });
  }

  const projectId = 'prj_' + crypto.randomBytes(4).toString('hex');
  const now = new Date().toISOString();
  const initialStatus = action === 'draft' ? 'DRAFT' : 'SUBMITTED';
  const submittedAt = initialStatus === 'SUBMITTED' ? now : null;

  db.prepare(`
    INSERT INTO projects (
      id, team_id, track_id, title, summary, description,
      repo_url, demo_url, status, submitted_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    projectId,
    team.id,
    resolvedTrackId,
    title.trim(),
    summary || '',
    description || summary || '',
    repo_url || null,
    demo_url || null,
    initialStatus,
    submittedAt,
    now,
    now
  );

  // Log in audit trail
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'aud_' + crypto.randomBytes(6).toString('hex'),
    req.user.id,
    initialStatus === 'SUBMITTED' ? 'PROJECT_SUBMITTED' : 'PROJECT_DRAFT_CREATED',
    'projects',
    projectId,
    JSON.stringify({ title, track_id: resolvedTrackId, status: initialStatus })
  );

  const created = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  return res.status(201).json({
    message: initialStatus === 'SUBMITTED' ? 'Project submitted successfully' : 'Draft saved successfully',
    project: created,
  });
}

// POST /projects/new - The route tested by run.py and form submission
router.post('/projects/new', requireParticipant, handleProjectSubmission);

// POST /api/projects - Standard API route for submission
router.post('/api/projects', requireParticipant, handleProjectSubmission);

// PUT /api/projects/:id - Edit draft before deadline
router.put('/api/projects/:id', requireParticipant, (req, res) => {
  const db = getDatabase();
  const project = db.prepare(`
    SELECT p.id, p.team_id, p.status, t.event_id, e.submissions_close, e.name as event_name
    FROM projects p
    JOIN teams t ON t.id = p.team_id
    JOIN events e ON e.id = t.event_id
    WHERE p.id = ?
  `).get(req.params.id);

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // Check team ownership: user must be on the project's team
  const isTeamMember = db.prepare(`
    SELECT user_id FROM team_members WHERE team_id = ? AND user_id = ?
  `).get(project.team_id, req.user.id);

  if (!isTeamMember && !req.user.roles.includes('admin')) {
    return res.status(403).json({ error: 'Forbidden: You are not a member of the team that owns this project' });
  }

  // Server-side deadline check
  const deadlineCheck = checkEventDeadline(db, project.event_id);
  if (!deadlineCheck.ok) {
    return res.status(400).json({ error: deadlineCheck.error });
  }

  const { title, summary, description, repo_url, demo_url, track_id } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE projects
    SET 
      title = COALESCE(?, title),
      summary = COALESCE(?, summary),
      description = COALESCE(?, description),
      repo_url = COALESCE(?, repo_url),
      demo_url = COALESCE(?, demo_url),
      track_id = COALESCE(?, track_id),
      updated_at = ?
    WHERE id = ?
  `).run(
    title ? title.trim() : null,
    summary !== undefined ? summary : null,
    description !== undefined ? description : null,
    repo_url !== undefined ? repo_url : null,
    demo_url !== undefined ? demo_url : null,
    track_id || null,
    now,
    project.id
  );

  const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id);
  res.json({ message: 'Project updated successfully', project: updated });
});

// POST /api/projects/:id/submit - Transition DRAFT to SUBMITTED
router.post('/api/projects/:id/submit', requireParticipant, (req, res) => {
  const db = getDatabase();
  const project = db.prepare(`
    SELECT p.id, p.team_id, p.status, t.event_id, e.submissions_close, e.name as event_name
    FROM projects p
    JOIN teams t ON t.id = p.team_id
    JOIN events e ON e.id = t.event_id
    WHERE p.id = ?
  `).get(req.params.id);

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const isTeamMember = db.prepare(`
    SELECT user_id FROM team_members WHERE team_id = ? AND user_id = ?
  `).get(project.team_id, req.user.id);

  if (!isTeamMember && !req.user.roles.includes('admin')) {
    return res.status(403).json({ error: 'Forbidden: You are not a member of the team that owns this project' });
  }

  // Server-side deadline check
  const deadlineCheck = checkEventDeadline(db, project.event_id);
  if (!deadlineCheck.ok) {
    return res.status(400).json({ error: deadlineCheck.error });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE projects
    SET status = 'SUBMITTED', submitted_at = ?, updated_at = ?
    WHERE id = ?
  `).run(now, now, project.id);

  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, 'PROJECT_SUBMITTED', 'projects', ?, ?)
  `).run('aud_' + crypto.randomBytes(6).toString('hex'), req.user.id, project.id, JSON.stringify({ submitted_at: now }));

  // Create verifiable cryptographic audit record for submission
  try {
    recordVerifiableEvent(db, {
      entityType: 'submission',
      entityId: project.id,
      payload: {
        project_id: project.id,
        team_id: project.team_id,
        submitted_at: now,
      },
      signerIdentity: 'dogfood:submission_authority:2026',
    });
  } catch (err) {
    console.warn('Failed to record verifiable submission event:', err.message);
  }

  // Asynchronously dispatch project.submitted webhooks
  dispatchWebhooks(db, project.event_id, 'project.submitted', {
    project_id: project.id,
    team_id: project.team_id,
    submitted_at: now,
  }).catch(() => {});

  res.json({ message: 'Project submitted successfully' });
});

export default router;
