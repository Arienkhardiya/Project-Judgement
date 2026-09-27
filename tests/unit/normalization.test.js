import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { calculateNormalization } from '../../src/server/services/normalization.js';
import { getDatabase, closeDatabase } from '../../src/server/db/database.js';
import { seedDatabase } from '../../src/server/db/seed.js';

describe('Normalization Engine Tests', () => {
  let db;
  const testDbPath = path.resolve(process.cwd(), 'norm-test.db');

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

  it('calculates normalization on real fixture data', () => {
    const result = calculateNormalization(null, db);

    assert.ok(result.event);
    assert.ok(result.globalStats.totalEvaluations === 126, `Expected 126 evaluations, got ${result.globalStats.totalEvaluations}`);
    assert.ok(result.globalStats.mean > 0);
    assert.ok(result.globalStats.stdDev > 0);

    // Verify all 41 projects are scored and ranked
    assert.equal(result.projects.length, 41);
    assert.equal(result.projects[0].rank, 1);
    assert.equal(result.projects[result.projects.length - 1].rank, 41);

    // Verify properties on each project
    for (const p of result.projects) {
      assert.ok(p.project_id);
      assert.ok(p.title);
      assert.ok(p.track_id);
      assert.ok(p.reviews_count >= 2 && p.reviews_count <= 5, `Expected 2-5 reviews, got ${p.reviews_count}`);
      assert.ok(!isNaN(p.raw_avg_score));
      assert.ok(!isNaN(p.normalized_score));
      assert.ok(!isNaN(p.final_score));
      assert.ok(p.final_score >= 1.0 && p.final_score <= 5.0);
    }
  });

  it('handles zero-variance judge (jdg_07) without division by zero or NaN', () => {
    const result = calculateNormalization(null, db);

    // jdg_07 scored all 4s in the fixtures
    const j7 = result.judgeStats['jdg_07'];
    assert.ok(j7, 'jdg_07 stats should exist');
    assert.equal(j7.count, 3);
    assert.equal(j7.mean, 4.0);
    assert.equal(j7.sampleStdDev, 0.0); // 0 sample variance!

    // Empirical Bayes regularized std dev must be strictly positive
    assert.ok(j7.regularizedStdDev > 0, `Regularized std dev must be > 0, got ${j7.regularizedStdDev}`);
    assert.ok(!isNaN(j7.regularizedStdDev));
  });

  it('handles judges with 1 review (jdg_01, jdg_23) gracefully', () => {
    const result = calculateNormalization(null, db);

    const j1 = result.judgeStats['jdg_01'];
    assert.ok(j1);
    assert.equal(j1.count, 1);
    assert.ok(j1.regularizedStdDev > 0);
    assert.ok(!isNaN(j1.regularizedStdDev));

    const j23 = result.judgeStats['jdg_23'];
    assert.ok(j23);
    assert.equal(j23.count, 1);
    assert.ok(j23.regularizedStdDev > 0);
  });
});
