import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { createApp } from '../../src/server/app.js';
import { getDatabase, closeDatabase } from '../../src/server/db/database.js';
import { seedDatabase } from '../../src/server/db/seed.js';
import { canonicalizeJson } from '../../src/server/services/verification.js';

let server;
let baseUrl;
let creds;
const testDbPath = path.resolve(process.cwd(), 'bulk-test.db');

before(async () => {
  closeDatabase();
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
  } catch {}

  process.env.DATABASE_PATH = testDbPath;
  const db = getDatabase(testDbPath);
  creds = seedDatabase(db);

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

describe('T4 Bulk Import & Export Integration Tests', () => {
  it('1. Organizer can export full event state as signed JSON bundle (HTTP 200)', async () => {
    const res = await fetch(`${baseUrl}/api/export.json`, {
      headers: { 'Cookie': creds.organizer.replace('Cookie: ', '') },
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/json/);

    const bundle = await res.json();
    assert.equal(bundle.export_version, '2026.1');
    assert.ok(bundle.event);
    assert.ok(bundle.tracks.length >= 1);
    assert.ok(bundle.teams.length >= 1);
    assert.ok(bundle.projects.length >= 1);
    assert.ok(bundle.rankings.length >= 1);
    assert.ok(bundle.audit);
    assert.equal(bundle.audit.algorithm, 'Ed25519');
    assert.equal(bundle.audit.signature.length, 128); // 64 bytes in hex
    assert.ok(bundle.audit.public_key);

    // Cryptographic offline verification of export bundle
    const { audit, ...payloadWithoutAudit } = bundle;
    const computedDigest = crypto
      .createHash('sha256')
      .update(canonicalizeJson(payloadWithoutAudit), 'utf8')
      .digest('hex');
    assert.equal(computedDigest, audit.digest);

    const isSigValid = crypto.verify(
      null,
      Buffer.from(computedDigest, 'utf8'),
      crypto.createPublicKey(audit.public_key),
      Buffer.from(audit.signature, 'hex')
    );
    assert.equal(isSigValid, true, 'Export bundle signature must verify offline');
  });

  it('2. Bulk Export RBAC: Participant is FORBIDDEN from exporting JSON (HTTP 403)', async () => {
    const res = await fetch(`${baseUrl}/api/export.json`, {
      headers: { 'Cookie': creds.participant.replace('Cookie: ', '') },
    });
    assert.equal(res.status, 403);
  });

  it('3. Organizer can bulk import a complete event dataset (HTTP 201)', async () => {
    const importPayload = {
      event: {
        id: 'evt_imported_99',
        name: 'Autonomous Hackathon 2026',
        submissions_close: '2026-04-01T20:00:00Z',
      },
      tracks: [
        { id: 'trk_ai', name: 'Artificial Intelligence' },
        { id: 'trk_sec', name: 'Systems Security' },
      ],
      judges: [
        { id: 'jdg_imported_1', name: 'Alan Turing', email: 'alan@turing.org', tracks: ['trk_ai'] },
      ],
      teams: [
        { id: 'tm_imp_1', name: 'Enigma Team', members: ['alan@turing.org'] },
      ],
      projects: [
        {
          id: 'prj_imp_1',
          team_id: 'tm_imp_1',
          track_id: 'trk_ai',
          title: 'Neural Decoder',
          summary: 'Cryptographic ML decoder',
          status: 'SUBMITTED',
        },
      ],
      scores: [
        {
          judge: 'jdg_imported_1',
          project: 'prj_imp_1',
          criteria: { functionality: 5, innovation: 5 },
          comment: 'Outstanding project',
        },
      ],
    };

    const res = await fetch(`${baseUrl}/api/organizer/import.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': creds.organizer.replace('Cookie: ', ''),
      },
      body: JSON.stringify(importPayload),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.event_id, 'evt_imported_99');
    assert.equal(data.counts.tracks, 2);
    assert.equal(data.counts.projects, 1);
    assert.equal(data.counts.scores, 1);

    // Verify imported project is queryable via public API
    const projectRes = await fetch(`${baseUrl}/api/projects/prj_imp_1`);
    assert.equal(projectRes.status, 200);
    const projectData = await projectRes.json();
    assert.equal(projectData.project.title, 'Neural Decoder');
  });

  it('4. Bulk Import RBAC: Participant is FORBIDDEN from importing datasets (HTTP 403)', async () => {
    const res = await fetch(`${baseUrl}/api/organizer/import.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': creds.participant.replace('Cookie: ', ''),
      },
      body: JSON.stringify({ event: { id: 'evt_evil', name: 'Rogue' } }),
    });
    assert.equal(res.status, 403);
  });

  it('5. Bulk Import Validation: Malformed data without event details is rejected (HTTP 400)', async () => {
    const res = await fetch(`${baseUrl}/api/organizer/import.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': creds.organizer.replace('Cookie: ', ''),
      },
      body: JSON.stringify({ invalid: 'no event present' }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error);
  });
});
