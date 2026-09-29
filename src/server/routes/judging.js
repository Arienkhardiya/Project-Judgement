import express from 'express';
import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { requireAuth, requireJudge, requireOrganizer } from '../middleware/auth.js';
import { recordVerifiableEvent } from '../services/verification.js';

const router = express.Router();

/**
 * CRITICAL SECURITY BARRIER:
 * Resolve judge identifier from query or path and strictly enforce isolation.
 */
function resolveJudgeId(reqJudgeQuery) {
  if (!reqJudgeQuery) return null;
  const q = reqJudgeQuery.trim();
  // Map alias 'judge_a' -> 'jdg_01', 'judge_b' -> 'jdg_02'
  if (q.toLowerCase() === 'judge_a') return 'jdg_01';
  if (q.toLowerCase() === 'judge_b') return 'jdg_02';
  return q;
}

// GET /api/judge/scores - Judge gets own scores. Peer judge access BLOCKED with 403.
router.get('/scores', requireJudge, (req, res) => {
  const db = getDatabase();
  const currentJudgeId = req.user.id;

  // Check query parameter tampering (?judge=..., ?judge_id=..., ?user_id=..., etc.)
  const targetJudgeQuery =
    req.query.judge ||
    req.query.judge_id ||
    req.query.judge_user_id ||
    req.query.user_id ||
    req.query.judgeId ||
    req.query.userId ||
    req.query.target ||
    req.query.target_judge;

  if (targetJudgeQuery) {
    const resolvedTarget = resolveJudgeId(targetJudgeQuery);
    if (resolvedTarget !== currentJudgeId && !req.user.roles.includes('organizer') && !req.user.roles.includes('admin')) {
      return res.status(403).json({
        error: 'Forbidden: Access to peer judge scores is strictly prohibited',
      });
    }
  }

  // Fetch only this judge's scores
  const scores = db.prepare(`
    SELECT
      s.id as score_id,
      s.project_id,
      s.comment,
      s.status,
      s.submitted_at,
      p.title as project_title,
      p.track_id,
      tr.name as track_name,
      t.name as team_name
    FROM scores s
    JOIN projects p ON p.id = s.project_id
    JOIN teams t ON t.id = p.team_id
    LEFT JOIN tracks tr ON tr.id = p.track_id
    WHERE s.judge_user_id = ?
    ORDER BY s.submitted_at DESC
  `).all(currentJudgeId);

  // Fetch criterion values for each score
  for (const s of scores) {
    const values = db.prepare(`
      SELECT criterion_key, value
      FROM score_values
      WHERE score_id = ?
    `).all(s.score_id);

    s.criteria = {};
    for (const v of values) {
      s.criteria[v.criterion_key] = v.value;
    }
  }

  res.json({
    judge_id: currentJudgeId,
    judge_name: req.user.name,
    scores,
  });
});

// GET /api/judge/scores/:scoreId - Retrieve single score with strict ownership check
router.get('/scores/:scoreId', requireJudge, (req, res) => {
  const db = getDatabase();
  const currentJudgeId = req.user.id;
  const { scoreId } = req.params;

  const score = db.prepare(`
    SELECT
      s.id as score_id,
      s.judge_user_id,
      s.project_id,
      s.comment,
      s.status,
      s.submitted_at,
      p.title as project_title,
      p.track_id,
      tr.name as track_name,
      t.name as team_name
    FROM scores s
    JOIN projects p ON p.id = s.project_id
    JOIN teams t ON t.id = p.team_id
    LEFT JOIN tracks tr ON tr.id = p.track_id
    WHERE s.id = ?
  `).get(scoreId);

  if (!score) {
    return res.status(404).json({ error: 'Score not found' });
  }

  // Strict ownership check: only authoring judge or organizer/admin can view
  if (
    score.judge_user_id !== currentJudgeId &&
    !req.user.roles.includes('organizer') &&
    !req.user.roles.includes('admin')
  ) {
    return res.status(403).json({
      error: 'Forbidden: Access to peer judge score is strictly prohibited',
    });
  }

  const values = db.prepare(`
    SELECT criterion_key, value
    FROM score_values
    WHERE score_id = ?
  `).all(score.score_id);

  score.criteria = {};
  for (const v of values) {
    score.criteria[v.criterion_key] = v.value;
  }

  res.json({ score });
});

