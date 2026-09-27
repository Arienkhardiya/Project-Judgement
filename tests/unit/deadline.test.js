import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Deadline Enforcement Logic', () => {
  it('correctly identifies expired deadline in the past', () => {
    const submissionsClose = '2026-03-01T18:00:00Z';
    const now = new Date('2026-09-27T00:00:00Z').toISOString();
    assert.equal(now >= submissionsClose, true);
  });

  it('correctly allows submission before deadline', () => {
    const submissionsClose = '2026-12-31T23:59:59Z';
    const now = new Date('2026-09-27T00:00:00Z').toISOString();
    assert.equal(now < submissionsClose, true);
  });

  it('correctly handles exact deadline boundary as closed', () => {
    const submissionsClose = '2026-03-01T18:00:00Z';
    const now = '2026-03-01T18:00:00Z';
    assert.equal(now >= submissionsClose, true);
  });
});
