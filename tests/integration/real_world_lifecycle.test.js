import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createApp } from '../../src/server/app.js';
import { getDatabase, closeDatabase } from '../../src/server/db/database.js';
import { seedDatabase } from '../../src/server/db/seed.js';

let server;
let baseUrl;
const testDbPath = path.resolve(process.cwd(), 'real-world-lifecycle-test.db');

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

describe('VERIDICT — Real-World Organizer & Competition Lifecycle Integration Tests', () => {
  let organizerToken;
  let organizerEmail = 'organizer.real@veridict.io';
  let createdEventId;
  let participantToken;
  let participantEmail = 'hacker.priya@veridict.io';
  let judgeInviteToken;
  let judgeEmail = 'distinguished.judge@veridict.io';

  it('1. Account Creation: Signup creates unverified account with secure token and truthful fallback', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Real Organizer',
        email: organizerEmail,
        password: 'SecureOrganizerPass2026!',
        role: 'organizer',
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.sessionToken);
    assert.ok(data.verificationToken);
    assert.ok(data.verificationLink);
    assert.equal(data.user.email, organizerEmail);
    assert.equal(data.user.is_verified, false);
    organizerToken = data.sessionToken;

    // Verify database state directly
    const db = getDatabase();
    const user = db.prepare('SELECT is_verified, verification_token FROM users WHERE email = ?').get(organizerEmail);
    assert.equal(user.is_verified, 0);
    assert.equal(user.verification_token, data.verificationToken);
  });

  it('2. Email Verification: Valid token verifies account and activates verified status', async () => {
    const db = getDatabase();
    const user = db.prepare('SELECT verification_token FROM users WHERE email = ?').get(organizerEmail);

    const res = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: user.verification_token }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.user.is_verified, true);

    const updatedUser = db.prepare('SELECT is_verified, verification_token FROM users WHERE email = ?').get(organizerEmail);
    assert.equal(updatedUser.is_verified, 1);
    assert.equal(updatedUser.verification_token, null);
  });

  it('3. Email Verification Security: Reused or altered token is rejected (HTTP 400)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'invalid_or_already_used_token' }),
    });
    assert.equal(res.status, 400);
  });

  it('4. Password Recovery: Forgot password generates secure token and resets password', async () => {
    // 1. Request reset
    const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: organizerEmail }),
    });
    assert.equal(forgotRes.status, 200);
    const forgotData = await forgotRes.json();
    assert.ok(forgotData.resetToken || forgotData.resetLink);

    const db = getDatabase();
    const user = db.prepare('SELECT reset_token FROM users WHERE email = ?').get(organizerEmail);
    assert.ok(user.reset_token);

    // 2. Perform reset
    const resetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: user.reset_token,
        newPassword: 'BrandNewOrganizerPassword2026!',
      }),
    });
    assert.equal(resetRes.status, 200);

    // 3. Login with new password succeeds
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: organizerEmail,
        password: 'BrandNewOrganizerPassword2026!',
      }),
    });
    assert.equal(loginRes.status, 200);
    const loginData = await loginRes.json();
    assert.ok(loginData.sessionToken);
    organizerToken = loginData.sessionToken;
  });

  it('5. Event Creation: Organizer launches Build Bharat 2026 with tracks and prizes', async () => {
    const futureClose = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `session=${organizerToken}`,
      },
      body: JSON.stringify({
        name: 'Build Bharat 2026',
        description: 'National Engineering and Innovation Hackathon',
        submissions_close: futureClose,
        status: 'PUBLISHED',
        tracks: [
          { name: 'Fintech & Digital Public Goods', description: 'Next-gen payment infrastructure' },
          { name: 'Healthcare & Agritech', description: 'Rural telemetry and AI diagnostics' },
        ],
        prizes: [
          { name: 'National Champion', amount: 50000 },
          { name: 'Emerging Innovator', amount: 25000 },
        ],
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.event.id);
    assert.equal(data.event.name, 'Build Bharat 2026');
    createdEventId = data.event.id;

    // Verify isolation: new event has ZERO teams and ZERO projects
    const eventDetailRes = await fetch(`${baseUrl}/api/events/${createdEventId}`);
    const eventDetails = await eventDetailRes.json();
    assert.equal(eventDetails.event.teams_count, 0);
    assert.equal(eventDetails.event.total_projects, 0);
    assert.equal(eventDetails.event.submitted_projects, 0);
    assert.equal(eventDetails.tracks.length, 2);
    assert.equal(eventDetails.prizes.length, 2);
  });

  it('6. Participant Registration: Participant registers for Build Bharat 2026', async () => {
    // 1. Participant registers account
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Priya Sharma',
        email: participantEmail,
        password: 'ParticipantPass2026!',
        role: 'participant',
      }),
    });
    assert.equal(regRes.status, 201);
    const regData = await regRes.json();
    participantToken = regData.sessionToken;

    // 2. Participant registers for event
    const eventRegRes = await fetch(`${baseUrl}/api/events/${createdEventId}/register`, {
      method: 'POST',
      headers: { 'Cookie': `session=${participantToken}` },
    });
    assert.equal(eventRegRes.status, 201);
    const eventRegData = await eventRegRes.json();
    assert.equal(eventRegData.is_registered, true);

    // 3. Check registration status
    const statusRes = await fetch(`${baseUrl}/api/events/${createdEventId}/my-registration`, {
      headers: { 'Cookie': `session=${participantToken}` },
    });
    const statusData = await statusRes.json();
    assert.equal(statusData.isRegistered, true);
  });

  it('7. Participant Team & Project: Forms team and submits project before deadline', async () => {
    // 1. Create team
    const teamRes = await fetch(`${baseUrl}/api/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `session=${participantToken}`,
      },
      body: JSON.stringify({
        name: 'Bharat Bharat Tech Labs',
        event_id: createdEventId,
      }),
    });
    assert.equal(teamRes.status, 201);
    const teamData = await teamRes.json();
    const teamId = teamData.team.id;

    // 2. Fetch track
    const db = getDatabase();
    const track = db.prepare('SELECT id FROM tracks WHERE event_id = ? LIMIT 1').get(createdEventId);
    assert.ok(track);

    // 3. Create project draft
    const draftRes = await fetch(`${baseUrl}/projects/new`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `session=${participantToken}`,
      },
      body: JSON.stringify({
        title: 'UPI Offline Mesh Protocol',
        summary: 'Offline audio and mesh routing for micropayments without cellular internet',
        track_id: track.id,
        team_id: teamId,
        status: 'SUBMITTED',
      }),
    });
    assert.ok(draftRes.status === 200 || draftRes.status === 201);
    const draftData = await draftRes.json();
    assert.equal(draftData.project.status, 'SUBMITTED');
  });

  it('8. Judge Invitation: Organizer invites designated judge with real invitation record', async () => {
    const db = getDatabase();
    const track = db.prepare('SELECT id FROM tracks WHERE event_id = ? LIMIT 1').get(createdEventId);

    const inviteRes = await fetch(`${baseUrl}/api/organizer/judges/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `session=${organizerToken}`,
      },
      body: JSON.stringify({
        name: 'Dr. Vikram Sarabhai',
        email: judgeEmail,
        event_id: createdEventId,
        track_ids: [track.id],
      }),
    });
    assert.equal(inviteRes.status, 201);
    const inviteData = await inviteRes.json();
    assert.ok(inviteData.token);
    assert.ok(inviteData.inviteLink);
    assert.equal(inviteData.invitation.status, 'PENDING');
    judgeInviteToken = inviteData.token;

    // Verify invitation record in database
    const inviteRecord = db.prepare('SELECT * FROM event_invitations WHERE token = ?').get(judgeInviteToken);
    assert.ok(inviteRecord);
    assert.equal(inviteRecord.email, judgeEmail);
    assert.equal(inviteRecord.event_id, createdEventId);
  });

  it('9. Judge Invitation Acceptance: Judge inspects and accepts invitation', async () => {
    // 1. Inspect invitation details
    const inspectRes = await fetch(`${baseUrl}/api/invitations/${judgeInviteToken}`);
    assert.equal(inspectRes.status, 200);
    const inspectData = await inspectRes.json();
    assert.equal(inspectData.invitation.event_name, 'Build Bharat 2026');
    assert.equal(inspectData.invitation.status, 'PENDING');

    // 2. Accept invitation
    const acceptRes = await fetch(`${baseUrl}/api/invitations/${judgeInviteToken}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dr. Vikram Sarabhai',
        password: 'JudgeSecurePass2026!',
      }),
    });
    assert.equal(acceptRes.status, 200);
    const acceptData = await acceptRes.json();
    assert.ok(acceptData.sessionToken);
    assert.ok(acceptData.user.roles.includes('judge'));

    // Verify database state: invitation marked ACCEPTED
    const db = getDatabase();
    const updatedInvite = db.prepare('SELECT status, accepted_at FROM event_invitations WHERE token = ?').get(judgeInviteToken);
    assert.equal(updatedInvite.status, 'ACCEPTED');
    assert.ok(updatedInvite.accepted_at);
  });

  it('10. Event Lifecycle: Organizer updates event lifecycle phase to JUDGING_OPEN', async () => {
    const patchRes = await fetch(`${baseUrl}/api/events/${createdEventId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `session=${organizerToken}`,
      },
      body: JSON.stringify({ status: 'JUDGING_OPEN' }),
    });
    assert.equal(patchRes.status, 200);
    const patchData = await patchRes.json();
    assert.equal(patchData.event.status, 'JUDGING_OPEN');
  });

  it('11. Results Publication Gate: Public results blocked until published', async () => {
    // Unauthenticated public request for results of unpublished event is blocked with 403
    const publicRes = await fetch(`${baseUrl}/api/events/${createdEventId}/results`);
    assert.equal(publicRes.status, 403);

    // Organizer publishes results
    const publishRes = await fetch(`${baseUrl}/api/events/${createdEventId}/publish-results`, {
      method: 'POST',
      headers: { 'Cookie': `session=${organizerToken}` },
    });
    assert.equal(publishRes.status, 200);

    // Public request now succeeds with 200 and ranked projects
    const afterPubRes = await fetch(`${baseUrl}/api/events/${createdEventId}/results`);
    assert.equal(afterPubRes.status, 200);
    const afterPubData = await afterPubRes.json();
    assert.equal(afterPubData.results_published, true);
    assert.ok(Array.isArray(afterPubData.projects));
  });
});