// GET /api/judge/assignments - List projects assigned to current judge
router.get('/assignments', requireJudge, (req, res) => {
  const db = getDatabase();
  const currentJudgeId = req.user.id;

  const assignments = db.prepare(`
    SELECT
      ja.id as assignment_id,
      ja.project_id,
      ja.batch_id,
      ja.status as assignment_status,
      ja.created_at as assigned_at,
      p.title as project_title,
      p.summary as project_summary,
      p.track_id,
      tr.name as track_name,
      t.name as team_name,
      s.id as score_id,
      s.status as score_status,
      s.comment as score_comment
    FROM judge_assignments ja
    JOIN projects p ON p.id = ja.project_id
    JOIN teams t ON t.id = p.team_id
    LEFT JOIN tracks tr ON tr.id = p.track_id
    LEFT JOIN scores s ON s.project_id = ja.project_id AND s.judge_user_id = ja.judge_user_id
    WHERE ja.judge_user_id = ?
    ORDER BY ja.status ASC, p.title ASC
  `).all(currentJudgeId);

  // Fetch active rubric for scoring
  const rubric = db.prepare(`
    SELECT r.id, r.name, r.is_locked
    FROM rubrics r
    ORDER BY r.id ASC LIMIT 1
  `).get();

  const criteria = rubric ? db.prepare(`
    SELECT id, criterion_key, name, description, weight, min_score, max_score
    FROM rubric_criteria
    WHERE rubric_id = ?
    ORDER BY name ASC
  `).all(rubric.id) : [];

  res.json({
    assignments,
    rubric: {
      ...rubric,
      criteria,
    },
  });
});

// GET /api/judge/assignments/:projectId - Fetch single assigned project detail for scoring
router.get('/assignments/:projectId', requireJudge, (req, res) => {
  const db = getDatabase();
  const currentJudgeId = req.user.id;
  const projectId = req.params.projectId;

  // Strict Assignment Check: Is this judge assigned to this project?
  const assignment = db.prepare(`
    SELECT ja.id as assignment_id, ja.batch_id, ja.status as assignment_status
    FROM judge_assignments ja
    WHERE ja.judge_user_id = ? AND ja.project_id = ?
  `).get(currentJudgeId, projectId);

  if (!assignment) {
    return res.status(403).json({
      error: 'Forbidden: You are not assigned to judge this project',
    });
  }

  // Fetch project details
  const project = db.prepare(`
    SELECT
      p.id, p.title, p.summary, p.description, p.repo_url, p.demo_url,
      p.track_id, tr.name as track_name, t.name as team_name
    FROM projects p
    JOIN teams t ON t.id = p.team_id
    LEFT JOIN tracks tr ON tr.id = p.track_id
    WHERE p.id = ?
  `).get(projectId);

  // Fetch existing score if any
  const existingScore = db.prepare(`
    SELECT id, comment, status, submitted_at
    FROM scores
    WHERE judge_user_id = ? AND project_id = ?
  `).get(currentJudgeId, projectId);

  let criteriaScores = {};
  if (existingScore) {
    const vals = db.prepare(`SELECT criterion_key, value FROM score_values WHERE score_id = ?`).all(existingScore.id);
    for (const v of vals) criteriaScores[v.criterion_key] = v.value;
  }

  // Fetch active rubric for event
  const projEvent = db.prepare(`SELECT t.event_id FROM projects p JOIN teams t ON t.id = p.team_id WHERE p.id = ?`).get(projectId);
  let rubric = projEvent ? db.prepare(`SELECT id, name FROM rubrics WHERE event_id = ? LIMIT 1`).get(projEvent.event_id) : null;
  if (!rubric) rubric = db.prepare(`SELECT id, name FROM rubrics ORDER BY id ASC LIMIT 1`).get();
  const criteria = rubric ? db.prepare(`
    SELECT criterion_key, name, description, weight, min_score, max_score
    FROM rubric_criteria
    WHERE rubric_id = ?
  `).all(rubric.id) : [];

  res.json({
    assignment,
    project,
    rubric: { ...rubric, criteria },
    existingScore: existingScore ? { ...existingScore, criteria: criteriaScores } : null,
  });
});

