// Request validation schemas shared by the API (validation middleware) and the web app
// (form validation). Every message here may be shown to end users — keep them plain.

import { z } from 'zod';
import {
  AUTO_REPLY_MODES,
  COMMENT_REPLY_MODES,
  COMMENT_REPLY_STATUSES,
  CONDITION_OPERATORS,
  DEAL_STATUSES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  USER_ROLES,
  USER_STATUSES,
  WORKFLOW_ACTIONS,
  WORKFLOW_TRIGGERS,
} from './enums.js';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from './http.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Treats '' (empty form input) as null. */
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const optionalText = (max: number) =>
  z.preprocess(
    blankToNull,
    z.string().trim().max(max, `Must be ${max} characters or fewer`).nullable().optional(),
  );

const optionalEmail = z.preprocess(
  blankToNull,
  z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address')
    .max(255)
    .nullable()
    .optional(),
);

const optionalPhone = z.preprocess(
  blankToNull,
  z
    .string()
    .trim()
    .max(20, 'Phone number is too long')
    .regex(/^[+\d][\d\s()-]*$/, 'Enter a valid phone number')
    .nullable()
    .optional(),
);

const id = z.string().uuid('Invalid id');
const optionalId = z.preprocess(blankToNull, id.nullable().optional());
const optionalDate = z.preprocess(blankToNull, z.coerce.date().nullable().optional());

const tags = z
  .array(z.string().trim().min(1).max(40, 'Tags must be 40 characters or fewer'))
  .max(20, 'A record can have at most 20 tags')
  .transform((t) => [...new Set(t)]);

/** Query strings deliver repeated params as string | string[]; normalise to string[]. */
const asArray = (v: unknown) =>
  v === undefined || v === '' ? undefined : Array.isArray(v) ? v : String(v).split(',');

export const idParamSchema = z.object({ id });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
});

const sortOrder = z.enum(['asc', 'desc']).default('desc');

// ─── Auth & users ────────────────────────────────────────────────────────────

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be 128 characters or fewer');

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** First-run setup: only allowed while the database has no users. */
export const setupSchema = z.object({
  companyName: z.string().trim().min(1, 'Enter your company name').max(100),
  firstName: z.string().trim().min(1, 'Enter your first name').max(60),
  lastName: z.string().trim().max(60).default(''),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password,
});
export type SetupInput = z.infer<typeof setupSchema>;

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name').max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: password,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const createUserSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter a first name').max(60),
  lastName: z.string().trim().max(60).default(''),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  role: z.enum(USER_ROLES).default('MEMBER'),
  password,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetUserPasswordSchema = z.object({ password });
export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordSchema>;

export const updateSettingsSchema = z.object({
  companyName: z.string().trim().min(1, 'Enter your company name').max(100).optional(),
  defaultCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3, 'Use a 3-letter currency code, e.g. INR')
    .optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  aiScoringAuto: z.boolean().optional(),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

// ─── Leads ───────────────────────────────────────────────────────────────────

export const createLeadSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter a first name').max(100),
  lastName: optionalText(100),
  email: optionalEmail,
  phone: optionalPhone,
  company: optionalText(150),
  source: z.enum(LEAD_SOURCES).default('MANUAL'),
  status: z.enum(LEAD_STATUSES).exclude(['WON']).default('NEW'),
  tags: tags.default([]),
  assignedToId: optionalId,
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

// WON is only reachable through POST /leads/:id/convert.
export const updateLeadSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Enter a first name').max(100).optional(),
    lastName: optionalText(100),
    email: optionalEmail,
    phone: optionalPhone,
    company: optionalText(150),
    source: z.enum(LEAD_SOURCES).optional(),
    status: z.enum(LEAD_STATUSES).exclude(['WON']).optional(),
    lostReason: optionalText(500),
    tags: tags.optional(),
    assignedToId: optionalId,
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const LEAD_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'lastActivityAt',
  'aiScore',
  'firstName',
] as const;

