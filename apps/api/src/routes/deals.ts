import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';
import { logActivity } from '../lib/helpers.js';
import { auditFromReq } from '../services/audit.js';

/** Deals & Pipeline (BRD §10.8, §22.1). */
const router = Router();
router.use(requireAuth, requireOrg());

/**
 * GET /api/v1/deals/pipeline
 * Kanban board: default pipeline stages, each with its deals + stage totals.
 */
router.get(
  '/pipeline',
  asyncHandler(async (req: AuthedRequest, res) => {
    const orgId = req.org!.organizationId;
    const pipeline = await prisma.pipeline.findFirst({
      where: { organizationId: orgId, isDefault: true },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    if (!pipeline) throw NotFound('No default pipeline found');

    // Cap deals loaded for the board so a huge pipeline can't OOM the free
    // instance; the most recent 500 are shown per pipeline (BRD §19.2).
    const deals = await prisma.deal.findMany({
      where: { organizationId: orgId, pipelineId: pipeline.id },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        lead: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });

    const columns = pipeline.stages.map((stage) => {
      const stageDeals = deals.filter((d) => d.stageId === stage.id);
      return {
        stage: { id: stage.id, key: stage.key, name: stage.name, order: stage.order, probability: stage.probability },
        deals: stageDeals,
        totalValue: stageDeals.reduce((sum, d) => sum + (d.value ?? 0), 0),
        count: stageDeals.length,
      };
    });

    res.json({
      pipeline: { id: pipeline.id, name: pipeline.name },
      columns,
      totalPipelineValue: deals.reduce((s, d) => s + (d.value ?? 0), 0),
    });
  })
);

/** GET /api/v1/deals */
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const deals = await prisma.deal.findMany({
      where: { organizationId: req.org!.organizationId },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        stage: true,
        owner: { select: { id: true, firstName: true, lastName: true } },
        lead: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } },
      },
    });
    res.json(deals);
  })
);

const createSchema = z.object({
  title: z.string().min(1),
  value: z.number().min(0).default(0),
  stageId: z.string().optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().datetime().optional(),
  ownerId: z.string().optional(),
  leadId: z.string().optional(),
  contactId: z.string().optional(),
  notes: z.string().optional(),
});

/** POST /api/v1/deals */
router.post(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.parse(req.body);
    const orgId = req.org!.organizationId;

    const pipeline = await prisma.pipeline.findFirst({
      where: { organizationId: orgId, isDefault: true },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    if (!pipeline) throw NotFound('No default pipeline found');

    // Default to first stage if not provided; validate stage belongs to pipeline.
    let stageId = data.stageId ?? pipeline.stages[0]?.id;
    const stage = pipeline.stages.find((s) => s.id === stageId);
    if (!stage) throw BadRequest('Invalid stageId for this pipeline');

    const deal = await prisma.deal.create({
      data: {
        organizationId: orgId,
        title: data.title,
        value: data.value,
        probability: data.probability ?? stage.probability,
        expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
        ownerId: data.ownerId || null,
        pipelineId: pipeline.id,
        stageId: stage.id,
        leadId: data.leadId || null,
        contactId: data.contactId || null,
        notes: data.notes || null,
        status: stage.key === 'WON' ? 'WON' : stage.key === 'LOST' ? 'LOST' : 'OPEN',
      },
    });
    await logActivity({
      organizationId: orgId,
      actorUserId: req.auth!.userId,
      type: 'DEAL_CREATED',
      message: `Deal "${deal.title}" created`,
      leadId: deal.leadId,
      contactId: deal.contactId,
    });
    res.status(201).json(deal);
  })
);

// ---- CSV export + bulk (declared before /:id routes) ----

/** GET /api/v1/deals/export.csv */
router.get(
  '/export.csv',
  asyncHandler(async (req: AuthedRequest, res) => {
    const deals = await prisma.deal.findMany({
      where: { organizationId: req.org!.organizationId },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
      include: { stage: true },
    });
    const header = ['title', 'value', 'stage', 'status', 'probability', 'expectedCloseDate', 'createdAt'];
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = deals.map((d) =>
      [d.title, d.value, d.stage?.name ?? '', d.status, d.probability, d.expectedCloseDate?.toISOString() ?? '', d.createdAt.toISOString()].map(esc).join(',')
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="deals.csv"');
    res.send([header.join(','), ...rows].join('\n'));
  })
);

const dealBulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  action: z.enum(['SET_STAGE', 'DELETE']),
  stageId: z.string().optional(),
});

