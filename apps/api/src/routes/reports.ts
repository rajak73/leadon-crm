import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';
import { cached } from '../lib/cache.js';
import { LEAD_STATUSES, LEAD_SOURCES } from '@leados/shared';

/**
 * Reports / analytics (org-scoped, BRD §24). Supports a date-range window
 * (?days=7|30|90|365 or explicit ?from/&to). Includes a daily trend series for
 * leads created and deals won. Cached briefly to keep free-tier DB load low.
 */
const router = Router();
router.use(requireAuth, requireOrg());

const rangeSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

function resolveRange(q: z.infer<typeof rangeSchema>): { from: Date; to: Date; days: number } {
  const to = q.to ? new Date(q.to) : new Date();
  let from: Date;
  if (q.from) from = new Date(q.from);
  else {
    const days = q.days ?? 30;
    from = new Date(to.getTime() - days * 86400000);
  }
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
  return { from, to, days };
}

/** Build a daily bucketed series (YYYY-MM-DD → count/sum). */
function bucketByDay(dates: Date[], from: Date, to: Date): { label: string; value: number }[] {
  const buckets = new Map<string, number>();
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  // Cap buckets to keep the chart readable.
  const dayCount = Math.min(120, Math.max(1, Math.round((end.getTime() - cur.getTime()) / 86400000) + 1));
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(cur.getTime() + i * 86400000);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const d of dates) {
    const key = new Date(d).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([label, value]) => ({ label: label.slice(5), value })); // MM-DD
}

/** GET /api/v1/reports/overview?days=30 */
router.get(
  '/overview',
  asyncHandler(async (req: AuthedRequest, res) => {
    const orgId = req.org!.organizationId;
    const range = resolveRange(rangeSchema.parse(req.query));
    const cacheKey = `reports:${orgId}:${range.from.toISOString().slice(0, 10)}:${range.to.toISOString().slice(0, 10)}`;

    const data = await cached(cacheKey, 15_000, async () => {
      const dateFilter = { gte: range.from, lte: range.to };
      const [leadsByStatusRaw, leadsBySourceRaw, deals, wonDeals, tasks, doneTasks, leadsTotal, leadsInRange, wonInRange] =
        await Promise.all([
          prisma.lead.groupBy({ by: ['status'], where: { organizationId: orgId }, _count: { _all: true } }),
          prisma.lead.groupBy({ by: ['source'], where: { organizationId: orgId }, _count: { _all: true } }),
          prisma.deal.findMany({ where: { organizationId: orgId }, select: { value: true, status: true } }),
          prisma.deal.findMany({ where: { organizationId: orgId, status: 'WON' }, select: { value: true } }),
          prisma.task.count({ where: { organizationId: orgId } }),
          prisma.task.count({ where: { organizationId: orgId, status: 'DONE' } }),
          prisma.lead.count({ where: { organizationId: orgId } }),
          prisma.lead.findMany({ where: { organizationId: orgId, createdAt: dateFilter }, select: { createdAt: true } }),
          prisma.deal.findMany({ where: { organizationId: orgId, status: 'WON', updatedAt: dateFilter }, select: { updatedAt: true } }),
        ]);

      const statusMap = Object.fromEntries(leadsByStatusRaw.map((r) => [r.status, r._count._all]));
      const leadsByStatus = LEAD_STATUSES.map((s) => ({ label: s.replace(/_/g, ' '), value: statusMap[s] ?? 0 }));
      const sourceMap = Object.fromEntries(leadsBySourceRaw.map((r) => [r.source, r._count._all]));
      const leadsBySource = LEAD_SOURCES.map((s) => ({ label: s, value: sourceMap[s] ?? 0 })).filter((x) => x.value > 0);

      const openValue = deals.filter((d) => d.status === 'OPEN').reduce((s, d) => s + (d.value ?? 0), 0);
      const wonValue = wonDeals.reduce((s, d) => s + (d.value ?? 0), 0);
      const lostValue = deals.filter((d) => d.status === 'LOST').reduce((s, d) => s + (d.value ?? 0), 0);

      const wonLeads = statusMap['WON'] ?? 0;
      const conversionRate = leadsTotal > 0 ? Math.round((wonLeads / leadsTotal) * 100) : 0;
      const taskCompletion = tasks > 0 ? Math.round((doneTasks / tasks) * 100) : 0;

      return {
        range: { from: range.from.toISOString(), to: range.to.toISOString(), days: range.days },
        kpis: {
          totalLeads: leadsTotal,
          leadsInRange: leadsInRange.length,
          wonLeads,
          conversionRate,
          openValue,
          wonValue,
          taskCompletion,
          totalDeals: deals.length,
        },
        leadsByStatus,
        leadsBySource,
        dealValue: [
          { label: 'Open', value: openValue },
          { label: 'Won', value: wonValue },
          { label: 'Lost', value: lostValue },
        ],
        trends: {
          leadsCreated: bucketByDay(leadsInRange.map((l) => l.createdAt), range.from, range.to),
          dealsWon: bucketByDay(wonInRange.map((d) => d.updatedAt), range.from, range.to),
        },
      };
    });
    res.json(data);
  })
);

