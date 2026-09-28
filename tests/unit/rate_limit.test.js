import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { isRateLimited, _resetVotingRateLimits, getRateLimitWindowMs } from '../../src/server/routes/voting.js';
import { isCommentSpam, _resetCommentRateLimits, getCommentCooldownMs } from '../../src/server/routes/comments.js';

describe('T3 Rate Limiting & Abuse Prevention Tests', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalVotingWindow = process.env.RATE_LIMIT_WINDOW_MS;
  const originalCommentCooldown = process.env.COMMENT_COOLDOWN_MS;

  beforeEach(() => {
    _resetVotingRateLimits();
    _resetCommentRateLimits();
    delete process.env.RATE_LIMIT_WINDOW_MS;
    delete process.env.COMMENT_COOLDOWN_MS;
  });

  after(() => {
    _resetVotingRateLimits();
    _resetCommentRateLimits();
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    if (originalVotingWindow !== undefined) {
      process.env.RATE_LIMIT_WINDOW_MS = originalVotingWindow;
    } else {
      delete process.env.RATE_LIMIT_WINDOW_MS;
    }
    if (originalCommentCooldown !== undefined) {
      process.env.COMMENT_COOLDOWN_MS = originalCommentCooldown;
    } else {
      delete process.env.COMMENT_COOLDOWN_MS;
    }
  });

  it('1. Production default: Voting rate limit window defaults to 2000ms when not in test mode', () => {
    delete process.env.NODE_ENV;
    assert.equal(getRateLimitWindowMs(), 2000);

    process.env.NODE_ENV = 'production';
    assert.equal(getRateLimitWindowMs(), 2000);
  });

  it('2. Production default: Comment cooldown defaults to 3000ms when not in test mode', () => {
    delete process.env.NODE_ENV;
    assert.equal(getCommentCooldownMs(), 3000);

    process.env.NODE_ENV = 'production';
    assert.equal(getCommentCooldownMs(), 3000);
  });

  it('3. Production behavior: Rapid duplicate vote attempts within window are rate limited', () => {
    process.env.NODE_ENV = 'production';
    const voterId = 'usr_voter_01';

    // First attempt succeeds
    assert.equal(isRateLimited(voterId), false);

    // Immediate second attempt within 2000ms must be rate limited
    assert.equal(isRateLimited(voterId), true);

    // Different user is NOT blocked (user-scoped rate limiting)
    assert.equal(isRateLimited('usr_voter_02'), false);
  });

  it('4. Production behavior: Rapid comment submissions within cooldown are flagged as spam', () => {
    process.env.NODE_ENV = 'production';
    const commenterId = 'usr_commenter_01';

    // First comment succeeds
    assert.equal(isCommentSpam(commenterId), false);

    // Immediate second comment within 3000ms is blocked
    assert.equal(isCommentSpam(commenterId), true);

    // Different commenter is NOT blocked
    assert.equal(isCommentSpam('usr_commenter_02'), false);
  });

  it('5. Test mode: Cooldown is 0ms in test environment, allowing rapid test assertions', () => {
    process.env.NODE_ENV = 'test';
    assert.equal(getRateLimitWindowMs(), 0);
    assert.equal(getCommentCooldownMs(), 0);

    // Immediate successive votes do not trip rate limiting in test mode
    assert.equal(isRateLimited('usr_test_voter'), false);
    assert.equal(isRateLimited('usr_test_voter'), false);
    assert.equal(isRateLimited('usr_test_voter'), false);

    // Immediate successive comments do not trip rate limiting in test mode
    assert.equal(isCommentSpam('usr_test_commenter'), false);
    assert.equal(isCommentSpam('usr_test_commenter'), false);
  });

  it('6. Test isolation: Explicit reset clears in-memory state cleanly between tests', () => {
    process.env.NODE_ENV = 'production';
    const voterId = 'usr_isolate_01';

    assert.equal(isRateLimited(voterId), false);
    assert.equal(isRateLimited(voterId), true);

    // Reset rate limits
    _resetVotingRateLimits();

    // After reset, previous rate limit state is gone
    assert.equal(isRateLimited(voterId), false);
  });

  it('7. Configurable override: Environment variables can explicitly tune windows', () => {
    process.env.RATE_LIMIT_WINDOW_MS = '500';
    process.env.COMMENT_COOLDOWN_MS = '750';

    assert.equal(getRateLimitWindowMs(), 500);
    assert.equal(getCommentCooldownMs(), 750);
  });
});