export const leadListQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(200).optional(),
  status: z.preprocess(asArray, z.array(z.enum(LEAD_STATUSES)).optional()),
  source: z.preprocess(asArray, z.array(z.enum(LEAD_SOURCES)).optional()),
  tag: z.string().trim().max(40).optional(),
  assignedToId: z.union([id, z.literal('me'), z.literal('unassigned')]).optional(),
  scoreMin: z.coerce.number().int().min(0).max(100).optional(),
  scoreMax: z.coerce.number().int().min(0).max(100).optional(),
  sortBy: z.enum(LEAD_SORT_FIELDS).default('createdAt'),
  sortOrder,
});
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;

export const convertLeadSchema = z.object({
  createDeal: z.boolean().default(false),
  dealTitle: optionalText(200),
  dealValue: z.coerce.number().nonnegative().nullable().optional(),
  pipelineId: optionalId, // defaults to the default pipeline
});
export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;

export const bulkLeadsSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('delete'), ids: z.array(id).min(1).max(500) }),
  z.object({
    action: z.literal('assign'),
    ids: z.array(id).min(1).max(500),
    assignedToId: id.nullable(),
  }),
  z.object({
    action: z.literal('status'),
    ids: z.array(id).min(1).max(500),
    status: z.enum(LEAD_STATUSES).exclude(['WON']),
  }),
  z.object({
    action: z.literal('tag'),
    ids: z.array(id).min(1).max(500),
    tag: z.string().trim().min(1).max(40),
  }),
]);
export type BulkLeadsInput = z.infer<typeof bulkLeadsSchema>;

// ─── Contacts ────────────────────────────────────────────────────────────────

export const createContactSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter a first name').max(100),
  lastName: optionalText(100),
  email: optionalEmail,
  phone: optionalPhone,
  company: optionalText(150),
  jobTitle: optionalText(100),
  tags: tags.default([]),
  assignedToId: optionalId,
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = createContactSchema
  .partial()
  .extend({ tags: tags.optional() })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

export const contactListQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(40).optional(),
  assignedToId: z.union([id, z.literal('me'), z.literal('unassigned')]).optional(),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'lastActivityAt', 'firstName', 'company'])
    .default('createdAt'),
  sortOrder,
});
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

// ─── Pipelines & deals ───────────────────────────────────────────────────────

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #4F46E5');

export const stageInputSchema = z.object({
  id: id.optional(), // present = existing stage, absent = new stage
  name: z.string().trim().min(1, 'Enter a stage name').max(60),
  color: hexColor.nullable().optional(),
  probability: z.coerce.number().int().min(0).max(100).nullable().optional(),
  isWon: z.boolean().default(false),
  isLost: z.boolean().default(false),
});
export type StageInput = z.infer<typeof stageInputSchema>;

const stagesSchema = z
  .array(stageInputSchema)
  .min(3, 'A pipeline needs at least 3 stages')
  .max(20)
  .refine((s) => s.filter((x) => x.isWon).length === 1, 'Mark exactly one stage as Won')
  .refine((s) => s.filter((x) => x.isLost).length === 1, 'Mark exactly one stage as Lost')
  .refine((s) => !s.some((x) => x.isWon && x.isLost), 'A stage cannot be both Won and Lost');

export const createPipelineSchema = z.object({
  name: z.string().trim().min(1, 'Enter a pipeline name').max(60),
  isDefault: z.boolean().default(false),
  stages: stagesSchema, // array order = stage order
});
export type CreatePipelineInput = z.infer<typeof createPipelineSchema>;

/** Full replace of name + ordered stages. Stages omitted are deleted (only if they hold no deals). */
export const updatePipelineSchema = z.object({
  name: z.string().trim().min(1, 'Enter a pipeline name').max(60).optional(),
  isDefault: z.boolean().optional(),
  stages: stagesSchema.optional(),
});
export type UpdatePipelineInput = z.infer<typeof updatePipelineSchema>;

