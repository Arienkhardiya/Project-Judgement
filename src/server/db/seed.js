import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './database.js';
import { runMigrations } from './migrations.js';
import { recordVerifiableEvent } from '../services/verification.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function seedDatabase(db = getDatabase(), fixturesPath) {
  runMigrations(db);

  const fixtureFile = fixturesPath || path.resolve(process.cwd(), 'fixtures.json');
  if (!fs.existsSync(fixtureFile)) {
    throw new Error(`Fixtures file not found at ${fixtureFile}`);
  }

  const fixtures = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));

  // 1. Seed Roles
  const roles = ['visitor', 'participant', 'judge', 'organizer', 'admin'];
  const insertRole = db.prepare('INSERT OR IGNORE INTO roles (id) VALUES (?)');
  for (const r of roles) {
    insertRole.run(r);
  }

  // 2. Seed Event
  const evt = fixtures.event;
  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO events (id, name, description, start_time, end_time, submissions_close)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertEvent.run(
    evt.id,
    evt.name,
    evt.description || 'Official DOGFOOD 2026 Hackathon',
    evt.start_time || '2026-02-27T18:00:00Z',
    evt.end_time || '2026-03-01T20:00:00Z',
    evt.submissions_close
  );

  // 3. Seed Tracks
  const insertTrack = db.prepare(`
    INSERT OR IGNORE INTO tracks (id, event_id, name, description)
    VALUES (?, ?, ?, ?)
  `);
  for (const trk of fixtures.tracks) {
    insertTrack.run(trk.id, evt.id, trk.name, trk.description || `Projects in track ${trk.name}`);
  }

  // 4. Seed Standard Prizes for event
  const insertPrize = db.prepare(`
    INSERT OR IGNORE INTO prizes (id, event_id, track_id, name, description, amount)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertPrize.run('prz_grand', evt.id, null, 'Grand Prize', 'Best overall hackathon project', 5000);
  insertPrize.run('prz_community', evt.id, null, 'Community Choice', 'Most voted by peers', 1000);
  for (const trk of fixtures.tracks) {
    insertPrize.run(`prz_${trk.id}`, evt.id, trk.id, `Best ${trk.name}`, `Top project in ${trk.name}`, 1000);
  }

  // 5. Seed Users & User Roles
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, email, name, password_hash)
    VALUES (?, ?, ?, ?)
  `);
  const insertUserRole = db.prepare(`
    INSERT OR IGNORE INTO user_roles (user_id, role_id)
    VALUES (?, ?)
  `);

  // Default Organizer
  const orgUserId = 'usr_org_01';
  insertUser.run(orgUserId, 'organizer@example.org', 'Lead Organizer', hashPassword('organizer123'));
  insertUserRole.run(orgUserId, 'organizer');
  insertUserRole.run(orgUserId, 'admin');

  // Seed Judges from fixtures
  const insertJudgeTrack = db.prepare(`
    INSERT OR IGNORE INTO judge_tracks (judge_user_id, track_id)
    VALUES (?, ?)
  `);
  for (const j of fixtures.judges) {
    insertUser.run(j.id, j.email, j.name, hashPassword('judge123'));
    insertUserRole.run(j.id, 'judge');
    for (const t of j.tracks) {
      insertJudgeTrack.run(j.id, t);
    }
  }

  // Seed Teams and Members
  const insertTeam = db.prepare(`
    INSERT OR IGNORE INTO teams (id, event_id, name, invite_code)
    VALUES (?, ?, ?, ?)
  `);
  const insertMember = db.prepare(`
    INSERT OR IGNORE INTO team_members (team_id, user_id, role)
    VALUES (?, ?, ?)
  `);

  let participantIndex = 0;
  let seededParticipantUserId = null;

  for (const tm of fixtures.teams) {
    const inviteCode = `inv_${tm.id}`;
    insertTeam.run(tm.id, evt.id, tm.name, inviteCode);

    for (let i = 0; i < tm.members.length; i++) {
      participantIndex++;
      const email = tm.members[i];
      const memberUserId = `usr_part_${participantIndex}`;
      const memberName = email.split('@')[0].replace(/[._]/g, ' ');
      
      insertUser.run(memberUserId, email, memberName, hashPassword('participant123'));
      insertUserRole.run(memberUserId, 'participant');

      const memberRole = (i === 0) ? 'leader' : 'member';
      insertMember.run(tm.id, memberUserId, memberRole);

      // Keep first member of tm_01 as our deterministic seeded participant
      if (tm.id === 'tm_01' && i === 0) {
        seededParticipantUserId = memberUserId;
      }
    }
  }

  if (!seededParticipantUserId) {
    const firstMember = db.prepare(`SELECT user_id FROM team_members WHERE team_id = 'tm_01' ORDER BY created_at ASC LIMIT 1`).get();
    if (firstMember) seededParticipantUserId = firstMember.user_id;
  }

  // 6. Seed Projects from fixtures (preserve all awkward cases including duplicate projects for tm_07)
  const insertProject = db.prepare(`
    INSERT OR IGNORE INTO projects (id, team_id, track_id, title, summary, description, repo_url, demo_url, status, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?)
  `);
  for (const prj of fixtures.projects) {
    insertProject.run(
      prj.id,
      prj.team,
      prj.track,
      prj.title,
      prj.summary,
      prj.description || prj.summary,
      prj.repo_url || null,
      prj.demo_url || null,
      prj.submitted_at
    );
  }

  // 7. Seed Rubric and Criteria
  const insertRubric = db.prepare(`
    INSERT OR IGNORE INTO rubrics (id, event_id, name, is_locked)
    VALUES (?, ?, ?, 1)
  `);
  insertRubric.run('rub_01', evt.id, 'Official Scoring Rubric');

  const insertCriterion = db.prepare(`
    INSERT OR IGNORE INTO rubric_criteria (id, rubric_id, criterion_key, name, description, weight, min_score, max_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertCriterion.run('crit_func', 'rub_01', 'functionality', 'Functionality', 'Does the solution work properly?', 1.0, 1.0, 5.0);
  insertCriterion.run('crit_qual', 'rub_01', 'quality', 'Quality', 'Architecture, cleanliness, and code quality', 1.0, 1.0, 5.0);
  insertCriterion.run('crit_inno', 'rub_01', 'innovation', 'Innovation', 'Creativity and technical difficulty', 1.0, 1.0, 5.0);

  // 8. Seed Judge Assignments & Scores from fixtures
  const insertAssignment = db.prepare(`
    INSERT OR IGNORE INTO judge_assignments (id, judge_user_id, project_id, batch_id, status)
    VALUES (?, ?, ?, 'default', 'SUBMITTED')
  `);
  const insertScore = db.prepare(`
    INSERT OR IGNORE INTO scores (id, judge_assignment_id, judge_user_id, project_id, comment, status, submitted_at)
    VALUES (?, ?, ?, ?, ?, 'SUBMITTED', datetime('now', 'utc'))
  `);
  const insertScoreValue = db.prepare(`
    INSERT OR IGNORE INTO score_values (id, score_id, criterion_key, value)
    VALUES (?, ?, ?, ?)
  `);

  let scoreIdx = 0;
  for (const s of fixtures.scores) {
    scoreIdx++;
    const assignmentId = `asgn_${s.judge}_${s.project}`;
    const scoreId = `scr_${s.judge}_${s.project}`;
    
    insertAssignment.run(assignmentId, s.judge, s.project);
    insertScore.run(scoreId, assignmentId, s.judge, s.project, s.comment || '');

    for (const [critKey, critVal] of Object.entries(s.criteria || {})) {
      insertScoreValue.run(`scrv_${scoreId}_${critKey}`, scoreId, critKey, Number(critVal));
    }
  }

  // 9. Create Fixed Test Sessions
  const insertSession = db.prepare(`
    INSERT OR IGNORE INTO sessions (token, user_id, expires_at)
    VALUES (?, ?, datetime('now', '+30 days'))
  `);

  // Tokens required by spec:
  // organizer    -> org_7f2a
  // judge_a      -> jdg_a_91bc (jdg_01)
  // judge_b      -> jdg_b_44de (jdg_02)
  // participant  -> prt_2e88 (seededParticipantUserId)
  insertSession.run('org_7f2a', orgUserId);
  insertSession.run('jdg_a_91bc', 'jdg_01');
  insertSession.run('jdg_b_44de', 'jdg_02');
  if (seededParticipantUserId) {
    insertSession.run('prt_2e88', seededParticipantUserId);
  }

  // In test environment, reset votes so that integration test suites run idempotently
  if (process.env.NODE_ENV === 'test') {
    db.prepare('DELETE FROM votes').run();
  }

  // 10. Seed T3 Voting Window for Event
  const insertVotingWindow = db.prepare(`
    INSERT OR IGNORE INTO voting_windows (id, event_id, title, start_time, end_time, is_active)
    VALUES (?, ?, ?, datetime('now', '-1 day'), datetime('now', '+7 days'), 1)
  `);
  insertVotingWindow.run('vwin_01', evt.id, 'Official Community Choice Voting Window');

  // 11. Seed T4 Sample Verifiable Certificate for prj_01
  const existingCert = db.prepare("SELECT id FROM verifiable_records WHERE entity_id = 'prj_01' AND entity_type = 'certificate'").get();
  if (!existingCert) {
    const certPayload = {
      project_id: 'prj_01',
      title: 'Quiet Hours',
      team: 'tm_01',
      event: evt.id,
      verified_at: '2026-03-01T20:00:00Z'
    };
    recordVerifiableEvent(db, {
      entityType: 'certificate',
      entityId: 'prj_01',
      payload: certPayload,
      signerIdentity: 'dogfood:cert_authority:2026'
    });
  }


  const credentials = {
    organizer: 'Cookie: session=org_7f2a',
    judge_a: 'Cookie: session=jdg_a_91bc',
    judge_b: 'Cookie: session=jdg_b_44de',
    participant: 'Cookie: session=prt_2e88',
  };

  return credentials;
}

export function printSeededLogins(credentials) {
  console.log('seeded. test logins:');
  console.log(`  organizer    ${credentials.organizer}`);
  console.log(`  judge_a      ${credentials.judge_a}`);
  console.log(`  judge_b      ${credentials.judge_b}`);
  console.log(`  participant  ${credentials.participant}`);
}

if (process.argv[1] === __filename) {
  const db = getDatabase();
  const creds = seedDatabase(db);
  printSeededLogins(creds);
}
