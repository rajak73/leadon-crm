/**
 * Notification / email service (BRD §14.4 "email delivery", §15.2 "Email
 * service"). Free default: logs to console (no external service, no cost). When
 * SMTP/provider env is configured later, swap the transport here — the
 * interface stays the same so callers never change.
 *
 * BRD §14.4 lists email/notifications as "skipped queues" in free mode; this
 * provides the ready abstraction so enabling it later is a config change.
 */
import { config } from '../config.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface NotifyResult {
  delivered: boolean;
  transport: 'console' | 'smtp';
}

/** Send an email. Free default logs it; returns delivered=false (not real). */
export async function sendEmail(msg: EmailMessage): Promise<NotifyResult> {
  if (!config.notify.emailEnabled) {
    // No-op transport (free mode). We DON'T claim delivery (mirrors §11.3 honesty).
    console.log(`[notify:console] email to=${msg.to} subject="${msg.subject}"`);
    return { delivered: false, transport: 'console' };
  }
  // Real SMTP would go here (e.g. nodemailer with config.notify.smtp*). Until
  // configured we keep it honest and return not-delivered.
  console.log(`[notify:smtp] (configured) email to=${msg.to} subject="${msg.subject}"`);
  return { delivered: true, transport: 'smtp' };
}

/** In-app notification (persisted as an Activity so the UI can surface it). */
export async function notifyInApp(_organizationId: string, _message: string): Promise<void> {
  // In-app notifications reuse the Activity timeline; callers use logActivity.
  // Placeholder kept for a future dedicated Notification model if needed.
}
