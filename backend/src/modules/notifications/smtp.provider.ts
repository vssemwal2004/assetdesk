import nodemailer from 'nodemailer';

import { env } from '../../config/env.js';
import type { EmailJobDocument } from './email-job.model.js';
import { renderEmail } from './email-template.js';

export class EmailProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'EmailProviderError';
  }
}

export function assertSmtpConfiguration(): void {
  const missing = [
    ['SMTP_HOST', env.SMTP_HOST],
    ['SMTP_PORT', env.SMTP_PORT],
    ['SMTP_FROM or SMTP_USER', env.SMTP_FROM ?? env.SMTP_USER],
  ].filter(([, value]) => !value);
  if (missing.length > 0) {
    throw new EmailProviderError(
      `SMTP is not configured: ${missing.map(([key]) => key).join(', ')}`,
      'SMTP_CONFIGURATION_MISSING',
      false,
    );
  }
}

export function smtpFromAddress(): string {
  return env.SMTP_FROM ?? env.SMTP_USER ?? '';
}

export function smtpSecure(): boolean {
  return env.SMTP_SECURE || env.SMTP_PORT === 465;
}

export async function sendWithSmtp(job: EmailJobDocument): Promise<string> {
  assertSmtpConfiguration();
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: smtpSecure(),
    ...(env.SMTP_USER || env.SMTP_PASS
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
      : {}),
  });

  try {
    const rendered = renderEmail(job.templateKey, job.templateParams);
    const result = await transporter.sendMail({
      from: { address: smtpFromAddress(), name: env.SMTP_FROM_NAME },
      to: { address: job.recipientEmailNormalized, name: job.recipientName },
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    return String(result.messageId || `${Date.now()}-${job._id.toString()}`);
  } catch (error) {
    throw new EmailProviderError(
      error instanceof Error ? error.message : 'SMTP send failed.',
      'SMTP_SEND_FAILED',
      true,
    );
  }
}
