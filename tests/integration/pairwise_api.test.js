import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createApp } from '../../src/server/app.js';
import { getDatabase, closeDatabase } from '../../src/server/db/database.js';
import { seedDatabase } from '../../src/server/db/seed.js';
import { generatePairAssignments } from '../../src/server/services/pairwise.js';

let server;
let baseUrl;
const testDbPath = path.resolve(process.cwd(), 'pairwise-api-test.db');

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

describe('Bonus B - Pairwise Mode Stage 3 Backend Assignment & API Tests', () => {
  let judgeAPairs = [];
  let judgeBPairs = [];

  it('1. Deterministic pair assignment generation via organizer endpoint', async () => {
    const res = await fetch(`${baseUrl}/api/organizer/pairwise/assignments/generate`, {
      method: 'POST',
      headers: {
        'Cookie': 'session=org_7f2a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ comparisons_per_project: 4 }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.createdCount > 0, 'Should have created pairwise assignments');
    assert.ok(data.metadata);

    // Second call should be idempotent and not create duplicate pairs
    const res2 = await fetch(`${baseUrl}/api/organizer/pairwise/assignments/generate`, {
      method: 'POST',
      headers: {
        'Cookie': 'session=org_7f2a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ comparisons_per_project: 4 }),
    });
    assert.equal(res2.status, 201);
    const data2 = await res2.json();
    assert.equal(data2.createdCount, 0, 'Re-generation should create 0 duplicate assignments');
  });

  it('2. Invariant: No self-pairs exist in generated assignments', () => {
    const db = getDatabase(testDbPath);
    const selfPairs = db.prepare(`
      SELECT count(*) as count FROM pairwise_pairs WHERE project_a_id = project_b_id
    `).get().count;
    assert.equal(selfPairs, 0, 'No project should ever be paired with itself');
  });

  it('3. Invariant: Canonical A < B storage ordering strictly enforced', () => {
    const db = getDatabase(testDbPath);
    const nonCanonical = db.prepare(`
      SELECT count(*) as count FROM pairwise_pairs WHERE project_a_id >= project_b_id
    `).get().count;
    assert.equal(nonCanonical, 0, 'All stored pairs must satisfy project_a_id < project_b_id');
  });

  it('4. Invariant: A judge never receives duplicate pair assignments', () => {
    const db = getDatabase(testDbPath);
    const duplicates = db.prepare(`
      SELECT judge_user_id, project_a_id, project_b_id, count(*) as count
      FROM pairwise_pairs
      GROUP BY judge_user_id, project_a_id, project_b_id
      HAVING count > 1
    `).all();
    assert.equal(duplicates.length, 0, 'No judge should receive duplicate assignments for the same pair');
  });

  it('5. Judge sees ONLY their own assigned pairs (HTTP 200)', async () => {
    const resA = await fetch(`${baseUrl}/api/judge/pairwise/assignments`, {
      headers: { 'Cookie': 'session=jdg_a_91bc' },
    });
    assert.equal(resA.status, 200);
    const dataA = await resA.json();
    assert.equal(dataA.judge_id, 'jdg_01');
    assert.ok(Array.isArray(dataA.pairs));
    assert.ok(dataA.pairs.length > 0);

    judgeAPairs = dataA.pairs;

    // Fetch Judge B pairs
    const resB = await fetch(`${baseUrl}/api/judge/pairwise/assignments`, {
      headers: { 'Cookie': 'session=jdg_b_44de' },
    });
    assert.equal(resB.status, 200);
    const dataB = await resB.json();
    assert.equal(dataB.judge_id, 'jdg_02');
    judgeBPairs = dataB.pairs;
  });

  it("6. Judge cannot read another judge's pairs via query probe (HTTP 403)", async () => {
    const res = await fetch(`${baseUrl}/api/judge/pairwise/assignments?judge=jdg_01`, {
      headers: { 'Cookie': 'session=jdg_b_44de' }, // Judge B querying Judge A
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /Access to peer judge pairwise assignments is strictly prohibited/);

    // Also cannot read single pair assigned to Judge A
    const pairAId = judgeAPairs[0].pair_id;
    const resSingle = await fetch(`${baseUrl}/api/judge/pairwise/assignments/${pairAId}`, {
      headers: { 'Cookie': 'session=jdg_b_44de' },
    });
    assert.equal(resSingle.status, 403);
  });

  it('7. Judge can submit valid assigned comparison (HTTP 201)', async () => {
    const pairToCompare = judgeAPairs[0];
    const res = await fetch(`${baseUrl}/api/judge/pairwise/comparisons`, {
      method: 'POST',
      headers: {
        'Cookie': 'session=jdg_a_91bc',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pair_id: pairToCompare.pair_id,
        winner_id: pairToCompare.project_a_id,
        is_tie: false,
        comment: 'Project A had significantly superior code structure.',
      }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.pair_id, pairToCompare.pair_id);
    assert.ok(data.comparison_id);
  });

  it('8. Judge cannot submit comparison for unassigned pair (HTTP 403)', async () => {
    // Judge A attempts to evaluate pair belonging to Judge B
    const pairBId = judgeBPairs[0].pair_id;
    const res = await fetch(`${baseUrl}/api/judge/pairwise/comparisons`, {
      method: 'POST',
      headers: {
        'Cookie': 'session=jdg_a_91bc',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pair_id: pairBId,
        winner_id: judgeBPairs[0].project_a_id,
        is_tie: false,
      }),
    });

    assert.equal(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /You are not assigned to evaluate this comparison pair/);
  });

  it('9. Non-existent pair returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/judge/pairwise/comparisons`, {
      method: 'POST',
      headers: {
        'Cookie': 'session=jdg_a_91bc',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pair_id: 'pwp_nonexistent_99999',
        winner_id: 'prj_01',
        is_tie: false,
      }),
    });

    assert.equal(res.status, 404);
  });

  it('10. Invalid winner rejected (HTTP 400)', async () => {
    const pairToCompare = judgeAPairs[1];
    const res = await fetch(`${baseUrl}/api/judge/pairwise/comparisons`, {
      method: 'POST',
      headers: {
        'Cookie': 'session=jdg_a_91bc',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pair_id: pairToCompare.pair_id,
        winner_id: 'prj_unrelated_foreign_project',
        is_tie: false,
      }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /winner_id must be either project A.*or project B/);
  });

  it('11. Tie accepted without winner (HTTP 201)', async () => {
    const pairToCompare = judgeAPairs[1];
    const res = await fetch(`${baseUrl}/api/judge/pairwise/comparisons`, {
      method: 'POST',
      headers: {
        'Cookie': 'session=jdg_a_91bc',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pair_id: pairToCompare.pair_id,
        winner_id: null,
        is_tie: true,
        comment: 'Both submissions demonstrated identical excellence.',
      }),
    });

    assert.equal(res.status, 201);
  });

  it('12. Winner + tie contradiction rejected (HTTP 400)', async () => {
    const pairToCompare = judgeAPairs[2];

    // Marked as tie but specifies a winner
    const res1 = await fetch(`${baseUrl}/api/judge/pairwise/comparisons`, {
      method: 'POST',
      headers: {
        'Cookie': 'session=jdg_a_91bc',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pair_id: pairToCompare.pair_id,
        winner_id: pairToCompare.project_a_id,
        is_tie: true,
      }),
    });
    assert.equal(res1.status, 400);
    const data1 = await res1.json();
    assert.match(data1.error, /Tie comparison must not specify a winner_id/);

    // Marked as non-tie but omits winner
    const res2 = await fetch(`${baseUrl}/api/judge/pairwise/comparisons`, {
      method: 'POST',
      headers: {
        'Cookie': 'session=jdg_a_91bc',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pair_id: pairToCompare.pair_id,
        is_tie: false,
      }),
    });
    assert.equal(res2.status, 400);
    const data2 = await res2.json();
    assert.match(data2.error, /Non-tie comparison requires a winner_id/);
  });

  it('13. Duplicate comparison for already-completed pair rejected (HTTP 409)', async () => {
    const completedPair = judgeAPairs[0];
    const res = await fetch(`${baseUrl}/api/judge/pairwise/comparisons`, {
      method: 'POST',
      headers: {
        'Cookie': 'session=jdg_a_91bc',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pair_id: completedPair.pair_id,
        winner_id: completedPair.project_b_id,
        is_tie: false,
      }),
    });

    assert.equal(res.status, 409);
    const data = await res.json();
    assert.match(data.error, /Comparison already submitted for this pair/);
  });

  it('14. Participant blocked from judge and organizer pairwise endpoints (HTTP 403)', async () => {
    // Participant accessing judge pairwise assignments
    const res1 = await fetch(`${baseUrl}/api/judge/pairwise/assignments`, {
      headers: { 'Cookie': 'session=prt_2e88' },
    });
    assert.equal(res1.status, 403);

    // Participant posting judge comparison
    const res2 = await fetch(`${baseUrl}/api/judge/pairwise/comparisons`, {
      method: 'POST',
      headers: {
        'Cookie': 'session=prt_2e88',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pair_id: 'any', is_tie: true }),
    });
    assert.equal(res2.status, 403);

    // Participant accessing organizer pairwise rankings
    const res3 = await fetch(`${baseUrl}/api/organizer/pairwise/rankings`, {
      headers: { 'Cookie': 'session=prt_2e88' },
    });
    assert.equal(res3.status, 403);

    // Unauthenticated access returns 401
    const resUnauth = await fetch(`${baseUrl}/api/judge/pairwise/assignments`);
    assert.equal(resUnauth.status, 401);
  });

  it('15. Organizer can retrieve aggregate pairwise ranking (HTTP 200)', async () => {
    const res = await fetch(`${baseUrl}/api/organizer/pairwise/rankings`, {
      headers: { 'Cookie': 'session=org_7f2a' },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.event_id);
    assert.equal(typeof data.converged, 'boolean');
    assert.ok(Array.isArray(data.projects));
    assert.ok(data.projects.length > 0);

    const first = data.projects[0];
    assert.equal(first.rank, 1);
    assert.ok(Number.isFinite(first.strength));
    assert.ok(Number.isFinite(first.lambda));
    assert.ok(first.title);
    assert.ok(first.track_name);
  });

  it('16. Non-organizer blocked from organizer pairwise endpoints (HTTP 403)', async () => {
    const res = await fetch(`${baseUrl}/api/organizer/pairwise/rankings`, {
      headers: { 'Cookie': 'session=jdg_a_91bc' }, // Judge attempting organizer view
    });
    assert.equal(res.status, 403);
  });

  it('17. Small project count handling in assignment service', () => {
    // 0 projects
    const r0 = generatePairAssignments([], ['j1']);
    assert.equal(r0.pairs.length, 0);
    assert.match(r0.metadata.underCoverageReason, /No eligible projects/);

    // 1 project
    const r1 = generatePairAssignments(['p1'], ['j1']);
    assert.equal(r1.pairs.length, 0);
    assert.match(r1.metadata.underCoverageReason, /At least 2 distinct projects/);

    // 2 projects
    const r2 = generatePairAssignments(['p2', 'p1'], ['j1', 'j2']);
    assert.ok(r2.pairs.length >= 1);
    assert.equal(r2.pairs[0].project_a_id, 'p1');
    assert.equal(r2.pairs[0].project_b_id, 'p2');
    assert.ok(r2.pairs[0].project_a_id < r2.pairs[0].project_b_id);
  });

  it('18. Ranking actually reflects submitted pairwise comparison results', async () => {
    // Recall: In test 7, Judge A voted for project_a over project_b in judgeAPairs[0]
    const testedPair = judgeAPairs[0];
    const res = await fetch(`${baseUrl}/api/organizer/pairwise/rankings`, {
      headers: { 'Cookie': 'session=org_7f2a' },
    });
    const data = await res.json();

    const winnerObj = data.projects.find(p => p.project_id === testedPair.project_a_id);
    const loserObj = data.projects.find(p => p.project_id === testedPair.project_b_id);

    assert.ok(winnerObj);
    assert.ok(loserObj);
    assert.ok(winnerObj.wins >= 1, 'Winner must have recorded win');
    assert.ok(loserObj.losses >= 1, 'Loser must have recorded loss');
    assert.ok(winnerObj.strength > loserObj.strength, 'Winner strength must exceed loser strength');
  });

  it('19. Pair status reflects COMPLETED vs PENDING state accurately', async () => {
    const res = await fetch(`${baseUrl}/api/organizer/pairwise/status`, {
      headers: { 'Cookie': 'session=org_7f2a' },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.totals);
    assert.ok(data.totals.total > 0);
    assert.ok(data.totals.completed >= 2); // 2 submitted in tests 7 & 11
    assert.ok(data.totals.pending >= 0);
    assert.ok(Array.isArray(data.judges));
  });

  it('20. Regression: Existing absolute-score judging remains completely functional', async () => {
    // 1. Judge A can still access standard T2 assignments
    const resAsgn = await fetch(`${baseUrl}/api/judge/assignments`, {
      headers: { 'Cookie': 'session=jdg_a_91bc' },
    });
    assert.equal(resAsgn.status, 200);
    const asgnData = await resAsgn.json();
    assert.ok(asgnData.assignments);

    // 2. Judge A can still view existing T2 scores
    const resScores = await fetch(`${baseUrl}/api/judge/scores`, {
      headers: { 'Cookie': 'session=jdg_a_91bc' },
    });
    assert.equal(resScores.status, 200);

    // 3. Organizer can still access normalization endpoint
    const resNorm = await fetch(`${baseUrl}/api/organizer/normalized`, {
      headers: { 'Cookie': 'session=org_7f2a' },
    });
    assert.equal(resNorm.status, 200);
    const normData = await resNorm.json();
    assert.ok(normData.projects);
  });

});
