import { Router } from 'express';
import { timelineQuerySchema } from '@leados/shared';
import { ok, query } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { activityInclude, toActivity } from '../../lib/serializers.js';

export const activitiesRouter = Router();

/** Timeline for one record, or the company-wide feed when no record is given. Newest first. */
activitiesRouter.get('/', async (req, res) => {
  const q = query(timelineQuerySchema, req);
  const rows = await prisma.activity.findMany({
    where: {
      ...(q.leadId ? { relatedLeadId: q.leadId } : {}),
      ...(q.contactId ? { relatedContactId: q.contactId } : {}),
      ...(q.dealId ? { relatedDealId: q.dealId } : {}),
      ...(q.before ? { createdAt: { lt: q.before } } : {}),
    },
    include: activityInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: q.limit,
  });
  ok(res, rows.map(toActivity));
});
