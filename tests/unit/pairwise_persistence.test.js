import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { getDatabase, closeDatabase } from '../../src/server/db/database.js';
import { seedDatabase } from '../../src/server/db/seed.js';

describe('Bonus B - Pairwise Mode Additive Persistence Foundation', () => {
  let db;
  const testDbPath = path.resolve(process.cwd(), 'pairwise-persistence-test.db');

  before(() => {
    closeDatabase();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
      if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
    } catch {}

    process.env.DATABASE_PATH = testDbPath;
    db = getDatabase(testDbPath);
    seedDatabase(db);
  });

  after(() => {
    closeDatabase();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
      if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
    } catch {}
  });

  it('1. pairwise_pairs table exists', () => {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pairwise_pairs'").get();
    assert.ok(table, 'pairwise_pairs table must exist in schema');
    assert.equal(table.name, 'pairwise_pairs');
  });

  it('2. pairwise_comparisons table exists', () => {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pairwise_comparisons'").get();
    assert.ok(table, 'pairwise_comparisons table must exist in schema');
    assert.equal(table.name, 'pairwise_comparisons');
  });

  it('3. valid pair can be inserted in canonical order (A < B)', () => {
    const pairId = 'pwp_test_01';
    db.prepare(`
      INSERT INTO pairwise_pairs (id, event_id, judge_user_id, project_a_id, project_b_id, track_id, status)
      VALUES (?, 'evt_01', 'jdg_01', 'prj_01', 'prj_02', 'trk_01', 'PENDING')
    `).run(pairId);

    const inserted = db.prepare('SELECT * FROM pairwise_pairs WHERE id = ?').get(pairId);
    assert.ok(inserted);
    assert.equal(inserted.judge_user_id, 'jdg_01');
    assert.equal(inserted.project_a_id, 'prj_01');
    assert.equal(inserted.project_b_id, 'prj_02');
    assert.equal(inserted.status, 'PENDING');
  });

  it('4. valid comparison can be inserted in canonical order (A < B)', () => {
    const cmpId = 'pwc_test_01';
    db.prepare(`
      INSERT INTO pairwise_comparisons (id, pair_id, event_id, judge_user_id, project_a_id, project_b_id, winner_id, is_tie, comment)
      VALUES (?, 'pwp_test_01', 'evt_01', 'jdg_01', 'prj_01', 'prj_02', 'prj_01', 0, 'Project A had superior architecture')
    `).run(cmpId);

    const inserted = db.prepare('SELECT * FROM pairwise_comparisons WHERE id = ?').get(cmpId);
    assert.ok(inserted);
    assert.equal(inserted.winner_id, 'prj_01');
    assert.equal(inserted.is_tie, 0);
    assert.equal(inserted.comment, 'Project A had superior architecture');
  });

  it('5. duplicate pair assignment (A/B) is rejected by UNIQUE constraint', () => {
    assert.throws(() => {
      db.prepare(`
        INSERT INTO pairwise_pairs (id, event_id, judge_user_id, project_a_id, project_b_id)
        VALUES ('pwp_test_dup', 'evt_01', 'jdg_01', 'prj_01', 'prj_02')
      `).run();
    }, /UNIQUE constraint failed/);
  });

  it('6. duplicate comparison (A/B) is rejected by UNIQUE constraint', () => {
    assert.throws(() => {
      db.prepare(`
        INSERT INTO pairwise_comparisons (id, pair_id, event_id, judge_user_id, project_a_id, project_b_id, winner_id, is_tie)
        VALUES ('pwc_test_dup', 'pwp_test_01', 'evt_01', 'jdg_01', 'prj_01', 'prj_02', 'prj_02', 0)
      `).run();
    }, /UNIQUE constraint failed/);
  });

  it('7. reverse-order pair (B/A where B > A) is rejected by canonical-order rule', () => {
    assert.throws(() => {
      db.prepare(`
        INSERT INTO pairwise_pairs (id, event_id, judge_user_id, project_a_id, project_b_id)
        VALUES ('pwp_test_rev', 'evt_01', 'jdg_01', 'prj_02', 'prj_01')
      `).run();
    }, /CHECK constraint failed: project_a_id < project_b_id/);
  });

  it('8. reverse-order comparison (B/A where B > A) is rejected by canonical-order rule', () => {
    assert.throws(() => {
      db.prepare(`
        INSERT INTO pairwise_comparisons (id, event_id, judge_user_id, project_a_id, project_b_id, winner_id, is_tie)
        VALUES ('pwc_test_rev', 'evt_01', 'jdg_01', 'prj_02', 'prj_01', 'prj_01', 0)
      `).run();
    }, /CHECK constraint failed: project_a_id < project_b_id/);
  });

  it('9. self-comparison (A == B) is rejected by canonical-order rule', () => {
    assert.throws(() => {
      db.prepare(`
        INSERT INTO pairwise_pairs (id, event_id, judge_user_id, project_a_id, project_b_id)
        VALUES ('pwp_test_self', 'evt_01', 'jdg_01', 'prj_03', 'prj_03')
      `).run();
    }, /CHECK constraint failed: project_a_id < project_b_id/);

    assert.throws(() => {
      db.prepare(`
        INSERT INTO pairwise_comparisons (id, event_id, judge_user_id, project_a_id, project_b_id, winner_id, is_tie)
        VALUES ('pwc_test_self', 'evt_01', 'jdg_01', 'prj_03', 'prj_03', 'prj_03', 0)
      `).run();
    }, /CHECK constraint failed: project_a_id < project_b_id/);
  });

  it('10. duplicate comparison for same pair_id is rejected by unique index', () => {
    assert.throws(() => {
      db.prepare(`
        INSERT INTO pairwise_comparisons (id, pair_id, event_id, judge_user_id, project_a_id, project_b_id, winner_id, is_tie)
        VALUES ('pwc_test_dup_pair_id', 'pwp_test_01', 'evt_01', 'jdg_02', 'prj_01', 'prj_02', 'prj_01', 0)
      `).run();
    }, /UNIQUE constraint failed: pairwise_comparisons\.pair_id/);
  });

  it('11. standalone comparison with NULL pair_id succeeds', () => {
    const standaloneId = 'pwc_test_standalone';
    db.prepare(`
      INSERT INTO pairwise_comparisons (id, pair_id, event_id, judge_user_id, project_a_id, project_b_id, winner_id, is_tie, comment)
      VALUES (?, NULL, 'evt_01', 'jdg_02', 'prj_02', 'prj_03', 'prj_03', 0, 'Direct comparison without pre-assigned pair')
    `).run(standaloneId);

    const inserted = db.prepare('SELECT * FROM pairwise_comparisons WHERE id = ?').get(standaloneId);
    assert.ok(inserted);
    assert.equal(inserted.pair_id, null);
    assert.equal(inserted.winner_id, 'prj_03');
  });

  it('12. invalid winner is rejected when not tied', () => {
    // Winner cannot be prj_03 when comparing prj_01 vs prj_02
    assert.throws(() => {
      db.prepare(`
        INSERT INTO pairwise_comparisons (id, event_id, judge_user_id, project_a_id, project_b_id, winner_id, is_tie)
        VALUES ('pwc_test_invalid_winner', 'evt_01', 'jdg_02', 'prj_01', 'prj_02', 'prj_03', 0)
      `).run();
    }, /CHECK constraint failed/);

    // Winner cannot be NULL when is_tie = 0
    assert.throws(() => {
      db.prepare(`
        INSERT INTO pairwise_comparisons (id, event_id, judge_user_id, project_a_id, project_b_id, winner_id, is_tie)
        VALUES ('pwc_test_null_winner', 'evt_01', 'jdg_02', 'prj_01', 'prj_02', NULL, 0)
      `).run();
    }, /CHECK constraint failed/);
  });

  it('13. tie can be stored without winner', () => {
    const tieId = 'pwc_test_tie';
    db.prepare(`
      INSERT INTO pairwise_comparisons (id, event_id, judge_user_id, project_a_id, project_b_id, winner_id, is_tie, comment)
      VALUES (?, 'evt_01', 'jdg_03', 'prj_01', 'prj_02', NULL, 1, 'Both projects performed equally')
    `).run(tieId);

    const inserted = db.prepare('SELECT * FROM pairwise_comparisons WHERE id = ?').get(tieId);
    assert.ok(inserted);
    assert.equal(inserted.is_tie, 1);
    assert.equal(inserted.winner_id, null);
    assert.equal(inserted.comment, 'Both projects performed equally');

    // But tie cannot specify a non-null winner
    assert.throws(() => {
      db.prepare(`
        INSERT INTO pairwise_comparisons (id, event_id, judge_user_id, project_a_id, project_b_id, winner_id, is_tie)
        VALUES ('pwc_test_invalid_tie', 'evt_01', 'jdg_03', 'prj_01', 'prj_02', 'prj_01', 1)
      `).run();
    }, /CHECK constraint failed/);
  });

  it('14. existing T2 score tables still work', () => {
    // Verify existing T2 score and assignment operations continue to work without conflict
    const scoresCount = db.prepare('SELECT count(*) as count FROM scores').get().count;
    const assignmentsCount = db.prepare('SELECT count(*) as count FROM judge_assignments').get().count;
    const rubricsCount = db.prepare('SELECT count(*) as count FROM rubrics').get().count;

    assert.ok(scoresCount > 0, 'Existing T2 scores table must be populated');
    assert.ok(assignmentsCount > 0, 'Existing T2 judge assignments table must be populated');
    assert.ok(rubricsCount > 0, 'Existing T2 rubrics table must be populated');

    // Test inserting a new score into existing T2 table
    const testScoreId = 'scr_t2_coexist_test';
    db.prepare(`
      INSERT INTO scores (id, judge_user_id, project_id, comment, status)
      VALUES (?, 'jdg_01', 'prj_03', 'T2 coexistence score', 'SUBMITTED')
    `).run(testScoreId);

    const score = db.prepare('SELECT * FROM scores WHERE id = ?').get(testScoreId);
    assert.ok(score);
    assert.equal(score.comment, 'T2 coexistence score');
  });
});
