import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';
import { NotFound } from '../lib/errors.js';
import { paginationSchema, paginate } from '../lib/helpers.js';
import { createEventForTask } from '../services/calendar.js';
import { TaskStatus, TaskPriority } from '@leados/shared';

/** Tasks & Follow-ups (BRD §10.9, §22.1). */
const router = Router();
router.use(requireAuth, requireOrg());

const STATUSES = Object.values(TaskStatus) as [string, ...string[]];
const PRIORITIES = Object.values(TaskPriority) as [string, ...string[]];

const listQuery = paginationSchema.extend({
  status: z.enum(STATUSES).optional(),
  assignedUserId: z.string().optional(),
  leadId: z.string().optional(),
  dealId: z.string().optional(),
  contactId: z.string().optional(),
});

/** GET /api/v1/tasks */
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { page, pageSize, status, assignedUserId, leadId, dealId, contactId } = listQuery.parse(req.query);
    const where: Record<string, unknown> = { organizationId: req.org!.organizationId };
    if (status) where.status = status;
    if (assignedUserId) where.assignedUserId = assignedUserId === 'none' ? null : assignedUserId;
    if (leadId) where.leadId = leadId;
    if (dealId) where.dealId = dealId;
    if (contactId) where.contactId = contactId;

    const [total, tasks] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
        ...paginate(page, pageSize),
        include: { assignedUser: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);
    res.json({ page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), tasks });
  })
);

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assignedUserId: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  status: z.enum(STATUSES).default('OPEN'),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  leadId: z.string().optional(),
  dealId: z.string().optional(),
  contactId: z.string().optional(),
});

/** POST /api/v1/tasks */
router.post(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.parse(req.body);
    const task = await prisma.task.create({
      data: {
        organizationId: req.org!.organizationId,
        title: data.title,
        description: data.description || null,
        assignedUserId: data.assignedUserId || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        status: data.status,
        priority: data.priority,
        leadId: data.leadId || null,
        dealId: data.dealId || null,
        contactId: data.contactId || null,
      },
    });

    // Calendar sync (BRD §15.2): if the task has a due date, create a calendar
    // event. Best-effort — mock mode when calendar isn't connected.
    let calendar: { created: boolean; mode: string } | undefined;
    if (task.dueDate) {
      const r = await createEventForTask({
        organizationId: task.organizationId,
        title: task.title,
        dueDate: task.dueDate,
        description: task.description ?? undefined,
      });
      calendar = { created: r.created, mode: r.mode };
    }

    res.status(201).json({ ...task, calendar });
  })
);

const updateSchema = createSchema.partial();

/** PATCH /api/v1/tasks/:id */
router.patch(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = updateSchema.parse(req.body);
    const existing = await prisma.task.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!existing) throw NotFound('Task not found');
    const task = await prisma.task.update({
      where: { id: existing.id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.assignedUserId !== undefined ? { assignedUserId: data.assignedUserId || null } : {}),
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate ? new Date(data.dueDate) : null } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.leadId !== undefined ? { leadId: data.leadId || null } : {}),
        ...(data.dealId !== undefined ? { dealId: data.dealId || null } : {}),
        ...(data.contactId !== undefined ? { contactId: data.contactId || null } : {}),
      },
    });
    res.json(task);
  })
);

/** DELETE /api/v1/tasks/:id */
router.delete(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.task.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!existing) throw NotFound('Task not found');
    await prisma.task.delete({ where: { id: existing.id } });
    res.status(204).send();
  })
);

export default router;
