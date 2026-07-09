import { Router } from 'express';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';
import { NotFound } from '../lib/errors.js';

/** In-app notification center. Org-scoped; includes org-wide + user-targeted. */
const router = Router();
router.use(requireAuth, requireOrg());

function scope(req: AuthedRequest) {
  // A member sees org-wide notifications (userId null) plus ones targeted to them.
  return {
    organizationId: req.org!.organizationId,
    OR: [{ userId: null }, { userId: req.auth!.userId }],
  };
}

/** GET /api/v1/notifications — latest notifications (capped). */
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const items = await prisma.notification.findMany({
      where: scope(req),
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(items);
  })
);

/** GET /api/v1/notifications/unread-count */
router.get(
  '/unread-count',
  asyncHandler(async (req: AuthedRequest, res) => {
    const count = await prisma.notification.count({ where: { ...scope(req), isRead: false } });
    res.json({ count });
  })
);

/** POST /api/v1/notifications/:id/read */
router.post(
  '/:id/read',
  asyncHandler(async (req: AuthedRequest, res) => {
    const n = await prisma.notification.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!n) throw NotFound('Notification not found');
    await prisma.notification.update({ where: { id: n.id }, data: { isRead: true } });
    res.json({ ok: true });
  })
);

/** POST /api/v1/notifications/read-all */
router.post(
  '/read-all',
  asyncHandler(async (req: AuthedRequest, res) => {
    await prisma.notification.updateMany({ where: { ...scope(req), isRead: false }, data: { isRead: true } });
    res.json({ ok: true });
  })
);

export default router;
