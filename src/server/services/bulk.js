import crypto from 'node:crypto';
import { canonicalizeJson, computeDigest, signDigest, getPublicKeyPem } from './verification.js';
import { calculateNormalization } from './normalization.js';

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Bulk export of complete hackathon event data, signed with Ed25519 digital signature
 */
export function exportEventData(db, eventId = null) {
  const event = eventId
    ? db.prepare('SELECT id, name, description, start_time, end_time, submissions_close, created_at FROM events WHERE id = ?').get(eventId)
    : db.prepare('SELECT id, name, description, start_time, end_time, submissions_close, created_at FROM events ORDER BY created_at DESC LIMIT 1').get();

  if (!event) {
    throw new Error('Event not found for export');
  }

  // 1. Tracks
  const tracks = db.prepare('SELECT id, name, description FROM tracks WHERE event_id = ? ORDER BY id ASC').all(event.id);

  // 2. Prizes
  const prizes = db.prepare('SELECT id, track_id, name, description, amount FROM prizes WHERE event_id = ? ORDER BY id ASC').all(event.id);

  // 3. Teams & Members
  const teams = db.prepare('SELECT id, name, invite_code, created_at FROM teams WHERE event_id = ? ORDER BY id ASC').all(event.id);
  for (const t of teams) {
    t.members = db.prepare(`
      SELECT tm.user_id, u.name, u.email, tm.role, tm.created_at
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ?
      ORDER BY tm.role DESC, u.name ASC
    `).all(t.id);
  }

  // 4. Projects
  const projects = db.prepare(`
    SELECT p.id, p.team_id, p.track_id, p.title, p.summary, p.description, p.repo_url, p.demo_url, p.status, p.submitted_at, p.created_at
    FROM projects p
    JOIN teams t ON t.id = p.team_id
    WHERE t.event_id = ?
    ORDER BY p.id ASC
  `).all(event.id);

  // 5. Rubrics & Criteria
  const rubrics = db.prepare('SELECT id, name, is_locked FROM rubrics WHERE event_id = ? ORDER BY id ASC').all(event.id);
  for (const r of rubrics) {
    r.criteria = db.prepare('SELECT id, criterion_key, name, description, weight, min_score, max_score FROM rubric_criteria WHERE rubric_id = ? ORDER BY criterion_key ASC').all(r.id);
  }

  // 6. Judges and Assignments
  const judges = db.prepare(`
    SELECT DISTINCT u.id, u.name, u.email
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id AND ur.role_id = 'judge'
    JOIN judge_tracks jt ON jt.judge_user_id = u.id
    JOIN tracks tr ON tr.id = jt.track_id
    WHERE tr.event_id = ?
    ORDER BY u.name ASC
  `).all(event.id);

  for (const j of judges) {
    j.tracks = db.prepare('SELECT track_id FROM judge_tracks WHERE judge_user_id = ? ORDER BY track_id ASC').all(j.id).map(row => row.track_id);
  }

  const assignments = db.prepare(`
    SELECT ja.id, ja.judge_user_id, ja.project_id, ja.batch_id, ja.status, ja.created_at
    FROM judge_assignments ja
    JOIN projects p ON p.id = ja.project_id
    JOIN teams t ON t.id = p.team_id
    WHERE t.event_id = ?
    ORDER BY ja.id ASC
  `).all(event.id);

  // 7. Scores
  const scores = db.prepare(`
    SELECT s.id, s.judge_assignment_id, s.judge_user_id, s.project_id, s.comment, s.status, s.submitted_at, s.created_at
    FROM scores s
    JOIN projects p ON p.id = s.project_id
    JOIN teams t ON t.id = p.team_id
    WHERE t.event_id = ?
    ORDER BY s.id ASC
  `).all(event.id);

  for (const s of scores) {
    const vals = db.prepare('SELECT criterion_key, value FROM score_values WHERE score_id = ? ORDER BY criterion_key ASC').all(s.id);
    s.criteria = {};
    for (const v of vals) s.criteria[v.criterion_key] = v.value;
  }

  // 8. Normalization Rankings
  let normalization = null;
  try {
    normalization = calculateNormalization(event.id, db);
  } catch {
    normalization = { projects: [] };
  }

  // 9. Verifiable Records
  const verifiableRecords = db.prepare(`
    SELECT id, entity_type, entity_id, digest, signature, signer_identity, created_at
    FROM verifiable_records
    ORDER BY created_at ASC
  `).all();

  const exportedAt = new Date().toISOString();

  const exportPayload = {
    export_version: '2026.1',
    exported_at: exportedAt,
    event,
    tracks,
    prizes,
    judges,
    teams,
    projects,
    rubrics,
    assignments,
    scores,
    rankings: normalization.projects,
    verifiable_records: verifiableRecords,
  };

  // Sign the export bundle using Ed25519
  const digest = computeDigest(exportPayload);
  const signature = signDigest(digest);

  return {
    ...exportPayload,
    audit: {
      digest,
      signature,
      algorithm: 'Ed25519',
      public_key: getPublicKeyPem(),
      signer: 'dogfood:authority:2026',
    },
  };
}

