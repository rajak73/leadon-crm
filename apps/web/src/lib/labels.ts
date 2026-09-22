// Human-friendly labels for every enum value. Never show raw enum values in the UI.

import type {
  ActivityType,
  AiProvider,
  AutoReplyMode,
  CommentReplyMode,
  CommentReplyStatus,
  ConditionOperator,
  IgAccountStatus,
  IgAttachment,
  MessageAuthor,
  MessageDirection,
  MessageStatus,
  DealStatus,
  LeadSource,
  LeadStatus,
  NotificationType,
  TaskPriority,
  TaskStatus,
  TaskType,
  UserRole,
  UserStatus,
  WorkflowActionType,
  WorkflowRunStatus,
  WorkflowTrigger,
} from '@leados/shared';

/** Visual tone for badges; maps onto semantic colour tokens. */
export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export const leadStatusLabels: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
};

export const leadStatusTones: Record<LeadStatus, Tone> = {
  NEW: 'info',
  CONTACTED: 'primary',
  QUALIFIED: 'primary',
  PROPOSAL: 'warning',
  NEGOTIATION: 'warning',
  WON: 'success',
  LOST: 'danger',
};

export const leadSourceLabels: Record<LeadSource, string> = {
  MANUAL: 'Added manually',
  WEBSITE: 'Website',
  REFERRAL: 'Referral',
  INSTAGRAM: 'Instagram',
  WHATSAPP: 'WhatsApp',
  FACEBOOK: 'Facebook',
  EMAIL: 'Email',
  PHONE: 'Phone',
  EVENT: 'Event',
  IMPORT: 'Import',
  OTHER: 'Other',
};

export const dealStatusLabels: Record<DealStatus, string> = {
  OPEN: 'Open',
  WON: 'Won',
  LOST: 'Lost',
};

export const dealStatusTones: Record<DealStatus, Tone> = {
  OPEN: 'neutral',
  WON: 'success',
  LOST: 'danger',
};

export const taskTypeLabels: Record<TaskType, string> = {
  CALL: 'Call',
  EMAIL: 'Email',
  MEETING: 'Meeting',
  FOLLOW_UP: 'Follow-up',
  DEMO: 'Demo',
  OTHER: 'Other',
};

export const taskPriorityLabels: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const taskPriorityTones: Record<TaskPriority, Tone> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  PENDING: 'To do',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Done',
  CANCELLED: 'Cancelled',
};

export const userRoleLabels: Record<UserRole, string> = {
  ADMIN: 'Admin',
  MEMBER: 'Member',
};

export const userRoleDescriptions: Record<UserRole, string> = {
  ADMIN: 'Can manage the team, settings, pipelines and workflows',
  MEMBER: 'Can work with leads, contacts, deals and tasks',
};

export const userStatusLabels: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  DISABLED: 'Disabled',
};

export const activityTypeLabels: Record<ActivityType, string> = {
  LEAD_CREATED: 'Lead created',
  LEAD_UPDATED: 'Lead updated',
  LEAD_STATUS_CHANGED: 'Status changed',
  LEAD_ASSIGNED: 'Owner changed',
  LEAD_CONVERTED: 'Converted',
  LEAD_SCORED: 'AI score updated',
  CONTACT_CREATED: 'Contact created',
  CONTACT_UPDATED: 'Contact updated',
  DEAL_CREATED: 'Deal created',
  DEAL_UPDATED: 'Deal updated',
  DEAL_STAGE_MOVED: 'Stage changed',
  DEAL_WON: 'Deal won',
  DEAL_LOST: 'Deal lost',
  TASK_CREATED: 'Task created',
  TASK_COMPLETED: 'Task completed',
  NOTE_ADDED: 'Note added',
  WORKFLOW_ACTION: 'Automation',
  INSTAGRAM_MESSAGE_RECEIVED: 'Instagram message received',
  INSTAGRAM_MESSAGE_SENT: 'Instagram message sent',
  INSTAGRAM_COMMENT_RECEIVED: 'Instagram comment received',
  INSTAGRAM_COMMENT_REPLIED: 'Instagram comment answered',
};

export const notificationTypeLabels: Record<NotificationType, string> = {
  LEAD_ASSIGNED: 'Lead assigned',
  DEAL_ASSIGNED: 'Deal assigned',
  TASK_ASSIGNED: 'Task assigned',
  TASK_DUE: 'Task due',
  LEAD_SCORED: 'Hot lead',
  WORKFLOW: 'Automation',
  INSTAGRAM_MESSAGE: 'Instagram message',
  INSTAGRAM_COMMENT: 'Instagram comment',
  AI_HANDOFF: 'Needs a person',
  AI_DRAFT_READY: 'AI draft ready',
  INSTAGRAM_CONNECTION: 'Instagram connection',
};

export const workflowTriggerLabels: Record<WorkflowTrigger, string> = {
  LEAD_CREATED: 'A lead is created',
  LEAD_STATUS_CHANGED: "A lead's status changes",
  LEAD_SCORED: 'A lead gets an AI score',
  DEAL_CREATED: 'A deal is created',
  DEAL_STAGE_MOVED: 'A deal moves to another stage',
  DEAL_WON: 'A deal is won',
  DEAL_LOST: 'A deal is lost',
  TASK_COMPLETED: 'A task is completed',
};

export const workflowActionLabels: Record<WorkflowActionType, string> = {
  update_lead_status: 'Change lead status',
  assign_lead: 'Assign the lead',
  add_tag: 'Add a tag',
  create_task: 'Create a task',
  send_notification: 'Send a notification',
  rescore_lead: 'Rescore with AI',
  outbound_webhook: 'Send a webhook',
};

