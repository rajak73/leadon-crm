import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';
import { paginationSchema, paginate, parseJson } from '../lib/helpers.js';
import { OrgRole } from '@leados/shared';

/**
 * Audit log viewer (BRD §8.2). Owners/Admins can review the org's audit trail
 * for compliance. Scoped by organizationId (BRD §20).
 */
const router = Router();
router.use(requireAuth, requireOrg(OrgRole.OWNER, OrgRole.ADMIN));

const listQuery = paginationSchema.extend({
  action: z.string().optional(),
  entityType: z.string().optional(),
});

/** GET /api/v1/audit — paginated audit entries (newest first). */
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { page, pageSize, action, entityType } = listQuery.parse(req.query);
    const where: Record<string, unknown> = { organizationId: req.org!.organizationId };
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;

    const [total, entries] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginate(page, pageSize),
      }),
    ]);

    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      entries: entries.map((e) => ({
        id: e.id,
        action: e.action,
        actorEmail: e.actorEmail,
        entityType: e.entityType,
        entityId: e.entityId,
        metadata: parseJson(e.metadata),
        ip: e.ip,
        createdAt: e.createdAt,
      })),
    });
  })
);

/** GET /api/v1/audit/export.csv — export the audit trail (owner/admin). */
router.get(
  '/export.csv',
  asyncHandler(async (req: AuthedRequest, res) => {
    const entries = await prisma.auditLog.findMany({
      where: { organizationId: req.org!.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });
    const header = ['createdAt', 'actorEmail', 'action', 'entityType', 'entityId', 'ip', 'metadata'];
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = entries.map((e) =>
      [e.createdAt.toISOString(), e.actorEmail, e.action, e.entityType, e.entityId, e.ip, e.metadata].map(esc).join(',')
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    res.send([header.join(','), ...rows].join('\n'));
  })
);

export default router;