/**
 * Bulk import of hackathon event data (supports both fixtures.json format and full export bundle)
 */
export function importEventData(db, data, { override = false } = {}) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid import data: JSON object is required');
  }

  const rawEvent = data.event;
  if (!rawEvent || !rawEvent.id || !rawEvent.name) {
    throw new Error('Invalid import data: event object with id and name is required');
  }

  const tracks = data.tracks || [];
  const judges = data.judges || [];
  const teams = data.teams || [];
  const projects = data.projects || [];
  const scores = data.scores || [];
  const rubrics = data.rubrics || [];

  db.exec('BEGIN TRANSACTION;');

  try {
    // 1. Ingest Event
    const upsertEvent = db.prepare(`
      INSERT INTO events (id, name, description, start_time, end_time, submissions_close)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        submissions_close = excluded.submissions_close
    `);
    upsertEvent.run(
      rawEvent.id,
      rawEvent.name,
      rawEvent.description || null,
      rawEvent.start_time || null,
      rawEvent.end_time || null,
      rawEvent.submissions_close || '2026-03-01T18:00:00Z'
    );

    // 2. Ingest Tracks
    const upsertTrack = db.prepare(`
      INSERT INTO tracks (id, event_id, name, description)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description
    `);
    for (const tr of tracks) {
      upsertTrack.run(tr.id, rawEvent.id, tr.name, tr.description || null);
    }

    // 3. Ingest Judges
    const assignRole = db.prepare(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)`);
    const assignTrack = db.prepare(`INSERT OR IGNORE INTO judge_tracks (judge_user_id, track_id) VALUES (?, ?)`);

    for (const j of judges) {
      const email = j.email || `${j.id}@example.org`;
      const name = j.name || j.id;
      const existingJudge = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      const judgeId = existingJudge ? existingJudge.id : j.id;

      if (!existingJudge) {
        const pHash = hashPassword('judge123');
        db.prepare(`
          INSERT INTO users (id, email, name, password_hash)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email
        `).run(judgeId, email, name, pHash);
      }
      assignRole.run(judgeId, 'judge');

      if (Array.isArray(j.tracks)) {
        for (const tId of j.tracks) {
          assignTrack.run(judgeId, tId);
        }
      }
    }

    // 4. Ingest Teams & Members
    const upsertTeam = db.prepare(`
      INSERT INTO teams (id, event_id, name, invite_code)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name
    `);
    const insertMember = db.prepare(`
      INSERT OR IGNORE INTO team_members (team_id, user_id, role)
      VALUES (?, ?, ?)
    `);

    for (const tm of teams) {
      const inviteCode = tm.invite_code || `inv_${tm.id}`;
      upsertTeam.run(tm.id, rawEvent.id, tm.name || tm.id, inviteCode);

      if (Array.isArray(tm.members)) {
        for (const mem of tm.members) {
          let email, name, role = 'member';
          if (typeof mem === 'string') {
            email = mem;
            name = email.split('@')[0];
          } else {
            email = mem.email || `${mem.user_id}@example.org`;
            name = mem.name || email.split('@')[0];
            role = mem.role || 'member';
          }

          const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
          let uId = existingUser ? existingUser.id : ((typeof mem !== 'string' && mem.user_id) ? mem.user_id : `usr_${crypto.createHash('md5').update(email).digest('hex').slice(0, 8)}`);

          if (!existingUser) {
            db.prepare(`
              INSERT INTO users (id, email, name, password_hash)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email
            `).run(uId, email, name, hashPassword('team123'));
          }

          assignRole.run(uId, 'participant');
          insertMember.run(tm.id, uId, role);
        }
      }
    }

    // 5. Ingest Projects
    const upsertProject = db.prepare(`
      INSERT INTO projects (id, team_id, track_id, title, summary, description, repo_url, demo_url, status, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        summary = excluded.summary,
        repo_url = excluded.repo_url,
        status = excluded.status,
        submitted_at = excluded.submitted_at
    `);

    for (const p of projects) {
      const teamId = p.team || p.team_id;
      const trackId = p.track || p.track_id || tracks[0]?.id || 'trk_01';
      upsertProject.run(
        p.id,
        teamId,
        trackId,
        p.title,
        p.summary || null,
        p.description || null,
        p.repo_url || null,
        p.demo_url || null,
        p.status || 'SUBMITTED',
        p.submitted_at || new Date().toISOString()
      );
    }

    // 6. Ingest Rubrics & Criteria (if present)
    if (rubrics.length > 0) {
      const upsertRubric = db.prepare(`
        INSERT INTO rubrics (id, event_id, name, is_locked)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, is_locked = excluded.is_locked
      `);
      const upsertCriteria = db.prepare(`
        INSERT INTO rubric_criteria (id, rubric_id, criterion_key, name, description, weight, min_score, max_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(rubric_id, criterion_key) DO UPDATE SET
          name = excluded.name,
          weight = excluded.weight,
          min_score = excluded.min_score,
          max_score = excluded.max_score
      `);

      for (const r of rubrics) {
        upsertRubric.run(r.id, rawEvent.id, r.name, r.is_locked ? 1 : 0);
        if (Array.isArray(r.criteria)) {
          for (const c of r.criteria) {
            const cId = c.id || `crit_${r.id}_${c.criterion_key}`;
            upsertCriteria.run(cId, r.id, c.criterion_key, c.name || c.criterion_key, c.description || '', Number(c.weight || 1), Number(c.min_score || 1), Number(c.max_score || 5));
          }
        }
      }
    }

    // 7. Ingest Assignments and Scores
    const insertAsgn = db.prepare(`
      INSERT INTO judge_assignments (id, judge_user_id, project_id, batch_id, status)
      VALUES (?, ?, ?, ?, 'SUBMITTED')
      ON CONFLICT(judge_user_id, project_id) DO UPDATE SET status = excluded.status
    `);
    const insertScore = db.prepare(`
      INSERT INTO scores (id, judge_assignment_id, judge_user_id, project_id, comment, status, submitted_at)
      VALUES (?, ?, ?, ?, ?, 'SUBMITTED', ?)
      ON CONFLICT(judge_user_id, project_id) DO UPDATE SET comment = excluded.comment, status = 'SUBMITTED'
    `);
    const insertScoreVal = db.prepare(`
      INSERT INTO score_values (id, score_id, criterion_key, value)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(score_id, criterion_key) DO UPDATE SET value = excluded.value
    `);

    for (const sc of scores) {
      const judgeId = sc.judge || sc.judge_user_id;
      const projectId = sc.project || sc.project_id;
      if (!judgeId || !projectId) continue;

      const asgnId = `asgn_${judgeId}_${projectId}`;
      insertAsgn.run(asgnId, judgeId, projectId, sc.batch_id || 'default');

      const scoreId = sc.id || `scr_${judgeId}_${projectId}`;
      insertScore.run(scoreId, asgnId, judgeId, projectId, sc.comment || '', sc.submitted_at || new Date().toISOString());

      if (sc.criteria && typeof sc.criteria === 'object') {
        for (const [key, val] of Object.entries(sc.criteria)) {
          const svId = `scrv_${scoreId}_${key}`;
          insertScoreVal.run(svId, scoreId, key, Number(val));
        }
      }
    }

    db.exec('COMMIT;');

    return {
      success: true,
      event_id: rawEvent.id,
      counts: {
        tracks: tracks.length,
        judges: judges.length,
        teams: teams.length,
        projects: projects.length,
        scores: scores.length,
      },
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export default {
  exportEventData,
  importEventData,
};
