// Plain-English helpers shared by the workflow pages.

import type { LeadStatus, Pipeline, WorkflowActionType, WorkflowTrigger } from '@leados/shared';
import { leadStatusLabels, workflowActionLabels, workflowTriggerLabels } from '@/lib/labels';

type TriggerConfig = Record<string, string | number | boolean> | undefined;

/** Finds a stage (and its pipeline) by id across all pipelines. */
export function findStage(pipelines: Pipeline[] | undefined, stageId: string | undefined) {
  if (!stageId || !pipelines) return null;
  for (const pipeline of pipelines) {
    const stage = pipeline.stages.find((s) => s.id === stageId);
    if (stage) return { pipeline, stage };
  }
  return null;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** e.g. "When a lead's status changes to Qualified". */
export function describeTrigger(
  type: WorkflowTrigger,
  config: TriggerConfig,
  pipelines?: Pipeline[],
): string {
  if (type === 'LEAD_STATUS_CHANGED' && typeof config?.toStatus === 'string') {
    const label = leadStatusLabels[config.toStatus as LeadStatus] ?? 'a new status';
    return `When a lead's status changes to ${label}`;
  }
  if (type === 'DEAL_STAGE_MOVED' && typeof config?.stageId === 'string') {
    const found = findStage(pipelines, config.stageId);
    if (found) {
      const multi = (pipelines?.length ?? 0) > 1;
      return `When a deal moves to ${found.stage.name}${multi ? ` (${found.pipeline.name})` : ''}`;
    }
    return 'When a deal moves to a specific stage';
  }
  return `When ${lowerFirst(workflowTriggerLabels[type])}`;
}

/** "send_email" → "Send email" for action types the UI doesn't know yet. */
export function humanise(value: string): string {
  const s = value.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function actionLabel(type: string): string {
  return type in workflowActionLabels
    ? workflowActionLabels[type as WorkflowActionType]
    : humanise(type);
}

/** Short human duration between two timestamps: "350 ms", "4.2 s", "3 min". */
export function formatDuration(start: string, end: string | null): string | null {
  if (!end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

/** Where a run's triggering record lives, if it has a page. */
export function triggerEntityHref(type: WorkflowTrigger, entityId: string): string | null {
  if (type.startsWith('LEAD_')) return `/leads/${entityId}`;
  if (type.startsWith('DEAL_')) return `/deals/${entityId}`;
  return null;
}
