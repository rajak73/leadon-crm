import type { Prisma } from '@prisma/client';
import type {
  CreatePipelineInput,
  Pipeline,
  PipelineBoard,
  StageInput,
  UpdatePipelineInput,
} from '@leados/shared';
import { conflict, fieldError, notFound } from '../../lib/errors.js';
import { lockTx, prisma, type Tx } from '../../lib/prisma.js';
import { dealInclude, toDeal } from '../../lib/serializers.js';

export const DEFAULT_STAGES: StageInput[] = [
  { name: 'New', color: '#57534E', probability: 10, isWon: false, isLost: false },
  { name: 'Contacted', color: '#0EA5E9', probability: 25, isWon: false, isLost: false },
  { name: 'Proposal', color: '#F59E0B', probability: 50, isWon: false, isLost: false },
  { name: 'Negotiation', color: '#F97316', probability: 75, isWon: false, isLost: false },
  { name: 'Won', color: '#22C55E', probability: 100, isWon: true, isLost: false },
  { name: 'Lost', color: '#EF4444', probability: 0, isWon: false, isLost: true },
];

const CLOSED_VISIBLE_DAYS = 30;

const stageData = (s: StageInput, order: number) => ({
  name: s.name,
  order,
  color: s.color ?? null,
  probability: s.probability ?? null,
  isWon: s.isWon,
  isLost: s.isLost,
});

export async function createDefaultPipeline(tx: Tx): Promise<string> {
  const pipeline = await tx.pipeline.create({
    data: {
      name: 'Sales pipeline',
      isDefault: true,
      stages: { create: DEFAULT_STAGES.map(stageData) },
    },
  });
  return pipeline.id;
}

const pipelineInclude = {
  stages: { orderBy: { order: 'asc' } },
} as const satisfies Prisma.PipelineInclude;
type PipelineRow = Prisma.PipelineGetPayload<{ include: typeof pipelineInclude }>;

/** Deals that appear on the board: open ones plus those closed recently. */
const boardDealsWhere = (): Prisma.DealWhereInput => ({
  deletedAt: null,
  OR: [
    { status: 'OPEN' },
    { closedAt: { gte: new Date(Date.now() - CLOSED_VISIBLE_DAYS * 24 * 60 * 60 * 1000) } },
  ],
});

async function withStats(pipelines: PipelineRow[]): Promise<Pipeline[]> {
  const ids = pipelines.map((p) => p.id);
  const stats = ids.length
    ? await prisma.deal.groupBy({
        by: ['stageId'],
        where: { ...boardDealsWhere(), pipelineId: { in: ids } },
        _count: { _all: true },
        _sum: { value: true },
      })
    : [];
  const byStage = new Map(stats.map((s) => [s.stageId, s]));
  return pipelines.map((p) => ({
    id: p.id,
    name: p.name,
    isDefault: p.isDefault,
    createdAt: p.createdAt.toISOString(),
    stages: p.stages.map((s) => ({
      id: s.id,
      name: s.name,
      order: s.order,
      color: s.color,
      probability: s.probability,
      isWon: s.isWon,
      isLost: s.isLost,
      dealCount: byStage.get(s.id)?._count._all ?? 0,
      totalValue: byStage.get(s.id)?._sum.value ?? 0,
    })),
  }));
}