export const createDealSchema = z.object({
  title: z.string().trim().min(1, 'Enter a deal title').max(200),
  value: z.preprocess(
    blankToNull,
    z.coerce.number().nonnegative('Value cannot be negative').nullable().optional(),
  ),
  currency: z.string().trim().toUpperCase().length(3).optional(), // defaults to settings.defaultCurrency
  pipelineId: id,
  stageId: id,
  leadId: optionalId,
  contactId: optionalId,
  assignedToId: optionalId,
  expectedCloseDate: optionalDate,
});
export type CreateDealInput = z.infer<typeof createDealSchema>;

export const updateDealSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter a deal title').max(200).optional(),
    value: z.preprocess(blankToNull, z.coerce.number().nonnegative().nullable().optional()),
    currency: z.string().trim().toUpperCase().length(3).optional(),
    leadId: optionalId,
    contactId: optionalId,
    assignedToId: optionalId,
    expectedCloseDate: optionalDate,
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });
export type UpdateDealInput = z.infer<typeof updateDealSchema>;

/** Moving into the pipeline's isWon/isLost stage marks the deal WON/LOST; moving out reopens it. */
export const moveDealSchema = z.object({
  stageId: id,
  lostReason: optionalText(500),
});
export type MoveDealInput = z.infer<typeof moveDealSchema>;

export const dealListQuerySchema = paginationSchema.extend({
  pipelineId: id.optional(),
  stageId: id.optional(),
  status: z.preprocess(asArray, z.array(z.enum(DEAL_STATUSES)).optional()),
  assignedToId: z.union([id, z.literal('me'), z.literal('unassigned')]).optional(),
  leadId: id.optional(),
  contactId: id.optional(),
  search: z.string().trim().max(200).optional(),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'value', 'expectedCloseDate', 'title'])
    .default('createdAt'),
  sortOrder,
});
export type DealListQuery = z.infer<typeof dealListQuerySchema>;

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Enter a task title').max(200),
  description: optionalText(2000),
  type: z.enum(TASK_TYPES).default('FOLLOW_UP'),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  dueDate: optionalDate,
  assignedToId: optionalId, // defaults to the creator
  relatedLeadId: optionalId,
  relatedContactId: optionalId,
  relatedDealId: optionalId,
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter a task title').max(200).optional(),
    description: optionalText(2000),
    type: z.enum(TASK_TYPES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    dueDate: optionalDate,
    assignedToId: optionalId,
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const taskListQuerySchema = paginationSchema.extend({
  status: z.preprocess(asArray, z.array(z.enum(TASK_STATUSES)).optional()),
  priority: z.preprocess(asArray, z.array(z.enum(TASK_PRIORITIES)).optional()),
  assignedToId: z.union([id, z.literal('me'), z.literal('unassigned')]).optional(),
  due: z.enum(['overdue', 'today', 'week', 'none']).optional(),
  relatedLeadId: id.optional(),
  relatedContactId: id.optional(),
  relatedDealId: id.optional(),
  search: z.string().trim().max(200).optional(),
  sortBy: z.enum(['dueDate', 'createdAt', 'priority']).default('dueDate'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

// ─── Notes ───────────────────────────────────────────────────────────────────

export const createNoteSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, 'Write something first')
      .max(10_000, 'Notes are limited to 10,000 characters'),
    relatedLeadId: optionalId,
    relatedContactId: optionalId,
    relatedDealId: optionalId,
  })
  .refine(
    (n) => [n.relatedLeadId, n.relatedContactId, n.relatedDealId].filter(Boolean).length === 1,
    {
      message: 'A note must belong to exactly one lead, contact or deal',
    },
  );
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const updateNoteSchema = z.object({
  content: z.string().trim().min(1, 'Write something first').max(10_000),
});
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export const timelineQuerySchema = z.object({
  leadId: id.optional(),
  contactId: id.optional(),
  dealId: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.coerce.date().optional(), // cursor: createdAt of the last item seen
});
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;

// ─── Workflows ───────────────────────────────────────────────────────────────

export interface FieldCondition {
  field: string;
  operator: (typeof CONDITION_OPERATORS)[number];
  value?: string | number | boolean | string[] | null;
}
export interface GroupCondition {
  type: 'AND' | 'OR';
  conditions: WorkflowCondition[];
}
export type WorkflowCondition = FieldCondition | GroupCondition;

export const fieldConditionSchema: z.ZodType<FieldCondition> = z.object({
  field: z.string().min(1, 'Choose a field'),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]).optional(),
});

