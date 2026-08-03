import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Transactional email for account recovery and verification.
 *
 * With no SMTP host configured the service logs the link instead of sending.
 * That keeps local development working without a mail server, and is why every
 * caller treats delivery as best-effort rather than a hard dependency.
 */
export class EmailService {
  private transporter: Transporter | null = null;

  constructor() {
    if (!config.smtp.host) {
      logger.warn('SMTP not configured — emails will be logged instead of sent');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const url = this.buildLink(config.links.resetUrl, { token, email });
    const minutes = Math.round(config.tokens.resetTtl / 60);

    await this.send({
      to: email,
      subject: 'Reset your password',
      text:
        `We received a request to reset your password.\n\n${url}\n\n` +
        `This link expires in ${minutes} minutes and can be used once. ` +
        `If you did not request it, you can ignore this email.`,
    });
  }

  async sendVerification(email: string, token: string): Promise<void> {
    const url = this.buildLink(config.links.verifyUrl, { token, email });
    const hours = Math.round(config.tokens.verifyTtl / 3600);

    await this.send({
      to: email,
      subject: 'Verify your email address',
      text: `Please confirm your email address.\n\n${url}\n\nThis link expires in ${hours} hours.`,
    });
  }

  private buildLink(base: string, params: Record<string, string>): string {
    const url = new URL(base);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private async send(message: { to: string; subject: string; text: string }): Promise<void> {
    if (!this.transporter) {
      logger.info('[EMAIL:dev] would send', { to: message.to, subject: message.subject });
      // The link is the whole point of the dev fallback — print it plainly.
      console.log(`\n[EMAIL:dev] ${message.subject} -> ${message.to}\n${message.text}\n`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: config.smtp.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      logger.info('Email sent', { to: message.to, subject: message.subject });
    } catch (err) {
      // Surfacing a send failure to the caller would leak whether an address is
      // registered, so log and swallow.
      logger.error('Email send failed', { to: message.to, error: (err as Error).message });
    }
  }
}
