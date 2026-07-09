import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';
import { NotFound } from '../lib/errors.js';
import { paginationSchema, paginate, parseJson, logActivity } from '../lib/helpers.js';
import { assertWithinLimit } from '../services/billing.js';
import { runWorkflows } from '../services/workflow-engine.js';
import { auditFromReq } from '../services/audit.js';
import { LEAD_STATUSES, LEAD_SOURCES } from '@leados/shared';

/** Lead management (BRD §10.6, §22.1). All queries scoped by organizationId. */
const router = Router();
router.use(requireAuth, requireOrg());

const listQuery = paginationSchema.extend({
  status: z.enum(LEAD_STATUSES as [string, ...string[]]).optional(),
  source: z.enum(LEAD_SOURCES as [string, ...string[]]).optional(),
  assignedUserId: z.string().optional(),
  q: z.string().trim().optional(),
});

/** GET /api/v1/leads */
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { page, pageSize, status, source, assignedUserId, q } = listQuery.parse(req.query);
    const where: Record<string, unknown> = { organizationId: req.org!.organizationId };
    // Role scoping (BRD §9.5/§9.6): Sales Agents & Support Agents see only
    // leads assigned to them; managers/admins/owners see all org leads.
    const role = req.org!.role;
    if (role === 'SALES_AGENT' || role === 'SUPPORT_AGENT') {
      where.assignedUserId = req.auth!.userId;
    }
    if (status) where.status = status;
    if (source) where.source = source;
    // "none" = unassigned; otherwise filter by the given user (managers only —
    // agents are already locked to their own leads above).
    if (assignedUserId && !(role === 'SALES_AGENT' || role === 'SUPPORT_AGENT')) {
      where.assignedUserId = assignedUserId === 'none' ? null : assignedUserId;
    }
    if (q) where.OR = [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }];

    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginate(page, pageSize),
        include: { assignedUser: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);

    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      leads: leads.map(serializeLead),
    });
  })
);

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  source: z.enum(LEAD_SOURCES as [string, ...string[]]).default('MANUAL'),
  status: z.enum(LEAD_STATUSES as [string, ...string[]]).default('NEW'),
  score: z.number().int().min(0).max(100).optional(),
  assignedUserId: z.string().optional(),
  notes: z.string().optional(),
  customFields: z.record(z.any()).optional(),
});

/** POST /api/v1/leads */
router.post(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.parse(req.body);
    await assertWithinLimit(req.org!.organizationId, 'leads'); // BRD §19.3
    const lead = await prisma.lead.create({
      data: {
        organizationId: req.org!.organizationId,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        source: data.source,
        status: data.status,
        score: data.score ?? 0,
        assignedUserId: data.assignedUserId || null,
        notes: data.notes || null,
        customFields: data.customFields ? JSON.stringify(data.customFields) : null,
        lastActivityAt: new Date(),
      },
    });
    await logActivity({
      organizationId: req.org!.organizationId,
      actorUserId: req.auth!.userId,
      type: 'LEAD_CREATED',
      message: `Lead "${lead.name}" created`,
      leadId: lead.id,
    });
    await runWorkflows({ organizationId: req.org!.organizationId, event: 'LEAD_CREATED', leadId: lead.id });
    await auditFromReq(req, 'LEAD_CREATED', { entityType: 'Lead', entityId: lead.id, metadata: { name: lead.name } });
    res.status(201).json(serializeLead(lead));
  })
);

/**
 * GET /api/v1/leads/export.csv — export org leads as CSV (BRD §10.6, §15.2).
 * NOTE: static paths must be declared BEFORE the `/:id` route so Express does
 * not treat "export.csv" as an :id param.
 */
router.get(
  '/export.csv',
  asyncHandler(async (req: AuthedRequest, res) => {
    const leads = await prisma.lead.findMany({
      where: { organizationId: req.org!.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 5000, // bounded for free-tier safety
    });
    const header = ['name', 'email', 'phone', 'source', 'status', 'score', 'createdAt'];
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = leads.map((l) =>
      [l.name, l.email, l.phone, l.source, l.status, l.score, l.createdAt.toISOString()].map(escape).join(',')
    );
    const csv = [header.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    res.send(csv);
  })
);

const importSchema = z.object({
  rows: z
    .array(
      z.object({
        name: z.string().min(1),
        email: z.string().optional(),
        phone: z.string().optional(),
        source: z.string().optional(),
        status: z.string().optional(),
      })
    )
    .max(1000), // cap per import (free-tier)
});

/** POST /api/v1/leads/import — bulk import leads from parsed CSV rows. */
router.post(
  '/import',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { rows } = importSchema.parse(req.body);
    const orgId = req.org!.organizationId;
    await assertWithinLimit(orgId, 'leads'); // BRD §19.3

    const valid = rows.filter((r) => r.name && r.name.trim());
    const created = await prisma.$transaction(
      valid.map((r) =>
        prisma.lead.create({
          data: {
            organizationId: orgId,
            name: r.name.trim(),
            email: r.email || null,
            phone: r.phone || null,
            source: (r.source as string) || 'IMPORT',
            status: (r.status as string) || 'NEW',
            lastActivityAt: new Date(),
          },
        })
      )
    );
    res.status(201).json({ imported: created.length, skipped: rows.length - valid.length });
  })
);

