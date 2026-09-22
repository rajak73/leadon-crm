import { describe, expect, it } from 'vitest';
import { evaluateCondition, evaluateConditions } from './workflows.evaluator.js';

const lead = {
  firstName: 'Asha',
  company: 'Zomato India',
  source: 'REFERRAL',
  status: 'NEW',
  tags: ['VIP', 'b2b'],
  aiScore: 72,
  email: null,
  phone: '',
};

describe('condition evaluator', () => {
  it.each([
    [{ field: 'source', operator: 'EQUALS', value: 'referral' }, true],
    [{ field: 'source', operator: 'EQUALS', value: 'WEBSITE' }, false],
    [{ field: 'source', operator: 'NOT_EQUALS', value: 'WEBSITE' }, true],
    [{ field: 'email', operator: 'NOT_EQUALS', value: 'x@y.in' }, true],
    [{ field: 'company', operator: 'CONTAINS', value: 'zomato' }, true],
    [{ field: 'company', operator: 'NOT_CONTAINS', value: 'swiggy' }, true],
    [{ field: 'email', operator: 'NOT_CONTAINS', value: 'x' }, true],
    [{ field: 'tags', operator: 'CONTAINS', value: 'vip' }, true],
    [{ field: 'tags', operator: 'CONTAINS', value: 'vi' }, false],
    [{ field: 'tags', operator: 'EQUALS', value: 'b2b' }, true],
    [{ field: 'aiScore', operator: 'GREATER_THAN', value: 70 }, true],
    [{ field: 'aiScore', operator: 'GREATER_THAN', value: '72' }, false],
    [{ field: 'aiScore', operator: 'LESS_THAN', value: 80 }, true],
    [{ field: 'email', operator: 'GREATER_THAN', value: 1 }, false],
    [{ field: 'aiScore', operator: 'EQUALS', value: '72' }, true],
    [{ field: 'status', operator: 'IN', value: ['NEW', 'CONTACTED'] }, true],
    [{ field: 'status', operator: 'IN', value: 'CONTACTED,QUALIFIED' }, false],
    [{ field: 'status', operator: 'NOT_IN', value: ['LOST'] }, true],
    [{ field: 'tags', operator: 'IN', value: ['b2b', 'x'] }, true],
    [{ field: 'email', operator: 'IS_EMPTY' }, true],
    [{ field: 'phone', operator: 'IS_EMPTY' }, true],
    [{ field: 'missing', operator: 'IS_EMPTY' }, true],
    [{ field: 'tags', operator: 'IS_NOT_EMPTY' }, true],
    [{ field: 'company', operator: 'IS_NOT_EMPTY' }, true],
  ] as const)('%j → %s', (condition, expected) => {
    expect(evaluateCondition(condition as never, lead)).toBe(expected);
  });

  it('evaluates nested AND/OR groups', () => {
    const cond = {
      type: 'AND' as const,
      conditions: [
        { field: 'source', operator: 'EQUALS' as const, value: 'REFERRAL' },
        {
          type: 'OR' as const,
          conditions: [
            { field: 'aiScore', operator: 'GREATER_THAN' as const, value: 90 },
            { field: 'tags', operator: 'CONTAINS' as const, value: 'VIP' },
          ],
        },
      ],
    };
    expect(evaluateCondition(cond, lead)).toBe(true);
    expect(
      evaluateCondition(
        {
          ...cond,
          type: 'AND',
          conditions: [...cond.conditions, { field: 'status', operator: 'EQUALS', value: 'LOST' }],
        },
        lead,
      ),
    ).toBe(false);
    expect(evaluateCondition({ type: 'OR', conditions: [] }, lead)).toBe(true);
  });

  it('treats an empty condition list as always true and ANDs the top level', () => {
    expect(evaluateConditions([], lead)).toBe(true);
    expect(
      evaluateConditions(
        [
          { field: 'source', operator: 'EQUALS', value: 'REFERRAL' },
          { field: 'status', operator: 'EQUALS', value: 'LOST' },
        ],
        lead,
      ),
    ).toBe(false);
  });
});
