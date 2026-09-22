import type { Prisma, Workflow as WorkflowRow } from '@prisma/client';
import {
  workflowDefinitionSchema,
  type WorkflowAction,
  type WorkflowActionLog,
  type WorkflowDefinition,
  type WorkflowTrigger,
} from '@leados/shared';
import type { Actor } from '../../lib/auth.js';
import { type DomainEvent, type EventType, on } from '../../lib/events.js';
import { AppError } from '../../lib/errors.js';
import { LEAD_STATUS_LABEL } from '../../lib/labels.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { withLock } from '../../lib/lock.js';
import { enqueue } from '../../lib/queue.js';
import { safePost, type SafePostOptions } from '../../lib/safe-fetch.js';
import { asTags } from '../../lib/serializers.js';
import { scoreLead } from '../ai/index.js';
import { addLeadTag, updateLead } from '../leads/index.js';
import { notify } from '../notifications/index.js';
import { createTask } from '../tasks/index.js';
import { evaluateConditions } from './workflows.evaluator.js';

/** Runs at this automation depth or deeper are recorded as SKIPPED (loop guard). */
export const MAX_DEPTH = 3;

const TRIGGER_FOR_EVENT: Partial<Record<EventType, WorkflowTrigger>> = {
  'lead.created': 'LEAD_CREATED',
  'lead.status_changed': 'LEAD_STATUS_CHANGED',
  'lead.scored': 'LEAD_SCORED',
  'deal.created': 'DEAL_CREATED',
  'deal.stage_moved': 'DEAL_STAGE_MOVED',
  'deal.won': 'DEAL_WON',
  'deal.lost': 'DEAL_LOST',
  'task.completed': 'TASK_COMPLETED',
};

type EntityKind = 'lead' | 'deal' | 'task';

interface Snapshot {
  kind: EntityKind;
  id: string;
  leadId: string | null; // lead the lead-actions apply to
  dealId: string | null;
  contactId: string | null;
  ownerId: string | null;
  fields: Record<string, unknown>;
}

function entityOf(event: DomainEvent): { kind: EntityKind; id: string } | null {
  switch (event.type) {
    case 'lead.created':
    case 'lead.status_changed':
    case 'lead.scored':
      return { kind: 'lead', id: event.leadId };
    case 'deal.created':
    case 'deal.stage_moved':
    case 'deal.won':
    case 'deal.lost':
      return { kind: 'deal', id: event.dealId };
    case 'task.completed':
      return { kind: 'task', id: event.taskId };
    default:
      return null;
  }
}

/** Event fields that `trigger.config` keys are compared against. */
function triggerPayload(event: DomainEvent): Record<string, unknown> {
  switch (event.type) {
    case 'lead.status_changed':
      return { fromStatus: event.fromStatus, toStatus: event.toStatus };
    case 'lead.scored':
      return { score: event.score };
    case 'deal.created':
    case 'deal.won':
    case 'deal.lost':
      return { pipelineId: event.pipelineId, stageId: event.stageId };
    case 'deal.stage_moved':
      return {
        pipelineId: event.pipelineId,
        fromStageId: event.fromStageId,
        stageId: event.stageId,
        toStageId: event.stageId,
      };
    default:
      return {};
  }
}

export function matchesTriggerConfig(
  config: Record<string, string | number | boolean>,
  event: DomainEvent,
): boolean {
  const payload = triggerPayload(event);
  return Object.entries(config).every(([key, expected]) => {
    if (expected === '' || expected === null) return true;
    if (key === 'minScore')
      return typeof payload.score === 'number' && payload.score >= Number(expected);
    if (key === 'maxScore')
      return typeof payload.score === 'number' && payload.score <= Number(expected);
    if (!(key in payload)) return true; // unknown keys don't block the trigger
    return String(payload[key]) === String(expected);
  });
}