export const conditionSchema: z.ZodType<WorkflowCondition> = z.lazy(() =>
  z.union([
    z.object({ type: z.enum(['AND', 'OR']), conditions: z.array(conditionSchema).max(20) }),
    fieldConditionSchema,
  ]),
);

// Action configs are strict objects so the UI and the engine agree on shape.
export const workflowActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('update_lead_status'),
    config: z.object({ status: z.enum(LEAD_STATUSES).exclude(['WON']) }),
  }),
  z.object({
    type: z.literal('assign_lead'),
    config: z.union([
      z.object({ strategy: z.literal('user'), userId: id }),
      z.object({ strategy: z.literal('round_robin') }),
    ]),
  }),
  z.object({
    type: z.literal('add_tag'),
    config: z.object({ tag: z.string().trim().min(1).max(40) }),
  }),
  z.object({
    type: z.literal('create_task'),
    config: z.object({
      title: z.string().trim().min(1, 'Enter a task title').max(200),
      taskType: z.enum(TASK_TYPES).default('FOLLOW_UP'),
      priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
      dueInHours: z.coerce
        .number()
        .int()
        .min(0)
        .max(24 * 90)
        .default(24),
      assignTo: z.union([z.literal('record_owner'), id]).default('record_owner'),
    }),
  }),
  z.object({
    type: z.literal('send_notification'),
    config: z.object({
      recipient: z.union([z.literal('record_owner'), z.literal('all_admins'), id]),
      title: z.string().trim().min(1, 'Enter a title').max(120),
      body: z.string().trim().max(500).default(''),
    }),
  }),
  z.object({ type: z.literal('rescore_lead'), config: z.object({}).default({}) }),
  z.object({
    type: z.literal('outbound_webhook'),
    config: z.object({
      url: z
        .string()
        .url('Enter a valid URL')
        .refine((u) => u.startsWith('https://'), 'The URL must start with https://'),
      headers: z.record(z.string().max(500)).default({}),
    }),
  }),
]);
export type WorkflowAction = z.infer<typeof workflowActionSchema>;

// Make sure every action in WORKFLOW_ACTIONS has a config schema above.
type _AllActionsCovered = WorkflowAction['type'] extends (typeof WORKFLOW_ACTIONS)[number]
  ? (typeof WORKFLOW_ACTIONS)[number] extends WorkflowAction['type']
    ? true
    : never
  : never;
export const _allActionsCovered: _AllActionsCovered = true;

export const workflowDefinitionSchema = z.object({
  trigger: z.object({
    type: z.enum(WORKFLOW_TRIGGERS),
    // e.g. LEAD_STATUS_CHANGED: { toStatus: 'QUALIFIED' }; DEAL_STAGE_MOVED: { stageId }
    config: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  }),
  conditions: z.array(conditionSchema).max(20).default([]), // AND-ed together
  actions: z.array(workflowActionSchema).min(1, 'Add at least one action').max(10),
});
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

export const createWorkflowSchema = z.object({
  name: z.string().trim().min(1, 'Enter a workflow name').max(100),
  description: optionalText(500),
  isActive: z.boolean().default(false),
  definition: workflowDefinitionSchema,
});
export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;

export const updateWorkflowSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a workflow name').max(100).optional(),
    description: optionalText(500),
    isActive: z.boolean().optional(),
    definition: workflowDefinitionSchema.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;

// ─── Misc ────────────────────────────────────────────────────────────────────

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const analyticsQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d', '365d']).default('30d'),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export const notificationListQuerySchema = paginationSchema.extend({
  unreadOnly: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

// ─── Instagram & auto-reply ──────────────────────────────────────────────────

export const IG_DM_MAX_LENGTH = 1000; // Instagram's limit for a text DM
export const IG_COMMENT_MAX_LENGTH = 2200;

