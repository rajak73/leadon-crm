import type { AnalyticsQuery, DashboardSummary, LeadSource, LeadStatus } from '@leados/shared';
import { LEAD_SOURCES, LEAD_STATUSES } from '@leados/shared';
import { prisma } from '../../lib/prisma.js';
import { toUserRef, userRefSelect } from '../../lib/serializers.js';
import { addDays, dateKeyIn, startOfDayIn } from '../../lib/time.js';
import { getDefaultPipelineId } from '../pipelines/index.js';
import { getSettings } from '../settings/index.js';

const RANGE_DAYS: Record<AnalyticsQuery['range'], number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '365d': 365,
};

/** Dashboard numbers. Soft-deleted records are always excluded; values only count the default currency. */
export async function getDashboard(
  range: AnalyticsQuery['range'],
  now = new Date(),
): Promise<DashboardSummary> {
  const { timezone, defaultCurrency: currency } = await getSettings();
  const days = RANGE_DAYS[range];
  // Current period: the last `days` calendar days (incl. today) in the settings time zone.
  const start = startOfDayIn(addDays(now, -(days - 1)), timezone);
  const prevStart = startOfDayIn(addDays(start, -days + 0.5), timezone);
  const period = { gte: start, lte: now };
  const prevPeriod = { gte: prevStart, lt: start };
  const lead = { deletedAt: null };
  const deal = { deletedAt: null };

  const conversion = async (createdAt: { gte: Date; lt?: Date; lte?: Date }) => {
    const [won, lost] = await Promise.all([
      prisma.lead.count({ where: { ...lead, createdAt, status: 'WON' } }),
      prisma.lead.count({ where: { ...lead, createdAt, status: 'LOST' } }),
    ]);
    return won + lost === 0 ? 0 : won / (won + lost);
  };
  const wonValue = async (closedAt: { gte: Date; lt?: Date; lte?: Date }) =>
    (
      await prisma.deal.aggregate({
        where: { ...deal, status: 'WON', currency, closedAt },
        _sum: { value: true },
      })
    )._sum.value ?? 0;

  const [
    newLeads,
    prevLeads,
    convRate,
    prevConvRate,
    openValue,
    won,
    prevWon,
    openTasks,
    overdueTasks,
  ] = await Promise.all([
    prisma.lead.count({ where: { ...lead, createdAt: period } }),
    prisma.lead.count({ where: { ...lead, createdAt: prevPeriod } }),
    conversion(period),
    conversion(prevPeriod),
    prisma.deal.aggregate({ where: { ...deal, status: 'OPEN', currency }, _sum: { value: true } }),
    wonValue(period),
    wonValue(prevPeriod),
    prisma.task.count({ where: { deletedAt: null, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
    prisma.task.count({
      where: { deletedAt: null, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { lt: now } },
    }),
  ]);

  // Leads over time, zero-filled per day.
  const created = await prisma.lead.findMany({
    where: { ...lead, createdAt: period },
    select: { createdAt: true },
  });
  const perDay = new Map<string, number>();
  for (let i = 0; i < days; i++) perDay.set(dateKeyIn(addDays(start, i + 0.5), timezone), 0);
  for (const l of created) {
    const key = dateKeyIn(l.createdAt, timezone);
    if (perDay.has(key)) perDay.set(key, perDay.get(key)! + 1);
  }

  const [byStatus, bySource] = await Promise.all([
    prisma.lead.groupBy({
      by: ['status'],
      where: { ...lead, createdAt: period },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ['source'],
      where: { ...lead, createdAt: period },
      _count: { _all: true },
    }),
  ]);
  const statusCount = new Map(byStatus.map((r) => [r.status, r._count._all]));
  const sourceCount = new Map(bySource.map((r) => [r.source, r._count._all]));

  // Default pipeline: open deals per stage, plus deals closed in this period for Won/Lost stages.
  const pipelineId = await getDefaultPipelineId();
  let pipelineByStage: DashboardSummary['pipelineByStage'] = [];
  if (pipelineId) {
    const stages = await prisma.pipelineStage.findMany({
      where: { pipelineId },
      orderBy: { order: 'asc' },
    });
    const dealWhere = { ...deal, pipelineId, OR: [{ status: 'OPEN' }, { closedAt: period }] };
    const [counts, values] = await Promise.all([
      prisma.deal.groupBy({ by: ['stageId'], where: dealWhere, _count: { _all: true } }),
      prisma.deal.groupBy({
        by: ['stageId'],
        where: { ...dealWhere, currency },
        _sum: { value: true },
      }),
    ]);
    const c = new Map(counts.map((r) => [r.stageId, r._count._all]));
    const v = new Map(values.map((r) => [r.stageId, r._sum.value ?? 0]));
    pipelineByStage = stages.map((s) => ({
      stageId: s.id,
      stageName: s.name,
      color: s.color,
      count: c.get(s.id) ?? 0,
      value: v.get(s.id) ?? 0,
    }));
  }

  const performers = await prisma.deal.groupBy({
    by: ['assignedToId'],
    where: { ...deal, status: 'WON', closedAt: period, assignedToId: { not: null } },
    _count: { _all: true },
    _sum: { value: true },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: performers.map((p) => p.assignedToId!) } },
    select: userRefSelect,
  });
  const userById = new Map(users.map((u) => [u.id, u]));
  // Won value only counts the default currency; count includes all.
  const perfValues = await prisma.deal.groupBy({
    by: ['assignedToId'],
    where: { ...deal, status: 'WON', closedAt: period, assignedToId: { not: null }, currency },
    _sum: { value: true },
  });
  const valueByUser = new Map(perfValues.map((p) => [p.assignedToId, p._sum.value ?? 0]));
  const topPerformers = performers
    .filter((p) => userById.has(p.assignedToId!))
    .map((p) => ({
      user: toUserRef(userById.get(p.assignedToId!)!),
      wonCount: p._count._all,
      wonValue: valueByUser.get(p.assignedToId) ?? 0,
    }))
    .sort((a, b) => b.wonValue - a.wonValue || b.wonCount - a.wonCount)
    .slice(0, 5);

  return {
    range,
    currency,
    kpis: {
      newLeads: { value: newLeads, previous: prevLeads },
      conversionRate: { value: convRate, previous: prevConvRate },
      openPipelineValue: { value: openValue._sum.value ?? 0 },
      wonValue: { value: won, previous: prevWon },
      openTasks: { value: openTasks, overdue: overdueTasks },
    },
    leadsOverTime: [...perDay].map(([date, count]) => ({ date, count })),
    leadsByStatus: LEAD_STATUSES.map((status: LeadStatus) => ({
      status,
      count: statusCount.get(status) ?? 0,
    })),
    leadsBySource: LEAD_SOURCES.map((source: LeadSource) => ({
      source,
      count: sourceCount.get(source) ?? 0,
    })).filter((s) => s.count > 0),
    pipelineByStage,
    topPerformers,
  };
}
