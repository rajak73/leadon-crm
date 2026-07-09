import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';
import { NotFound } from '../lib/errors.js';
import { parseJson } from '../lib/helpers.js';

/**
 * Saved views — personal filter presets for list pages (e.g. Leads). Scoped by
 * org + user (BRD §20). Filters are stored as a safe JSON object.
 */
const router = Router();
router.use(requireAuth, requireOrg());

/** GET /api/v1/saved-views?resource=LEADS */
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const resource = (req.query.resource as string) || 'LEADS';
    const views = await prisma.savedView.findMany({
      where: { organizationId: req.org!.organizationId, userId: req.auth!.userId, resource },
      orderBy: { createdAt: 'asc' },
    });
    res.json(views.map((v) => ({ id: v.id, name: v.name, resource: v.resource, filters: parseJson(v.filters) })));
  })
);

const createSchema = z.object({
  name: z.string().min(1).max(60),
  resource: z.string().default('LEADS'),
  filters: z.record(z.any()),
});

/** POST /api/v1/saved-views */
router.post(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.parse(req.body);
    const view = await prisma.savedView.create({
      data: {
        organizationId: req.org!.organizationId,
        userId: req.auth!.userId,
        name: data.name,
        resource: data.resource,
        filters: JSON.stringify(data.filters),
      },
    });
    res.status(201).json({ id: view.id, name: view.name, resource: view.resource, filters: data.filters });
  })
);

/** DELETE /api/v1/saved-views/:id */
router.delete(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const view = await prisma.savedView.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId, userId: req.auth!.userId },
    });
    if (!view) throw NotFound('Saved view not found');
    await prisma.savedView.delete({ where: { id: view.id } });
    res.status(204).send();
  })
);

export default router;
