import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/server/app.js';
import { getDatabase, closeDatabase } from '../../src/server/db/database.js';
import { seedDatabase } from '../../src/server/db/seed.js';

describe('Milestone 3 - T3 Community Voting & Anti-Abuse Integration Tests', () => {
  let app;
  let server;
  let baseUrl;
  let creds;

  before(async () => {
    const db = getDatabase();
    creds = seedDatabase(db);
    app = createApp();

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    closeDatabase();
  });

  test('1. Organizer can create and configure a voting window', async () => {
    const res = await fetch(`${baseUrl}/api/voting/windows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': creds.organizer.replace('Cookie: ', ''),
      },
      body: JSON.stringify({
        event_id: 'evt_01',
        title: 'Open Hack Community Voting',
        start_time: new Date(Date.now() - 86400000).toISOString(),
        end_time: new Date(Date.now() + 7 * 86400000).toISOString(),
        is_active: 1
      })
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.window.id.startsWith('vwin_'));
    assert.equal(data.window.title, 'Open Hack Community Voting');
  });

  test('2. Ballot returns randomized project ordering per voter (eliminating positional bias)', async () => {
    // Voter 1: participant
    const res1 = await fetch(`${baseUrl}/api/voting/ballot?event_id=evt_01`, {
      headers: { 'Cookie': creds.participant.replace('Cookie: ', '') }
    });
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.ok(data1.projects.length > 0);

    // Voter 2: judge_a
    const res2 = await fetch(`${baseUrl}/api/voting/ballot?event_id=evt_01`, {
      headers: { 'Cookie': creds.judge_a.replace('Cookie: ', '') }
    });
    assert.equal(res2.status, 200);
    const data2 = await res2.json();

    // Verify both get all projects but ordering differs or is shuffled
    assert.equal(data1.ballot_count, data2.ballot_count);
    const ids1 = data1.projects.map(p => p.id);
    const ids2 = data2.projects.map(p => p.id);

    // Set comparison confirms exact same set of projects
    assert.equal(new Set(ids1).size, new Set(ids2).size);
    // Positional difference check (order shuffled)
    const orderDiffers = ids1.some((id, idx) => id !== ids2[idx]);
    assert.ok(orderDiffers, 'Ballot ordering must differ between different voters to eliminate positional bias');
  });

  test('3. Anti-Abuse: Self-voting is strictly forbidden (HTTP 403)', async () => {
    // Participant is a member of their own team in the fixtures
    // In seed, participant user is in Nightshift (tm_01), which created prj_01
    const res = await fetch(`${baseUrl}/api/voting/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': creds.participant.replace('Cookie: ', ''),
      },
      body: JSON.stringify({
        event_id: 'evt_01',
        project_id: 'prj_01'
      })
    });

    assert.equal(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /Self-voting is strictly prohibited/i);
  });

  test('4. Valid Community Vote succeeds on an independent project (HTTP 201)', async () => {
    // Participant votes for prj_02 (Small Meadow, submitted by LoudQuarry)
    const res = await fetch(`${baseUrl}/api/voting/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': creds.participant.replace('Cookie: ', ''),
      },
      body: JSON.stringify({
        event_id: 'evt_01',
        project_id: 'prj_02'
      })
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.vote_id.startsWith('vote_'));
    assert.equal(data.project_id, 'prj_02');
  });

  test('5. Anti-Abuse: Duplicate vote by same user in same event is rejected (HTTP 409 Conflict)', async () => {
    // Participant attempts to vote a second time for prj_03
    const res = await fetch(`${baseUrl}/api/voting/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': creds.participant.replace('Cookie: ', ''),
      },
      body: JSON.stringify({
        event_id: 'evt_01',
        project_id: 'prj_03'
      })
    });

    assert.equal(res.status, 409);
    const data = await res.json();
    assert.match(data.error, /already voted/i);
  });

  test('6. Blind Voting Window: Active window seals results from participants', async () => {
    // Participant requests voting results while window is active
    const res = await fetch(`${baseUrl}/api/voting/results?event_id=evt_01`, {
      headers: { 'Cookie': creds.participant.replace('Cookie: ', '') }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.is_blind, true);
    assert.equal(data.status, 'OPEN');
    assert.equal(data.results, undefined); // Results array must be withheld
    assert.match(data.message, /sealed/i);
  });

  test('7. Organizer can view live unblinded voting results during active window', async () => {
    const res = await fetch(`${baseUrl}/api/voting/results?event_id=evt_01`, {
      headers: { 'Cookie': creds.organizer.replace('Cookie: ', '') }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.is_blind, false);
    assert.ok(Array.isArray(data.results));
    assert.ok(data.total_votes >= 1);
    // Verify prj_02 has the vote
    const prj2 = data.results.find(r => r.project_id === 'prj_02');
    assert.ok(prj2);
    assert.equal(prj2.vote_count, 1);
  });

  test('8. Community Comments: Posting constructive feedback on a project', async () => {
    const res = await fetch(`${baseUrl}/api/projects/prj_02/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': creds.judge_a.replace('Cookie: ', ''),
      },
      body: JSON.stringify({
        content: 'Impressive accessibility implementation! The color contrast and keyboard navigation are spotless.'
      })
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.comment.id.startsWith('cmt_'));
    assert.equal(data.comment.author_name, 'Tomas Varga');
  });

  test('9. Community Comments: Public read returns non-flagged comments', async () => {
    const res = await fetch(`${baseUrl}/api/projects/prj_02/comments`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.count >= 1);
    assert.equal(data.comments[0].project_id, 'prj_02');
    assert.match(data.comments[0].content, /accessibility implementation/i);
  });

  test('10. Community Comments: Moderation flagging hides comment from public', async () => {
    // Get comment ID
    const listRes = await fetch(`${baseUrl}/api/projects/prj_02/comments`);
    const listData = await listRes.json();
    const commentId = listData.comments[0].id;

    // Flag the comment
    const flagRes = await fetch(`${baseUrl}/api/comments/flag/${commentId}`, {
      method: 'POST',
      headers: { 'Cookie': creds.participant.replace('Cookie: ', '') }
    });
    assert.equal(flagRes.status, 200);

    // Public list should now hide the flagged comment
    const checkRes = await fetch(`${baseUrl}/api/projects/prj_02/comments`);
    const checkData = await checkRes.json();
    assert.equal(checkData.comments.find(c => c.id === commentId), undefined);
  });
});
