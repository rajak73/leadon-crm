/**
 * Notifications service (in-app notification center). Best-effort — never throws
 * to callers. Notifications are org-scoped (BRD §20); `userId` optionally
 * targets one member, otherwise it's visible to the whole org.
 */
import { prisma } from '../prisma.js';

export interface NotifyParams {
  organizationId: string;
  userId?: string | null;
  type: 'LEAD_CAPTURED' | 'TASK_DUE' | 'WORKFLOW_RUN' | 'SYSTEM';
  title: string;
  body?: string;
  link?: string;
}

export async function createNotification(params: NotifyParams): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId ?? null,
        type: params.type,
        title: params.title,
        body: params.body ?? null,
        link: params.link ?? null,
      },
    });
  } catch {
    // non-critical
  }
}