export const workflowActionDescriptions: Record<WorkflowActionType, string> = {
  update_lead_status: 'Move the lead to a different status.',
  assign_lead: 'Give the lead to a teammate, or share leads out in turn.',
  add_tag: 'Label the record so it is easy to find later.',
  create_task: 'Add a follow-up to someone’s task list.',
  send_notification: 'Let a teammate know in LeadOS.',
  rescore_lead: 'Ask the AI to score the lead again.',
  outbound_webhook: 'Post the record to another app over HTTPS.',
};

export const workflowRunStatusLabels: Record<WorkflowRunStatus, string> = {
  PENDING: 'Queued',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  SKIPPED: 'Skipped',
  FAILED: 'Failed',
};

export const workflowRunStatusTones: Record<WorkflowRunStatus, Tone> = {
  PENDING: 'neutral',
  RUNNING: 'info',
  COMPLETED: 'success',
  SKIPPED: 'warning',
  FAILED: 'danger',
};

export const actionLogStatusLabels: Record<'SUCCESS' | 'FAILED' | 'SKIPPED', string> = {
  SUCCESS: 'Done',
  FAILED: 'Failed',
  SKIPPED: 'Skipped',
};

export const conditionOperatorLabels: Record<ConditionOperator, string> = {
  EQUALS: 'is',
  NOT_EQUALS: 'is not',
  CONTAINS: 'contains',
  NOT_CONTAINS: "doesn't contain",
  GREATER_THAN: 'is more than',
  LESS_THAN: 'is less than',
  IN: 'is any of',
  NOT_IN: 'is none of',
  IS_EMPTY: 'is empty',
  IS_NOT_EMPTY: 'is not empty',
};

export const aiTriggerLabels: Record<'manual' | 'auto' | 'workflow', string> = {
  manual: 'Scored on request',
  auto: 'Scored automatically',
  workflow: 'Scored by a workflow',
};

export const dashboardRangeLabels: Record<'7d' | '30d' | '90d' | '365d', string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '365d': 'Last 12 months',
};

// ─── Instagram & auto-reply ──────────────────────────────────────────────────

export const igAccountStatusLabels: Record<IgAccountStatus, string> = {
  ACTIVE: 'Connected',
  EXPIRED: 'Token expired',
  ERROR: 'Needs attention',
};

export const igAccountStatusTones: Record<IgAccountStatus, Tone> = {
  ACTIVE: 'success',
  EXPIRED: 'warning',
  ERROR: 'danger',
};

export const messageDirectionLabels: Record<MessageDirection, string> = {
  INBOUND: 'Received',
  OUTBOUND: 'Sent',
};

export const messageAuthorLabels: Record<MessageAuthor, string> = {
  CUSTOMER: 'Customer',
  USER: 'You',
  AI: 'AI assistant',
  INSTAGRAM_APP: 'Sent from Instagram app',
};

export const messageStatusLabels: Record<MessageStatus, string> = {
  RECEIVED: 'Received',
  DRAFT: 'Draft',
  SENDING: 'Sending…',
  SENT: 'Sent',
  FAILED: 'Not sent',
  DISCARDED: 'Discarded',
};

export const commentReplyStatusLabels: Record<CommentReplyStatus, string> = {
  NONE: 'Needs reply',
  DRAFT: 'Draft ready',
  REPLIED: 'Replied',
  SKIPPED: 'Skipped',
  FAILED: 'Failed',
};

export const commentReplyStatusTones: Record<CommentReplyStatus, Tone> = {
  NONE: 'warning',
  DRAFT: 'primary',
  REPLIED: 'success',
  SKIPPED: 'neutral',
  FAILED: 'danger',
};

export const autoReplyModeLabels: Record<AutoReplyMode, string> = {
  AUTO: 'Send automatically',
  DRAFT: 'Save as draft for me to approve',
};

export const autoReplyModeDescriptions: Record<AutoReplyMode, string> = {
  AUTO: 'Replies go out straight away — good once you trust the answers.',
  DRAFT: 'The AI writes a reply and waits for you to send, edit or discard it.',
};

export const commentReplyModeLabels: Record<CommentReplyMode, string> = {
  PUBLIC: 'Public reply',
  PRIVATE: 'Private DM',
  BOTH: 'Both',
};

export const commentReplyModeDescriptions: Record<CommentReplyMode, string> = {
  PUBLIC: 'Answer under the comment, where everyone can see it.',
  PRIVATE: 'Send the commenter a direct message instead.',
  BOTH: 'A short public reply plus a direct message with the details.',
};

export const aiProviderLabels: Record<AiProvider, string> = {
  gemini: 'Gemini',
  groq: 'Groq',
  openai: 'OpenAI',
  rules: 'Built-in rules',
};

export const attachmentTypeLabels: Record<IgAttachment['type'], string> = {
  image: 'Photo',
  video: 'Video',
  audio: 'Voice message',
  file: 'File',
  share: 'Shared post',
  story_mention: 'Story mention',
  reel: 'Reel',
  unknown: 'Attachment',
};

/** Label for any enum value used by workflow condition fields (status, source, …). */
export function enumOptionLabel(value: string): string {
  const maps: Array<Record<string, string>> = [
    leadStatusLabels,
    leadSourceLabels,
    dealStatusLabels,
    taskTypeLabels,
    taskPriorityLabels,
    taskStatusLabels,
  ];
  for (const m of maps) if (value in m) return m[value] as string;
  return value
    .toLowerCase()
    .split('_')
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}
