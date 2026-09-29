import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';

/**
 * Robustly unpacks error strings, codes, and AggregateError arrays from Node.js sockets.
 */
function extractErrorMessage(err) {
  if (!err) return 'Unknown error';
  if (Array.isArray(err.errors) && err.errors.length > 0) {
    const messages = err.errors.map(e => e?.message || e?.code || String(e)).filter(Boolean);
    if (messages.length > 0) return messages.join('; ');
  }
  return err.message || err.code || String(err) || 'Unknown error';
}

/**
 * VERIDICT Transactional Email Service Layer
 * 
 * Primary Production Transport: Resend HTTPS API (Port 443)
 * - RESEND_API_KEY (e.g. re_123456789)
 * - EMAIL_FROM (default: VERIDICT <onboarding@resend.dev>)
 *
 * Development / Fallback Transport: Native RFC 5321 / RFC 3207 SMTP
 * - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_SECURE
 *
 * Truthful Offline Fallback:
 * - If neither RESEND_API_KEY nor SMTP_HOST is set, returns truthful offline status
 *   and provides deterministic single-use verification links directly to users.
 */
export class EmailService {
  constructor(config = {}) {
    this.userConfig = config;
  }

  _resolveConfig() {
    // 1. Resend HTTPS API Configuration
    const apiKey = (
      this.userConfig.apiKey ??
      this.userConfig.resendApiKey ??
      process.env.RESEND_API_KEY ??
      ''
    ).trim();

    // 2. Sender Address
    const from = (
      this.userConfig.from ??
      process.env.EMAIL_FROM ??
      process.env.RESEND_FROM ??
      process.env.SMTP_FROM ??
      'VERIDICT <onboarding@resend.dev>'
    ).trim();

    // 3. Optional SMTP Fallback Configuration
    const host = (this.userConfig.host ?? process.env.SMTP_HOST ?? '').trim();
    const rawPort = this.userConfig.port ?? process.env.SMTP_PORT;
    const explicitSecure = this.userConfig.secure !== undefined
      ? Boolean(this.userConfig.secure)
      : (process.env.SMTP_SECURE === 'true');

    let port = Number(rawPort);
    if (!port || isNaN(port)) {
      port = explicitSecure ? 465 : 587;
    }
    const secure = explicitSecure || port === 465;

    const user = (this.userConfig.user ?? process.env.SMTP_USER ?? '').trim();
    const password = (this.userConfig.password ?? process.env.SMTP_PASSWORD ?? '').trim();
    const timeout = Number(this.userConfig.timeout ?? process.env.EMAIL_TIMEOUT ?? process.env.SMTP_TIMEOUT) || 8000;

    let provider = 'offline';
    if (apiKey.length > 0) {
      provider = 'resend';
    } else if (host.length > 0) {
      provider = 'smtp';
    }

    return { provider, apiKey, from, host, port, secure, user, password, timeout };
  }

  isConfigured() {
    const { provider } = this._resolveConfig();
    return provider !== 'offline';
  }

  getProvider() {
    return this._resolveConfig().provider;
  }

  getConfig() {
    const cfg = this._resolveConfig();
    return {
      provider: cfg.provider,
      configured: cfg.provider !== 'offline',
      from: cfg.from,
      hasApiKey: Boolean(cfg.apiKey && cfg.apiKey.length > 0),
      apiKey: cfg.apiKey ? '***' : '',
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      useStartTls: cfg.host ? (!cfg.secure && (cfg.port === 587 || cfg.port === 25)) : false,
      user: cfg.user ? '***' : '',
    };
  }

  getDiagnostics() {
    const cfg = this._resolveConfig();
    return {
      configured: cfg.provider !== 'offline',
      provider: cfg.provider,
      from: cfg.from,
      hasApiKey: Boolean(cfg.apiKey && cfg.apiKey.length > 0),
      apiKeyPrefix: cfg.apiKey ? (cfg.apiKey.substring(0, Math.min(cfg.apiKey.length, 7)) + '...') : null,
      host: cfg.host || null,
      port: cfg.host ? cfg.port : null,
      secure: cfg.host ? cfg.secure : null,
      useStartTls: cfg.host ? (!cfg.secure && (cfg.port === 587 || cfg.port === 25)) : false,
      hasUser: Boolean(cfg.user && cfg.user.length > 0),
      hasPassword: Boolean(cfg.password && cfg.password.length > 0),
    };
  }