async function loadSnapshot(kind: EntityKind, id: string): Promise<Snapshot | null> {
  if (kind === 'lead') {
    const l = await prisma.lead.findFirst({ where: { id, deletedAt: null } });
    if (!l) return null;
    return {
      kind,
      id,
      leadId: l.id,
      dealId: null,
      contactId: l.convertedToContactId,
      ownerId: l.assignedToId,
      fields: {
        id: l.id,
        firstName: l.firstName,
        lastName: l.lastName,
        email: l.email,
        phone: l.phone,
        company: l.company,
        source: l.source,
        status: l.status,
        tags: asTags(l.tags),
        aiScore: l.aiScore,
        assignedToId: l.assignedToId,
      },
    };
  }
  if (kind === 'deal') {
    const d = await prisma.deal.findFirst({
      where: { id, deletedAt: null },
      include: { stage: true, pipeline: true },
    });
    if (!d) return null;
    return {
      kind,
      id,
      leadId: d.leadId,
      dealId: d.id,
      contactId: d.contactId,
      ownerId: d.assignedToId,
      fields: {
        id: d.id,
        title: d.title,
        value: d.value,
        currency: d.currency,
        status: d.status,
        stageId: d.stageId,
        stageName: d.stage.name,
        pipelineId: d.pipelineId,
        pipelineName: d.pipeline.name,
        leadId: d.leadId,
        contactId: d.contactId,
        assignedToId: d.assignedToId,
      },
    };
  }
  const t = await prisma.task.findFirst({ where: { id, deletedAt: null } });
  if (!t) return null;
  return {
    kind,
    id,
    leadId: t.relatedLeadId,
    dealId: t.relatedDealId,
    contactId: t.relatedContactId,
    ownerId: t.assignedToId,
    fields: {
      id: t.id,
      title: t.title,
      type: t.type,
      priority: t.priority,
      status: t.status,
      assignedToId: t.assignedToId,
      relatedLeadId: t.relatedLeadId,
      relatedContactId: t.relatedContactId,
      relatedDealId: t.relatedDealId,
    },
  };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

class SkipAction extends Error {}

interface ActionContext {
  workflow: WorkflowRow;
  runId: string;
  trigger: WorkflowTrigger;
  snapshot: Snapshot;
  actor: Actor; // automation actor with depth + 1
}

/** Round-robin pointer per workflow (in memory; restarts begin again with the first user). */
const roundRobin = new Map<string, number>();

/** Test seam for outbound webhooks (e.g. a fake resolver). */
export const webhookOptions: SafePostOptions = {};

const requireLead = (ctx: ActionContext) => {
  if (!ctx.snapshot.leadId) throw new SkipAction('No lead is linked to this record');
  return ctx.snapshot.leadId;
};

async function runAction(action: WorkflowAction, ctx: ActionContext): Promise<string> {
  const { actor, snapshot, workflow } = ctx;
  switch (action.type) {
    case 'update_lead_status': {
      const leadId = requireLead(ctx);
      const lead = await prisma.lead.findFirst({ where: { id: leadId, deletedAt: null } });
      if (!lead) throw new SkipAction('The lead no longer exists');
      if (lead.status === action.config.status)
        throw new SkipAction(`Lead is already ${LEAD_STATUS_LABEL[action.config.status]}`);
      if (lead.status === 'WON') throw new SkipAction('Converted leads keep their status');
      await updateLead(actor, leadId, {
        status: action.config.status,
        ...(action.config.status === 'LOST' && !lead.lostReason
          ? { lostReason: `Set by workflow "${workflow.name}"` }
          : {}),
      });
      return `Status set to ${LEAD_STATUS_LABEL[action.config.status]}`;
    }
    case 'assign_lead': {
      const leadId = requireLead(ctx);
      let userId: string;
      if (action.config.strategy === 'user') {
        userId = action.config.userId;
      } else {
        const users = await prisma.user.findMany({
          where: { status: 'ACTIVE' },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true },
        });
        if (!users.length) throw new SkipAction('There are no active team members');
        const next = (roundRobin.get(workflow.id) ?? -1) + 1;
        roundRobin.set(workflow.id, next % users.length);
        userId = users[next % users.length]!.id;
      }
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      await updateLead(actor, leadId, { assignedToId: userId });
      return `Assigned to ${[user?.firstName, user?.lastName].filter(Boolean).join(' ')}`;
    }
    case 'add_tag': {
      const leadId = requireLead(ctx);
      const added = await addLeadTag(actor, leadId, action.config.tag);
      if (!added) throw new SkipAction(`Lead already has the tag "${action.config.tag}"`);
      return `Tag "${action.config.tag}" added`;
    }
    case 'create_task': {
      const assignee =
        action.config.assignTo === 'record_owner'
          ? (snapshot.ownerId ?? workflow.createdById)
          : action.config.assignTo;
      const task = await createTask(
        actor,
        {
          title: action.config.title,
          type: action.config.taskType,
          priority: action.config.priority,
          dueDate: new Date(Date.now() + action.config.dueInHours * 60 * 60 * 1000),
          assignedToId: assignee,
          relatedLeadId: snapshot.leadId,
          relatedContactId: snapshot.leadId ? null : snapshot.contactId,
          relatedDealId: snapshot.dealId,
        },
        workflow.createdById,
      );
      return `Task "${task.title}" created${task.assignedTo ? ` for ${task.assignedTo.firstName}` : ''}`;
    }
    case 'send_notification': {
      let recipients: string[];
      if (action.config.recipient === 'record_owner') {
        if (!snapshot.ownerId) throw new SkipAction('Nobody is assigned to this record');
        recipients = [snapshot.ownerId];
      } else if (action.config.recipient === 'all_admins') {
        recipients = (
          await prisma.user.findMany({
            where: { role: 'ADMIN', status: 'ACTIVE' },
            select: { id: true },
          })
        ).map((u) => u.id);
      } else {
        const u = await prisma.user.findFirst({
          where: { id: action.config.recipient, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!u) throw new SkipAction('The recipient is no longer active');
        recipients = [u.id];
      }
      for (const userId of recipients) {
        await notify({
          userId,
          type: 'WORKFLOW',
          title: action.config.title,
          body: action.config.body,
          entityType: snapshot.kind,
          entityId: snapshot.id,
        });
      }
      return `Notified ${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}`;
    }
    case 'rescore_lead': {
      const leadId = requireLead(ctx);
      const score = await scoreLead(leadId, 'workflow', actor.depth);
      return `Lead rescored: ${score.score}`;
    }
    case 'outbound_webhook': {
      const result = await safePost(
        action.config.url,
        { event: ctx.trigger, entity: snapshot.fields, workflowId: workflow.id, runId: ctx.runId },
        { ...webhookOptions, headers: action.config.headers },
      );
      if (!result.ok) throw new Error(result.message);
      return result.message;
    }
  }
}

// ─── Runs ────────────────────────────────────────────────────────────────────

export async function runWorkflow(workflow: WorkflowRow, event: DomainEvent): Promise<void> {
  const trigger = TRIGGER_FOR_EVENT[event.type];
  const target = entityOf(event);
  if (!trigger || !target) return;
  const triggerEvent = {
    type: trigger,
    entityId: target.id,
    payload: triggerPayload(event),
  } as Prisma.InputJsonObject;

  const parsed = workflowDefinitionSchema.safeParse(workflow.definition);
  if (!parsed.success) {
    await prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        status: 'FAILED',
        triggerEvent,
        error: 'The workflow definition is invalid. Edit and save it again.',
        depth: event.depth,
        finishedAt: new Date(),
      },
    });
    return;
  }
  const definition: WorkflowDefinition = parsed.data;
  if (!matchesTriggerConfig(definition.trigger.config, event)) return;

  const snapshot = await loadSnapshot(target.kind, target.id);
  if (!snapshot) return; // deleted in the meantime
  if (!evaluateConditions(definition.conditions, snapshot.fields)) return;

  if (event.depth >= MAX_DEPTH) {
    await prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        status: 'SKIPPED',
        triggerEvent,
        depth: event.depth,
        error:
          'Skipped to prevent an automation loop (triggered by other workflows too many times in a row).',
        finishedAt: new Date(),
      },
    });
    return;
  }

  const run = await prisma.workflowRun.create({
    data: { workflowId: workflow.id, status: 'RUNNING', triggerEvent, depth: event.depth },
  });
  const ctx: ActionContext = {
    workflow,
    runId: run.id,
    trigger,
    snapshot,
    actor: { userId: null, role: null, depth: event.depth + 1 },
  };
  const logs: WorkflowActionLog[] = [];
  for (const action of definition.actions) {
    try {
      const message = await runAction(action, ctx);
      logs.push({ type: action.type, status: 'SUCCESS', message, at: new Date().toISOString() });
    } catch (err) {
      const skipped = err instanceof SkipAction;
      const message =
        err instanceof SkipAction || err instanceof AppError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unexpected error';
      if (!skipped && !(err instanceof AppError))
        logger.warn(
          { err, workflowId: workflow.id, action: action.type },
          'Workflow action failed',
        );
      logs.push({
        type: action.type,
        status: skipped ? 'SKIPPED' : 'FAILED',
        message,
        at: new Date().toISOString(),
      });
    }
    // Later actions see the effects of earlier ones (e.g. notify the owner just assigned).
    ctx.snapshot = (await loadSnapshot(target.kind, target.id)) ?? ctx.snapshot;
  }
  const failed = logs.filter((l) => l.status === 'FAILED').length;
  await prisma.workflowRun.update({
    where: { id: run.id },
    data: {
      status: failed ? 'FAILED' : 'COMPLETED',
      actionLogs: logs as unknown as object[],
      error: failed
        ? `${failed} of ${logs.length} action${logs.length === 1 ? '' : 's'} failed`
        : null,
      finishedAt: new Date(),
    },
  });
}

/**
 * Dispatch is serialised in event order, and runs of one workflow execute one at a time in that
 * same order, so e.g. round-robin assignment follows the order leads were created even though
 * background jobs and database connections run in parallel.
 */
function handleEvent(event: DomainEvent): Promise<void> {
  const trigger = TRIGGER_FOR_EVENT[event.type];
  if (!trigger) return Promise.resolve();
  return withLock('workflow-dispatch', async () => {
    const workflows = await prisma.workflow.findMany({
      where: { triggerType: trigger, isActive: true, deletedAt: null },
    });
    for (const wf of workflows)
      enqueue(`workflow:${wf.id}`, () =>
        withLock(`workflow:${wf.id}`, () => runWorkflow(wf, event)),
      );
  });
}

export function registerWorkflowEngine(): void {
  for (const type of Object.keys(TRIGGER_FOR_EVENT) as EventType[]) {
    on(type, 'workflow-engine', handleEvent);
  }
}
