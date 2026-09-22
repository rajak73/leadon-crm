import type { FieldCondition, WorkflowCondition } from '@leados/shared';

type Entity = Record<string, unknown>;

const isEmpty = (v: unknown) =>
  v === null ||
  v === undefined ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

const norm = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : v);

function looselyEqual(a: unknown, b: unknown): boolean {
  if (isEmpty(a) || isEmpty(b)) return isEmpty(a) && isEmpty(b);
  if (typeof a === 'number' || typeof b === 'number') {
    const x = Number(a);
    const y = Number(b);
    return Number.isFinite(x) && Number.isFinite(y) && x === y;
  }
  if (typeof a === 'boolean' || typeof b === 'boolean')
    return String(a).toLowerCase() === String(b).toLowerCase();
  return norm(String(a)) === norm(String(b));
}

const asList = (v: unknown): unknown[] =>
  Array.isArray(v)
    ? v
    : typeof v === 'string'
      ? v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : isEmpty(v)
        ? []
        : [v];

function evaluateField(c: FieldCondition, entity: Entity): boolean {
  const actual = entity[c.field];
  const expected = c.value;
  switch (c.operator) {
    case 'IS_EMPTY':
      return isEmpty(actual);
    case 'IS_NOT_EMPTY':
      return !isEmpty(actual);
    case 'EQUALS':
      return Array.isArray(actual)
        ? actual.some((a) => looselyEqual(a, expected))
        : looselyEqual(actual, expected);
    case 'NOT_EQUALS':
      return Array.isArray(actual)
        ? !actual.some((a) => looselyEqual(a, expected))
        : !looselyEqual(actual, expected);
    case 'CONTAINS':
    case 'NOT_CONTAINS': {
      let hit = false;
      if (!isEmpty(expected)) {
        const needle = String(norm(String(expected)));
        hit = Array.isArray(actual)
          ? actual.some((a) => looselyEqual(a, expected))
          : typeof actual === 'string' && actual.toLowerCase().includes(needle);
      }
      return c.operator === 'CONTAINS' ? hit : !hit;
    }
    case 'GREATER_THAN':
    case 'LESS_THAN': {
      if (isEmpty(actual) || isEmpty(expected)) return false;
      const x = Number(actual);
      const y = Number(expected);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      return c.operator === 'GREATER_THAN' ? x > y : x < y;
    }
    case 'IN':
    case 'NOT_IN': {
      const options = asList(expected);
      const values = Array.isArray(actual) ? actual : isEmpty(actual) ? [] : [actual];
      const hit = values.some((v) => options.some((o) => looselyEqual(v, o)));
      return c.operator === 'IN' ? hit : !hit;
    }
    default:
      return false;
  }
}

/** Evaluates one condition (field or AND/OR group) against a flat entity. */
export function evaluateCondition(condition: WorkflowCondition, entity: Entity): boolean {
  if ('conditions' in condition) {
    if (condition.conditions.length === 0) return true;
    return condition.type === 'AND'
      ? condition.conditions.every((c) => evaluateCondition(c, entity))
      : condition.conditions.some((c) => evaluateCondition(c, entity));
  }
  return evaluateField(condition, entity);
}

/** Top-level conditions are AND-ed together; no conditions means "always". */
export const evaluateConditions = (conditions: WorkflowCondition[], entity: Entity) =>
  conditions.every((c) => evaluateCondition(c, entity));
