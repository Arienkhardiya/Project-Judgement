import crypto from 'node:crypto';

// Secret key for HMAC signing (uses environment variable or secure fallback)
const SIGNING_SECRET = process.env.SIGNING_SECRET || 'dogfood-2026-hackathon-verifiable-master-key';

/**
 * Creates a deterministic canonical JSON string for hashing
 */
export function canonicalizeJson(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalizeJson).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(k => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Computes a SHA256 digest of canonical data
 */
export function computeDigest(data) {
  const canonical = typeof data === 'string' ? data : canonicalizeJson(data);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Signs a digest using HMAC-SHA256
 */
export function signDigest(digest, secret = SIGNING_SECRET) {
  return crypto.createHmac('sha256', secret).update(digest, 'utf8').digest('hex');
}

/**
 * Verifies a signature against data
 */
export function verifySignature(data, signature, secret = SIGNING_SECRET) {
  const digest = computeDigest(data);
  const expectedSig = signDigest(digest, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Generates and saves a verifiable record in SQLite
 */
export function recordVerifiableEvent(db, { entityType, entityId, payload, signerIdentity = 'dogfood:authority:2026' }) {
  const digest = computeDigest(payload);
  const signature = signDigest(digest);
  const recordId = `vrf_${crypto.randomBytes(8).toString('hex')}`;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO verifiable_records (id, entity_type, entity_id, digest, signature, signer_identity, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    recordId,
    entityType,
    entityId,
    digest,
    signature,
    signerIdentity,
    JSON.stringify(payload)
  );

  return {
    recordId,
    entityType,
    entityId,
    digest,
    signature,
    signerIdentity,
    verified: true,
  };
}

export default {
  canonicalizeJson,
  computeDigest,
  signDigest,
  verifySignature,
  recordVerifiableEvent,
};
