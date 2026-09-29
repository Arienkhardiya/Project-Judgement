import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EmailService } from '../../src/server/services/email.js';

describe('VERIDICT — Email Service & SMTP Abstraction Unit Tests', () => {
  it('1. Offline / Default State: isConfigured() is false when SMTP_HOST is unset', () => {
    const email = new EmailService({ host: '' });
    assert.equal(email.isConfigured(), false);
    const cfg = email.getConfig();
    assert.equal(cfg.configured, false);
  });

  it('2. Graceful Offline Fallback: sendMail fails truthfully with SMTP_NOT_CONFIGURED', async () => {
    const email = new EmailService({ host: '' });
    const result = await email.sendMail({
      to: 'tester@example.com',
      subject: 'Test Subject',
      text: 'Test Body',
    });
    assert.equal(result.success, false);
    assert.equal(result.reason, 'SMTP_NOT_CONFIGURED');
    assert.ok(result.error.includes('SMTP_HOST is empty'));
  });

  it('3. Verification Email Template: Generates valid VERIDICT verification links and HTML', async () => {
    const email = new EmailService({ host: '' });
    const result = await email.sendVerificationEmail({
      email: 'hacker@veridict.io',
      name: 'Priya',
      token: 'vfy_test_123456',
      baseUrl: 'http://localhost:8080',
    });
    assert.equal(result.success, false); // offline fallback
    assert.equal(result.verifyUrl, 'http://localhost:8080/verify-email?token=vfy_test_123456');
    assert.equal(result.token, 'vfy_test_123456');
  });

  it('4. Password Reset Template: Generates valid password reset URL', async () => {
    const email = new EmailService({ host: '' });
    const result = await email.sendPasswordResetEmail({
      email: 'organizer@veridict.io',
      name: 'Organizer',
      token: 'rst_test_987654',
      baseUrl: 'http://localhost:8080',
    });
    assert.equal(result.success, false);
    assert.equal(result.resetUrl, 'http://localhost:8080/reset-password?token=rst_test_987654');
  });

  it('5. Judge Invitation Template: Generates official VERIDICT judge invitation link', async () => {
    const email = new EmailService({ host: '' });
    const result = await email.sendJudgeInvitationEmail({
      email: 'judge@veridict.io',
      name: 'Dr. Sarah Connor',
      eventName: 'Build Bharat 2026',
      token: 'tok_judge_abcdef',
      baseUrl: 'http://localhost:8080',
    });
    assert.equal(result.success, false);
    assert.equal(result.inviteUrl, 'http://localhost:8080/invite/judge/tok_judge_abcdef');
  });

  it('6. Team Invitation Template: Generates valid team invitation code', async () => {
    const email = new EmailService({ host: '' });
    const result = await email.sendTeamInvitationEmail({
      email: 'teammate@veridict.io',
      teamName: 'CyberKnights',
      eventName: 'Build Bharat 2026',
      inviteCode: 'inv_tm_99',
      baseUrl: 'http://localhost:8080',
    });
    assert.equal(result.success, false);
    assert.equal(result.joinUrl, 'http://localhost:8080/teams/join?code=inv_tm_99');
  });
});
