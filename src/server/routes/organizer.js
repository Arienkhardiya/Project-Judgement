import express from 'express';
import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { requireOrganizer } from '../middleware/auth.js';
import { calculateNormalization } from '../services/normalization.js';
import { generateResultsCsv } from '../services/csv.js';
import { exportEventData, importEventData } from '../services/bulk.js';
import { calculatePairwiseRanking, generatePairAssignments } from '../services/pairwise.js';
import { emailService } from '../services/email.js';

const router = express.Router();

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// GET /api/organizer/dashboard - Comprehensive Judging Progress View
router.get('/dashboard', requireOrganizer, (req, res) => {
  const db = getDatabase();
  const eventId = req.query.event_id;
  const event = eventId
    ? db.prepare(`
        SELECT id, name, description, start_time, end_time, submissions_close,
               organizer_id, slug, COALESCE(status, 'PUBLISHED') as status,
               COALESCE(judging_mode, 'BOTH') as judging_mode,
               COALESCE(results_published, 0) as results_published
        FROM events WHERE id = ?
      `).get(eventId)
    : db.prepare(`
        SELECT id, name, description, start_time, end_time, submissions_close,
               organizer_id, slug, COALESCE(status, 'PUBLISHED') as status,
               COALESCE(judging_mode, 'BOTH') as judging_mode,
               COALESCE(results_published, 0) as results_published
        FROM events ORDER BY created_at DESC LIMIT 1
      `).get();
  if (!event) return res.status(404).json({ error: 'No event found' });

  // 1. Overall Lifecycle Stats
  const lifecycle = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM teams WHERE event_id = ?) as total_teams,
      (SELECT COUNT(DISTINCT tm.user_id) FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE t.event_id = ?) as total_participants,
      (SELECT COUNT(*) FROM projects p JOIN teams t ON t.id = p.team_id WHERE t.event_id = ?) as total_projects,
      (SELECT COUNT(*) FROM projects p JOIN teams t ON t.id = p.team_id WHERE t.event_id = ? AND p.status = 'SUBMITTED') as submitted_projects,
      (SELECT COUNT(*) FROM projects p JOIN teams t ON t.id = p.team_id WHERE t.event_id = ? AND p.status = 'DRAFT') as draft_projects
  `).get(event.id, event.id, event.id, event.id, event.id);

  // 2. Overall Assignment Stats
  const totals = db.prepare(`
    SELECT
      COUNT(*) as total_assignments,
      SUM(CASE WHEN ja.status = 'ASSIGNED' THEN 1 ELSE 0 END) as not_started,
      SUM(CASE WHEN ja.status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN ja.status = 'SUBMITTED' THEN 1 ELSE 0 END) as submitted
    FROM judge_assignments ja
    JOIN projects p ON p.id = ja.project_id
    JOIN teams t ON t.id = p.team_id
    WHERE t.event_id = ?
  `).get(event.id);

  // 2. Track Breakdown
  const tracks = db.prepare(`
    SELECT
      tr.id as track_id,
      tr.name as track_name,
      COUNT(ja.id) as total_assignments,
      SUM(CASE WHEN ja.status = 'SUBMITTED' THEN 1 ELSE 0 END) as submitted,
      COUNT(DISTINCT p.id) as project_count
    FROM tracks tr
    LEFT JOIN projects p ON p.track_id = tr.id
    LEFT JOIN judge_assignments ja ON ja.project_id = p.id
    WHERE tr.event_id = ?
    GROUP BY tr.id, tr.name
    ORDER BY tr.name ASC
  `).all(event.id);

  // 3. Judge Breakdown
  const judges = db.prepare(`
    SELECT
      u.id as judge_id,
      u.name,
      u.email,
      COUNT(ja.id) as total_assigned,
      SUM(CASE WHEN ja.status = 'SUBMITTED' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN ja.status != 'SUBMITTED' THEN 1 ELSE 0 END) as pending
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id AND ur.role_id = 'judge'
    LEFT JOIN judge_assignments ja ON ja.judge_user_id = u.id
    GROUP BY u.id, u.name, u.email
    ORDER BY completed DESC, u.name ASC
  `).all();

  // 4. Batch Breakdown
  const batches = db.prepare(`
    SELECT
      COALESCE(ja.batch_id, 'default') as batch_id,
      COUNT(*) as total,
      SUM(CASE WHEN ja.status = 'SUBMITTED' THEN 1 ELSE 0 END) as submitted
    FROM judge_assignments ja
    JOIN projects p ON p.id = ja.project_id
    JOIN teams t ON t.id = p.team_id
    WHERE t.event_id = ?
    GROUP BY ja.batch_id
  `).all(event.id);

  res.json({
    event,
    lifecycle: {
      total_teams: lifecycle.total_teams || 0,
      total_participants: lifecycle.total_participants || 0,
      total_projects: lifecycle.total_projects || 0,
      submitted_projects: lifecycle.submitted_projects || 0,
      draft_projects: lifecycle.draft_projects || 0,
    },
    totals: {
      total: totals.total_assignments || 0,
      not_started: totals.not_started || 0,
      in_progress: totals.in_progress || 0,
      submitted: totals.submitted || 0,
      completion_percentage: totals.total_assignments
        ? Number(((totals.submitted / totals.total_assignments) * 100).toFixed(1))
        : 0,
    },
    tracks,
    judges,
    batches,
  });
});

// GET /api/organizer/normalized - Normalization results with mathematical breakdown
router.get('/normalized', requireOrganizer, (req, res) => {
  const db = getDatabase();
  const eventId = req.query.event_id;
  const event = eventId
    ? db.prepare('SELECT id FROM events WHERE id = ?').get(eventId)
    : db.prepare('SELECT id FROM events ORDER BY created_at DESC LIMIT 1').get();
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const result = calculateNormalization(event.id, db);

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, 'NORMALIZATION_EXECUTED', 'events', ?, ?)
  `).run('aud_' + crypto.randomBytes(6).toString('hex'), req.user.id, event.id, JSON.stringify({ projectCount: result.projects.length }));

  res.json(result);
});

