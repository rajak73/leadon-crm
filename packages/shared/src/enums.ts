// Allowed values for every enum-like column. The database stores them as plain text (no native
// Postgres enums, so adding a value needs no migration); these lists are the single source of truth for both the API (zod validation) and the UI.

const values = <T extends readonly string[]>(...v: T) => v;

export const USER_ROLES = values('ADMIN', 'MEMBER');
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = values('ACTIVE', 'DISABLED');
export type UserStatus = (typeof USER_STATUSES)[number];

export const LEAD_STATUSES = values(
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
);
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = values(
  'MANUAL',
  'WEBSITE',
  'REFERRAL',
  'INSTAGRAM',
  'WHATSAPP',
  'FACEBOOK',
  'EMAIL',
  'PHONE',
  'EVENT',
  'IMPORT',
  'OTHER',
);
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const DEAL_STATUSES = values('OPEN', 'WON', 'LOST');
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const TASK_TYPES = values('CALL', 'EMAIL', 'MEETING', 'FOLLOW_UP', 'DEMO', 'OTHER');
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_PRIORITIES = values('LOW', 'MEDIUM', 'HIGH', 'URGENT');
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = values('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const ACTIVITY_TYPES = values(
  'LEAD_CREATED',
  'LEAD_UPDATED',
  'LEAD_STATUS_CHANGED',
  'LEAD_ASSIGNED',
  'LEAD_CONVERTED',
  'LEAD_SCORED',
  'CONTACT_CREATED',
  'CONTACT_UPDATED',
  'DEAL_CREATED',
  'DEAL_UPDATED',
  'DEAL_STAGE_MOVED',
  'DEAL_WON',
  'DEAL_LOST',
  'TASK_CREATED',
  'TASK_COMPLETED',
  'NOTE_ADDED',
  'WORKFLOW_ACTION',
  'INSTAGRAM_MESSAGE_RECEIVED',
  'INSTAGRAM_MESSAGE_SENT',
  'INSTAGRAM_COMMENT_RECEIVED',
  'INSTAGRAM_COMMENT_REPLIED',
);
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const NOTIFICATION_TYPES = values(
  'LEAD_ASSIGNED',
  'DEAL_ASSIGNED',
  'TASK_ASSIGNED',
  'TASK_DUE',
  'LEAD_SCORED',
  'WORKFLOW',
  'INSTAGRAM_MESSAGE',
  'INSTAGRAM_COMMENT',
  'AI_HANDOFF',
  'AI_DRAFT_READY',
  'INSTAGRAM_CONNECTION',
);
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const WORKFLOW_RUN_STATUSES = values('PENDING', 'RUNNING', 'COMPLETED', 'SKIPPED', 'FAILED');
export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[number];

export const WORKFLOW_TRIGGERS = values(
  'LEAD_CREATED',
  'LEAD_STATUS_CHANGED',
  'LEAD_SCORED',
  'DEAL_CREATED',
  'DEAL_STAGE_MOVED',
  'DEAL_WON',
  'DEAL_LOST',
  'TASK_COMPLETED',
);
export type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number];

export const WORKFLOW_ACTIONS = values(
  'update_lead_status',
  'assign_lead',
  'add_tag',
  'create_task',
  'send_notification',
  'rescore_lead',
  'outbound_webhook',
);
export type WorkflowActionType = (typeof WORKFLOW_ACTIONS)[number];

export const CONDITION_OPERATORS = values(
  'EQUALS',
  'NOT_EQUALS',
  'CONTAINS',
  'NOT_CONTAINS',
  'GREATER_THAN',
  'LESS_THAN',
  'IN',
  'NOT_IN',
  'IS_EMPTY',
  'IS_NOT_EMPTY',
);
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

// ─── Instagram & auto-reply ──────────────────────────────────────────────────

export const IG_ACCOUNT_STATUSES = values('ACTIVE', 'EXPIRED', 'ERROR');
export type IgAccountStatus = (typeof IG_ACCOUNT_STATUSES)[number];

export const MESSAGE_DIRECTIONS = values('INBOUND', 'OUTBOUND');
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

/** Who wrote a message. INSTAGRAM_APP = sent by the business from the Instagram app itself. */
export const MESSAGE_AUTHORS = values('CUSTOMER', 'USER', 'AI', 'INSTAGRAM_APP');
export type MessageAuthor = (typeof MESSAGE_AUTHORS)[number];

export const MESSAGE_STATUSES = values(
  'RECEIVED',
  'DRAFT',
  'SENDING',
  'SENT',
  'FAILED',
  'DISCARDED',
);
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const COMMENT_REPLY_STATUSES = values('NONE', 'DRAFT', 'REPLIED', 'SKIPPED', 'FAILED');
export type CommentReplyStatus = (typeof COMMENT_REPLY_STATUSES)[number];

/** AUTO = AI replies are sent immediately; DRAFT = saved for you to approve. */
export const AUTO_REPLY_MODES = values('AUTO', 'DRAFT');
export type AutoReplyMode = (typeof AUTO_REPLY_MODES)[number];

/** PUBLIC = reply under the comment; PRIVATE = DM the commenter; BOTH = short public reply + DM. */
export const COMMENT_REPLY_MODES = values('PUBLIC', 'PRIVATE', 'BOTH');
export type CommentReplyMode = (typeof COMMENT_REPLY_MODES)[number];

export const AI_PROVIDERS = values('gemini', 'groq', 'openai', 'rules');
export type AiProvider = (typeof AI_PROVIDERS)[number];
