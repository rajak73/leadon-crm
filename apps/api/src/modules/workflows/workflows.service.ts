import type {
  CreateWorkflowInput,
  PageMeta,
  UpdateWorkflowInput,
  Workflow,
  WorkflowRun,
} from '@leados/shared';
import { notFound } from '../../lib/errors.js';
import { pageMeta } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { toWorkflow, toWorkflowRun, workflowInclude } from '../../lib/serializers.js';

async function stats(ids: string[]) {
  if (!ids.length) return new Map<string, { lastRunAt: Date | null; runCount: number }>();
  const rows = await prisma.workflowRun.groupBy({
    by: ['workflowId'],
    where: { workflowId: { in: ids } },
    _count: { _all: true },
    _max: { startedAt: true },
  });
  return new Map(
    rows.map((r) => [r.workflowId, { lastRunAt: r._max.startedAt, runCount: r._count._all }]),
  );
}

const NO_RUNS = { lastRunAt: null, runCount: 0 };

export async function listWorkflows(): Promise<Workflow[]> {
  const rows = await prisma.workflow.findMany({
    where: { deletedAt: null },
    include: workflowInclude,
    orderBy: { createdAt: 'desc' },
  });
  const s = await stats(rows.map((r) => r.id));
  return rows.map((w) => toWorkflow(w, s.get(w.id) ?? NO_RUNS));
}

export async function getWorkflow(id: string): Promise<Workflow> {
  const w = await prisma.workflow.findFirst({
    where: { id, deletedAt: null },
    include: workflowInclude,
  });
  if (!w) throw notFound('workflow');
  return toWorkflow(w, (await stats([id])).get(id) ?? NO_RUNS);
}

export async function createWorkflow(
  userId: string,
  input: CreateWorkflowInput,
): Promise<Workflow> {
  const w = await prisma.workflow.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      isActive: input.isActive,
      triggerType: input.definition.trigger.type,
      definition: input.definition as object,
      createdById: userId,
    },
  });
  return getWorkflow(w.id);
}

export async function updateWorkflow(id: string, input: UpdateWorkflowInput): Promise<Workflow> {
  await getWorkflow(id);
  await prisma.workflow.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      isActive: input.isActive,
      ...(input.definition
        ? { definition: input.definition as object, triggerType: input.definition.trigger.type }
        : {}),
    },
  });
  return getWorkflow(id);
}

export async function deleteWorkflow(id: string): Promise<void> {
  const r = await prisma.workflow.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  });
  if (r.count === 0) throw notFound('workflow');
}

export async function listRuns(
  id: string,
  page: number,
  limit: number,
): Promise<{ data: WorkflowRun[]; meta: PageMeta }> {
  await getWorkflow(id);
  const [rows, total] = await Promise.all([
    prisma.workflowRun.findMany({
      where: { workflowId: id },
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.workflowRun.count({ where: { workflowId: id } }),
  ]);
  return { data: rows.map(toWorkflowRun), meta: pageMeta(page, limit, total) };
}
