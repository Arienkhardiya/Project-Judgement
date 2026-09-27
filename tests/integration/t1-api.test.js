import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createApp } from '../../src/server/app.js';
import { getDatabase, closeDatabase } from '../../src/server/db/database.js';
import { seedDatabase } from '../../src/server/db/seed.js';

let server;
let baseUrl;
const testDbPath = path.resolve(process.cwd(), 't1-test.db');

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

describe('Milestone 1 - T1 Integration Tests', () => {
  it('1. Public Anonymous Gallery returns 200 without auth', async () => {
    const res = await fetch(`${baseUrl}/projects`);
    assert.equal(res.status, 200);
    const body = await res.text();
    // Verify fixture project title appears
    assert.ok(body.includes('Glass Signal') || body.toLowerCase().includes('glass signal'));
  });

  it('2. Search query filters projects', async () => {
    const res = await fetch(`${baseUrl}/api/projects?q=Signal`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.projects.length > 0);
    assert.ok(data.projects.some(p => p.title.includes('Signal')));
  });

  it('3. Track filter restricts projects to specified track', async () => {
    const res = await fetch(`${baseUrl}/api/projects?track=trk_04`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.projects.length > 0);
    assert.ok(data.projects.every(p => p.track_id === 'trk_04'));
  });

  it('4. Project detail page returns 200 with metadata', async () => {
    const res = await fetch(`${baseUrl}/api/projects/prj_01`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.project.id, 'prj_01');
    assert.equal(data.project.title, 'Glass Signal');
    assert.ok(data.project.members.length > 0);
  });

  it('5. Closed event strictly refuses submissions with HTTP 4xx', async () => {
    const res = await fetch(`${baseUrl}/projects/new`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'session=prt_2e88',
      },
      body: JSON.stringify({
        title: 'dogfood-late-submission-probe',
        summary: 'probe',
      }),
    });
    assert.ok(res.status >= 400 && res.status < 500, `Expected 4xx, got ${res.status}`);
    const data = await res.json();
    assert.ok(data.error.toLowerCase().includes('closed') || data.deadline === 'EXPIRED');
  });

  it('6. Participant cannot create an event (RBAC: 403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'session=prt_2e88',
      },
      body: JSON.stringify({
        name: 'Unauthorized Hackathon',
        submissions_close: '2026-12-31T23:59:59Z',
      }),
    });
    assert.equal(res.status, 403);
  });

  it('7. Organizer can create an event and tracks (RBAC: 201 Created)', async () => {
    const futureClose = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'session=org_7f2a',
      },
      body: JSON.stringify({
        name: 'Active Test Hackathon 2026',
        description: 'An open test event',
        submissions_close: futureClose,
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    const newEventId = data.event.id;
    assert.ok(newEventId);

    // Add track to new event
    const trackRes = await fetch(`${baseUrl}/api/events/${newEventId}/tracks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'session=org_7f2a',
      },
      body: JSON.stringify({
        name: 'Generative AI',
        description: 'AI track',
      }),
    });
    assert.equal(trackRes.status, 201);
  });

  it('8. Team creation generates secure invite link and adds creator as leader', async () => {
    // Create new participant session
    const db = getDatabase();
    const userId = 'usr_test_lead';
    db.prepare(`INSERT OR REPLACE INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)`).run(
      userId, 'teamlead@example.org', 'Team Lead', 'hash'
    );
    db.prepare(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, 'participant')`).run(userId);
    db.prepare(`INSERT OR REPLACE INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 day'))`).run(
      'ses_test_lead', userId
    );

    const res = await fetch(`${baseUrl}/api/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'session=ses_test_lead',
      },
      body: JSON.stringify({ name: 'Alpha Squad' }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.team.invite_code.startsWith('inv_'));

    // Check my-team returns leader
    const myTeamRes = await fetch(`${baseUrl}/api/teams/my-team`, {
      headers: { 'Cookie': 'session=ses_test_lead' },
    });
    const myTeamData = await myTeamRes.json();
    assert.equal(myTeamData.team.name, 'Alpha Squad');
    assert.equal(myTeamData.team.my_role, 'leader');
  });

  it('9. Joining a team with valid invite code succeeds', async () => {
    const db = getDatabase();
    // Get invite code of Alpha Squad
    const team = db.prepare(`SELECT id, invite_code FROM teams WHERE name = 'Alpha Squad'`).get();
    assert.ok(team);

    // Create second participant
    const userId = 'usr_test_member';
    db.prepare(`INSERT OR REPLACE INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)`).run(
      userId, 'member2@example.org', 'Second Member', 'hash'
    );
    db.prepare(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, 'participant')`).run(userId);
    db.prepare(`INSERT OR REPLACE INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 day'))`).run(
      'ses_test_member', userId
    );

    const joinRes = await fetch(`${baseUrl}/api/teams/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'session=ses_test_member',
      },
      body: JSON.stringify({ invite_code: team.invite_code }),
    });
    assert.equal(joinRes.status, 200);

    // Check second member sees team
    const checkRes = await fetch(`${baseUrl}/api/teams/my-team`, {
      headers: { 'Cookie': 'session=ses_test_member' },
    });
    const checkData = await checkRes.json();
    assert.equal(checkData.team.name, 'Alpha Squad');
    assert.equal(checkData.team.my_role, 'member');
  });

  it('10. Invalid invite code is rejected with 404', async () => {
    const res = await fetch(`${baseUrl}/api/teams/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'session=prt_2e88',
      },
      body: JSON.stringify({ invite_code: 'inv_non_existent_fake_code' }),
    });
    assert.equal(res.status, 404);
  });

  it('11. Full Project Lifecycle on an Open Event (Draft -> Edit -> Submit)', async () => {
    const db = getDatabase();
    // 1. Create open event with deadline in future
    const openEventId = 'evt_open_test';
    const futureClose = new Date(Date.now() + 3600 * 1000).toISOString();
    db.prepare(`
      INSERT OR REPLACE INTO events (id, name, submissions_close)
      VALUES (?, 'Open Hack', ?)
    `).run(openEventId, futureClose);

    const trackId = 'trk_open_01';
    db.prepare(`
      INSERT OR REPLACE INTO tracks (id, event_id, name)
      VALUES (?, ?, 'Innovation')
    `).run(trackId, openEventId);

    // 2. Create team in this open event
    const user3 = 'usr_test_3';
    db.prepare(`INSERT OR REPLACE INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)`).run(
      user3, 'builder@example.org', 'Builder', 'hash'
    );
    db.prepare(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, 'participant')`).run(user3);
    db.prepare(`INSERT OR REPLACE INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 day'))`).run(
      'ses_builder', user3
    );

    const team3Id = 'tm_open_03';
    db.prepare(`INSERT OR REPLACE INTO teams (id, event_id, name, invite_code) VALUES (?, ?, 'Innovators', 'inv_inn_3')`).run(
      team3Id, openEventId
    );
    db.prepare(`INSERT OR REPLACE INTO team_members (team_id, user_id, role) VALUES (?, ?, 'leader')`).run(
      team3Id, user3
    );

    // 3. Create Draft
    const createRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'session=ses_builder',
      },
      body: JSON.stringify({
        title: 'Project Genesis',
        summary: 'Initial draft summary',
        track_id: trackId,
        team_id: team3Id,
        action: 'draft',
      }),
    });
    assert.equal(createRes.status, 201);
    const createData = await createRes.json();
    assert.equal(createData.project.status, 'DRAFT');
    const projectId = createData.project.id;

    // 4. Edit Draft
    const updateRes = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'session=ses_builder',
      },
      body: JSON.stringify({
        title: 'Project Genesis V2',
        summary: 'Polished summary',
      }),
    });
    assert.equal(updateRes.status, 200);
    const updateData = await updateRes.json();
    assert.equal(updateData.project.title, 'Project Genesis V2');

    // 5. Submit Draft
    const submitRes = await fetch(`${baseUrl}/api/projects/${projectId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'session=ses_builder',
      },
    });
    assert.equal(submitRes.status, 200);

    // 6. Verify in gallery
    const galleryRes = await fetch(`${baseUrl}/api/projects?q=Genesis`);
    const galleryData = await galleryRes.json();
    assert.ok(galleryData.projects.some(p => p.id === projectId && p.status === 'SUBMITTED'));
  });

  it('12. Adversarial Ownership: Participant cannot edit another team’s project', async () => {
    // Attempting to edit prj_01 (owned by tm_01) using ses_builder
    const res = await fetch(`${baseUrl}/api/projects/prj_01`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'session=ses_builder',
      },
      body: JSON.stringify({
        title: 'Hacked Project Title',
      }),
    });
    assert.equal(res.status, 403);
  });
});
