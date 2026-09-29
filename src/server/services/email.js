import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';

/**
 * VERIDICT Email Service Layer
 * 
 * Supports standard RFC 5321 self-hosted SMTP configurations via environment variables:
 * - SMTP_HOST
 * - SMTP_PORT (default 587, or 465 if SMTP_SECURE=true)
 * - SMTP_USER
 * - SMTP_PASSWORD
 * - SMTP_FROM (default: VERIDICT <noreply@veridict.local>)
 * - SMTP_SECURE ('true' for SMTPS/port 465, false for STARTTLS/plain)
 * 
 * In offline/self-hosted mode without SMTP credentials:
 * - isConfigured() returns false
 * - sendMail() returns { success: false, reason: 'SMTP_NOT_CONFIGURED' }
 * - Applications gracefully provide truthful secure link fallbacks without faking delivery.
 */

export class EmailService {
  constructor(config = {}) {
    this.config = {
      host: config.host || process.env.SMTP_HOST || '',
      port: Number(config.port || process.env.SMTP_PORT) || (config.secure || process.env.SMTP_SECURE === 'true' ? 465 : 587),
      user: config.user || process.env.SMTP_USER || '',
      password: config.password || process.env.SMTP_PASSWORD || '',
      from: config.from || process.env.SMTP_FROM || 'VERIDICT Platform <noreply@veridict.local>',
      secure: config.secure !== undefined ? config.secure : process.env.SMTP_SECURE === 'true',
      timeout: Number(config.timeout || process.env.SMTP_TIMEOUT) || 8000,
    };
  }

  isConfigured() {
    return Boolean(this.config.host && this.config.host.trim().length > 0);
  }

  getConfig() {
    return {
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      user: this.config.user ? '***' : '',
      from: this.config.from,
      configured: this.isConfigured(),
    };
  }

