import express from 'express';
import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { requireOrganizer } from '../middleware/auth.js';
import { calculateNormalization } from '../services/normalization.js';
import { generateResultsCsv } from '../services/csv.js';

const router = express.Router();

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// GET /api/organizer/dashboard - Comprehensive Judging Progress View
router.get('/dashboard', requireOrganizer, (req, res) => {
  const db = getDatabase();
  const event = db.prepare('SELECT id, name FROM events ORDER BY created_at DESC LIMIT 1').get();
  if (!event) return res.status(404).json({ error: 'No event found' });

  // 1. Overall Assignment Stats
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
  const event = db.prepare('SELECT id FROM events ORDER BY created_at DESC LIMIT 1').get();
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
  const event = db.prepare('SELECT id, name FROM events ORDER BY created_at DESC LIMIT 1').get();
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

// POST /api/organizer/judges/invite - Invite a new judge
router.post('/judges/invite', requireOrganizer, (req, res) => {
  const { email, name, track_ids = [] } = req.body;
  if (!email || !name) {
    return res.status(400).json({ error: 'Email and name are required' });
  }

  const db = getDatabase();
  const judgeId = 'jdg_' + crypto.randomBytes(4).toString('hex');
  const tempPasswordHash = hashPassword('judge123');

  // Insert or update user with judge role
  db.prepare(`
    INSERT INTO users (id, email, name, password_hash)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET name = excluded.name
  `).run(judgeId, email.trim().toLowerCase(), name.trim(), tempPasswordHash);

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
  const actualUserId = existingUser ? existingUser.id : judgeId;

  db.prepare(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, 'judge')`).run(actualUserId);

  // Link tracks
  if (Array.isArray(track_ids)) {
    const insertTrack = db.prepare(`INSERT OR IGNORE INTO judge_tracks (judge_user_id, track_id) VALUES (?, ?)`);
    for (const tid of track_ids) {
      insertTrack.run(actualUserId, tid);
    }
  }

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, 'JUDGE_INVITED', 'users', ?, ?)
  `).run('aud_' + crypto.randomBytes(6).toString('hex'), req.user.id, actualUserId, JSON.stringify({ email, track_ids }));

  res.status(201).json({
    message: `Judge ${name} invited successfully`,
    judge: { id: actualUserId, email, name, track_ids },
  });
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
  const { reviews_per_project = 3, batch_id = 'auto_batch' } = req.body;
  const db = getDatabase();

  const event = db.prepare('SELECT id FROM events ORDER BY created_at DESC LIMIT 1').get();
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

export default router;
