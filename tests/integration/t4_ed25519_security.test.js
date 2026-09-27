import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from '../../src/server/app.js';
import { getDatabase, closeDatabase } from '../../src/server/db/database.js';
import { seedDatabase } from '../../src/server/db/seed.js';
import { canonicalizeJson } from '../../src/server/services/verification.js';

describe('T4 Cryptographic Verification & Hardened Security Integration Tests', () => {
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

  test('1. Public Key Distribution: GET /api/verify/public-key returns valid Ed25519 SPKI key', async () => {
    const res = await fetch(`${baseUrl}/api/verify/public-key`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.algorithm, 'Ed25519');
    assert.ok(data.public_key_pem.includes('-----BEGIN PUBLIC KEY-----'));
    assert.ok(data.public_key_pem.includes('-----END PUBLIC KEY-----'));
    assert.equal(data.public_key_hex.length, 64); // 32 bytes in hex

    // Verify the PEM is parseable by node:crypto
    const pubKey = crypto.createPublicKey(data.public_key_pem);
    assert.equal(pubKey.asymmetricKeyType, 'ed25519');
  });

  test('2. Genuine Offline Asymmetric Verification: External party can independently verify certificate', async () => {
    // 1. Fetch certificate from platform
    const certRes = await fetch(`${baseUrl}/api/verify/certificate/prj_01`);
    assert.equal(certRes.status, 200);
    const cert = await certRes.json();

    assert.equal(cert.algorithm, 'Ed25519');
    assert.equal(cert.signature.length, 128); // 64 bytes in hex
    assert.ok(cert.digest);
    assert.ok(cert.public_key);

    // 2. Fetch record to get full metadata payload
    const recordRes = await fetch(`${baseUrl}/api/verify/record/${cert.signature}`);
    assert.equal(recordRes.status, 200);
    const record = await recordRes.json();
    assert.equal(record.verified, true);

    // 3. OFFLINE VERIFICATION (Zero server calls):
    // Reconstruct canonical digest from metadata
    const offlineCanonical = canonicalizeJson(record.metadata);
    const offlineDigest = crypto.createHash('sha256').update(offlineCanonical, 'utf8').digest('hex');
    assert.equal(offlineDigest, cert.digest, 'Computed offline digest must match certificate digest');

    // Verify Ed25519 signature using standard crypto API and published public key
    const externalPubKey = crypto.createPublicKey(cert.public_key);
    const isSignatureValid = crypto.verify(
      null,
      Buffer.from(offlineDigest, 'utf8'),
      externalPubKey,
      Buffer.from(cert.signature, 'hex')
    );
    assert.equal(isSignatureValid, true, 'Ed25519 signature must verify offline with public key');
  });

  test('3. Tamper Resistance: Payload alteration fails verification both offline and online', async () => {
    const certRes = await fetch(`${baseUrl}/api/verify/certificate/prj_01`);
    const cert = await certRes.json();

    // Adversary modifies project title in payload
    const tamperedPayload = {
      project_id: 'prj_01',
      title: 'TAMPERED TITLE: Hacked Project',
      team: 'tm_01',
      event: 'evt_01',
      verified_at: '2026-03-01T20:00:00Z',
    };

    // Offline test with modified payload
    const tamperedDigest = crypto.createHash('sha256').update(canonicalizeJson(tamperedPayload), 'utf8').digest('hex');
    const pubKey = crypto.createPublicKey(cert.public_key);
    const isTamperedValid = crypto.verify(
      null,
      Buffer.from(tamperedDigest, 'utf8'),
      pubKey,
      Buffer.from(cert.signature, 'hex')
    );
    assert.equal(isTamperedValid, false, 'Tampered payload signature verification must fail');

    // Online verification endpoint POST /api/verify
    const verifyRes = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: tamperedPayload,
        signature: cert.signature,
      }),
    });

    assert.equal(verifyRes.status, 200);
    const verifyData = await verifyRes.json();
    assert.equal(verifyData.verified, false, 'Server must report verified: false for tampered payload');
  });

  test('4. Independent Verification Endpoint: POST /api/verify with record_id', async () => {
    const certRes = await fetch(`${baseUrl}/api/verify/certificate/prj_01`);
    const cert = await certRes.json();

    const verifyRes = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        record_id: cert.certificate_id,
      }),
    });

    assert.equal(verifyRes.status, 200);
    const data = await verifyRes.json();
    assert.equal(data.verified, true);
    assert.equal(data.algorithm, 'Ed25519');
    assert.equal(data.record_id, cert.certificate_id);
    assert.equal(data.entity_id, 'prj_01');
  });

  test('5. Rogue Keypair Attack: Signatures created with unauthorized keys are rejected', async () => {
    // Attacker generates their own rogue Ed25519 keypair
    const attackerKeypair = crypto.generateKeyPairSync('ed25519');
    const attackerPayload = { project_id: 'prj_fake', award: 'Winner' };
    const attackerDigest = crypto.createHash('sha256').update(canonicalizeJson(attackerPayload), 'utf8').digest('hex');
    const attackerSig = crypto.sign(null, Buffer.from(attackerDigest, 'utf8'), attackerKeypair.privateKey).toString('hex');

    // Query platform verification with official authority key
    const res = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: attackerPayload,
        signature: attackerSig,
      }),
    });

    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.verified, false, 'Rogue key signature must be rejected by platform authority');
  });

  test('6. Webhook Deliveries: Test ping execution and delivery audit log', async () => {
    // 1. Register a webhook as organizer
    const regRes = await fetch(`${baseUrl}/api/webhooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': creds.organizer.replace('Cookie: ', ''),
      },
      body: JSON.stringify({
        event_id: 'evt_01',
        url: 'https://httpbin.org/post',
        event_type: 'webhook.test',
      }),
    });
    assert.equal(regRes.status, 201);
    const regData = await regRes.json();
    const webhookId = regData.webhook.id;

    // 2. Trigger immediate test delivery
    const testRes = await fetch(`${baseUrl}/api/webhooks/${webhookId}/test`, {
      method: 'POST',
      headers: {
        'Cookie': creds.organizer.replace('Cookie: ', ''),
      },
    });
    assert.equal(testRes.status, 200);
    const testData = await testRes.json();
    assert.equal(testData.message, 'Webhook test executed');
    assert.ok(testData.delivery.deliveryId);

    // 3. Query delivery history
    const historyRes = await fetch(`${baseUrl}/api/webhooks/deliveries?webhook_id=${webhookId}`, {
      headers: {
        'Cookie': creds.organizer.replace('Cookie: ', ''),
      },
    });
    assert.equal(historyRes.status, 200);
    const historyData = await historyRes.json();
    assert.ok(historyData.deliveries.length >= 1);
    assert.equal(historyData.deliveries[0].webhook_id, webhookId);

    // 4. Clean up webhook
    await fetch(`${baseUrl}/api/webhooks/${webhookId}`, {
      method: 'DELETE',
      headers: { 'Cookie': creds.organizer.replace('Cookie: ', '') },
    });
  });

  test('7. Webhook Delivery RBAC: Participants cannot view deliveries or trigger tests', async () => {
    const listRes = await fetch(`${baseUrl}/api/webhooks/deliveries`, {
      headers: { 'Cookie': creds.participant.replace('Cookie: ', '') },
    });
    assert.equal(listRes.status, 403);

    const testRes = await fetch(`${baseUrl}/api/webhooks/whk_fake/test`, {
      method: 'POST',
      headers: { 'Cookie': creds.participant.replace('Cookie: ', '') },
    });
    assert.equal(testRes.status, 403);
  });
});
