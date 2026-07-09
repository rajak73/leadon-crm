import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';
import { NotFound } from '../lib/errors.js';
import { paginationSchema, paginate, logActivity } from '../lib/helpers.js';
import { auditFromReq } from '../services/audit.js';

/** Contact / Customer management + Customer 360 (BRD §10.7, §22.1). */
const router = Router();
router.use(requireAuth, requireOrg());

const listQuery = paginationSchema.extend({ q: z.string().trim().optional() });

/** GET /api/v1/contacts */
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { page, pageSize, q } = listQuery.parse(req.query);
    const where: Record<string, unknown> = { organizationId: req.org!.organizationId };
    if (q) where.OR = [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }, { company: { contains: q } }];

    const [total, contacts] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(page, pageSize) }),
    ]);
    res.json({ page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), contacts });
  })
);

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  company: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
});

/** POST /api/v1/contacts */
router.post(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.parse(req.body);
    const contact = await prisma.contact.create({
      data: {
        organizationId: req.org!.organizationId,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        company: data.company || null,
        source: data.source || null,
        notes: data.notes || null,
      },
    });
    await logActivity({
      organizationId: req.org!.organizationId,
      actorUserId: req.auth!.userId,
      type: 'CONTACT_CREATED',
      message: `Contact "${contact.name}" created`,
      contactId: contact.id,
    });
    res.status(201).json(contact);
  })
);

// ---- CSV export/import + bulk (declared before /:id routes) ----

/** GET /api/v1/contacts/export.csv */
router.get(
  '/export.csv',
  asyncHandler(async (req: AuthedRequest, res) => {
    const contacts = await prisma.contact.findMany({
      where: { organizationId: req.org!.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const header = ['name', 'email', 'phone', 'company', 'source', 'createdAt'];
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = contacts.map((c) =>
      [c.name, c.email, c.phone, c.company, c.source, c.createdAt.toISOString()].map(esc).join(',')
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
    res.send([header.join(','), ...rows].join('\n'));
  })
);

const importSchema = z.object({
  rows: z.array(z.object({
    name: z.string().min(1),
    email: z.string().optional(),
    phone: z.string().optional(),
    company: z.string().optional(),
    source: z.string().optional(),
  })).max(1000),
});

/** POST /api/v1/contacts/import */
router.post(
  '/import',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { rows } = importSchema.parse(req.body);
    const orgId = req.org!.organizationId;
    const valid = rows.filter((r) => r.name && r.name.trim());
    const created = await prisma.$transaction(
      valid.map((r) => prisma.contact.create({
        data: {
          organizationId: orgId,
          name: r.name.trim(),
          email: r.email || null,
          phone: r.phone || null,
          company: r.company || null,
          source: r.source || 'IMPORT',
        },
      }))
    );
    await auditFromReq(req, 'CONTACT_BULK_IMPORT', { entityType: 'Contact', metadata: { count: created.length } });
    res.status(201).json({ imported: created.length, skipped: rows.length - valid.length });
  })
);

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  action: z.enum(['DELETE']),
});

/** POST /api/v1/contacts/bulk — bulk delete. */
router.post(
  '/bulk',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = bulkSchema.parse(req.body);
    const orgId = req.org!.organizationId;
    const owned = await prisma.contact.findMany({ where: { id: { in: data.ids }, organizationId: orgId }, select: { id: true } });
    const ids = owned.map((c) => c.id);
    if (ids.length === 0) throw NotFound('No matching contacts');
    const affected = (await prisma.contact.deleteMany({ where: { id: { in: ids }, organizationId: orgId } })).count;
    await auditFromReq(req, 'CONTACT_BULK_DELETE', { entityType: 'Contact', metadata: { count: affected } });
    res.json({ affected });
  })
);

/**
 * GET /api/v1/contacts/:id/customer360
 * Customer 360 profile (BRD §10.7): identity, timeline, messages, deals,
 * tasks, notes, next action, assigned team member.
 */
router.get(
  '/:id/customer360',
  asyncHandler(async (req: AuthedRequest, res) => {
    const orgId = req.org!.organizationId;
    const contact = await prisma.contact.findFirst({
      where: { id: req.params.id, organizationId: orgId },
      include: {
        deals: { include: { stage: true, owner: { select: { id: true, firstName: true, lastName: true } } } },
        tasks: { orderBy: { dueDate: 'asc' } },
        activities: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!contact) throw NotFound('Contact not found');

    // Next action = earliest open task (BRD §10.7 "Next action")
    const nextAction =
      contact.tasks.find((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS') ?? null;

    res.json({
      identity: {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        company: contact.company,
        source: contact.source,
        notes: contact.notes,
        createdAt: contact.createdAt,
      },
      deals: contact.deals,
      tasks: contact.tasks,
      timeline: contact.activities,
      nextAction,
    });
  })
);

const noteSchema = z.object({ note: z.string().min(1).max(2000) });

/** POST /api/v1/contacts/:id/notes — log a note to the contact's timeline. */
router.post(
  '/:id/notes',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { note } = noteSchema.parse(req.body);
    const contact = await prisma.contact.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!contact) throw NotFound('Contact not found');
    await logActivity({
      organizationId: req.org!.organizationId,
      actorUserId: req.auth!.userId,
      type: 'NOTE_ADDED',
      message: note,
      contactId: contact.id,
    });
    res.status(201).json({ ok: true });
  })
);

/** GET /api/v1/contacts/:id */
router.get(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const contact = await prisma.contact.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!contact) throw NotFound('Contact not found');
    res.json(contact);
  })
);

const updateSchema = createSchema.partial();

/** PATCH /api/v1/contacts/:id */
router.patch(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = updateSchema.parse(req.body);
    const existing = await prisma.contact.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!existing) throw NotFound('Contact not found');
    const contact = await prisma.contact.update({
      where: { id: existing.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.email !== undefined ? { email: data.email || null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
        ...(data.company !== undefined ? { company: data.company || null } : {}),
        ...(data.source !== undefined ? { source: data.source || null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      },
    });
    res.json(contact);
  })
);

/** DELETE /api/v1/contacts/:id */
router.delete(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.contact.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!existing) throw NotFound('Contact not found');
    await prisma.contact.delete({ where: { id: existing.id } });
    res.status(204).send();
  })
);

export default router;
