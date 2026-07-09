import { z } from 'zod';
import { prisma } from '../prisma.js';

/** Standard pagination query parser. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function paginate(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/** Safely parse a JSON string column (SQLite stores JSON as text). */
export function parseJson<T = Record<string, unknown>>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/** Record an activity row (BRD §10.7 timeline, §12.2). Best-effort, never throws. */
export async function logActivity(params: {
  organizationId: string;
  actorUserId?: string | null;
  type: string;
  message: string;
  leadId?: string | null;
  contactId?: string | null;
}) {
  try {
    await prisma.activity.create({
      data: {
        organizationId: params.organizationId,
        actorUserId: params.actorUserId ?? null,
        type: params.type,
        message: params.message,
        leadId: params.leadId ?? null,
        contactId: params.contactId ?? null,
      },
    });
  } catch {
    // activity logging is non-critical
  }
}
