import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Active Ed25519 Keypair in memory
let activePrivateKey = null;
let activePublicKey = null;
let activePublicKeyPem = null;
let activePublicKeyHex = null;

// Legacy secret fallback for HMAC-SHA256
const SIGNING_SECRET = process.env.SIGNING_SECRET || 'dogfood-2026-hackathon-verifiable-master-key';

/**
 * Initializes or retrieves the asymmetric Ed25519 keypair.
 * Priority:
 * 1. process.env.VERIFICATION_PRIVATE_KEY
 * 2. .keys/ed25519_private.pem on disk (git-ignored)
 * 3. Ephemeral/runtime generated Ed25519 keypair
 */
export function initializeKeys() {
  if (activePrivateKey && activePublicKey) {
    return {
      privateKey: activePrivateKey,
      publicKey: activePublicKey,
      publicKeyPem: activePublicKeyPem,
      publicKeyHex: activePublicKeyHex,
    };
  }

  // 1. Check environment variable
  if (process.env.VERIFICATION_PRIVATE_KEY) {
    try {
      activePrivateKey = crypto.createPrivateKey(process.env.VERIFICATION_PRIVATE_KEY);
      activePublicKey = crypto.createPublicKey(activePrivateKey);
      activePublicKeyPem = activePublicKey.export({ type: 'spki', format: 'pem' });
      const der = activePublicKey.export({ type: 'spki', format: 'der' });
      activePublicKeyHex = der.subarray(-32).toString('hex');
      return {
        privateKey: activePrivateKey,
        publicKey: activePublicKey,
        publicKeyPem: activePublicKeyPem,
        publicKeyHex: activePublicKeyHex,
      };
    } catch (err) {
      console.warn('Warning: Failed to load VERIFICATION_PRIVATE_KEY from environment:', err.message);
    }
  }

  // 2. Check local key directory (git-ignored)
  const keysDir = path.resolve(process.cwd(), '.keys');
  const keyFile = path.join(keysDir, 'ed25519_private.pem');

  if (fs.existsSync(keyFile)) {
    try {
      const pem = fs.readFileSync(keyFile, 'utf8');
      activePrivateKey = crypto.createPrivateKey(pem);
      activePublicKey = crypto.createPublicKey(activePrivateKey);
      activePublicKeyPem = activePublicKey.export({ type: 'spki', format: 'pem' });
      const der = activePublicKey.export({ type: 'spki', format: 'der' });
      activePublicKeyHex = der.subarray(-32).toString('hex');
      return {
        privateKey: activePrivateKey,
        publicKey: activePublicKey,
        publicKeyPem: activePublicKeyPem,
        publicKeyHex: activePublicKeyHex,
      };
    } catch (err) {
      console.warn('Warning: Failed to load key file from .keys:', err.message);
    }
  }

  // 3. Generate keypair dynamically
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  activePrivateKey = privateKey;
  activePublicKey = publicKey;
  activePublicKeyPem = activePublicKey.export({ type: 'spki', format: 'pem' });
  const der = activePublicKey.export({ type: 'spki', format: 'der' });
  activePublicKeyHex = der.subarray(-32).toString('hex');

  // Attempt persistence to .keys directory if possible (never committed to git)
  try {
    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir, { recursive: true });
    }
    const privPem = activePrivateKey.export({ type: 'pkcs8', format: 'pem' });
    fs.writeFileSync(keyFile, privPem, { mode: 0o600 });
  } catch {
    // Non-fatal if filesystem is read-only
  }

  return {
    privateKey: activePrivateKey,
    publicKey: activePublicKey,
    publicKeyPem: activePublicKeyPem,
    publicKeyHex: activePublicKeyHex,
  };
}

export function setSigningKeypair(privateKey, publicKey = null) {
  activePrivateKey = typeof privateKey === 'string' ? crypto.createPrivateKey(privateKey) : privateKey;
  activePublicKey = publicKey
    ? (typeof publicKey === 'string' ? crypto.createPublicKey(publicKey) : publicKey)
    : crypto.createPublicKey(activePrivateKey);
  activePublicKeyPem = activePublicKey.export({ type: 'spki', format: 'pem' });
  const der = activePublicKey.export({ type: 'spki', format: 'der' });
  activePublicKeyHex = der.subarray(-32).toString('hex');
}

export function getPublicKeyPem() {
  if (!activePublicKeyPem) initializeKeys();
  return activePublicKeyPem;
}

export function getPublicKeyHex() {
  if (!activePublicKeyHex) initializeKeys();
  return activePublicKeyHex;
}

export function getPublicKey() {
  if (!activePublicKey) initializeKeys();
  return activePublicKey;
}

export function getPrivateKey() {
  if (!activePrivateKey) initializeKeys();
  return activePrivateKey;
}

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
 * Signs a digest using Ed25519 private key (or legacy HMAC-SHA256 if secret string is passed)
 */
export function signDigest(digest, optionsOrSecret = null) {
  if (typeof optionsOrSecret === 'string') {
    // Legacy HMAC-SHA256
    return crypto.createHmac('sha256', optionsOrSecret).update(digest, 'utf8').digest('hex');
  }

  const privKey = getPrivateKey();
  const sig = crypto.sign(null, Buffer.from(digest, 'utf8'), privKey);
  return sig.toString('hex');
}

/**
 * Verifies a signature against data using Ed25519 (or legacy HMAC-SHA256)
 */
export function verifySignature(data, signature, keyOrSecret = null) {
  if (!signature || typeof signature !== 'string') return false;
  const digest = computeDigest(data);

  // 1. Ed25519 signature: 64 bytes = 128 hex chars
  if (signature.length === 128) {
    try {
      let pubKey;
      if (keyOrSecret) {
        pubKey = typeof keyOrSecret === 'string' && keyOrSecret.includes('PUBLIC KEY')
          ? crypto.createPublicKey(keyOrSecret)
          : getPublicKey();
      } else {
        pubKey = getPublicKey();
      }

      return crypto.verify(
        null,
        Buffer.from(digest, 'utf8'),
        pubKey,
        Buffer.from(signature, 'hex')
      );
    } catch {
      return false;
    }
  }

  // 2. Legacy HMAC-SHA256 signature: 32 bytes = 64 hex chars
  if (signature.length === 64) {
    try {
      const secret = typeof keyOrSecret === 'string' && !keyOrSecret.includes('PUBLIC KEY')
        ? keyOrSecret
        : SIGNING_SECRET;
      const expectedSig = crypto.createHmac('sha256', secret).update(digest, 'utf8').digest('hex');
      return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'));
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Generates and saves a verifiable record in SQLite using Ed25519 asymmetric cryptography
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
    algorithm: 'Ed25519',
    publicKeyPem: getPublicKeyPem(),
    verified: true,
  };
}

export default {
  initializeKeys,
  setSigningKeypair,
  getPublicKeyPem,
  getPublicKeyHex,
  getPublicKey,
  getPrivateKey,
  canonicalizeJson,
  computeDigest,
  signDigest,
  verifySignature,
  recordVerifiableEvent,
};
