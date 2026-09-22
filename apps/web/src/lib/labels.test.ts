import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_TYPES,
  AI_PROVIDERS,
  AUTO_REPLY_MODES,
  COMMENT_REPLY_MODES,
  COMMENT_REPLY_STATUSES,
  IG_ACCOUNT_STATUSES,
  MESSAGE_AUTHORS,
  MESSAGE_DIRECTIONS,
  MESSAGE_STATUSES,
  CONDITION_OPERATORS,
  DEAL_STATUSES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  NOTIFICATION_TYPES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  USER_ROLES,
  USER_STATUSES,
  WORKFLOW_ACTIONS,
  WORKFLOW_RUN_STATUSES,
  WORKFLOW_TRIGGERS,
} from '@leados/shared';
import * as labels from './labels';

const cases: Array<[string, readonly string[], Record<string, string>]> = [
  ['lead status', LEAD_STATUSES, labels.leadStatusLabels],
  ['lead source', LEAD_SOURCES, labels.leadSourceLabels],
  ['deal status', DEAL_STATUSES, labels.dealStatusLabels],
  ['task type', TASK_TYPES, labels.taskTypeLabels],
  ['task priority', TASK_PRIORITIES, labels.taskPriorityLabels],
  ['task status', TASK_STATUSES, labels.taskStatusLabels],
  ['user role', USER_ROLES, labels.userRoleLabels],
  ['user status', USER_STATUSES, labels.userStatusLabels],
  ['activity type', ACTIVITY_TYPES, labels.activityTypeLabels],
  ['notification type', NOTIFICATION_TYPES, labels.notificationTypeLabels],
  ['workflow trigger', WORKFLOW_TRIGGERS, labels.workflowTriggerLabels],
  ['workflow action', WORKFLOW_ACTIONS, labels.workflowActionLabels],
  ['workflow action description', WORKFLOW_ACTIONS, labels.workflowActionDescriptions],
  ['workflow run status', WORKFLOW_RUN_STATUSES, labels.workflowRunStatusLabels],
  ['condition operator', CONDITION_OPERATORS, labels.conditionOperatorLabels],
  ['Instagram account status', IG_ACCOUNT_STATUSES, labels.igAccountStatusLabels],
  ['message direction', MESSAGE_DIRECTIONS, labels.messageDirectionLabels],
  ['message author', MESSAGE_AUTHORS, labels.messageAuthorLabels],
  ['message status', MESSAGE_STATUSES, labels.messageStatusLabels],
  ['comment reply status', COMMENT_REPLY_STATUSES, labels.commentReplyStatusLabels],
  ['auto-reply mode', AUTO_REPLY_MODES, labels.autoReplyModeLabels],
  ['auto-reply mode description', AUTO_REPLY_MODES, labels.autoReplyModeDescriptions],
  ['comment reply mode', COMMENT_REPLY_MODES, labels.commentReplyModeLabels],
  ['comment reply mode description', COMMENT_REPLY_MODES, labels.commentReplyModeDescriptions],
  ['AI provider', AI_PROVIDERS, labels.aiProviderLabels],
];

describe('label maps', () => {
  it.each(cases)('%s: every enum value has a friendly label', (_name, values, map) => {
    expect(Object.keys(map).sort()).toEqual([...values].sort());
    for (const v of values) {
      const label = map[v]!;
      expect(label.trim()).not.toBe('');
      // No raw enum values: nothing SHOUTY or snake_cased.
      expect(label).not.toMatch(/^[A-Z_]{2,}$/);
      expect(label).not.toContain('_');
    }
  });

  it('labels use sentence case', () => {
    for (const [, , map] of cases) {
      for (const label of Object.values(map)) {
        const words = label.replace(/[.,]/g, '').split(' ').slice(1);
        // Later words are lower case unless they are proper nouns/acronyms we allow.
        for (const w of words)
          expect(
            w === w.toLowerCase() || /^(AI|HTTPS|WhatsApp|Instagram|Facebook|LeadOS|DM)$/.test(w),
          ).toBe(true);
      }
    }
  });

  it('tone maps cover every value', () => {
    expect(Object.keys(labels.leadStatusTones).sort()).toEqual([...LEAD_STATUSES].sort());
    expect(Object.keys(labels.dealStatusTones).sort()).toEqual([...DEAL_STATUSES].sort());
    expect(Object.keys(labels.taskPriorityTones).sort()).toEqual([...TASK_PRIORITIES].sort());
    expect(Object.keys(labels.workflowRunStatusTones).sort()).toEqual(
      [...WORKFLOW_RUN_STATUSES].sort(),
    );
    expect(Object.keys(labels.igAccountStatusTones).sort()).toEqual(
      [...IG_ACCOUNT_STATUSES].sort(),
    );
    expect(Object.keys(labels.commentReplyStatusTones).sort()).toEqual(
      [...COMMENT_REPLY_STATUSES].sort(),
    );
  });

  it('enumOptionLabel humanises known and unknown values', () => {
    expect(labels.enumOptionLabel('FOLLOW_UP')).toBe('Follow-up');
    expect(labels.enumOptionLabel('NEGOTIATION')).toBe('Negotiation');
    expect(labels.enumOptionLabel('SOME_NEW_VALUE')).toBe('Some new value');
  });
});
