import { describe, expect, it } from 'vitest';
import { createWorkflowSchema, type Workflow } from '@leados/shared';
import {
  buildWorkflowPayload,
  defaultAction,
  emptyBuilderState,
  newKey,
  workflowToState,
  type BuilderState,
} from './builder-state';
import { validateWorkflowState } from './builder-validation';

const USER_ID = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';

function sampleState(): BuilderState {
  const webhook = defaultAction('outbound_webhook');
  if (webhook.type !== 'outbound_webhook') throw new Error('unexpected');
  webhook.url = 'https://hooks.example.com/leads';
  webhook.headers = [
    { key: newKey(), name: 'X-Api-Key', value: 'abc' },
    { key: newKey(), name: '', value: '' }, // blank row is ignored
  ];
  const task = defaultAction('create_task');
  if (task.type !== 'create_task') throw new Error('unexpected');
  task.title = 'Call them back';
  task.assignTo = USER_ID;

  return {
    ...emptyBuilderState(),
    name: 'Hot lead follow-up',
    triggerType: 'LEAD_STATUS_CHANGED',
    triggerConfig: { toStatus: 'QUALIFIED' },
    conditions: [
      {
        kind: 'field',
        key: newKey(),
        field: 'phone',
        fieldType: 'string',
        operator: 'EQUALS',
        value: '00123',
        values: [],
      },
      {
        kind: 'field',
        key: newKey(),
        field: 'aiScore',
        fieldType: 'number',
        operator: 'GREATER_THAN',
        value: '70',
        values: [],
      },
      {
        kind: 'field',
        key: newKey(),
        field: 'email',
        fieldType: 'string',
        operator: 'IS_EMPTY',
        value: 'ignored',
        values: [],
      },
      {
        kind: 'field',
        key: newKey(),
        field: 'source',
        fieldType: 'enum',
        operator: 'IN',
        value: '',
        values: ['WEBSITE', 'REFERRAL'],
      },
    ],
    actions: [webhook, task],
  };
}

describe('buildWorkflowPayload', () => {
  it('produces a payload that passes createWorkflowSchema', () => {
    const payload = buildWorkflowPayload(sampleState());
    const parsed = createWorkflowSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it('sends webhook headers as an object, never a JSON string', () => {
    const payload = buildWorkflowPayload(sampleState());
    const webhook = payload.definition.actions[0];
    expect(webhook).toEqual({
      type: 'outbound_webhook',
      config: { url: 'https://hooks.example.com/leads', headers: { 'X-Api-Key': 'abc' } },
    });
    expect(typeof (webhook as { config: { headers: unknown } }).config.headers).toBe('object');
  });

  it('keeps string condition values as strings and numbers as numbers', () => {
    const { conditions } = buildWorkflowPayload(sampleState()).definition;
    expect(conditions?.[0]).toEqual({ field: 'phone', operator: 'EQUALS', value: '00123' });
    expect(conditions?.[1]).toEqual({ field: 'aiScore', operator: 'GREATER_THAN', value: 70 });
    expect(conditions?.[2]).toEqual({ field: 'email', operator: 'IS_EMPTY' });
    expect(conditions?.[3]).toEqual({
      field: 'source',
      operator: 'IN',
      value: ['WEBSITE', 'REFERRAL'],
    });
  });

  it('round-trips a saved workflow without changing its definition', () => {
    const payload = createWorkflowSchema.parse(buildWorkflowPayload(sampleState()));
    const workflow = {
      id: 'w1',
      name: payload.name,
      description: null,
      triggerType: payload.definition.trigger.type,
      definition: payload.definition,
      isActive: payload.isActive,
      createdBy: { id: USER_ID, firstName: 'A', lastName: 'B', email: 'a@b.co' },
      lastRunAt: null,
      runCount: 0,
      createdAt: '',
      updatedAt: '',
    } satisfies Workflow;
    const again = createWorkflowSchema.parse(buildWorkflowPayload(workflowToState(workflow)));
    expect(again.definition).toEqual(payload.definition);
  });

  it('preserves nested condition groups it cannot edit', () => {
    const group = {
      type: 'OR' as const,
      conditions: [{ field: 'status', operator: 'EQUALS' as const, value: 'NEW' }],
    };
    const state = workflowToState({
      id: 'w',
      name: 'x',
      description: null,
      triggerType: 'LEAD_CREATED',
      definition: {
        trigger: { type: 'LEAD_CREATED', config: {} },
        conditions: [group],
        actions: [{ type: 'rescore_lead', config: {} }],
      },
      isActive: false,
      createdBy: { id: USER_ID, firstName: 'A', lastName: 'B', email: 'a@b.co' },
      lastRunAt: null,
      runCount: 0,
      createdAt: '',
      updatedAt: '',
    });
    expect(buildWorkflowPayload(state).definition.conditions).toEqual([group]);
  });
});

describe('validateWorkflowState', () => {
  it('returns the parsed payload when valid', () => {
    const { payload, errors } = validateWorkflowState(sampleState());
    expect(errors).toEqual({});
    expect(payload?.definition.actions).toHaveLength(2);
  });

  it('puts errors next to the right inputs', () => {
    const state = sampleState();
    const webhook = state.actions[0];
    if (webhook?.type !== 'outbound_webhook') throw new Error('unexpected');
    webhook.url = 'http://insecure.example.com';
    webhook.headers.push({ key: newKey(), name: 'x-api-key', value: 'dup' });
    const num = state.conditions[1];
    if (num?.kind === 'field') num.value = '';
    state.name = '';

    const { payload, errors } = validateWorkflowState(state);
    expect(payload).toBeNull();
    expect(errors['name']).toBe('Enter a workflow name');
    expect(errors['definition.actions.0.config.url']).toBe('The URL must start with https://');
    expect(errors['definition.actions.0.config.headers.2.name']).toBe(
      'This header is already listed',
    );
    expect(errors['definition.conditions.1.value']).toBe('Enter a number');
  });

  it('requires at least one action', () => {
    const { errors } = validateWorkflowState({ ...emptyBuilderState(), name: 'Empty' });
    expect(errors['definition.actions']).toBe('Add at least one action');
  });
});
