// Pure builder state for the workflow editor, plus conversion to and from the API shape.
// Nothing here touches React, so it is easy to unit test.

import type { z } from 'zod';
import type {
  ConditionOperator,
  createWorkflowSchema,
  FieldCondition,
  Workflow,
  WorkflowAction,
  WorkflowActionType,
  WorkflowCondition,
  WorkflowTrigger,
  workflowActionSchema,
} from '@leados/shared';
import type { WorkflowFieldMeta, WorkflowFieldType } from '@/api/workflows';

export type WorkflowPayload = z.input<typeof createWorkflowSchema>;
type TriggerConfig = Record<string, string | number | boolean>;

let keySeq = 0;
/** Stable React keys for list rows (never sent to the API). */
export const newKey = () => `k${++keySeq}`;

// ─── Conditions ──────────────────────────────────────────────────────────────

export interface FieldConditionState {
  kind: 'field';
  key: string;
  field: string;
  fieldType: WorkflowFieldType;
  operator: ConditionOperator;
  /** Text / number / single enum value, exactly as typed. */
  value: string;
  /** Multi-select values for IN / NOT_IN. */
  values: string[];
}

/** Nested groups (or values the simple editor can't show) are kept untouched. */
export interface RawConditionState {
  kind: 'raw';
  key: string;
  condition: WorkflowCondition;
}

export type ConditionState = FieldConditionState | RawConditionState;

export const operatorsByType: Record<WorkflowFieldType, ConditionOperator[]> = {
  string: ['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'NOT_CONTAINS', 'IS_EMPTY', 'IS_NOT_EMPTY'],
  number: ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'IS_EMPTY', 'IS_NOT_EMPTY'],
  enum: ['EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN'],
  tags: ['CONTAINS', 'NOT_CONTAINS', 'IS_EMPTY', 'IS_NOT_EMPTY'],
};

export const isNoValueOperator = (op: ConditionOperator) =>
  op === 'IS_EMPTY' || op === 'IS_NOT_EMPTY';
export const isMultiOperator = (op: ConditionOperator) => op === 'IN' || op === 'NOT_IN';

