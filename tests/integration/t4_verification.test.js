import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/server/app.js';
import { getDatabase, closeDatabase } from '../../src/server/db/database.js';
import { seedDatabase } from '../../src/server/db/seed.js';

describe('Milestone 4 - T4 Stretch Verification & Extensions Integration Tests', () => {
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

  test('1. Verifiable Records: Querying signed audit record returns valid cryptographic proof', async () => {
    // prj_01 was seeded with a verifiable certificate record
    const certRes = await fetch(`${baseUrl}/api/verify/certificate/prj_01`);
    assert.equal(certRes.status, 200);
    const cert = await certRes.json();
    assert.ok(cert.signature);
    assert.ok(cert.digest);

    // Verify record via signature endpoint
    const verifyRes = await fetch(`${baseUrl}/api/verify/record/${cert.signature}`);
    assert.equal(verifyRes.status, 200);
    const verifyData = await verifyRes.json();

    assert.equal(verifyData.verified, true);
    assert.equal(verifyData.entity_id, 'prj_01');
    assert.equal(verifyData.signature, cert.signature);
    assert.equal(verifyData.digest, cert.digest);
  });

  test('2. Tamper Resistance: Fake or altered signature is rejected (HTTP 404 / verified: false)', async () => {
    const fakeSignature = '0000000000000000000000000000000000000000000000000000000000000000';
    const res = await fetch(`${baseUrl}/api/verify/record/${fakeSignature}`);
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.verified, false);
  });

  test('3. Certificate Generation: Issued certificate for submitted project has valid signature', async () => {
    const res = await fetch(`${baseUrl}/api/verify/certificate/prj_02`);
    assert.equal(res.status, 200);
    const cert = await res.json();

    assert.equal(cert.project_id, 'prj_02');
    assert.equal(cert.title, 'Small Meadow');
    assert.ok(cert.signature);
    assert.ok(cert.verification_url);
  });

  test('4. Webhooks: Organizer can register and list event webhooks', async () => {
    const registerRes = await fetch(`${baseUrl}/api/webhooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': creds.organizer.replace('Cookie: ', ''),
      },
      body: JSON.stringify({
        event_id: 'evt_01',
        url: 'https://example.org/webhook/receiver',
        event_type: 'project.submitted'
      })
    });

    assert.equal(registerRes.status, 201);
    const registerData = await registerRes.json();
    assert.ok(registerData.webhook.id.startsWith('whk_'));
    assert.ok(registerData.webhook.secret.startsWith('whsec_'));

    // List webhooks
    const listRes = await fetch(`${baseUrl}/api/webhooks?event_id=evt_01`, {
      headers: { 'Cookie': creds.organizer.replace('Cookie: ', '') }
    });
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.ok(listData.webhooks.length >= 1);
  });

  test('5. Webhooks RBAC: Participant is blocked from registering webhooks (HTTP 403)', async () => {
    const res = await fetch(`${baseUrl}/api/webhooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': creds.participant.replace('Cookie: ', ''),
      },
      body: JSON.stringify({
        url: 'https://attacker.org/exfiltrate'
      })
    });

    assert.equal(res.status, 403);
  });

  test('6. Embeddable Gallery Widget returns 200 with responsive markup', async () => {
    const res = await fetch(`${baseUrl}/embed/gallery`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const html = await res.text();
    assert.match(html, /prj_/);
  });
});