/** POST /api/v1/deals/bulk — bulk set stage or delete. */
router.post(
  '/bulk',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = dealBulkSchema.parse(req.body);
    const orgId = req.org!.organizationId;
    const owned = await prisma.deal.findMany({ where: { id: { in: data.ids }, organizationId: orgId }, select: { id: true } });
    const ids = owned.map((d) => d.id);
    if (ids.length === 0) throw NotFound('No matching deals');

    let affected = 0;
    if (data.action === 'SET_STAGE') {
      if (!data.stageId) throw BadRequest('stageId required');
      const stage = await prisma.pipelineStage.findFirst({ where: { id: data.stageId, pipeline: { organizationId: orgId } } });
      if (!stage) throw BadRequest('Invalid stageId');
      affected = (await prisma.deal.updateMany({
        where: { id: { in: ids }, organizationId: orgId },
        data: { stageId: stage.id, probability: stage.probability, status: stage.key === 'WON' ? 'WON' : stage.key === 'LOST' ? 'LOST' : 'OPEN' },
      })).count;
      await auditFromReq(req, 'DEAL_BULK_STAGE', { entityType: 'Deal', metadata: { count: affected, stage: stage.name } });
    } else if (data.action === 'DELETE') {
      affected = (await prisma.deal.deleteMany({ where: { id: { in: ids }, organizationId: orgId } })).count;
      await auditFromReq(req, 'DEAL_BULK_DELETE', { entityType: 'Deal', metadata: { count: affected } });
    }
    res.json({ affected });
  })
);

const moveSchema = z.object({ stageId: z.string() });

/**
 * PATCH /api/v1/deals/:id/stage
 * Move a deal to another stage (BRD §10.8 drag/change stage). Recomputes
 * probability + status from the target stage.
 */
router.patch(
  '/:id/stage',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { stageId } = moveSchema.parse(req.body);
    const orgId = req.org!.organizationId;

    const deal = await prisma.deal.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!deal) throw NotFound('Deal not found');

    const stage = await prisma.pipelineStage.findFirst({
      where: { id: stageId, pipeline: { organizationId: orgId } },
    });
    if (!stage) throw BadRequest('Invalid stageId');

    const updated = await prisma.deal.update({
      where: { id: deal.id },
      data: {
        stageId: stage.id,
        probability: stage.probability,
        status: stage.key === 'WON' ? 'WON' : stage.key === 'LOST' ? 'LOST' : 'OPEN',
      },
    });
    await logActivity({
      organizationId: orgId,
      actorUserId: req.auth!.userId,
      type: 'DEAL_STAGE_CHANGED',
      message: `Deal "${updated.title}" moved to ${stage.name}`,
      leadId: updated.leadId,
      contactId: updated.contactId,
    });
    res.json(updated);
  })
);

const updateSchema = createSchema.partial();

/** GET /api/v1/deals/:id — single deal with related records + activity. */
router.get(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const orgId = req.org!.organizationId;
    const deal = await prisma.deal.findFirst({
      where: { id: req.params.id, organizationId: orgId },
      include: {
        stage: true,
        pipeline: { include: { stages: { orderBy: { order: 'asc' } } } },
        owner: { select: { id: true, firstName: true, lastName: true } },
        lead: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } },
        tasks: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!deal) throw NotFound('Deal not found');
    // Related activity from the deal's lead/contact (if any).
    const orFilters: Record<string, string>[] = [];
    if (deal.leadId) orFilters.push({ leadId: deal.leadId });
    if (deal.contactId) orFilters.push({ contactId: deal.contactId });
    const activities = orFilters.length
      ? await prisma.activity.findMany({ where: { organizationId: orgId, OR: orFilters }, orderBy: { createdAt: 'desc' }, take: 50 })
      : [];
    res.json({ ...deal, activities });
  })
);

/** PATCH /api/v1/deals/:id */
router.patch(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = updateSchema.parse(req.body);
    const existing = await prisma.deal.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!existing) throw NotFound('Deal not found');
    const deal = await prisma.deal.update({
      where: { id: existing.id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.value !== undefined ? { value: data.value } : {}),
        ...(data.probability !== undefined ? { probability: data.probability } : {}),
        ...(data.expectedCloseDate !== undefined
          ? { expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null }
          : {}),
        ...(data.ownerId !== undefined ? { ownerId: data.ownerId || null } : {}),
        ...(data.leadId !== undefined ? { leadId: data.leadId || null } : {}),
        ...(data.contactId !== undefined ? { contactId: data.contactId || null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      },
    });
    res.json(deal);
  })
);

/** DELETE /api/v1/deals/:id */
router.delete(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.deal.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!existing) throw NotFound('Deal not found');
    await prisma.deal.delete({ where: { id: existing.id } });
    await auditFromReq(req, 'DEAL_DELETED', { entityType: 'Deal', entityId: existing.id, metadata: { title: existing.title, value: existing.value } });
    res.status(204).send();
  })
);

export default router;