  /**
   * Send an email via native SMTP RFC 5321 socket conversation.
   * Requires zero external dependencies.
   */
  async sendMail({ to, subject, html, text }) {
    if (!this.isConfigured()) {
      return {
        success: false,
        reason: 'SMTP_NOT_CONFIGURED',
        error: 'SMTP host is not configured in environment variables (SMTP_HOST is empty).',
      };
    }

    const { host, port, user, password, from, secure, timeout } = this.config;
    const messageId = `<${Date.now()}.${crypto.randomBytes(8).toString('hex')}@veridict.local>`;

    return new Promise((resolve) => {
      let resolved = false;
      const finish = (result) => {
        if (!resolved) {
          resolved = true;
          try { socket.destroy(); } catch {}
          resolve(result);
        }
      };

      const socketFactory = secure ? tls.connect : net.connect;
      const socket = socketFactory({ host, port, timeout }, () => {});

      socket.setTimeout(timeout, () => {
        finish({ success: false, reason: 'SMTP_TIMEOUT', error: `SMTP connection to ${host}:${port} timed out.` });
      });

      socket.on('error', (err) => {
        finish({ success: false, reason: 'SMTP_ERROR', error: err.message });
      });

      let state = 'WAIT_GREETING';
      let buffer = '';

      const send = (str) => {
        if (!socket.destroyed) {
          socket.write(str + '\r\n');
        }
      };

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\r\n');
        buffer = lines.pop(); // keep partial line

        for (const line of lines) {
          if (!line) continue;
          const code = parseInt(line.substring(0, 3), 10);
          const isFinal = line.charAt(3) === ' ';

          if (!isFinal) continue; // Multi-line response continuation

          if (state === 'WAIT_GREETING') {
            if (code >= 200 && code < 300) {
              state = 'SENT_EHLO';
              send('EHLO veridict.local');
            } else {
              finish({ success: false, reason: 'SMTP_GREETING_FAILED', error: line });
            }
          } else if (state === 'SENT_EHLO') {
            if (code >= 200 && code < 300) {
              if (user && password) {
                state = 'AUTH_LOGIN';
                send('AUTH LOGIN');
              } else {
                state = 'MAIL_FROM';
                send(`MAIL FROM:<${from.replace(/.*<([^>]+)>.*/, '$1')}>`);
              }
            } else {
              finish({ success: false, reason: 'SMTP_EHLO_FAILED', error: line });
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
              finish({ success: false, reason: 'SMTP_AUTH_FAILED', error: 'Invalid SMTP credentials.' });
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
              finish({ success: true, messageId });
            } else {
              finish({ success: false, reason: 'SMTP_BODY_REJECTED', error: line });
            }
          }
        }
      });
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
    const text = `Welcome to VERIDICT, ${name || 'Organizer'}!\n\nPlease verify your email address by opening the following link:\n${verifyUrl}\n\nThis verification link expires in 24 hours.\n\n— The VERIDICT Team`;
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
        <div style="max-width: 560px; margin: 0 auto; background-color: #111827; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 14px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <div style="margin-bottom: 24px;">
            <span style="font-size: 20px; font-weight: 800; letter-spacing: 0.05em; color: #ffffff;">VERIDICT</span>
          </div>
          <h1 style="font-size: 22px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 12px;">Reset your password</h1>
          <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
            We received a request to reset the password for your VERIDICT account. Click the button below to choose a new password.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}" style="background-color: #38bdf8; color: #0b0f19; font-weight: 700; font-size: 15px; text-decoration: none; padding: 12px 28px; border-radius: 8px; display: inline-block;">Reset Password</a>
          </div>
          <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin-top: 32px; border-top: 1px solid rgba(255, 255, 255, 0.06); padding-top: 20px;">
            Or copy and paste this link into your browser:<br>
            <a href="${resetUrl}" style="color: #38bdf8; word-break: break-all;">${resetUrl}</a>
          </p>
          <p style="color: #475569; font-size: 12px; margin-top: 16px;">This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
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
   * Judge Invitation
   */
  async sendJudgeInvitationEmail({ email, name, eventName, token, baseUrl = 'http://localhost:8080' }) {
    const inviteUrl = `${baseUrl}/invite/judge/${encodeURIComponent(token)}`;
    const subject = `Invitation to Judge ${eventName || 'Hackathon'} on VERIDICT`;
    const text = `Hello ${name || 'Judge'},\n\nYou have been invited to serve as an official judge for ${eventName || 'the hackathon'} on VERIDICT.\n\nAccept your invitation and access your judging workbench:\n${inviteUrl}\n\n— The VERIDICT Team`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Judge Invitation</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; padding: 40px 20px; margin: 0;">
        <div style="max-width: 560px; margin: 0 auto; background-color: #111827; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 14px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <div style="margin-bottom: 24px;">
            <span style="font-size: 20px; font-weight: 800; letter-spacing: 0.05em; color: #38bdf8;">VERIDICT</span>
            <span style="font-size: 14px; color: #64748b; margin-left: 8px;">• Official Judging Invitation</span>
          </div>
          <h1 style="font-size: 22px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 12px;">You're invited to evaluate submissions</h1>
          <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
            Hello ${name || 'Judge'}, the organizers of <strong style="color: #ffffff;">${eventName}</strong> have designated you as an official judge for this competition.
          </p>
          <div style="background-color: rgba(56, 189, 248, 0.05); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <div style="font-size: 13px; color: #38bdf8; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">Role & Responsibilities</div>
            <div style="font-size: 14px; color: #cbd5e1; line-height: 1.5;">Review assigned project submissions, evaluate technical merit and impact against weighted rubrics, and record official scores.</div>
          </div>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${inviteUrl}" style="background-color: #38bdf8; color: #0b0f19; font-weight: 700; font-size: 15px; text-decoration: none; padding: 12px 28px; border-radius: 8px; display: inline-block;">Accept Judging Invitation</a>
          </div>
          <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin-top: 32px; border-top: 1px solid rgba(255, 255, 255, 0.06); padding-top: 20px;">
            Direct link:<br>
            <a href="${inviteUrl}" style="color: #38bdf8; word-break: break-all;">${inviteUrl}</a>
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
   * Team Teammate Invitation
   */
  async sendTeamInvitationEmail({ email, teamName, eventName, inviteCode, baseUrl = 'http://localhost:8080' }) {
    const joinUrl = `${baseUrl}/teams/join?code=${encodeURIComponent(inviteCode)}`;
    const subject = `Join Team ${teamName} for ${eventName || 'the Hackathon'} on VERIDICT`;
    const text = `You have been invited to join team ${teamName} for ${eventName || 'the competition'} on VERIDICT.\n\nJoin your squad:\n${joinUrl}\n\nInvite Code: ${inviteCode}\n\n— The VERIDICT Team`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Team Invitation</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; padding: 40px 20px; margin: 0;">
        <div style="max-width: 560px; margin: 0 auto; background-color: #111827; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 14px; padding: 32px;">
          <h1 style="font-size: 22px; font-weight: 700; color: #ffffff;">Join Team ${teamName}</h1>
          <p style="color: #94a3b8; font-size: 15px; line-height: 1.6;">You have been invited to join team <strong style="color: #ffffff;">${teamName}</strong> for ${eventName}.</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${joinUrl}" style="background-color: #38bdf8; color: #0b0f19; font-weight: 700; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">Accept & Join Team</a>
          </div>
          <p style="color: #64748b; font-size: 13px;">Invite code: <code>${inviteCode}</code></p>
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

// Global default singleton instance
export const emailService = new EmailService();
