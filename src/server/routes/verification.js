import express from 'express';
import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import {
  verifySignature,
  computeDigest,
  signDigest,
  recordVerifiableEvent,
  getPublicKeyPem,
  getPublicKeyHex,
  canonicalizeJson,
} from '../services/verification.js';

const router = express.Router();

// 1. GET /api/verify/public-key - Retrieve Ed25519 Authority Public Key
router.get('/public-key', (req, res) => {
  res.json({
    algorithm: 'Ed25519',
    format: 'SPKI / RFC 8410',
    public_key_pem: getPublicKeyPem(),
    public_key_hex: getPublicKeyHex(),
    signer_identity: 'dogfood:authority:2026',
    curve: 'Ed25519',
    usage: 'Independent offline and online verification of DOGFOOD 2026 certificates and audit receipts',
  });
});

// 2. GET /api/verify/record/:signature - Verify a cryptographic audit record
router.get('/record/:signature', (req, res) => {
  const db = getDatabase();
  const { signature } = req.params;

  const record = db.prepare(`
    SELECT id, entity_type, entity_id, digest, signature, signer_identity, metadata_json, created_at
    FROM verifiable_records
    WHERE signature = ?
  `).get(signature);

  if (!record) {
    return res.status(404).json({
      verified: false,
      error: 'Record with given cryptographic signature not found',
    });
  }

  const payload = JSON.parse(record.metadata_json);
  const isValid = verifySignature(payload, signature);

  res.json({
    verified: isValid,
    algorithm: signature.length === 128 ? 'Ed25519' : 'HMAC-SHA256',
    record_id: record.id,
    entity_type: record.entity_type,
    entity_id: record.entity_id,
    digest: record.digest,
    signature: record.signature,
    public_key: getPublicKeyPem(),
    signer_identity: record.signer_identity,
    created_at: record.created_at,
    metadata: payload,
  });
});

// 3. POST /api/verify - Independent verification endpoint for records or arbitrary payloads
router.post('/', (req, res) => {
  const { record_id, signature, payload, public_key } = req.body || {};
  const db = getDatabase();

  // Mode A: Verify by record_id
  if (record_id) {
    const record = db.prepare(`
      SELECT id, entity_type, entity_id, digest, signature, signer_identity, metadata_json, created_at
      FROM verifiable_records
      WHERE id = ?
    `).get(record_id);

    if (!record) {
      return res.status(404).json({ verified: false, error: 'Record not found' });
    }

    const parsedPayload = JSON.parse(record.metadata_json);
    const isValid = verifySignature(parsedPayload, record.signature);

    return res.json({
      verified: isValid,
      algorithm: record.signature.length === 128 ? 'Ed25519' : 'HMAC-SHA256',
      record_id: record.id,
      entity_type: record.entity_type,
      entity_id: record.entity_id,
      digest: record.digest,
      signature: record.signature,
      public_key: getPublicKeyPem(),
      signer_identity: record.signer_identity,
      metadata: parsedPayload,
    });
  }

  // Mode B: Verify arbitrary payload + signature (+ optional custom public_key)
  if (payload && signature) {
    const isValid = verifySignature(payload, signature, public_key);
    const digest = computeDigest(payload);
    return res.json({
      verified: isValid,
      algorithm: signature.length === 128 ? 'Ed25519' : 'HMAC-SHA256',
      digest,
      signature,
      checked_at: new Date().toISOString(),
    });
  }

  // Mode C: Verify by signature only
  if (signature) {
    const record = db.prepare(`
      SELECT id, entity_type, entity_id, digest, signature, signer_identity, metadata_json, created_at
      FROM verifiable_records
      WHERE signature = ?
    `).get(signature);

    if (!record) {
      return res.status(404).json({ verified: false, error: 'Signature not found in verifiable records' });
    }

    const parsedPayload = JSON.parse(record.metadata_json);
    const isValid = verifySignature(parsedPayload, signature);

    return res.json({
      verified: isValid,
      algorithm: signature.length === 128 ? 'Ed25519' : 'HMAC-SHA256',
      record_id: record.id,
      entity_type: record.entity_type,
      entity_id: record.entity_id,
      digest: record.digest,
      signature: record.signature,
      metadata: parsedPayload,
    });
  }

  return res.status(400).json({
    error: 'Invalid request: provide either record_id, or { payload, signature }',
  });
});

// 4. GET /api/verify/certificate/:projectId - Generate/retrieve verifiable project certificate
router.get('/certificate/:projectId', (req, res) => {
  const db = getDatabase();
  const { projectId } = req.params;

  const project = db.prepare(`
    SELECT p.id, p.title, p.status, p.submitted_at, t.name as team_name, e.name as event_name, tr.name as track_name
    FROM projects p
    JOIN teams t ON t.id = p.team_id
    JOIN events e ON e.id = t.event_id
    LEFT JOIN tracks tr ON tr.id = p.track_id
    WHERE p.id = ?
  `).get(projectId);

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (project.status !== 'SUBMITTED') {
    return res.status(400).json({ error: 'Certificates are only issued for SUBMITTED projects' });
  }

  // Look for existing certificate record
  let cert = db.prepare(`
    SELECT id, digest, signature, signer_identity, created_at, metadata_json
    FROM verifiable_records
    WHERE entity_type = 'certificate' AND entity_id = ?
  `).get(projectId);

  if (!cert) {
    // Generate new verifiable certificate record
    const certPayload = {
      project_id: project.id,
      title: project.title,
      team_name: project.team_name,
      track_name: project.track_name || 'General',
      event_name: project.event_name,
      submitted_at: project.submitted_at,
      issued_at: new Date().toISOString(),
    };

    const recorded = recordVerifiableEvent(db, {
      entityType: 'certificate',
      entityId: project.id,
      payload: certPayload,
      signerIdentity: 'dogfood:cert_authority:2026',
    });

    cert = {
      id: recorded.recordId,
      digest: recorded.digest,
      signature: recorded.signature,
      signer_identity: recorded.signerIdentity,
      created_at: new Date().toISOString(),
      metadata_json: JSON.stringify(certPayload),
    };
  }

  res.json({
    certificate_id: cert.id,
    project_id: project.id,
    title: project.title,
    team_name: project.team_name,
    track_name: project.track_name || 'General',
    event_name: project.event_name,
    algorithm: cert.signature.length === 128 ? 'Ed25519' : 'HMAC-SHA256',
    signature: cert.signature,
    digest: cert.digest,
    public_key: getPublicKeyPem(),
    signer: cert.signer_identity,
    issued_at: cert.created_at,
    verification_url: `/api/verify/record/${cert.signature}`,
  });
});

export default router;