// GET /api/export.csv - RFC 4180 CSV export (Organizer-only)
router.get('/export.csv', requireOrganizer, (req, res) => {
  const db = getDatabase();
  const eventId = req.query.event_id;
  const event = eventId
    ? db.prepare('SELECT id, name FROM events WHERE id = ?').get(eventId)
    : db.prepare('SELECT id, name FROM events ORDER BY created_at DESC LIMIT 1').get();
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const result = calculateNormalization(event.id, db);
  const csvContent = generateResultsCsv(result.projects);

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, 'CSV_EXPORTED', 'events', ?, ?)
  `).run('aud_' + crypto.randomBytes(6).toString('hex'), req.user.id, event.id, JSON.stringify({ exportRows: result.projects.length }));

  const dateStr = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="dogfood-results-${dateStr}.csv"`);
  res.status(200).send(csvContent);
});

// GET /api/organizer/export.json (or /api/export.json) - Full JSON Bulk Export (signed with Ed25519)
router.get('/export.json', requireOrganizer, (req, res) => {
  const db = getDatabase();
  try {
    const data = exportEventData(db, req.query.event_id || null);
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="dogfood-export-${dateStr}.json"`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/organizer/import.json - Full JSON Bulk Import with transaction safety
router.post('/import.json', requireOrganizer, (req, res) => {
  const db = getDatabase();
  try {
    const result = importEventData(db, req.body);
    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
      VALUES (?, ?, 'BULK_IMPORT_EXECUTED', 'events', ?, ?)
    `).run('aud_' + crypto.randomBytes(6).toString('hex'), req.user.id, result.event_id, JSON.stringify(result.counts));

    res.status(201).json({
      message: 'Bulk event import completed successfully',
      ...result,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/organizer/audit - Audit trail
router.get('/audit', requireOrganizer, (req, res) => {
  const db = getDatabase();
  const logs = db.prepare(`
    SELECT a.id, a.actor_user_id, u.name as actor_name, a.action, a.entity_type, a.entity_id, a.details_json, a.created_at
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.actor_user_id
    ORDER BY a.created_at DESC
    LIMIT 200
  `).all();

  res.json({ logs });
});

// POST /api/organizer/judges/invite - Invite a new judge with real invitation record & email delivery
router.post('/judges/invite', requireOrganizer, async (req, res) => {
  const { email, name, track_ids = [], event_id } = req.body;
  if (!email || !name) {
    return res.status(400).json({ error: 'Email and name are required' });
  }

  const db = getDatabase();
  const cleanEmail = email.trim().toLowerCase();

  // Determine target event
  let targetEventId = event_id;
  if (!targetEventId) {
    const defaultEvt = db.prepare('SELECT id, name FROM events ORDER BY created_at DESC LIMIT 1').get();
    targetEventId = defaultEvt ? defaultEvt.id : 'evt_01';
  }
  const event = db.prepare('SELECT id, name FROM events WHERE id = ?').get(targetEventId);
  const eventName = event ? event.name : 'Hackathon';

  const judgeId = 'jdg_' + crypto.randomBytes(4).toString('hex');
  const tempPasswordHash = hashPassword('judge123');

  // Insert or update user with judge role
  db.prepare(`
    INSERT INTO users (id, email, name, password_hash, is_verified)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(email) DO UPDATE SET name = excluded.name
  `).run(judgeId, cleanEmail, name.trim(), tempPasswordHash);

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  const actualUserId = existingUser ? existingUser.id : judgeId;

  db.prepare(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, 'judge')`).run(actualUserId);

  // Link tracks
  if (Array.isArray(track_ids)) {
    const insertTrack = db.prepare(`INSERT OR IGNORE INTO judge_tracks (judge_user_id, track_id) VALUES (?, ?)`);
    for (const tid of track_ids) {
      insertTrack.run(actualUserId, tid);
    }
  }

  // Create real event_invitations record
  const invitationId = 'inv_' + crypto.randomBytes(6).toString('hex');
  const token = 'tok_' + crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  db.prepare(`
    INSERT INTO event_invitations (id, event_id, email, name, role, token, status, track_ids_json, created_by_user_id, expires_at)
    VALUES (?, ?, ?, ?, 'judge', ?, 'PENDING', ?, ?, ?)
  `).run(invitationId, targetEventId, cleanEmail, name.trim(), token, JSON.stringify(track_ids), req.user.id, expiresAt);

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, 'JUDGE_INVITED', 'users', ?, ?)
  `).run('aud_' + crypto.randomBytes(6).toString('hex'), req.user.id, actualUserId, JSON.stringify({ email: cleanEmail, track_ids, event_id: targetEventId, invitation_id: invitationId }));

  const baseUrl = `${req.protocol}://${req.get('host') || 'localhost:8080'}`;
  let emailDelivered = false;
  let inviteLink = `/invite/judge/${token}`;

  try {
    const emailResult = await emailService.sendJudgeInvitationEmail({
      email: cleanEmail,
      name: name.trim(),
      eventName,
      token,
      baseUrl,
    });
    emailDelivered = emailResult.success;
    if (emailResult.inviteUrl) inviteLink = emailResult.inviteUrl;
  } catch (err) {}

  res.status(201).json({
    message: emailDelivered
      ? `Invitation sent via email to ${cleanEmail}.`
      : `Invitation created. Email delivery is not configured.`,
    emailDelivered,
    inviteLink,
    token,
    invitation: {
      id: invitationId,
      token,
      email: cleanEmail,
      name: name.trim(),
      event_id: targetEventId,
      expires_at: expiresAt,
      status: 'PENDING',
    },
    defaultPassword: 'judge123',
    judge: { id: actualUserId, email: cleanEmail, name: name.trim(), track_ids },
  });
});

// GET /api/organizer/invitations - List event invitations
router.get('/invitations', requireOrganizer, (req, res) => {
  const db = getDatabase();
  const eventId = req.query.event_id;
  let query = `
    SELECT
      i.id, i.event_id, i.email, i.name, i.role, i.token, i.status,
      i.track_ids_json, i.expires_at, i.created_at, i.accepted_at,
      u.name as accepted_by_name
    FROM event_invitations i
    LEFT JOIN users u ON u.id = i.accepted_by_user_id
    WHERE 1=1
  `;
  const params = [];
  if (eventId) {
    query += ` AND i.event_id = ?`;
    params.push(eventId);
  }
  query += ` ORDER BY i.created_at DESC`;
  const invitations = db.prepare(query).all(...params);
  res.json({ invitations });
});

// GET /api/organizer/judges - List all judges and tracks
router.get('/judges', requireOrganizer, (req, res) => {
  const db = getDatabase();
  const judges = db.prepare(`
    SELECT u.id, u.name, u.email
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id AND ur.role_id = 'judge'
    ORDER BY u.name ASC
  `).all();

  for (const j of judges) {
    const tracks = db.prepare(`
      SELECT tr.id, tr.name
      FROM judge_tracks jt
      JOIN tracks tr ON tr.id = jt.track_id
      WHERE jt.judge_user_id = ?
    `).all(j.id);
    j.tracks = tracks;
  }

  res.json({ judges });
});

// POST /api/organizer/assignments - Manually assign project to judge
router.post('/assignments', requireOrganizer, (req, res) => {
  const { judge_user_id, project_id, batch_id = 'default', override_track = false } = req.body;
  if (!judge_user_id || !project_id) {
    return res.status(400).json({ error: 'judge_user_id and project_id are required' });
  }

  const db = getDatabase();
  const project = db.prepare('SELECT id, track_id FROM projects WHERE id = ?').get(project_id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Track restriction verification
  if (!override_track) {
    const judgeTrack = db.prepare(`
      SELECT track_id FROM judge_tracks
      WHERE judge_user_id = ? AND track_id = ?
    `).get(judge_user_id, project.track_id);

    if (!judgeTrack) {
      return res.status(400).json({
        error: `Track mismatch: Judge is not assigned to track ${project.track_id}. Set override_track: true to bypass.`,
      });
    }
  }

  const assignmentId = `asgn_${crypto.randomBytes(6).toString('hex')}`;
  db.prepare(`
    INSERT INTO judge_assignments (id, judge_user_id, project_id, batch_id, status)
    VALUES (?, ?, ?, ?, 'ASSIGNED')
    ON CONFLICT(judge_user_id, project_id) DO UPDATE SET batch_id = excluded.batch_id
  `).run(assignmentId, judge_user_id, project_id, batch_id);

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, 'ASSIGNMENT_CREATED', 'judge_assignments', ?, ?)
  `).run('aud_' + crypto.randomBytes(6).toString('hex'), req.user.id, assignmentId, JSON.stringify({ judge_user_id, project_id, batch_id }));

  res.status(201).json({ message: 'Assignment created successfully', assignmentId });
});

// POST /api/organizer/assignments/auto - Algorithmic track-aware assignment
router.post('/assignments/auto', requireOrganizer, (req, res) => {
  const { reviews_per_project = 3, batch_id = 'auto_batch', event_id } = req.body;
  const db = getDatabase();

  const event = event_id
    ? db.prepare('SELECT id FROM events WHERE id = ?').get(event_id)
    : db.prepare('SELECT id FROM events ORDER BY created_at DESC LIMIT 1').get();
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const projects = db.prepare(`
    SELECT p.id, p.track_id
    FROM projects p
    JOIN teams t ON t.id = p.team_id
    WHERE t.event_id = ? AND p.status = 'SUBMITTED'
  `).all(event.id);

  const judgeTracks = db.prepare(`
    SELECT jt.judge_user_id, jt.track_id
    FROM judge_tracks jt
  `).all();

  const judgesByTrack = {};
  for (const jt of judgeTracks) {
    if (!judgesByTrack[jt.track_id]) judgesByTrack[jt.track_id] = [];
    judgesByTrack[jt.track_id].push(jt.judge_user_id);
  }

  let createdCount = 0;
  const insertAsgn = db.prepare(`
    INSERT OR IGNORE INTO judge_assignments (id, judge_user_id, project_id, batch_id, status)
    VALUES (?, ?, ?, ?, 'ASSIGNED')
  `);

  for (const p of projects) {
    const candidateJudges = judgesByTrack[p.track_id] || [];
    if (candidateJudges.length === 0) continue;

    // Pick candidate judges deterministically
    const selected = candidateJudges.slice(0, Number(reviews_per_project));
    for (const jId of selected) {
      const asgnId = `asgn_${jId}_${p.id}`;
      const info = insertAsgn.run(asgnId, jId, p.id, batch_id);
      if (info.changes > 0) createdCount++;
    }
  }

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, 'BATCH_ASSIGNMENT_EXECUTED', 'judge_assignments', ?, ?)
  `).run('aud_' + crypto.randomBytes(6).toString('hex'), req.user.id, batch_id, JSON.stringify({ createdCount, reviews_per_project }));

  res.json({ message: `Automated assignment complete. Created ${createdCount} assignments.`, createdCount });
});

// GET /api/organizer/rubric - View rubric and criteria
router.get('/rubric', (req, res) => {
  const db = getDatabase();
  const rubric = db.prepare('SELECT id, name, is_locked FROM rubrics ORDER BY id ASC LIMIT 1').get();
  if (!rubric) return res.status(404).json({ error: 'Rubric not found' });

  const criteria = db.prepare(`
    SELECT id, criterion_key, name, description, weight, min_score, max_score
    FROM rubric_criteria
    WHERE rubric_id = ?
    ORDER BY name ASC
  `).all(rubric.id);

  res.json({ rubric: { ...rubric, criteria } });
});

// PUT /api/organizer/rubric/criteria - Configure rubric criteria (validate ranges & weights, block if locked)
router.put('/rubric/criteria', requireOrganizer, (req, res) => {
  const { criteria } = req.body;
  if (!Array.isArray(criteria) || criteria.length === 0) {
    return res.status(400).json({ error: 'criteria array is required' });
  }

  const db = getDatabase();
  const rubric = db.prepare('SELECT id, is_locked FROM rubrics ORDER BY id ASC LIMIT 1').get();
  if (!rubric) return res.status(404).json({ error: 'Rubric not found' });

  // Immutability rule: If rubric is locked because scores exist, reject silent mutation
  if (rubric.is_locked) {
    return res.status(400).json({
      error: 'Rubric is locked: scores have already been submitted against this rubric. Existing rubric cannot be silently mutated.',
    });
  }

  // Validate all criteria
  for (const c of criteria) {
    if (!c.criterion_key || !c.name) {
      return res.status(400).json({ error: 'Each criterion must have criterion_key and name' });
    }
    const weight = Number(c.weight);
    const minScore = Number(c.min_score);
    const maxScore = Number(c.max_score);

    if (isNaN(weight) || weight <= 0) {
      return res.status(400).json({ error: `Weight for ${c.criterion_key} must be a positive number` });
    }
    if (isNaN(minScore) || isNaN(maxScore) || minScore >= maxScore || minScore < 0) {
      return res.status(400).json({ error: `Invalid score range for ${c.criterion_key}: min must be >= 0 and < max` });
    }
  }

  // Upsert criteria
  const upsertCrit = db.prepare(`
    INSERT INTO rubric_criteria (id, rubric_id, criterion_key, name, description, weight, min_score, max_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(rubric_id, criterion_key) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      weight = excluded.weight,
      min_score = excluded.min_score,
      max_score = excluded.max_score
  `);

  for (const c of criteria) {
    const critId = c.id || `crit_${crypto.randomBytes(4).toString('hex')}`;
    upsertCrit.run(critId, rubric.id, c.criterion_key, c.name, c.description || '', Number(c.weight), Number(c.min_score), Number(c.max_score));
  }

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, 'RUBRIC_UPDATED', 'rubrics', ?, ?)
  `).run('aud_' + crypto.randomBytes(6).toString('hex'), req.user.id, rubric.id, JSON.stringify({ count: criteria.length }));

  res.json({ message: 'Rubric updated successfully' });
});

// =========================================================================
// BONUS B: PAIRWISE COMPARISON ORGANIZER ENDPOINTS
// =========================================================================

// POST /api/organizer/pairwise/assignments/generate - Algorithmic pair generation
router.post('/pairwise/assignments/generate', requireOrganizer, (req, res) => {
  const db = getDatabase();
  const { event_id, track_id, comparisons_per_project = 5 } = req.body;

  const event = event_id
    ? db.prepare('SELECT id, name FROM events WHERE id = ?').get(event_id)
    : db.prepare('SELECT id, name FROM events ORDER BY created_at DESC LIMIT 1').get();

  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  // Fetch submitted projects
  let projectsQuery = `
    SELECT p.id, p.track_id, p.title
    FROM projects p
    JOIN teams t ON t.id = p.team_id
    WHERE t.event_id = ? AND p.status = 'SUBMITTED'
  `;
  const params = [event.id];
  if (track_id) {
    projectsQuery += ' AND p.track_id = ?';
    params.push(track_id);
  }
  projectsQuery += ' ORDER BY p.id ASC';

  const projects = db.prepare(projectsQuery).all(...params);

  // Fetch eligible judges
  let judges = [];
  if (track_id) {
    judges = db.prepare(`
      SELECT DISTINCT jt.judge_user_id as id
      FROM judge_tracks jt
      WHERE jt.track_id = ?
      ORDER BY jt.judge_user_id ASC
    `).all(track_id);
  }
  if (judges.length === 0) {
    judges = db.prepare(`
      SELECT DISTINCT u.id
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      WHERE ur.role_id = 'judge'
      ORDER BY u.id ASC
    `).all();
  }

  const generated = generatePairAssignments(projects, judges, {
    eventId: event.id,
    trackId: track_id || null,
    comparisonsPerProject: Number(comparisons_per_project) || 5,
  });

  const insertPair = db.prepare(`
    INSERT OR IGNORE INTO pairwise_pairs (
      id, event_id, judge_user_id, project_a_id, project_b_id, track_id, status
    ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
  `);

  let createdCount = 0;
  for (const pair of generated.pairs) {
    const info = insertPair.run(
      pair.id,
      pair.event_id,
      pair.judge_user_id,
      pair.project_a_id,
      pair.project_b_id,
      pair.track_id
    );
    if (info.changes > 0) createdCount++;
  }

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, 'PAIRWISE_ASSIGNMENTS_GENERATED', 'pairwise_pairs', ?, ?)
  `).run(
    'aud_' + crypto.randomBytes(6).toString('hex'),
    req.user.id,
    event.id,
    JSON.stringify({ createdCount, totalPlanned: generated.pairs.length, metadata: generated.metadata })
  );

  res.status(201).json({
    message: `Pairwise assignment complete. Created ${createdCount} pair assignments.`,
    createdCount,
    metadata: generated.metadata,
  });
});

// GET /api/organizer/pairwise/rankings - Pairwise Bradley-Terry ranking results
router.get('/pairwise/rankings', requireOrganizer, (req, res) => {
  const db = getDatabase();
  const eventId = req.query.event_id;
  const trackId = req.query.track_id;

  const event = eventId
    ? db.prepare('SELECT id, name FROM events WHERE id = ?').get(eventId)
    : db.prepare('SELECT id, name FROM events ORDER BY created_at DESC LIMIT 1').get();

  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  // 1. Fetch all submitted projects in scope
  let projectsQuery = `
    SELECT p.id, p.title, p.track_id, tr.name as track_name, t.name as team_name
    FROM projects p
    JOIN teams t ON t.id = p.team_id
    LEFT JOIN tracks tr ON tr.id = p.track_id
    WHERE t.event_id = ? AND p.status = 'SUBMITTED'
  `;
  const projParams = [event.id];
  if (trackId) {
    projectsQuery += ' AND p.track_id = ?';
    projParams.push(trackId);
  }
  projectsQuery += ' ORDER BY p.id ASC';

  const projects = db.prepare(projectsQuery).all(...projParams);
  const projectIds = projects.map(p => p.id);

  if (projectIds.length === 0) {
    return res.json({
      event_id: event.id,
      event_name: event.name,
      converged: true,
      iterations: 0,
      total_comparisons: 0,
      projects: [],
    });
  }

  // 2. Fetch completed comparisons
  let comparisonsQuery = `
    SELECT c.id, c.project_a_id, c.project_b_id, c.winner_id, c.is_tie
    FROM pairwise_comparisons c
    WHERE c.event_id = ?
  `;
  const cmpParams = [event.id];
  if (trackId) {
    comparisonsQuery += ' AND (c.project_a_id IN (SELECT id FROM projects WHERE track_id = ?) AND c.project_b_id IN (SELECT id FROM projects WHERE track_id = ?))';
    cmpParams.push(trackId, trackId);
  }

  const rawComparisons = db.prepare(comparisonsQuery).all(...cmpParams);

  // Normalize comparisons for pure solver
  const normalizedComparisons = rawComparisons.map(c => ({
    project_a_id: c.project_a_id,
    project_b_id: c.project_b_id,
    winner_id: c.winner_id,
    is_tie: c.is_tie === 1 || c.is_tie === true,
  }));

  // 3. Compute Bradley-Terry ranking via solver
  const rankingResult = calculatePairwiseRanking(normalizedComparisons, projectIds);

  // 4. Enrich results with project metadata
  const projectMetaMap = new Map();
  for (const p of projects) {
    projectMetaMap.set(p.id, p);
  }

  const enrichedProjects = rankingResult.projects.map(rp => {
    const meta = projectMetaMap.get(rp.project_id) || {};
    return {
      ...rp,
      title: meta.title || rp.project_id,
      track_id: meta.track_id || null,
      track_name: meta.track_name || 'General',
      team_name: meta.team_name || 'Independent',
    };
  });

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, 'PAIRWISE_RANKINGS_VIEWED', 'events', ?, ?)
  `).run(
    'aud_' + crypto.randomBytes(6).toString('hex'),
    req.user.id,
    event.id,
    JSON.stringify({ projectCount: enrichedProjects.length, comparisonCount: normalizedComparisons.length })
  );

  res.json({
    event_id: event.id,
    event_name: event.name,
    converged: rankingResult.converged,
    iterations: rankingResult.iterations,
    total_comparisons: normalizedComparisons.length,
    projects: enrichedProjects,
  });
});

// GET /api/organizer/pairwise/status - Pairwise progress and summary status
router.get('/pairwise/status', requireOrganizer, (req, res) => {
  const db = getDatabase();
  const eventId = req.query.event_id;

  const event = eventId
    ? db.prepare('SELECT id, name FROM events WHERE id = ?').get(eventId)
    : db.prepare('SELECT id, name FROM events ORDER BY created_at DESC LIMIT 1').get();

  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total_pairs,
      SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_pairs,
      SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_pairs
    FROM pairwise_pairs
    WHERE event_id = ?
  `).get(event.id);

  const total = totals.total_pairs || 0;
  const completed = totals.completed_pairs || 0;
  const pending = totals.pending_pairs || 0;

  const judgeStats = db.prepare(`
    SELECT
      u.id as judge_id,
      u.name as judge_name,
      COUNT(pwp.id) as total_assigned,
      SUM(CASE WHEN pwp.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN pwp.status = 'PENDING' THEN 1 ELSE 0 END) as pending
    FROM pairwise_pairs pwp
    JOIN users u ON u.id = pwp.judge_user_id
    WHERE pwp.event_id = ?
    GROUP BY u.id, u.name
    ORDER BY completed DESC, u.name ASC
  `).all(event.id);

  res.json({
    event_id: event.id,
    event_name: event.name,
    totals: {
      total,
      completed,
      pending,
      completion_percentage: total ? Number(((completed / total) * 100).toFixed(1)) : 0,
    },
    judges: judgeStats,
  });
});

export default router;