export async function listPipelines(): Promise<Pipeline[]> {
  const rows = await prisma.pipeline.findMany({
    include: pipelineInclude,
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  return withStats(rows);
}

async function getPipelineRow(id: string): Promise<PipelineRow> {
  const row = await prisma.pipeline.findUnique({ where: { id }, include: pipelineInclude });
  if (!row) throw notFound('pipeline');
  return row;
}

export async function getPipeline(id: string): Promise<Pipeline> {
  return (await withStats([await getPipelineRow(id)]))[0]!;
}

export async function getBoard(id: string): Promise<PipelineBoard> {
  const pipeline = await getPipeline(id);
  const deals = await prisma.deal.findMany({
    where: { ...boardDealsWhere(), pipelineId: id },
    include: dealInclude,
    orderBy: { updatedAt: 'desc' },
  });
  return { pipeline, deals: deals.map((d) => toDeal(d)) };
}

export async function createPipeline(input: CreatePipelineInput): Promise<Pipeline> {
  const id = await prisma.$transaction(async (tx) => {
    await lockTx(tx, 'pipelines'); // keeps exactly one default pipeline
    const isFirst = (await tx.pipeline.count()) === 0;
    const isDefault = input.isDefault || isFirst;
    if (isDefault)
      await tx.pipeline.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    const p = await tx.pipeline.create({
      data: { name: input.name, isDefault, stages: { create: input.stages.map(stageData) } },
    });
    return p.id;
  });
  return getPipeline(id);
}

export async function updatePipeline(id: string, input: UpdatePipelineInput): Promise<Pipeline> {
  const current = await getPipelineRow(id);
  if (input.isDefault === false && current.isDefault) {
    throw fieldError('isDefault', 'Make another pipeline the default instead');
  }

  await prisma.$transaction(async (tx) => {
    await lockTx(tx, 'pipelines');
    if (input.isDefault)
      await tx.pipeline.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    await tx.pipeline.update({
      where: { id },
      data: { name: input.name, isDefault: input.isDefault },
    });
    if (input.stages) await replaceStages(tx, current, input.stages);
  });
  return getPipeline(id);
}

/** Full replace of the ordered stage list. Stages omitted are deleted, but only if no deals use them. */
async function replaceStages(tx: Tx, current: PipelineRow, stages: StageInput[]): Promise<void> {
  const currentIds = new Set(current.stages.map((s) => s.id));
  stages.forEach((s, i) => {
    if (s.id && !currentIds.has(s.id))
      throw fieldError(`stages.${i}.id`, "This stage doesn't belong to this pipeline");
  });
  const keptIds = new Set(stages.map((s) => s.id).filter(Boolean));
  const removed = current.stages.filter((s) => !keptIds.has(s.id));

  for (const stage of removed) {
    const activeDeals = await tx.deal.count({ where: { stageId: stage.id, deletedAt: null } });
    if (activeDeals > 0) {
      throw conflict(
        `The "${stage.name}" stage still has ${activeDeals} deal${activeDeals === 1 ? '' : 's'}. Move them to another stage before removing it.`,
      );
    }
  }

  const results: Array<{ id: string; isWon: boolean; isLost: boolean }> = [];
  for (const [i, s] of stages.entries()) {
    if (s.id) {
      await tx.pipelineStage.update({ where: { id: s.id }, data: stageData(s, i) });
      results.push({ id: s.id, isWon: s.isWon, isLost: s.isLost });
    } else {
      const created = await tx.pipelineStage.create({
        data: { ...stageData(s, i), pipelineId: current.id },
      });
      results.push({ id: created.id, isWon: s.isWon, isLost: s.isLost });
    }
  }

  if (removed.length) {
    // Soft-deleted deals still reference removed stages; park them on the first stage.
    const fallback = results[0]!.id;
    const removedIds = removed.map((s) => s.id);
    await tx.deal.updateMany({
      where: { stageId: { in: removedIds } },
      data: { stageId: fallback },
    });
    await tx.pipelineStage.deleteMany({ where: { id: { in: removedIds } } });
  }

  // Keep deal status consistent if a stage's Won/Lost flag changed.
  const now = new Date();
  const won = results.filter((r) => r.isWon).map((r) => r.id);
  const lost = results.filter((r) => r.isLost).map((r) => r.id);
  const open = results.filter((r) => !r.isWon && !r.isLost).map((r) => r.id);
  await tx.deal.updateMany({
    where: { stageId: { in: won }, status: { not: 'WON' } },
    data: { status: 'WON', closedAt: now },
  });
  await tx.deal.updateMany({
    where: { stageId: { in: lost }, status: { not: 'LOST' } },
    data: { status: 'LOST', closedAt: now },
  });
  await tx.deal.updateMany({
    where: { stageId: { in: open }, status: { not: 'OPEN' } },
    data: { status: 'OPEN', closedAt: null, lostReason: null },
  });
}

export async function deletePipeline(id: string): Promise<void> {
  const pipeline = await getPipelineRow(id);
  if (pipeline.isDefault)
    throw conflict(
      "You can't delete the default pipeline. Make another pipeline the default first.",
    );
  if ((await prisma.pipeline.count()) <= 1) throw conflict("You can't delete your only pipeline.");
  const deals = await prisma.deal.count({ where: { pipelineId: id, deletedAt: null } });
  if (deals > 0)
    throw conflict(
      `This pipeline still has ${deals} deal${deals === 1 ? '' : 's'}. Move or delete them first.`,
    );
  await prisma.$transaction([
    prisma.deal.deleteMany({ where: { pipelineId: id } }), // only soft-deleted deals remain
    prisma.pipeline.delete({ where: { id } }),
  ]);
}

/** The pipeline used when none is specified (default flag, else the oldest). */
export async function getDefaultPipelineId(db: Tx = prisma): Promise<string | null> {
  const p = await db.pipeline.findFirst({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  return p?.id ?? null;
}