export function emptyCondition(): FieldConditionState {
  return {
    kind: 'field',
    key: newKey(),
    field: '',
    fieldType: 'string',
    operator: 'EQUALS',
    value: '',
    values: [],
  };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export interface HeaderRow {
  key: string;
  name: string;
  value: string;
}

export type ActionConfigState =
  | { type: 'update_lead_status'; status: string }
  | { type: 'assign_lead'; strategy: 'user' | 'round_robin'; userId: string }
  | { type: 'add_tag'; tag: string }
  | {
      type: 'create_task';
      title: string;
      taskType: string;
      priority: string;
      dueInHours: string;
      assignTo: string;
    }
  | { type: 'send_notification'; recipient: string; title: string; body: string }
  | { type: 'rescore_lead' }
  | { type: 'outbound_webhook'; url: string; headers: HeaderRow[] };

export type ActionState = ActionConfigState & { key: string };

export function defaultAction(type: WorkflowActionType): ActionState {
  const key = newKey();
  switch (type) {
    case 'update_lead_status':
      return { key, type, status: '' };
    case 'assign_lead':
      return { key, type, strategy: 'round_robin', userId: '' };
    case 'add_tag':
      return { key, type, tag: '' };
    case 'create_task':
      return {
        key,
        type,
        title: '',
        taskType: 'FOLLOW_UP',
        priority: 'MEDIUM',
        dueInHours: '24',
        assignTo: 'record_owner',
      };
    case 'send_notification':
      return { key, type, recipient: 'record_owner', title: '', body: '' };
    case 'rescore_lead':
      return { key, type };
    case 'outbound_webhook':
      return { key, type, url: '', headers: [] };
  }
}

// ─── Whole builder ───────────────────────────────────────────────────────────

export interface BuilderState {
  name: string;
  description: string;
  isActive: boolean;
  triggerType: WorkflowTrigger;
  triggerConfig: TriggerConfig;
  conditions: ConditionState[];
  actions: ActionState[];
}

export function emptyBuilderState(): BuilderState {
  return {
    name: '',
    description: '',
    isActive: true,
    triggerType: 'LEAD_CREATED',
    triggerConfig: {},
    conditions: [],
    actions: [],
  };
}

// ─── API → state ─────────────────────────────────────────────────────────────

function isGroup(c: WorkflowCondition): c is Exclude<WorkflowCondition, FieldCondition> {
  return 'conditions' in c;
}

function inferType(c: FieldCondition, meta?: WorkflowFieldMeta): WorkflowFieldType {
  if (meta) return meta.type;
  if (typeof c.value === 'number') return 'number';
  if (Array.isArray(c.value)) return 'enum';
  return 'string';
}

export function conditionToState(
  c: WorkflowCondition,
  fields: WorkflowFieldMeta[] = [],
): ConditionState {
  if (isGroup(c) || typeof c.value === 'boolean' || c.value === null) {
    return { kind: 'raw', key: newKey(), condition: c };
  }
  const fieldType = inferType(
    c,
    fields.find((f) => f.key === c.field),
  );
  const v = c.value;
  return {
    kind: 'field',
    key: newKey(),
    field: c.field,
    fieldType,
    operator: c.operator,
    value: v === undefined || Array.isArray(v) ? '' : String(v),
    values: Array.isArray(v) ? [...v] : [],
  };
}

export function actionToState(a: WorkflowAction): ActionState {
  const key = newKey();
  switch (a.type) {
    case 'update_lead_status':
      return { key, type: a.type, status: a.config.status };
    case 'assign_lead':
      return a.config.strategy === 'user'
        ? { key, type: a.type, strategy: 'user', userId: a.config.userId }
        : { key, type: a.type, strategy: 'round_robin', userId: '' };
    case 'add_tag':
      return { key, type: a.type, tag: a.config.tag };
    case 'create_task':
      return {
        key,
        type: a.type,
        title: a.config.title,
        taskType: a.config.taskType,
        priority: a.config.priority,
        dueInHours: String(a.config.dueInHours),
        assignTo: a.config.assignTo,
      };
    case 'send_notification':
      return {
        key,
        type: a.type,
        recipient: a.config.recipient,
        title: a.config.title,
        body: a.config.body,
      };
    case 'rescore_lead':
      return { key, type: a.type };
    case 'outbound_webhook':
      return {
        key,
        type: a.type,
        url: a.config.url,
        headers: Object.entries(a.config.headers ?? {}).map(([name, value]) => ({
          key: newKey(),
          name,
          value,
        })),
      };
  }
}

/** Converts a saved workflow into editable builder state. `fields` refines condition types. */
export function workflowToState(
  workflow: Workflow,
  fields: WorkflowFieldMeta[] = [],
): BuilderState {
  const def = workflow.definition;
  return {
    name: workflow.name,
    description: workflow.description ?? '',
    isActive: workflow.isActive,
    triggerType: def.trigger.type,
    triggerConfig: { ...(def.trigger.config ?? {}) },
    conditions: (def.conditions ?? []).map((c) => conditionToState(c, fields)),
    actions: def.actions.map(actionToState),
  };
}

// ─── state → API ─────────────────────────────────────────────────────────────

/** Number parsing that never guesses: '' or junk → undefined. */
export function parseNumber(v: string): number | undefined {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function conditionToPayload(c: ConditionState): WorkflowCondition {
  if (c.kind === 'raw') return c.condition;
  const out: FieldCondition = { field: c.field, operator: c.operator };
  if (isNoValueOperator(c.operator)) return out;
  if (isMultiOperator(c.operator)) out.value = [...c.values];
  else if (c.fieldType === 'number') {
    const n = parseNumber(c.value);
    if (n !== undefined) out.value = n;
  } else out.value = c.value; // strings stay strings ("00123" is never coerced)
  return out;
}

/** Header rows → plain object. Blank rows are ignored; later duplicates are dropped. */
export function headersToObject(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const name = r.name.trim();
    if (!name && !r.value.trim()) continue;
    if (!(name in out)) out[name] = r.value;
  }
  return out;
}

export function actionToPayload(a: ActionState): z.input<typeof workflowActionSchema> {
  switch (a.type) {
    case 'update_lead_status':
      return { type: a.type, config: { status: a.status as 'NEW' } };
    case 'assign_lead':
      return {
        type: a.type,
        config:
          a.strategy === 'user'
            ? { strategy: 'user', userId: a.userId }
            : { strategy: 'round_robin' },
      };
    case 'add_tag':
      return { type: a.type, config: { tag: a.tag } };
    case 'create_task':
      return {
        type: a.type,
        config: {
          title: a.title,
          taskType: a.taskType as 'FOLLOW_UP',
          priority: a.priority as 'MEDIUM',
          dueInHours: parseNumber(a.dueInHours) ?? Number.NaN,
          assignTo: a.assignTo,
        },
      };
    case 'send_notification':
      return { type: a.type, config: { recipient: a.recipient, title: a.title, body: a.body } };
    case 'rescore_lead':
      return { type: a.type, config: {} };
    case 'outbound_webhook':
      return { type: a.type, config: { url: a.url.trim(), headers: headersToObject(a.headers) } };
  }
}

/** Builds the request body for POST/PATCH /workflows. Validate it with createWorkflowSchema. */
export function buildWorkflowPayload(state: BuilderState): WorkflowPayload {
  return {
    name: state.name,
    description: state.description.trim() === '' ? null : state.description,
    isActive: state.isActive,
    definition: {
      trigger: { type: state.triggerType, config: { ...state.triggerConfig } },
      conditions: state.conditions.map(conditionToPayload),
      actions: state.actions.map(actionToPayload),
    },
  };
}
