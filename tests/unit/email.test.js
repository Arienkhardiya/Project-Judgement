import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EmailService } from '../../src/server/services/email.js';

describe('VERIDICT — Transactional Email Service (Resend HTTPS & Offline Abstraction)', () => {
  it('1. Offline / Default State: isConfigured() is false when RESEND_API_KEY is unset', () => {
    const email = new EmailService({ apiKey: '', host: '' });
    assert.equal(email.isConfigured(), false);
    assert.equal(email.getProvider(), 'offline');
    const cfg = email.getConfig();
    assert.equal(cfg.configured, false);
    assert.equal(cfg.hasApiKey, false);
  });

  it('2. Graceful Offline Fallback: sendMail fails truthfully with EMAIL_NOT_CONFIGURED', async () => {
    const email = new EmailService({ apiKey: '', host: '' });
    const result = await email.sendMail({
      to: 'tester@example.com',
      subject: 'Test Subject',
      text: 'Test Body',
    });
    assert.equal(result.success, false);
    assert.equal(result.reason, 'EMAIL_NOT_CONFIGURED');
    assert.ok(result.error.includes('RESEND_API_KEY is unset'));
  });

  it('3. Verification Email Template: Generates valid VERIDICT verification links and HTML in offline mode', async () => {
    const email = new EmailService({ apiKey: '', host: '' });
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

  it('4. Password Reset Template: Generates valid password reset URL in offline mode', async () => {
    const email = new EmailService({ apiKey: '', host: '' });
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
    const email = new EmailService({ apiKey: '', host: '' });
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
    const email = new EmailService({ apiKey: '', host: '' });
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

  it('7. Safe Diagnostics: getDiagnostics() never leaks secrets or raw API keys', () => {
    const email = new EmailService({
      apiKey: 're_secret_resend_api_token_1234567890',
      from: 'VERIDICT <alerts@veridict.io>',
    });
    const diag = email.getDiagnostics();
    assert.equal(diag.configured, true);
    assert.equal(diag.provider, 'resend');
    assert.equal(diag.hasApiKey, true);
    assert.equal(diag.apiKeyPrefix, 're_secr...');
    assert.equal(diag.from, 'VERIDICT <alerts@veridict.io>');
    // Crucial: check that full API key is never exposed
    assert.equal(Object.keys(diag).includes('apiKey'), false);
    assert.equal(JSON.stringify(diag).includes('re_secret_resend_api_token'), false);
  });

  it('8. Dynamic Config Resolution: Trims surrounding whitespace from env values', () => {
    const email = new EmailService({
      apiKey: '  re_test_token_123  ',
      from: '  VERIDICT <onboarding@resend.dev>  ',
    });
    const resolved = email._resolveConfig();
    assert.equal(resolved.provider, 'resend');
    assert.equal(resolved.apiKey, 're_test_token_123');
    assert.equal(resolved.from, 'VERIDICT <onboarding@resend.dev>');
  });

  it('9. Resend HTTPS API Mock: Successful email delivery returns provider message ID', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = null;
    let capturedOptions = null;

    globalThis.fetch = async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ id: 'res_test_msg_998877' }),
      };
    };

    try {
      const email = new EmailService({ apiKey: 're_mock_key_123', from: 'VERIDICT <test@example.com>' });
      const result = await email.sendMail({
        to: 'judge@veridict.io',
        subject: 'Welcome Judge',
        text: 'Hello Judge',
      });

      assert.equal(result.success, true);
      assert.equal(result.provider, 'resend');
      assert.equal(result.messageId, 'res_test_msg_998877');
      assert.equal(capturedUrl, 'https://api.resend.com/emails');
      assert.equal(capturedOptions.method, 'POST');
      assert.equal(capturedOptions.headers['Authorization'], 'Bearer re_mock_key_123');

      const payload = JSON.parse(capturedOptions.body);
      assert.deepEqual(payload.to, ['judge@veridict.io']);
      assert.equal(payload.subject, 'Welcome Judge');
      assert.equal(payload.from, 'VERIDICT <test@example.com>');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('10. Resend HTTPS API Mock: HTTP 422 validation failure reports truthful error reason', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => ({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({
        statusCode: 422,
        name: 'validation_error',
        message: 'The from domain is not verified in Resend.',
      }),
    });

    try {
      const email = new EmailService({ apiKey: 're_mock_key_123' });
      const result = await email.sendMail({
        to: 'user@example.com',
        subject: 'Hello',
        text: 'World',
      });

      assert.equal(result.success, false);
      assert.equal(result.provider, 'resend');
      assert.equal(result.reason, 'RESEND_API_ERROR');
      assert.equal(result.statusCode, 422);
      assert.ok(result.error.includes('from domain is not verified'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('11. Resend HTTPS API Mock: Network timeout handled cleanly without crashing', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    };

    try {
      const email = new EmailService({ apiKey: 're_mock_key_123' });
      const result = await email.sendMail({
        to: 'user@example.com',
        subject: 'Hello',
        text: 'World',
      });

      assert.equal(result.success, false);
      assert.equal(result.provider, 'resend');
      assert.equal(result.reason, 'RESEND_TIMEOUT');
      assert.ok(result.error.includes('timed out'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('12. Resend Connection Test Mock: testConnection() verifies API key against /api-keys endpoint', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://api.resend.com/api-keys');
      assert.equal(options.headers['Authorization'], 'Bearer re_valid_key_456');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ data: [{ id: 'key_1' }] }),
      };
    };

    try {
      const email = new EmailService({ apiKey: 're_valid_key_456' });
      const testResult = await email.testConnection();
      assert.equal(testResult.success, true);
      assert.ok(testResult.message.includes('verified successfully'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('13. Templated Verification Email: Invokes Resend HTTPS API and preserves verifyUrl', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 'res_verify_msg_001' }),
    });

    try {
      const email = new EmailService({ apiKey: 're_valid_key_456' });
      const result = await email.sendVerificationEmail({
        email: 'organizer@veridict.io',
        name: 'Lead Organizer',
        token: 'vfy_resend_test_123',
        baseUrl: 'https://verdict-production-5a56.up.railway.app',
      });

      assert.equal(result.success, true);
      assert.equal(result.provider, 'resend');
      assert.equal(result.messageId, 'res_verify_msg_001');
      assert.equal(result.verifyUrl, 'https://verdict-production-5a56.up.railway.app/verify-email?token=vfy_resend_test_123');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('14. SMTP Dev Fallback: When RESEND_API_KEY is empty, falls back to SMTP if SMTP_HOST is set', () => {
    const email = new EmailService({
      apiKey: '',
      host: 'smtp.gmail.com',
      port: 587,
      user: 'dev@example.com',
      password: 'dev-password',
    });
    assert.equal(email.isConfigured(), true);
    assert.equal(email.getProvider(), 'smtp');
    const diag = email.getDiagnostics();
    assert.equal(diag.provider, 'smtp');
    assert.equal(diag.host, 'smtp.gmail.com');
  });

  it('15. Safe Connection Test: testConnection() fails gracefully when unconfigured', async () => {
    const email = new EmailService({ apiKey: '', host: '' });
    const testResult = await email.testConnection();
    assert.equal(testResult.success, false);
    assert.equal(testResult.reason, 'EMAIL_NOT_CONFIGURED');
  });
});
