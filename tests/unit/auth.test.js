import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractSessionToken } from '../../src/server/middleware/auth.js';

describe('Auth Middleware - extractSessionToken', () => {
  it('extracts token from parsed cookies', () => {
    const req = { cookies: { session: 'test_token_123' }, headers: {} };
    assert.equal(extractSessionToken(req), 'test_token_123');
  });

  it('extracts token from raw cookie header', () => {
    const req = { headers: { cookie: 'foo=bar; session=raw_token_456; baz=qux' } };
    assert.equal(extractSessionToken(req), 'raw_token_456');
  });

  it('extracts token from Authorization: Bearer header', () => {
    const req = { headers: { authorization: 'Bearer bearer_token_789' } };
    assert.equal(extractSessionToken(req), 'bearer_token_789');
  });

  it('extracts token from Authorization: session= header', () => {
    const req = { headers: { authorization: 'session=auth_token_abc' } };
    assert.equal(extractSessionToken(req), 'auth_token_abc');
  });

  it('extracts token from x-session-token header', () => {
    const req = { headers: { 'x-session-token': 'custom_header_token' } };
    assert.equal(extractSessionToken(req), 'custom_header_token');
  });

  it('returns null when no session token is present', () => {
    const req = { headers: {} };
    assert.equal(extractSessionToken(req), null);
  });
});
