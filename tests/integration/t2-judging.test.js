import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createApp } from '../../src/server/app.js';
import { getDatabase, closeDatabase } from '../../src/server/db/database.js';
import { seedDatabase } from '../../src/server/db/seed.js';

let server;
let baseUrl;
const testDbPath = path.resolve(process.cwd(), 't2-test.db');

before(async () => {
  closeDatabase();
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
  } catch {}

  process.env.DATABASE_PATH = testDbPath;
  const db = getDatabase(testDbPath);
  seedDatabase(db);

  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(() => {
  if (server) server.close();
  closeDatabase();
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
  } catch {}
});

describe('Milestone 2 - T2 Judging & Security Integration Tests', () => {
  // CRITICAL ACCEPTANCE CHECKS
  it('1. Judge A can view their own scores (HTTP 200)', async () => {
    const res = await fetch(`${baseUrl}/api/judge/scores`, {
      headers: { 'Cookie': 'session=jdg_a_91bc' },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.judge_id, 'jdg_01');
    assert.ok(Array.isArray(data.scores));
  });

  it('2. Judge B is FORBIDDEN from viewing Judge A scores via ?judge=jdg_01 (HTTP 403)', async () => {
    const res = await fetch(`${baseUrl}/api/judge/scores?judge=jdg_01`, {
      headers: { 'Cookie': 'session=jdg_b_44de' },
    });
    assert.ok(res.status === 401 || res.status === 403, `Expected 401 or 403, got ${res.status}`);
  });

  it('3. Judge B is FORBIDDEN from viewing Judge A scores via ?judge=judge_a alias (HTTP 403)', async () => {
    const res = await fetch(`${baseUrl}/api/judge/scores?judge=judge_a`, {
      headers: { 'Cookie': 'session=jdg_b_44de' },
    });
    assert.ok(res.status === 401 || res.status === 403, `Expected 401 or 403, got ${res.status}`);
  });

  it('4. Participant is BLOCKED from accessing judge scores (HTTP 403)', async () => {
    const res = await fetch(`${baseUrl}/api/judge/scores`, {
      headers: { 'Cookie': 'session=prt_2e88' },
    });
    assert.ok(res.status === 401 || res.status === 403, `Expected 401 or 403, got ${res.status}`);
  });

  it('5. Unauthenticated request to judge scores returns 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/judge/scores`);
    assert.equal(res.status, 401);
  });

  it('6. Organizer can export results as CSV (HTTP 200 with commas)', async () => {
    const res = await fetch(`${baseUrl}/api/export.csv`, {
      headers: { 'Cookie': 'session=org_7f2a' },
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    const firstLine = text.split('\r\n')[0] || text.split('\n')[0];
    assert.ok(firstLine.includes(','), 'CSV header must contain commas');
    assert.ok(firstLine.includes('project_id'));
    assert.ok(firstLine.includes('normalized_score'));
  });

  it('7. Participant is BLOCKED from exporting CSV (HTTP 403)', async () => {
    const res = await fetch(`${baseUrl}/api/export.csv`, {
      headers: { 'Cookie': 'session=prt_2e88' },
    });
    assert.ok(res.status === 401 || res.status === 403);
  });

  // ADVERSARIAL ASSIGNMENT & SCOPE TAMPERING
  it('8. Judge cannot access project details for unassigned project (HTTP 403)', async () => {
    // Check an unassigned project for jdg_01 (jdg_01 is only assigned to trk_03 projects in fixtures)
    // Find a project not assigned to jdg_01
    const db = getDatabase();
    const unassigned = db.prepare(`
      SELECT p.id FROM projects p
      WHERE p.id NOT IN (SELECT project_id FROM judge_assignments WHERE judge_user_id = 'jdg_01')
      LIMIT 1
    `).get();

    assert.ok(unassigned);
    const res = await fetch(`${baseUrl}/api/judge/assignments/${unassigned.id}`, {
      headers: { 'Cookie': 'session=jdg_a_91bc' },
    });
    assert.equal(res.status, 403);
  });

  it('9. Judge cannot submit scores for unassigned project (HTTP 403)', async () => {
    const db = getDatabase();
    const unassigned = db.prepare(`
      SELECT p.id FROM projects p
      WHERE p.id NOT IN (SELECT project_id FROM judge_assignments WHERE judge_user_id = 'jdg_01')
      LIMIT 1
    `).get();

    assert.ok(unassigned);
    const res = await fetch(`${baseUrl}/api/judge/scores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'session=jdg_a_91bc',
      },
      body: JSON.stringify({
        project_id: unassigned.id,
        criteria: { functionality: 4, quality: 4, innovation: 4 },
      }),
    });
    assert.equal(res.status, 403);
  });

  it('10. Score out of rubric range is rejected with 400', async () => {
    // Find an assigned project for jdg_01
    const db = getDatabase();
    const assigned = db.prepare(`
      SELECT project_id FROM judge_assignments WHERE judge_user_id = 'jdg_01' LIMIT 1
    `).get();

    assert.ok(assigned);
    const res = await fetch(`${baseUrl}/api/judge/scores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'session=jdg_a_91bc',
      },
      body: JSON.stringify({
        project_id: assigned.project_id,
        criteria: { functionality: 99.0 }, // max is 5.0!
      }),
    });
    assert.equal(res.status, 400);
  });

  it('11. Judge successfully submits valid score on assigned project', async () => {
    const db = getDatabase();
    const assigned = db.prepare(`
      SELECT project_id FROM judge_assignments WHERE judge_user_id = 'jdg_01' LIMIT 1
    `).get();

    assert.ok(assigned);
    const res = await fetch(`${baseUrl}/api/judge/scores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'session=jdg_a_91bc',
      },
      body: JSON.stringify({
        project_id: assigned.project_id,
        criteria: { functionality: 5, quality: 4, innovation: 5 },
        comment: 'Exceptional technical execution.',
        status: 'SUBMITTED',
      }),
    });
    assert.ok(res.status === 200 || res.status === 201);
  });

  it('12. Locked rubric prevents silent mutation once scores exist (HTTP 400)', async () => {
    const res = await fetch(`${baseUrl}/api/organizer/rubric/criteria`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'session=org_7f2a',
      },
      body: JSON.stringify({
        criteria: [
          { criterion_key: 'functionality', name: 'Func', weight: 10, min_score: 1, max_score: 10 },
        ],
      }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('locked'));
  });

  it('13. Organizer Progress Dashboard returns complete metrics', async () => {
    const res = await fetch(`${baseUrl}/api/organizer/dashboard`, {
      headers: { 'Cookie': 'session=org_7f2a' },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.totals);
    assert.ok(data.tracks.length > 0);
    assert.ok(data.judges.length > 0);
    assert.ok(data.batches.length > 0);
  });

  it('14. Organizer Normalization endpoint returns all ranked projects', async () => {
    const res = await fetch(`${baseUrl}/api/organizer/normalized`, {
      headers: { 'Cookie': 'session=org_7f2a' },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.projects.length, 41);
    assert.ok(data.globalStats);
    assert.ok(data.judgeStats);
  });

  it('15. Track restriction on manual assignment enforced', async () => {
    // Try to assign jdg_01 to a project in trk_01 (jdg_01 is only in trk_03)
    const db = getDatabase();
    const trk1Project = db.prepare(`SELECT id FROM projects WHERE track_id = 'trk_01' LIMIT 1`).get();
    assert.ok(trk1Project);

    const res = await fetch(`${baseUrl}/api/organizer/assignments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'session=org_7f2a',
      },
      body: JSON.stringify({
        judge_user_id: 'jdg_01',
        project_id: trk1Project.id,
      }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('Track mismatch'));
  });

  it('16. Audit trail logs judging actions without leaking sensitive secrets', async () => {
    const res = await fetch(`${baseUrl}/api/organizer/audit`, {
      headers: { 'Cookie': 'session=org_7f2a' },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.logs.length > 0);

    // Verify no password hashes or tokens in details_json
    for (const log of data.logs) {
      if (log.details_json) {
        assert.ok(!log.details_json.includes('password'));
        assert.ok(!log.details_json.includes('token'));
      }
    }
  });

  it('17. Parameter probe hardening: Alternate parameter names (?user_id, ?judge_user_id) are strictly blocked with 403', async () => {
    const res1 = await fetch(`${baseUrl}/api/judge/scores?user_id=jdg_01`, {
      headers: { 'Cookie': 'session=jdg_b_44de' },
    });
    assert.equal(res1.status, 403);

    const res2 = await fetch(`${baseUrl}/api/judge/scores?judge_user_id=jdg_01`, {
      headers: { 'Cookie': 'session=jdg_b_44de' },
    });
    assert.equal(res2.status, 403);
  });

  it('18. Score detail ownership: Judge A can view own score, but Judge B is FORBIDDEN with 403', async () => {
    // 1. Fetch Judge A's scores to get a valid score ID
    const listRes = await fetch(`${baseUrl}/api/judge/scores`, {
      headers: { 'Cookie': 'session=jdg_a_91bc' },
    });
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.ok(listData.scores.length > 0);
    const scoreId = listData.scores[0].score_id;

    // 2. Judge A views own score -> 200
    const ownRes = await fetch(`${baseUrl}/api/judge/scores/${scoreId}`, {
      headers: { 'Cookie': 'session=jdg_a_91bc' },
    });
    assert.equal(ownRes.status, 200);
    const ownData = await ownRes.json();
    assert.equal(ownData.score.score_id, scoreId);

    // 3. Judge B attempts to view Judge A's score -> 403 Forbidden
    const peerRes = await fetch(`${baseUrl}/api/judge/scores/${scoreId}`, {
      headers: { 'Cookie': 'session=jdg_b_44de' },
    });
    assert.equal(peerRes.status, 403);
    const peerData = await peerRes.json();
    assert.ok(peerData.error.includes('Forbidden'));

    // 4. Participant attempts to view score -> 403 Forbidden
    const partRes = await fetch(`${baseUrl}/api/judge/scores/${scoreId}`, {
      headers: { 'Cookie': 'session=prt_2e88' },
    });
    assert.equal(partRes.status, 403);
  });
});