export const connectInstagramSchema = z.object({
  accessToken: z
    .string()
    .trim()
    .min(20, 'Paste the full access token from the Meta dashboard')
    .max(1000),
});
export type ConnectInstagramInput = z.infer<typeof connectInstagramSchema>;

export const conversationListQuerySchema = paginationSchema.extend({
  filter: z.enum(['all', 'unread', 'attention']).default('all'),
  search: z.string().trim().max(100).optional(),
});
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;

export const sendMessageSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Write a message first')
    .max(IG_DM_MAX_LENGTH, `Instagram messages are limited to ${IG_DM_MAX_LENGTH} characters`),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/** Approve (optionally edited) or discard an AI draft. */
export const draftActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('send'),
    text: z.string().trim().min(1, 'Write a message first').max(IG_DM_MAX_LENGTH).optional(),
  }),
  z.object({ action: z.literal('discard') }),
]);
export type DraftActionInput = z.infer<typeof draftActionSchema>;

export const updateConversationSchema = z
  .object({
    aiEnabled: z.boolean().optional(),
    leadId: optionalId, // link to an existing lead (null to unlink)
    markRead: z.literal(true).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;

export const commentListQuerySchema = paginationSchema.extend({
  status: z.preprocess(asArray, z.array(z.enum(COMMENT_REPLY_STATUSES)).optional()),
  mediaId: z.string().max(64).optional(),
  search: z.string().trim().max(100).optional(),
  /** By commentedAt: newest first (default) or oldest first. */
  sortOrder,
});
export type CommentListQuery = z.infer<typeof commentListQuerySchema>;

/** Reply to a comment manually, or approve (optionally edited) an AI draft. */
export const commentReplySchema = z
  .object({
    publicReply: z.preprocess(
      blankToNull,
      z.string().trim().max(IG_COMMENT_MAX_LENGTH).nullable().optional(),
    ),
    privateReply: z.preprocess(
      blankToNull,
      z.string().trim().max(IG_DM_MAX_LENGTH).nullable().optional(),
    ),
  })
  .refine((d) => Boolean(d.publicReply || d.privateReply), {
    message: 'Write a public reply, a private message, or both',
  });
export type CommentReplyInput = z.infer<typeof commentReplySchema>;

export const updateAutoReplySettingsSchema = z.object({
  dmEnabled: z.boolean().optional(),
  commentsEnabled: z.boolean().optional(),
  mode: z.enum(AUTO_REPLY_MODES).optional(),
  commentReplyMode: z.enum(COMMENT_REPLY_MODES).optional(),
  businessInfo: z.string().trim().max(8000, 'Keep business info under 8,000 characters').optional(),
  tone: z.string().trim().max(300).optional(),
  handoffMessage: z.string().trim().max(IG_DM_MAX_LENGTH).optional(),
  replyDelaySeconds: z.coerce.number().int().min(0).max(300).optional(),
  maxRepliesPerDay: z.coerce.number().int().min(1).max(200).optional(),
  createLeads: z.boolean().optional(),
  collectContactDetails: z.boolean().optional(),
});
export type UpdateAutoReplySettingsInput = z.infer<typeof updateAutoReplySettingsSchema>;

/** Try the AI without sending anything. */
export const testAutoReplySchema = z.object({
  kind: z.enum(['dm', 'comment']).default('dm'),
  text: z.string().trim().min(1, 'Write a sample message').max(1000),
});
export type TestAutoReplyInput = z.infer<typeof testAutoReplySchema>;

/** Test mode only: inject a fake incoming DM or comment through the real pipeline. */
export const simulateInstagramSchema = z.object({
  kind: z.enum(['dm', 'comment']),
  username: z
    .string()
    .trim()
    .min(1, 'Enter a username')
    .max(30)
    .regex(/^[a-zA-Z0-9._]+$/, 'Use letters, numbers, dots and underscores'),
  text: z.string().trim().min(1, 'Write a message').max(1000),
});
export type SimulateInstagramInput = z.infer<typeof simulateInstagramSchema>;