/** GET /api/v1/reports/export.csv?days=30 — flat CSV of the key metrics. */
router.get(
  '/export.csv',
  asyncHandler(async (req: AuthedRequest, res) => {
    const orgId = req.org!.organizationId;
    const range = resolveRange(rangeSchema.parse(req.query));
    const [leadsByStatus, leadsBySource] = await Promise.all([
      prisma.lead.groupBy({ by: ['status'], where: { organizationId: orgId }, _count: { _all: true } }),
      prisma.lead.groupBy({ by: ['source'], where: { organizationId: orgId }, _count: { _all: true } }),
    ]);
    const lines = ['metric,key,value'];
    for (const r of leadsByStatus) lines.push(`leads_by_status,${r.status},${r._count._all}`);
    for (const r of leadsBySource) lines.push(`leads_by_source,${r.source},${r._count._all}`);
    lines.push(`range,days,${range.days}`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
    res.send(lines.join('\n'));
  })
);

/**
 * GET /api/v1/reports/leaderboard — per-agent performance.
 * For each org member: assigned leads, won leads, conversion %, and open
 * pipeline value from deals they own.
 */
router.get(
  '/leaderboard',
  asyncHandler(async (req: AuthedRequest, res) => {
    const orgId = req.org!.organizationId;
    const data = await cached(`leaderboard:${orgId}`, 15_000, async () => {
      const members = await prisma.organizationMember.findMany({
        where: { organizationId: orgId },
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      });

      const [assignedGroups, wonGroups, deals] = await Promise.all([
        prisma.lead.groupBy({ by: ['assignedUserId'], where: { organizationId: orgId, assignedUserId: { not: null } }, _count: { _all: true } }),
        prisma.lead.groupBy({ by: ['assignedUserId'], where: { organizationId: orgId, assignedUserId: { not: null }, status: 'WON' }, _count: { _all: true } }),
        prisma.deal.findMany({ where: { organizationId: orgId, status: 'OPEN', ownerId: { not: null } }, select: { ownerId: true, value: true } }),
      ]);

      const assignedMap = Object.fromEntries(assignedGroups.map((g) => [g.assignedUserId, g._count._all]));
      const wonMap = Object.fromEntries(wonGroups.map((g) => [g.assignedUserId, g._count._all]));
      const openValueMap: Record<string, number> = {};
      for (const d of deals) if (d.ownerId) openValueMap[d.ownerId] = (openValueMap[d.ownerId] ?? 0) + (d.value ?? 0);

      const rows = members.map((m) => {
        const assigned = assignedMap[m.userId] ?? 0;
        const won = wonMap[m.userId] ?? 0;
        return {
          userId: m.userId,
          name: `${m.user.firstName} ${m.user.lastName}`.trim(),
          email: m.user.email,
          role: m.role,
          assignedLeads: assigned,
          wonLeads: won,
          conversionRate: assigned > 0 ? Math.round((won / assigned) * 100) : 0,
          openPipelineValue: openValueMap[m.userId] ?? 0,
        };
      });

      // Rank: most won, then highest conversion, then most assigned.
      rows.sort((a, b) => b.wonLeads - a.wonLeads || b.conversionRate - a.conversionRate || b.assignedLeads - a.assignedLeads);
      return rows;
    });
    res.json({ leaderboard: data });
  })
);

export default router;
