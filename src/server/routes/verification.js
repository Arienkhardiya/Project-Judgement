import express from 'express';
import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { verifySignature, computeDigest, signDigest, recordVerifiableEvent } from '../services/verification.js';

const router = express.Router();

// 1. GET /api/verify/record/:signature - Verify a cryptographic audit record
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
      error: 'Record with given cryptographic signature not found'
    });
  }

  const payload = JSON.parse(record.metadata_json);
  const isValid = verifySignature(payload, signature);

  res.json({
    verified: isValid,
    record_id: record.id,
    entity_type: record.entity_type,
    entity_id: record.entity_id,
    digest: record.digest,
    signature: record.signature,
    signer_identity: record.signer_identity,
    created_at: record.created_at,
    metadata: payload
  });
});

// 2. GET /api/verify/certificate/:projectId - Generate/retrieve verifiable project certificate
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
      track_name: project.track_name,
      event_name: project.event_name,
      submitted_at: project.submitted_at,
      issued_at: new Date().toISOString()
    };

    const recorded = recordVerifiableEvent(db, {
      entityType: 'certificate',
      entityId: project.id,
      payload: certPayload,
      signerIdentity: 'dogfood:cert_authority:2026'
    });

    cert = {
      id: recorded.recordId,
      digest: recorded.digest,
      signature: recorded.signature,
      signer_identity: recorded.signerIdentity,
      created_at: new Date().toISOString(),
      metadata_json: JSON.stringify(certPayload)
    };
  }

  res.json({
    certificate_id: cert.id,
    project_id: project.id,
    title: project.title,
    team_name: project.team_name,
    track_name: project.track_name,
    event_name: project.event_name,
    signature: cert.signature,
    digest: cert.digest,
    signer: cert.signer_identity,
    issued_at: cert.created_at,
    verification_url: `/api/verify/record/${cert.signature}`
  });
});

export default router;