  async sendMail({ to, subject, html, text }) {
    if (!this.isConfigured()) {
      return {
        success: false,
        reason: 'EMAIL_NOT_CONFIGURED',
        error: 'Email delivery is not configured in environment variables (RESEND_API_KEY is unset).',
      };
    }

    const cfg = this._resolveConfig();
    if (cfg.provider === 'resend') {
      return this._sendViaResend({ to, subject, html, text });
    }

    if (cfg.provider === 'smtp') {
      return this._sendViaSmtp({ to, subject, html, text });
    }

    return {
      success: false,
      reason: 'EMAIL_NOT_CONFIGURED',
      error: 'No active email provider available.',
    };
  }

  async testConnection(overrideConfig = {}) {
    if (!this.isConfigured() && !overrideConfig.apiKey && !overrideConfig.host) {
      return {
        success: false,
        reason: 'EMAIL_NOT_CONFIGURED',
        error: 'Email service is not configured (RESEND_API_KEY is not set).',
      };
    }

    const baseCfg = this._resolveConfig();
    const cfg = { ...baseCfg, ...overrideConfig };

    if (cfg.provider === 'resend' || overrideConfig.apiKey) {
      return this._testResendConnection(cfg);
    }

    if (cfg.provider === 'smtp' || overrideConfig.host) {
      return this._testSmtpConnection(cfg);
    }

    return {
      success: false,
      reason: 'EMAIL_NOT_CONFIGURED',
      error: 'No active email provider configured.',
    };
  }

  /**
   * Resend HTTPS API transport over port 443
   */
  async _sendViaResend({ to, subject, html, text }) {
    const { apiKey, from, timeout } = this._resolveConfig();
    const toArray = Array.isArray(to) ? to : [to];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'VERIDICT/1.0',
        },
        body: JSON.stringify({
          from,
          to: toArray,
          subject,
          html: html || undefined,
          text: text || undefined,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (res.ok && data?.id) {
        return {
          success: true,
          messageId: data.id,
          provider: 'resend',
        };
      }

      const errMsg = data?.message || data?.error?.message || `Resend API returned HTTP ${res.status}: ${res.statusText}`;
      return {
        success: false,
        reason: 'RESEND_API_ERROR',
        error: errMsg,
        statusCode: res.status,
        provider: 'resend',
      };
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err.name === 'AbortError';
      return {
        success: false,
        reason: isTimeout ? 'RESEND_TIMEOUT' : 'RESEND_NETWORK_ERROR',
        error: isTimeout ? 'Resend API request timed out.' : (err.message || 'Network request failed'),
        provider: 'resend',
      };
    }
  }

