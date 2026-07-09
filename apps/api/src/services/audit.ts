/**
 * Audit log service (BRD §8.2 enterprise audit log). Records who did what,
 * when, and on which entity — org-scoped (BRD §20). Best-effort; never throws
 * to callers. Metadata must be safe/non-secret (BRD §19.1).
 */
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/auth.js';

export interface AuditParams {
  organizationId: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

export async function recordAudit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId,
        actorUserId: params.actorUserId ?? null,
        actorEmail: params.actorEmail ?? null,
        action: params.action,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        ip: params.ip ?? null,
      },
    });
  } catch {
    // auditing is non-critical
  }
}

/** Convenience: derive actor/org/ip from an authed request. */
export async function auditFromReq(
  req: AuthedRequest,
  action: string,
  opts: { entityType?: string; entityId?: string; metadata?: Record<string, unknown> } = {}
): Promise<void> {
  if (!req.org) return;
  await recordAudit({
    organizationId: req.org.organizationId,
    actorUserId: req.auth?.userId ?? null,
    actorEmail: req.auth?.email ?? null,
    action,
    entityType: opts.entityType,
    entityId: opts.entityId,
    metadata: opts.metadata,
    ip: req.ip,
  });
}