// POST /api/judge/scores - Submit or update score for assigned project
router.post('/scores', requireJudge, (req, res) => {
  const db = getDatabase();
  const currentJudgeId = req.user.id;
  const { project_id, criteria, comment = '', status = 'SUBMITTED' } = req.body;

  if (!project_id) {
    return res.status(400).json({ error: 'project_id is required' });
  }

  // 1. Strict Assignment Check
  const assignment = db.prepare(`
    SELECT id, status FROM judge_assignments
    WHERE judge_user_id = ? AND project_id = ?
  `).get(currentJudgeId, project_id);

  if (!assignment) {
    return res.status(403).json({
      error: 'Forbidden: You cannot score a project you are not assigned to',
    });
  }

  // 2. Fetch Active Rubric and Validate Criteria Values
  const projectEvent = db.prepare(`
    SELECT t.event_id FROM projects p JOIN teams t ON t.id = p.team_id WHERE p.id = ?
  `).get(project_id);

  let rubric = projectEvent ? db.prepare('SELECT id FROM rubrics WHERE event_id = ? LIMIT 1').get(projectEvent.event_id) : null;
  if (!rubric) {
    rubric = db.prepare(`SELECT id FROM rubrics ORDER BY id ASC LIMIT 1`).get();
  }
  if (!rubric) {
    return res.status(500).json({ error: 'No active rubric configured for event' });
  }

  const validCriteria = db.prepare(`
    SELECT criterion_key, min_score, max_score
    FROM rubric_criteria
    WHERE rubric_id = ?
  `).all(rubric.id);

  const criteriaMap = new Map(validCriteria.map(c => [c.criterion_key, c]));

  if (criteria && typeof criteria === 'object') {
    for (const [key, val] of Object.entries(criteria)) {
      if (!criteriaMap.has(key)) {
        return res.status(400).json({ error: `Unknown rubric criterion: ${key}` });
      }
      const conf = criteriaMap.get(key);
      const numVal = Number(val);
      if (isNaN(numVal) || numVal < conf.min_score || numVal > conf.max_score) {
        return res.status(400).json({
          error: `Score for ${key} must be between ${conf.min_score} and ${conf.max_score}`,
        });
      }
    }
  }

  const now = new Date().toISOString();
  const scoreStatus = status === 'DRAFT' ? 'DRAFT' : 'SUBMITTED';

  // 3. Upsert Score record
  let score = db.prepare(`
    SELECT id FROM scores WHERE judge_user_id = ? AND project_id = ?
  `).get(currentJudgeId, project_id);

  const scoreId = score ? score.id : 'scr_' + crypto.randomBytes(6).toString('hex');
  const actionType = score ? 'SCORE_UPDATED' : 'SCORE_CREATED';

  if (score) {
    db.prepare(`
      UPDATE scores
      SET comment = ?, status = ?, submitted_at = ?, updated_at = ?
      WHERE id = ?
    `).run(comment, scoreStatus, scoreStatus === 'SUBMITTED' ? now : null, now, scoreId);
  } else {
    db.prepare(`
      INSERT INTO scores (id, judge_assignment_id, judge_user_id, project_id, comment, status, submitted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(scoreId, assignment.id, currentJudgeId, project_id, comment, scoreStatus, scoreStatus === 'SUBMITTED' ? now : null, now, now);
  }

  // 4. Save criterion values
  if (criteria) {
    const upsertVal = db.prepare(`
      INSERT INTO score_values (id, score_id, criterion_key, value)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(score_id, criterion_key) DO UPDATE SET value = excluded.value
    `);
    for (const [key, val] of Object.entries(criteria)) {
      upsertVal.run(`scrv_${scoreId}_${key}`, scoreId, key, Number(val));
    }
  }

  // 5. Update assignment status
  db.prepare(`
    UPDATE judge_assignments
    SET status = ?
    WHERE id = ?
  `).run(scoreStatus === 'SUBMITTED' ? 'SUBMITTED' : 'IN_PROGRESS', assignment.id);

  // 6. Lock rubric once scores exist to prevent silent modification
  db.prepare(`UPDATE rubrics SET is_locked = 1 WHERE id = ?`).run(rubric.id);

  // 7. Audit log (never log passwords/secrets)
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, ?, 'scores', ?, ?)
  `).run(
    'aud_' + crypto.randomBytes(6).toString('hex'),
    currentJudgeId,
    actionType,
    scoreId,
    JSON.stringify({ project_id, status: scoreStatus })
  );

  // 8. Verifiable cryptographic record for completed evaluation
  if (scoreStatus === 'SUBMITTED') {
    try {
      recordVerifiableEvent(db, {
        entityType: 'score',
        entityId: scoreId,
        payload: {
          score_id: scoreId,
          project_id,
          judge_id: currentJudgeId,
          criteria: criteria || {},
          submitted_at: now,
        },
        signerIdentity: 'dogfood:judging_authority:2026',
      });
    } catch (err) {
      console.warn('Failed to record verifiable score event:', err.message);
    }
  }

  res.status(score ? 200 : 201).json({
    message: scoreStatus === 'SUBMITTED' ? 'Score submitted successfully' : 'Draft score saved',
    score_id: scoreId,
  });
});

// =========================================================================
// BONUS B: PAIRWISE COMPARISON JUDGE ENDPOINTS
// =========================================================================

// GET /api/judge/pairwise/assignments - List pairwise comparison pairs assigned to current judge
router.get('/pairwise/assignments', requireJudge, (req, res) => {
  const db = getDatabase();
  const currentJudgeId = req.user.id;

  const targetJudgeQuery =
    req.query.judge ||
    req.query.judge_id ||
    req.query.judge_user_id ||
    req.query.user_id ||
    req.query.judgeId ||
    req.query.userId ||
    req.query.target ||
    req.query.target_judge;

  if (targetJudgeQuery) {
    const resolvedTarget = resolveJudgeId(targetJudgeQuery);
    if (resolvedTarget !== currentJudgeId && !req.user.roles.includes('organizer') && !req.user.roles.includes('admin')) {
      return res.status(403).json({
        error: 'Forbidden: Access to peer judge pairwise assignments is strictly prohibited',
      });
    }
  }

  const pairs = db.prepare(`
    SELECT
      pwp.id as pair_id,
      pwp.event_id,
      pwp.track_id,
      pwp.status as pair_status,
      pwp.created_at,
      pwp.project_a_id,
      pwp.project_b_id,
      pa.title as project_a_title,
      pa.summary as project_a_summary,
      ta.name as team_a_name,
      pb.title as project_b_title,
      pb.summary as project_b_summary,
      tb.name as team_b_name,
      pwc.id as comparison_id,
      pwc.winner_id,
      pwc.is_tie,
      pwc.comment
    FROM pairwise_pairs pwp
    JOIN projects pa ON pa.id = pwp.project_a_id
    JOIN teams ta ON ta.id = pa.team_id
    JOIN projects pb ON pb.id = pwp.project_b_id
    JOIN teams tb ON tb.id = pb.team_id
    LEFT JOIN pairwise_comparisons pwc ON pwc.pair_id = pwp.id
    WHERE pwp.judge_user_id = ?
    ORDER BY pwp.status ASC, pwp.created_at ASC
  `).all(currentJudgeId);

  res.json({
    judge_id: currentJudgeId,
    judge_name: req.user.name,
    pairs,
  });
});

// GET /api/judge/pairwise/assignments/:pairId - Fetch single assigned comparison pair
router.get('/pairwise/assignments/:pairId', requireJudge, (req, res) => {
  const db = getDatabase();
  const currentJudgeId = req.user.id;
  const { pairId } = req.params;

  const pair = db.prepare(`
    SELECT
      pwp.id as pair_id,
      pwp.judge_user_id,
      pwp.event_id,
      pwp.track_id,
      pwp.status as pair_status,
      pwp.created_at,
      pwp.project_a_id,
      pwp.project_b_id,
      pa.title as project_a_title,
      pa.summary as project_a_summary,
      pa.description as project_a_description,
      pa.repo_url as project_a_repo_url,
      pa.demo_url as project_a_demo_url,
      ta.name as team_a_name,
      pb.title as project_b_title,
      pb.summary as project_b_summary,
      pb.description as project_b_description,
      pb.repo_url as project_b_repo_url,
      pb.demo_url as project_b_demo_url,
      tb.name as team_b_name,
      pwc.id as comparison_id,
      pwc.winner_id,
      pwc.is_tie,
      pwc.comment
    FROM pairwise_pairs pwp
    JOIN projects pa ON pa.id = pwp.project_a_id
    JOIN teams ta ON ta.id = pa.team_id
    JOIN projects pb ON pb.id = pwp.project_b_id
    JOIN teams tb ON tb.id = pb.team_id
    LEFT JOIN pairwise_comparisons pwc ON pwc.pair_id = pwp.id
    WHERE pwp.id = ?
  `).get(pairId);

  if (!pair) {
    return res.status(404).json({ error: 'Pair assignment not found' });
  }

  // Strict ownership check
  if (
    pair.judge_user_id !== currentJudgeId &&
    !req.user.roles.includes('organizer') &&
    !req.user.roles.includes('admin')
  ) {
    return res.status(403).json({
      error: 'Forbidden: Access to peer judge pairwise assignment is strictly prohibited',
    });
  }

  res.json({ pair });
});

// POST /api/judge/pairwise/comparisons - Submit comparison for assigned pair
router.post('/pairwise/comparisons', requireJudge, (req, res) => {
  const db = getDatabase();
  const currentJudgeId = req.user.id;
  const { pair_id, winner_id, is_tie, comment = '' } = req.body;

  if (!pair_id) {
    return res.status(400).json({ error: 'pair_id is required' });
  }

  // 1. Fetch pair assignment
  const pair = db.prepare(`
    SELECT * FROM pairwise_pairs WHERE id = ?
  `).get(pair_id);

  if (!pair) {
    return res.status(404).json({ error: 'Pair assignment not found' });
  }

  // 2. Strict Judge Ownership Check
  if (pair.judge_user_id !== currentJudgeId) {
    return res.status(403).json({
      error: 'Forbidden: You are not assigned to evaluate this comparison pair',
    });
  }

  // 3. Duplicate check
  const existing = db.prepare(`
    SELECT id FROM pairwise_comparisons WHERE pair_id = ?
  `).get(pair_id);

  if (existing) {
    return res.status(409).json({
      error: 'Conflict: Comparison already submitted for this pair',
    });
  }

  // 4. Validate is_tie
  if (is_tie !== undefined && typeof is_tie !== 'boolean' && is_tie !== 0 && is_tie !== 1) {
    return res.status(400).json({ error: 'is_tie must be a boolean or 0/1' });
  }
  const isTie = is_tie === true || is_tie === 1;

  // 5. Validate Winner vs Tie
  let finalWinnerId = null;
  if (isTie) {
    if (winner_id !== null && winner_id !== undefined && winner_id !== '') {
      return res.status(400).json({ error: 'Tie comparison must not specify a winner_id' });
    }
  } else {
    if (!winner_id) {
      return res.status(400).json({ error: 'Non-tie comparison requires a winner_id' });
    }
    if (winner_id !== pair.project_a_id && winner_id !== pair.project_b_id) {
      return res.status(400).json({
        error: `winner_id must be either project A (${pair.project_a_id}) or project B (${pair.project_b_id})`,
      });
    }
    finalWinnerId = winner_id;
  }

  // 6. Insert Comparison
  const comparisonId = 'pwc_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO pairwise_comparisons (
        id, pair_id, event_id, judge_user_id, project_a_id, project_b_id, winner_id, is_tie, comment, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      comparisonId,
      pair.id,
      pair.event_id,
      currentJudgeId,
      pair.project_a_id,
      pair.project_b_id,
      finalWinnerId,
      isTie ? 1 : 0,
      comment || '',
      now
    );

    // 7. Mark pair completed
    db.prepare(`
      UPDATE pairwise_pairs SET status = 'COMPLETED' WHERE id = ?
    `).run(pair.id);

    // 8. Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json)
      VALUES (?, ?, 'PAIRWISE_COMPARISON_SUBMITTED', 'pairwise_comparisons', ?, ?)
    `).run(
      'aud_' + crypto.randomBytes(6).toString('hex'),
      currentJudgeId,
      comparisonId,
      JSON.stringify({ pair_id: pair.id, winner_id: finalWinnerId, is_tie: isTie })
    );

    res.status(201).json({
      message: 'Comparison recorded successfully',
      comparison_id: comparisonId,
      pair_id: pair.id,
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Conflict: Comparison already exists for this pair' });
    }
    return res.status(500).json({ error: 'Failed to record pairwise comparison: ' + err.message });
  }
});

// GET /api/judge/pairwise/comparisons - Retrieve judge's own comparisons
router.get('/pairwise/comparisons', requireJudge, (req, res) => {
  const db = getDatabase();
  const currentJudgeId = req.user.id;

  const targetJudgeQuery =
    req.query.judge ||
    req.query.judge_id ||
    req.query.judge_user_id ||
    req.query.user_id ||
    req.query.judgeId ||
    req.query.userId ||
    req.query.target ||
    req.query.target_judge;

  if (targetJudgeQuery) {
    const resolvedTarget = resolveJudgeId(targetJudgeQuery);
    if (resolvedTarget !== currentJudgeId && !req.user.roles.includes('organizer') && !req.user.roles.includes('admin')) {
      return res.status(403).json({
        error: 'Forbidden: Access to peer judge pairwise comparisons is strictly prohibited',
      });
    }
  }

  const comparisons = db.prepare(`
    SELECT
      pwc.id as comparison_id,
      pwc.pair_id,
      pwc.event_id,
      pwc.project_a_id,
      pwc.project_b_id,
      pwc.winner_id,
      pwc.is_tie,
      pwc.comment,
      pwc.created_at,
      pa.title as project_a_title,
      pb.title as project_b_title
    FROM pairwise_comparisons pwc
    JOIN projects pa ON pa.id = pwc.project_a_id
    JOIN projects pb ON pb.id = pwc.project_b_id
    WHERE pwc.judge_user_id = ?
    ORDER BY pwc.created_at DESC
  `).all(currentJudgeId);

  res.json({
    judge_id: currentJudgeId,
    comparisons,
  });
});

export default router;
