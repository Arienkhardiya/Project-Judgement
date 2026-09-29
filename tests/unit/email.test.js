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

  it('7. Safe Diagnostics: getDiagnostics() never leaks secrets or passwords', () => {
    const email = new EmailService({
      host: 'smtp.gmail.com',
      port: 587,
      user: 'alice@example.com',
      password: 'super-secret-password-1234',
      from: 'noreply@veridict.io',
    });
    const diag = email.getDiagnostics();
    assert.equal(diag.configured, true);
    assert.equal(diag.host, 'smtp.gmail.com');
    assert.equal(diag.port, 587);
    assert.equal(diag.hasUser, true);
    assert.equal(diag.hasPassword, true);
    assert.equal(diag.secure, false);
    // Crucial: check that the raw password string is NOT in the diagnostics
    assert.equal(Object.keys(diag).includes('password'), false);
    assert.equal(JSON.stringify(diag).includes('super-secret-password'), false);
  });

  it('8. Dynamic Config Resolution: Trims surrounding whitespace from env values', () => {
    const email = new EmailService({
      host: '  smtp.sendgrid.net  ',
      port: ' 587 ',
      user: ' apikey ',
      password: ' SG.secret.token ',
      from: ' VERIDICT <team@veridict.io> ',
    });
    const resolved = email._resolveConfig();
    assert.equal(resolved.host, 'smtp.sendgrid.net');
    assert.equal(resolved.port, 587);
    assert.equal(resolved.user, 'apikey');
    assert.equal(resolved.password, 'SG.secret.token');
    assert.equal(resolved.from, 'VERIDICT <team@veridict.io>');
  });

  it('9. Security Mode Selection: Port 465 sets secure=true, Port 587 sets secure=false (STARTTLS)', () => {
    const directTls = new EmailService({ host: 'smtp.gmail.com', port: 465 });
    assert.equal(directTls._resolveConfig().secure, true);

    const startTls = new EmailService({ host: 'smtp.gmail.com', port: 587 });
    assert.equal(startTls._resolveConfig().secure, false);
  });

  it('10. Safe Connection Test: testConnection() fails gracefully when unconfigured without throwing', async () => {
    const email = new EmailService({ host: '' });
    const testResult = await email.testConnection();
    assert.equal(testResult.success, false);
    assert.equal(testResult.reason, 'SMTP_NOT_CONFIGURED');
  });

  it('11. Connection Test Overrides: Supports testing alternative ports and security settings', async () => {
    const email = new EmailService({ host: 'smtp.gmail.com', port: 587 });
    // Overriding unconfigured host
    const offlineEmail = new EmailService({ host: '' });
    const res = await offlineEmail.testConnection({ host: '' });
    assert.equal(res.success, false);
    assert.equal(res.reason, 'SMTP_NOT_CONFIGURED');
  });
});
