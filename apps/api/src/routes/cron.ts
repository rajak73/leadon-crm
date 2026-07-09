import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { asyncHandler } from '../middleware/error.js';
import { Unauthorized } from '../lib/errors.js';
import { drainQueues } from '../services/queue.js';

/**
 * Protected cron endpoint (BRD §14.2). cron-job.org calls this every 5 minutes
 * with `Authorization: Bearer <CRON_SECRET>` to drain the queue in free mode.
 */
const router = Router();

function requireCronSecret(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || token !== config.cronSecret) {
    return next(Unauthorized('Invalid cron secret'));
  }
  return next();
}

/** POST /api/internal/cron/drain-queues */
router.post(
  '/drain-queues',
  requireCronSecret,
  asyncHandler(async (_req, res) => {
    const summary = await drainQueues();
    res.json({ ok: true, ...summary, at: new Date().toISOString() });
  })
);

export default router;