// ---- Bulk actions (BRD productivity) — declared before /:id ----

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  action: z.enum(['SET_STATUS', 'ASSIGN', 'DELETE']),
  status: z.enum(LEAD_STATUSES as [string, ...string[]]).optional(),
  assignedUserId: z.string().nullable().optional(),
});

/**
 * POST /api/v1/leads/bulk — apply an action to many leads at once.
 * All operations are scoped to the org (BRD §20) and audited.
 */
router.post(
  '/bulk',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = bulkSchema.parse(req.body);
    const orgId = req.org!.organizationId;
    // Only operate on leads that belong to this org (prevents cross-tenant ids).
    const owned = await prisma.lead.findMany({
      where: { id: { in: data.ids }, organizationId: orgId },
      select: { id: true },
    });
    const ids = owned.map((l) => l.id);
    if (ids.length === 0) throw NotFound('No matching leads');

    let affected = 0;
    if (data.action === 'SET_STATUS') {
      if (!data.status) throw NotFound('status required');
      affected = (await prisma.lead.updateMany({ where: { id: { in: ids }, organizationId: orgId }, data: { status: data.status, lastActivityAt: new Date() } })).count;
      await auditFromReq(req, 'LEAD_BULK_STATUS', { entityType: 'Lead', metadata: { count: affected, status: data.status } });
    } else if (data.action === 'ASSIGN') {
      affected = (await prisma.lead.updateMany({ where: { id: { in: ids }, organizationId: orgId }, data: { assignedUserId: data.assignedUserId ?? null } })).count;
      await auditFromReq(req, 'LEAD_BULK_ASSIGN', { entityType: 'Lead', metadata: { count: affected, assignedUserId: data.assignedUserId ?? null } });
    } else if (data.action === 'DELETE') {
      affected = (await prisma.lead.deleteMany({ where: { id: { in: ids }, organizationId: orgId } })).count;
      await auditFromReq(req, 'LEAD_BULK_DELETE', { entityType: 'Lead', metadata: { count: affected } });
    }
    res.json({ affected });
  })
);

/** GET /api/v1/leads/:id */
router.get(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
      include: {
        assignedUser: { select: { id: true, firstName: true, lastName: true } },
        deals: { include: { stage: true } },
        tasks: { orderBy: { createdAt: 'desc' } },
        activities: { orderBy: { createdAt: 'desc' }, take: 100 },
        conversations: { include: { messages: { orderBy: { createdAt: 'desc' }, take: 5 } } },
      },
    });
    if (!lead) throw NotFound('Lead not found');
    res.json({
      ...serializeLead(lead),
      deals: lead.deals,
      tasks: lead.tasks,
      activities: lead.activities,
      conversations: lead.conversations,
    });
  })
);

const updateSchema = createSchema.partial();

/** PATCH /api/v1/leads/:id */
router.patch(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = updateSchema.parse(req.body);
    const existing = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!existing) throw NotFound('Lead not found');

    const lead = await prisma.lead.update({
      where: { id: existing.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.email !== undefined ? { email: data.email || null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
        ...(data.source !== undefined ? { source: data.source } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.score !== undefined ? { score: data.score } : {}),
        ...(data.assignedUserId !== undefined ? { assignedUserId: data.assignedUserId || null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
        ...(data.customFields !== undefined
          ? { customFields: data.customFields ? JSON.stringify(data.customFields) : null }
          : {}),
        lastActivityAt: new Date(),
      },
    });

    if (data.status && data.status !== existing.status) {
      await logActivity({
        organizationId: req.org!.organizationId,
        actorUserId: req.auth!.userId,
        type: 'LEAD_STATUS_CHANGED',
        message: `Status: ${existing.status} → ${data.status}`,
        leadId: lead.id,
      });
      await runWorkflows({
        organizationId: req.org!.organizationId,
        event: 'LEAD_STATUS_CHANGED',
        leadId: lead.id,
        newStatus: data.status,
      });
    }
    res.json(serializeLead(lead));
  })
);

const noteSchema = z.object({ note: z.string().min(1).max(2000) });

/** POST /api/v1/leads/:id/notes — log a note to the lead's activity timeline. */
router.post(
  '/:id/notes',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { note } = noteSchema.parse(req.body);
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!lead) throw NotFound('Lead not found');
    await logActivity({
      organizationId: req.org!.organizationId,
      actorUserId: req.auth!.userId,
      type: 'NOTE_ADDED',
      message: note,
      leadId: lead.id,
    });
    await prisma.lead.update({ where: { id: lead.id }, data: { lastActivityAt: new Date() } });
    res.status(201).json({ ok: true });
  })
);

/** DELETE /api/v1/leads/:id */
router.delete(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!existing) throw NotFound('Lead not found');
    await prisma.lead.delete({ where: { id: existing.id } });
    await auditFromReq(req, 'LEAD_DELETED', { entityType: 'Lead', entityId: existing.id, metadata: { name: existing.name } });
    res.status(204).send();
  })
);

function serializeLead(lead: any) {
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    status: lead.status,
    score: lead.score,
    assignedUserId: lead.assignedUserId,
    assignedUser: lead.assignedUser ?? undefined,
    notes: lead.notes,
    customFields: parseJson(lead.customFields),
    lastActivityAt: lead.lastActivityAt,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}

export default router;
