// Validates builder state: friendly local checks first, then the shared zod schema
// (so the rules always match the server). Errors are keyed by the payload path,
// e.g. "definition.actions.1.config.url", so each input can find its own message.

import type { z } from 'zod';
import { createWorkflowSchema, type CreateWorkflowInput } from '@leados/shared';
import { isApiError } from '@/lib/api-client';
import {
  buildWorkflowPayload,
  isMultiOperator,
  isNoValueOperator,
  parseNumber,
  type ActionState,
  type BuilderState,
} from './builder-state';

export type BuilderErrors = Record<string, string>;

export const actionPath = (i: number, field?: string) =>
  field ? `definition.actions.${i}.config.${field}` : `definition.actions.${i}`;
export const conditionPath = (i: number, field = 'value') => `definition.conditions.${i}.${field}`;
export const headerPath = (actionIndex: number, row: number, part: 'name' | 'value') =>
  `${actionPath(actionIndex, 'headers')}.${row}.${part}`;

function checkAction(a: ActionState, i: number, errors: BuilderErrors) {
  const set = (field: string, msg: string) => (errors[actionPath(i, field)] ??= msg);
  switch (a.type) {
    case 'update_lead_status':
      if (!a.status) set('status', 'Choose a status');
      break;
    case 'assign_lead':
      if (a.strategy === 'user' && !a.userId) set('userId', 'Choose a person');
      break;
    case 'add_tag':
      if (!a.tag.trim()) set('tag', 'Enter a tag');
      break;
    case 'create_task':
      if (parseNumber(a.dueInHours) === undefined) set('dueInHours', 'Enter a number of hours');
      if (!a.assignTo) set('assignTo', 'Choose who gets the task');
      break;
    case 'send_notification':
      if (!a.recipient) set('recipient', 'Choose who to notify');
      break;
    case 'outbound_webhook': {
      if (!a.url.trim()) set('url', 'Enter a URL');
      const seen = new Set<string>();
      a.headers.forEach((h, row) => {
        const name = h.name.trim();
        if (!name && !h.value.trim()) return;
        if (!name) errors[headerPath(i, row, 'name')] = 'Enter a header name';
        else if (seen.has(name.toLowerCase()))
          errors[headerPath(i, row, 'name')] = 'This header is already listed';
        seen.add(name.toLowerCase());
      });
      break;
    }
    case 'rescore_lead':
      break;
  }
}

/** Checks the payload can't express (empty number inputs, duplicate headers, …). */
export function localErrors(state: BuilderState): BuilderErrors {
  const errors: BuilderErrors = {};
  state.conditions.forEach((c, i) => {
    if (c.kind === 'raw') return;
    if (!c.field) errors[conditionPath(i, 'field')] = 'Choose a field';
    if (isNoValueOperator(c.operator)) return;
    if (isMultiOperator(c.operator)) {
      if (c.values.length === 0) errors[conditionPath(i)] = 'Choose at least one option';
    } else if (c.fieldType === 'number') {
      if (parseNumber(c.value) === undefined) errors[conditionPath(i)] = 'Enter a number';
    } else if (c.value.trim() === '') {
      errors[conditionPath(i)] = c.fieldType === 'enum' ? 'Choose a value' : 'Enter a value';
    }
  });
  state.actions.forEach((a, i) => checkAction(a, i, errors));
  return errors;
}

/**
 * Header records are keyed by header name on the server ("…headers.X-Api-Key");
 * point those at the matching row instead.
 */
export function normaliseErrorKey(key: string, state: BuilderState): string {
  const m = /^definition\.actions\.(\d+)\.config\.headers\.(.+)$/.exec(key);
  if (!m || /^\d+\.(name|value)$/.test(m[2] ?? '')) return key;
  const i = Number(m[1]);
  const action = state.actions[i];
  if (action?.type !== 'outbound_webhook') return key;
  const row = action.headers.findIndex((h) => h.name.trim() === m[2]);
  return row >= 0 ? headerPath(i, row, 'value') : actionPath(i, 'headers');
}

// zod's built-in messages are developer-facing; the shared schemas' own messages are not.
const ZOD_DEFAULT =
  /^(String must|Number must|Array must|Expected|Required|Invalid|Too (small|big))/;

function friendly(issue: z.ZodIssue): string {
  if (issue.message && !ZOD_DEFAULT.test(issue.message)) return issue.message;
  switch (issue.code) {
    case 'too_small':
      if (issue.type === 'string' && Number(issue.minimum) <= 1) return 'This field is required';
      if (issue.type === 'number') return `Must be ${String(issue.minimum)} or more`;
      return issue.message;
    case 'too_big':
      if (issue.type === 'number') return `Must be ${String(issue.maximum)} or less`;
      if (issue.type === 'string') return `Must be ${String(issue.maximum)} characters or fewer`;
      return issue.message;
    case 'not_multiple_of':
      return 'Use a whole number';
    case 'invalid_type':
      return issue.received === 'nan' ? 'Enter a number' : 'This field is required';
    case 'invalid_enum_value':
      return 'Choose an option';
    case 'invalid_string':
      return issue.message === 'Invalid id' ? 'Choose a person' : issue.message;
    default:
      return issue.message === 'Invalid id' ? 'Choose a person' : issue.message;
  }
}

/** Unions report one issue per branch; keep the branch that got furthest. */
function flattenIssues(issues: z.ZodIssue[]): z.ZodIssue[] {
  return issues.flatMap((issue) => {
    if (issue.code !== 'invalid_union') return [issue];
    const branches = issue.unionErrors
      .map((e) => flattenIssues(e.issues))
      .filter((b) => !b.some((x) => x.code === 'invalid_literal'))
      .sort((a, b) => a.length - b.length);
    return branches[0] ?? [issue];
  });
}

export interface ValidationResult {
  payload: CreateWorkflowInput | null;
  errors: BuilderErrors;
}

export function validateWorkflowState(state: BuilderState): ValidationResult {
  const errors = localErrors(state);
  const parsed = createWorkflowSchema.safeParse(buildWorkflowPayload(state));
  if (!parsed.success) {
    for (const issue of flattenIssues(parsed.error.issues)) {
      const key = normaliseErrorKey(issue.path.length ? issue.path.join('.') : '_form', state);
      errors[key] ??= friendly(issue);
    }
  }
  const ok = parsed.success && Object.keys(errors).length === 0;
  return { payload: ok ? parsed.data : null, errors };
}

/** Maps a 422 response's `details` onto builder error keys. Returns null when nothing mapped. */
export function apiErrorsToBuilder(error: unknown, state: BuilderState): BuilderErrors | null {
  if (!isApiError(error) || !error.details) return null;
  const out: BuilderErrors = {};
  for (const [key, messages] of Object.entries(error.details)) {
    const msg = messages?.[0];
    if (msg) out[normaliseErrorKey(key, state)] = msg;
  }
  return Object.keys(out).length ? out : null;
}