  /**
   * Test Resend HTTPS API connection and API key validity
   */
  async _testResendConnection(cfg) {
    const { apiKey, timeout } = cfg;
    if (!apiKey) {
      return { success: false, reason: 'RESEND_MISSING_API_KEY', error: 'RESEND_API_KEY is missing' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch('https://api.resend.com/api-keys', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'User-Agent': 'VERIDICT/1.0',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        return { success: true, message: 'Resend HTTPS API connection and API key verified successfully!' };
      }

      let data = null;
      try { data = await res.json(); } catch {}
      const errMsg = data?.message || `Resend API returned HTTP ${res.status}: ${res.statusText}`;
      return { success: false, reason: 'RESEND_AUTH_FAILED', error: errMsg };
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err.name === 'AbortError';
      return {
        success: false,
        reason: isTimeout ? 'RESEND_TIMEOUT' : 'RESEND_NETWORK_ERROR',
        error: isTimeout ? 'Resend API connection timed out.' : (err.message || 'Network request failed'),
      };
    }
  }

  /**
   * Optional SMTP transport fallback (useful for local development)
   */
  async _sendViaSmtp({ to, subject, html, text }) {
    const { host, port, user, password, from, secure, timeout } = this._resolveConfig();

    return new Promise((resolve) => {
      let resolved = false;
      let activeSocket = null;
      const messageId = `<${Date.now()}.${crypto.randomBytes(8).toString('hex')}@veridict.local>`;

      const finish = (result) => {
        if (!resolved) {
          resolved = true;
          try {
            if (activeSocket && !activeSocket.destroyed) {
              activeSocket.destroy();
            }
          } catch {}
          resolve(result);
        }
      };

      const socketFactory = secure ? tls.connect : net.connect;
      const socketOptions = secure
        ? { host, port, timeout, servername: host, family: 4 }
        : { host, port, timeout, family: 4 };

      activeSocket = socketFactory(socketOptions, () => {});

      activeSocket.setTimeout(timeout, () => {
        finish({ success: false, reason: 'SMTP_TIMEOUT', error: `SMTP connection to ${host}:${port} timed out.` });
      });

      activeSocket.on('error', (err) => {
        const errMsg = extractErrorMessage(err);
        finish({ success: false, reason: 'SMTP_ERROR', error: errMsg });
      });

      let state = 'WAIT_GREETING';
      let buffer = '';

      const send = (str) => {
        if (activeSocket && !activeSocket.destroyed) {
          activeSocket.write(str + '\r\n');
        }
      };

      const setupDataListener = (s) => {
        s.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\r\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line) continue;
            const code = parseInt(line.substring(0, 3), 10);
            const isFinal = line.charAt(3) === ' ';

            if (!isFinal) continue;

            if (state === 'WAIT_GREETING') {
              if (code >= 200 && code < 300) {
                state = 'SENT_EHLO_1';
                send('EHLO veridict.local');
              } else {
                finish({ success: false, reason: 'SMTP_GREETING_FAILED', error: line });
              }
            } else if (state === 'SENT_EHLO_1') {
              if (code >= 200 && code < 300) {
                if (!secure) {
                  state = 'SENT_STARTTLS';
                  send('STARTTLS');
                } else if (user && password) {
                  state = 'AUTH_LOGIN';
                  send('AUTH LOGIN');
                } else {
                  state = 'MAIL_FROM';
                  send(`MAIL FROM:<${from.replace(/.*<([^>]+)>.*/, '$1')}>`);
                }
              } else {
                finish({ success: false, reason: 'SMTP_EHLO_FAILED', error: line });
              }
            } else if (state === 'SENT_STARTTLS') {
              if (code === 220) {
                state = 'UPGRADING_TLS';
                s.removeAllListeners('data');
                s.removeAllListeners('error');
                s.removeAllListeners('timeout');

                s.on('error', (err) => {
                  finish({ success: false, reason: 'SMTP_ERROR', error: extractErrorMessage(err) });
                });

                const tlsSocket = tls.connect({
                  socket: s,
                  host: host,
                  servername: host,
                }, () => {
                  activeSocket = tlsSocket;
                  state = 'SENT_EHLO_2';
                  setupDataListener(tlsSocket);
                  send('EHLO veridict.local');
                });

                tlsSocket.setTimeout(timeout, () => {
                  finish({ success: false, reason: 'SMTP_TIMEOUT', error: 'TLS handshake timed out.' });
                });

                tlsSocket.on('error', (err) => {
                  const errMsg = extractErrorMessage(err);
                  finish({ success: false, reason: 'SMTP_TLS_ERROR', error: errMsg });
                });
              } else {
                finish({ success: false, reason: 'SMTP_STARTTLS_REJECTED', error: line });
              }
            } else if (state === 'SENT_EHLO_2') {
              if (code >= 200 && code < 300) {
                if (user && password) {
                  state = 'AUTH_LOGIN';
                  send('AUTH LOGIN');
                } else {
                  state = 'MAIL_FROM';
                  send(`MAIL FROM:<${from.replace(/.*<([^>]+)>.*/, '$1')}>`);
                }
              } else {
                finish({ success: false, reason: 'SMTP_EHLO_TLS_FAILED', error: line });
              }
            } else if (state === 'AUTH_LOGIN') {
              if (code === 334) {
                state = 'AUTH_USER';
                send(Buffer.from(user).toString('base64'));
              } else {
                finish({ success: false, reason: 'SMTP_AUTH_NOT_SUPPORTED', error: line });
              }
            } else if (state === 'AUTH_USER') {
              if (code === 334) {
                state = 'AUTH_PASS';
                send(Buffer.from(password).toString('base64'));
              } else {
                finish({ success: false, reason: 'SMTP_AUTH_USER_FAILED', error: line });
              }
            } else if (state === 'AUTH_PASS') {
              if (code === 235) {
                state = 'MAIL_FROM';
                send(`MAIL FROM:<${from.replace(/.*<([^>]+)>.*/, '$1')}>`);
              } else {
                finish({ success: false, reason: 'SMTP_AUTH_FAILED', error: 'Invalid SMTP credentials: ' + line });
              }
            } else if (state === 'MAIL_FROM') {
              if (code >= 200 && code < 300) {
                state = 'RCPT_TO';
                send(`RCPT TO:<${to}>`);
              } else {
                finish({ success: false, reason: 'SMTP_MAIL_FROM_FAILED', error: line });
              }
            } else if (state === 'RCPT_TO') {
              if (code >= 200 && code < 300) {
                state = 'DATA_CMD';
                send('DATA');
              } else {
                finish({ success: false, reason: 'SMTP_RCPT_TO_FAILED', error: line });
              }
            } else if (state === 'DATA_CMD') {
              if (code === 354) {
                state = 'SEND_BODY';
                const boundary = `----=_Part_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
                const payload = [
                  `From: ${from}`,
                  `To: ${to}`,
                  `Subject: ${subject}`,
                  `Message-ID: ${messageId}`,
                  `Date: ${new Date().toUTCString()}`,
                  'MIME-Version: 1.0',
                  `Content-Type: multipart/alternative; boundary="${boundary}"`,
                  '',
                  `--${boundary}`,
                  'Content-Type: text/plain; charset=utf-8',
                  'Content-Transfer-Encoding: 7bit',
                  '',
                  text || '',
                  '',
                  `--${boundary}`,
                  'Content-Type: text/html; charset=utf-8',
                  'Content-Transfer-Encoding: 7bit',
                  '',
                  html || `<p>${text || ''}</p>`,
                  '',
                  `--${boundary}--`,
                  '',
                  '.'
                ].join('\r\n');
                send(payload);
              } else {
                finish({ success: false, reason: 'SMTP_DATA_FAILED', error: line });
              }
            } else if (state === 'SEND_BODY') {
              if (code >= 200 && code < 300) {
                state = 'QUIT';
                send('QUIT');
                finish({ success: true, messageId, provider: 'smtp' });
              } else {
                finish({ success: false, reason: 'SMTP_BODY_REJECTED', error: line });
              }
            }
          }
        });
      };

      setupDataListener(activeSocket);
    });
  }

  /**
   * Safe SMTP handshake test for fallback mode
   */
  async _testSmtpConnection(cfg) {
    const { host, port, user, password, secure, timeout } = cfg;

    return new Promise((resolve) => {
      let resolved = false;
      let activeSocket = null;

      const finish = (result) => {
        if (!resolved) {
          resolved = true;
          try {
            if (activeSocket && !activeSocket.destroyed) activeSocket.destroy();
          } catch {}
          resolve(result);
        }
      };

      const socketFactory = secure ? tls.connect : net.connect;
      const socketOptions = secure
        ? { host, port, timeout, servername: host, family: 4 }
        : { host, port, timeout, family: 4 };

      activeSocket = socketFactory(socketOptions, () => {});
      activeSocket.setTimeout(timeout, () => finish({ success: false, reason: 'SMTP_TIMEOUT', error: 'Connection timed out' }));
      activeSocket.on('error', (err) => {
        const errMsg = extractErrorMessage(err);
        finish({ success: false, reason: 'SMTP_ERROR', error: errMsg });
      });

      let state = 'WAIT_GREETING';
      let buffer = '';

      const send = (str) => {
        if (activeSocket && !activeSocket.destroyed) activeSocket.write(str + '\r\n');
      };

      const setupListener = (s) => {
        s.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\r\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line) continue;
            const code = parseInt(line.substring(0, 3), 10);
            if (line.charAt(3) !== ' ') continue;

            if (state === 'WAIT_GREETING' && code >= 200 && code < 300) {
              state = 'SENT_EHLO_1';
              send('EHLO veridict.local');
            } else if (state === 'SENT_EHLO_1' && code >= 200 && code < 300) {
              if (!secure) {
                state = 'SENT_STARTTLS';
                send('STARTTLS');
              } else if (user && password) {
                state = 'AUTH_LOGIN';
                send('AUTH LOGIN');
              } else {
                send('QUIT');
                finish({ success: true, message: 'SMTP handshake verified (anonymous)' });
              }
            } else if (state === 'SENT_STARTTLS') {
              if (code === 220) {
                s.removeAllListeners('data');
                s.removeAllListeners('error');
                s.removeAllListeners('timeout');

                s.on('error', (err) => {
                  finish({ success: false, reason: 'SMTP_ERROR', error: extractErrorMessage(err) });
                });

                const tlsSocket = tls.connect({ socket: s, host, servername: host }, () => {
                  activeSocket = tlsSocket;
                  state = 'SENT_EHLO_2';
                  setupListener(tlsSocket);
                  send('EHLO veridict.local');
                });
                tlsSocket.setTimeout(timeout, () => finish({ success: false, reason: 'SMTP_TIMEOUT', error: 'TLS timed out' }));
                tlsSocket.on('error', (err) => {
                  const errMsg = extractErrorMessage(err);
                  finish({ success: false, reason: 'SMTP_TLS_ERROR', error: errMsg });
                });
              } else {
                finish({ success: false, reason: 'SMTP_STARTTLS_FAILED', error: line });
              }
            } else if (state === 'SENT_EHLO_2' && code >= 200 && code < 300) {
              if (user && password) {
                state = 'AUTH_LOGIN';
                send('AUTH LOGIN');
              } else {
                send('QUIT');
                finish({ success: true, message: 'STARTTLS handshake verified' });
              }
            } else if (state === 'AUTH_LOGIN' && code === 334) {
              state = 'AUTH_USER';
              send(Buffer.from(user).toString('base64'));
            } else if (state === 'AUTH_USER' && code === 334) {
              state = 'AUTH_PASS';
              send(Buffer.from(password).toString('base64'));
            } else if (state === 'AUTH_PASS') {
              if (code === 235) {
                send('QUIT');
                finish({ success: true, message: 'SMTP authentication verified successfully!' });
              } else {
                finish({ success: false, reason: 'SMTP_AUTH_FAILED', error: 'Invalid credentials: ' + line });
              }
            }
          }
        });
      };

      setupListener(activeSocket);
    });
  }

  // =========================================================================
  // HIGH-LEVEL TEMPLATED NOTIFICATIONS
  // =========================================================================

  /**
   * Account Email Verification
   */
  async sendVerificationEmail({ email, name, token, baseUrl = 'http://localhost:8080' }) {
    const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const subject = 'Verify your VERIDICT Account';
    const text = `Welcome to VERIDICT, ${name || 'User'}!\n\nPlease verify your email address by opening the following link:\n${verifyUrl}\n\nThis verification link expires in 24 hours.\n\n— The VERIDICT Team`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Verify Account</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; padding: 40px 20px; margin: 0;">
        <div style="max-width: 560px; margin: 0 auto; background-color: #111827; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 14px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 24px;">
            <div style="width: 28px; height: 28px; background: #38bdf8; border-radius: 6px; display: inline-block; vertical-align: middle;"></div>
            <span style="font-size: 20px; font-weight: 800; letter-spacing: 0.05em; color: #ffffff; vertical-align: middle; margin-left: 8px;">VERIDICT</span>
          </div>
          <h1 style="font-size: 22px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 12px;">Confirm your email address</h1>
          <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
            Hello ${name || 'User'}, welcome to VERIDICT — the operating platform for hackathons. Please click below to verify your account and activate your permissions.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${verifyUrl}" style="background-color: #38bdf8; color: #0b0f19; font-weight: 700; font-size: 15px; text-decoration: none; padding: 12px 28px; border-radius: 8px; display: inline-block;">Verify Email Address</a>
          </div>
          <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin-top: 32px; border-top: 1px solid rgba(255, 255, 255, 0.06); padding-top: 20px;">
            Or copy and paste this link into your browser:<br>
            <a href="${verifyUrl}" style="color: #38bdf8; word-break: break-all;">${verifyUrl}</a>
          </p>
          <p style="color: #475569; font-size: 12px; margin-top: 16px;">This link will expire in 24 hours. If you did not create a VERIDICT account, you can safely ignore this email.</p>
        </div>
      </body>
      </html>
    `;

    const result = await this.sendMail({ to: email, subject, text, html });
    return {
      ...result,
      verifyUrl,
      token,
    };
  }

  /**
   * Password Reset
   */
  async sendPasswordResetEmail({ email, name, token, baseUrl = 'http://localhost:8080' }) {
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const subject = 'Reset your VERIDICT Password';
    const text = `Hello ${name || 'User'},\n\nA password reset request was requested for your VERIDICT account.\n\nReset your password here:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, please ignore this email.\n\n— The VERIDICT Team`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Reset Password</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; padding: 40px 20px; margin: 0;">
        <div style="max-width: 560px; margin: 0 auto; background-color: #111827; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 14px; padding: 32px;">
          <h2 style="font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0;">Password Reset Request</h2>
          <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">
            We received a request to reset your password. Click the button below to choose a new password:
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${resetUrl}" style="background-color: #38bdf8; color: #0b0f19; font-weight: 700; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block;">Reset Password</a>
          </div>
          <p style="color: #64748b; font-size: 12px;">Link: <a href="${resetUrl}" style="color: #38bdf8;">${resetUrl}</a></p>
          <p style="color: #475569; font-size: 12px;">Expires in 1 hour. If you did not request this, no action is needed.</p>
        </div>
      </body>
      </html>
    `;

    const result = await this.sendMail({ to: email, subject, text, html });
    return {
      ...result,
      resetUrl,
      token,
    };
  }

  /**
   * Official Judge Onboarding & Credentials
   */
  async sendJudgeInvitationEmail({ email, name, eventName, token, baseUrl = 'http://localhost:8080' }) {
    const inviteUrl = `${baseUrl}/invite/judge/${encodeURIComponent(token)}`;
    const subject = `Official Judge Invitation: ${eventName} on VERIDICT`;
    const text = `Greetings ${name || 'Judge'},\n\nYou have been invited to serve as an official judge for ${eventName} on VERIDICT.\n\nPlease claim your judge credentials and view your evaluation tracks here:\n${inviteUrl}\n\n— The ${eventName} Organizing Committee`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Judge Invitation</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; padding: 40px 20px; margin: 0;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #111827; border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 14px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <div style="display: inline-block; background: rgba(56, 189, 248, 0.1); border: 1px solid #38bdf8; color: #38bdf8; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px;">
            Official Invitation
          </div>
          <h1 style="font-size: 22px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 12px;">You're invited to judge at ${eventName}</h1>
          <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
            Hello ${name || 'Judge'}, the organizers of <strong style="color: #ffffff;">${eventName}</strong> have designated you as an official judge for this competition.
          </p>
          <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">Assigned Email:</div>
            <div style="font-family: monospace; font-size: 14px; color: #38bdf8;">${email}</div>
          </div>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${inviteUrl}" style="background-color: #38bdf8; color: #0b0f19; font-weight: 700; font-size: 15px; text-decoration: none; padding: 12px 28px; border-radius: 8px; display: inline-block;">Accept &amp; Set Password</a>
          </div>
          <p style="color: #64748b; font-size: 12px; margin-top: 24px;">
            Direct link: <a href="${inviteUrl}" style="color: #38bdf8; word-break: break-all;">${inviteUrl}</a>
          </p>
        </div>
      </body>
      </html>
    `;

    const result = await this.sendMail({ to: email, subject, text, html });
    return {
      ...result,
      inviteUrl,
      token,
    };
  }

  /**
   * Participant Team Invitation
   */
  async sendTeamInvitationEmail({ email, teamName, eventName, inviteCode, baseUrl = 'http://localhost:8080' }) {
    const joinUrl = `${baseUrl}/teams/join?code=${encodeURIComponent(inviteCode)}`;
    const subject = `Join ${teamName} for ${eventName} on VERIDICT`;
    const text = `You've been invited to join team ${teamName} for ${eventName}.\n\nJoin the team here:\n${joinUrl}\n\nTeam Code: ${inviteCode}\n\n— The VERIDICT Team`;
    const html = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: sans-serif; background-color: #0b0f19; color: #f1f5f9; padding: 30px;">
        <div style="max-width: 500px; margin: 0 auto; background: #111827; padding: 24px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1);">
          <h2 style="color: #38bdf8;">Team Invitation</h2>
          <p>You have been invited to join team <strong>${teamName}</strong> for <strong>${eventName}</strong>.</p>
          <div style="margin: 20px 0;">
            <a href="${joinUrl}" style="background: #38bdf8; color: #0b0f19; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 700;">Join Team</a>
          </div>
          <p style="color: #64748b; font-size: 12px;">Team Code: <code>${inviteCode}</code></p>
        </div>
      </body>
      </html>
    `;

    const result = await this.sendMail({ to: email, subject, text, html });
    return {
      ...result,
      joinUrl,
      inviteCode,
    };
  }
}

export const emailService = new EmailService();
export default emailService;
