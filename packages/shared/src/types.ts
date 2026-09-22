// Response shapes returned by the API (inside SuccessEnvelope.data). Dates are ISO strings.

import type {
  ActivityType,
  AiProvider,
  AutoReplyMode,
  CommentReplyMode,
  CommentReplyStatus,
  IgAccountStatus,
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
  WorkflowRunStatus,
  WorkflowTrigger,
} from './enums.js';
import type { WorkflowDefinition } from './schemas.js';

type ISODate = string;

/** Compact user reference embedded in other records. */
export interface UserRef {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface User extends UserRef {
  role: UserRole;
  status: UserStatus;
  lastLoginAt: ISODate | null;
  createdAt: ISODate;
}

export interface AppSettings {
  companyName: string;
  defaultCurrency: string;
  timezone: string;
  aiScoringAuto: boolean;
  aiProvider: AiProvider; // 'rules' when no AI key is configured (scoring then uses built-in rules; AI replies are unavailable)
  aiModel: string | null; // e.g. 'gemini-2.5-flash'; null for 'rules'
}

/** GET /auth/status — tells the login screen whether first-run setup is needed. */
export interface AuthStatus {
  needsSetup: boolean;
  companyName: string | null;
}

export interface AuthSession {
  accessToken: string;
  expiresIn: number; // seconds
  user: User;
}

export interface Lead {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: LeadSource;
  status: LeadStatus;
  tags: string[];
  lostReason: string | null;
  aiScore: number | null;
  aiScoreUpdatedAt: ISODate | null;
  assignedTo: UserRef | null;
  createdBy: UserRef;
  convertedToContactId: string | null;
  lastActivityAt: ISODate | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface LeadDetail extends Lead {
  latestScore: AiScore | null;
  openTaskCount: number;
  deals: DealSummary[];
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  tags: string[];
  assignedTo: UserRef | null;
  createdBy: UserRef;
  lastActivityAt: ISODate | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface ContactDetail extends Contact {
  deals: DealSummary[];
  convertedFromLeadId: string | null;
}

export interface PipelineStage {
  id: string;
  name: string;
  order: number;
  color: string | null;
  probability: number | null;
  isWon: boolean;
  isLost: boolean;
  dealCount: number;
  totalValue: number;
}

export interface Pipeline {
  id: string;
  name: string;
  isDefault: boolean;
  stages: PipelineStage[]; // sorted by order
  createdAt: ISODate;
}

export interface DealSummary {
  id: string;
  title: string;
  value: number | null;
  currency: string;
  status: DealStatus;
  stageId: string;
  stageName: string;
}

export interface Deal {
  id: string;
  title: string;
  value: number | null;
  currency: string;
  status: DealStatus;
  pipelineId: string;
  stage: { id: string; name: string; color: string | null };
  lead: { id: string; firstName: string; lastName: string | null } | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string | null;
    company: string | null;
  } | null;
  assignedTo: UserRef | null;
  createdBy: UserRef;
  expectedCloseDate: ISODate | null;
  closedAt: ISODate | null;
  lostReason: string | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** GET /pipelines/:id/board — everything the kanban needs in one request. */
export interface PipelineBoard {
  pipeline: Pipeline;
  deals: Deal[]; // OPEN deals + deals closed in the last 30 days
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: ISODate | null;
  completedAt: ISODate | null;
  isOverdue: boolean;
  assignedTo: UserRef | null;
  createdBy: UserRef;
  relatedLead: { id: string; name: string } | null;
  relatedContact: { id: string; name: string } | null;
  relatedDeal: { id: string; title: string } | null;
  createdAt: ISODate;
}

export interface Note {
  id: string;
  content: string;
  createdBy: UserRef;
  relatedLeadId: string | null;
  relatedContactId: string | null;
  relatedDealId: string | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Activity {
  id: string;
  type: ActivityType;
  description: string; // human-readable, e.g. "Status changed from New to Contacted"
  metadata: Record<string, unknown>;
  performedBy: UserRef | null; // null = automation
  relatedLeadId: string | null;
  relatedContactId: string | null;
  relatedDealId: string | null;
  createdAt: ISODate;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType:
    | 'lead'
    | 'contact'
    | 'deal'
    | 'task'
    | 'ig_conversation'
    | 'ig_comment'
    | 'instagram'
    | null;
  entityId: string | null;
  readAt: ISODate | null;
  createdAt: ISODate;
}

export interface ScoringFactor {
  type: 'POSITIVE' | 'NEGATIVE';
  description: string;
}

export interface AiScore {
  id: string;
  leadId: string;
  score: number; // 0–100
  factors: ScoringFactor[];
  recommendation: string;
  modelVersion: string; // e.g. "gpt-4o-mini" or "rules-v1"
  triggeredBy: 'manual' | 'auto' | 'workflow';
  createdAt: ISODate;
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  triggerType: WorkflowTrigger;
  definition: WorkflowDefinition;
  isActive: boolean;
  createdBy: UserRef;
  lastRunAt: ISODate | null;
  runCount: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface WorkflowActionLog {
  type: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  message: string;
  at: ISODate;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: WorkflowRunStatus;
  triggerEvent: { type: WorkflowTrigger; entityId: string };
  actionLogs: WorkflowActionLog[];
  error: string | null;
  startedAt: ISODate;
  finishedAt: ISODate | null;
}

export interface SearchResults {
  leads: Array<{ id: string; name: string; email: string | null; status: LeadStatus }>;
  contacts: Array<{ id: string; name: string; email: string | null; company: string | null }>;
  deals: Array<{
    id: string;
    title: string;
    value: number | null;
    currency: string;
    status: DealStatus;
  }>;
}

export interface ImportResult {
  total: number;
  created: number;
  skipped: number; // duplicates by email within the file or already in the database
  errors: Array<{ row: number; message: string }>; // row = 1-based data row
}

export interface DashboardSummary {
  range: '7d' | '30d' | '90d' | '365d';
  currency: string; // settings.defaultCurrency; values from other currencies are excluded
  kpis: {
    newLeads: { value: number; previous: number };
    conversionRate: { value: number; previous: number }; // 0–1, leads WON / leads closed
    openPipelineValue: { value: number };
    wonValue: { value: number; previous: number };
    openTasks: { value: number; overdue: number };
  };
  leadsOverTime: Array<{ date: string; count: number }>; // date = YYYY-MM-DD, zero-filled
  leadsByStatus: Array<{ status: LeadStatus; count: number }>;
  leadsBySource: Array<{ source: LeadSource; count: number }>;
  pipelineByStage: Array<{
    stageId: string;
    stageName: string;
    color: string | null;
    count: number;
    value: number;
  }>;
  topPerformers: Array<{ user: UserRef; wonCount: number; wonValue: number }>;
}

// ─── Instagram & auto-reply ──────────────────────────────────────────────────

/** GET /instagram/status — everything the Instagram settings page needs. */
export interface InstagramStatus {
  connected: boolean;
  account: {
    igUserId: string;
    username: string;
    name: string | null;
    profilePictureUrl: string | null;
    status: IgAccountStatus;
    statusMessage: string | null; // human-readable problem, e.g. "The access token has expired."
    tokenExpiresAt: ISODate | null;
    lastWebhookAt: ISODate | null;
    connectedAt: ISODate;
  } | null;
  /** Values the admin must paste into the Meta app dashboard. */
  webhook: {
    callbackUrl: string; // `${PUBLIC_URL}/api/webhooks/instagram`
    verifyToken: string;
    isPublicUrl: boolean; // false when PUBLIC_URL is localhost — Meta cannot reach it
  };
  appSecretConfigured: boolean; // META_APP_SECRET set (needed to verify webhooks)
  testMode: boolean; // INSTAGRAM_TEST_MODE: sends are simulated, simulate endpoint enabled
  /** INSTAGRAM_ACCESS_TOKEN is set on the server: the account connects itself on start-up. */
  managedByServer: boolean;
}

export interface IgAttachment {
  type: 'image' | 'video' | 'audio' | 'file' | 'share' | 'story_mention' | 'reel' | 'unknown';
  url: string | null;
}

export interface IgMessage {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  text: string | null;
  attachments: IgAttachment[];
  author: MessageAuthor;
  sentBy: UserRef | null;
  status: MessageStatus;
  error: string | null; // user-friendly
  createdAt: ISODate;
  sentAt: ISODate | null;
}

export interface IgConversation {
  id: string;
  igsid: string;
  username: string | null;
  name: string | null;
  profilePictureUrl: string | null;
  lead: { id: string; firstName: string; lastName: string | null; status: LeadStatus } | null;
  aiEnabled: boolean;
  aiPausedReason: string | null;
  needsAttention: boolean;
  hasDraft: boolean;
  unreadCount: number;
  lastMessageAt: ISODate | null;
  lastMessagePreview: string | null;
  /** When the 24-hour window to reply closes; null if the customer never wrote. */
  replyWindowEndsAt: ISODate | null;
  canReply: boolean; // replyWindowEndsAt is in the future
  createdAt: ISODate;
}

export interface IgConversationDetail extends IgConversation {
  messages: IgMessage[]; // oldest first, last 100
}

export interface IgComment {
  id: string;
  commentId: string;
  parentCommentId: string | null;
  media: {
    id: string;
    permalink: string | null;
    caption: string | null;
    thumbnailUrl: string | null;
  };
  fromUsername: string | null;
  text: string;
  lead: { id: string; firstName: string; lastName: string | null } | null;
  replyStatus: CommentReplyStatus;
  publicReply: string | null;
  privateReply: string | null;
  privateReplySent: boolean;
  replyError: string | null;
  skipReason: string | null;
  repliedBy: UserRef | null;
  commentedAt: ISODate;
}

/** GET /instagram/comments/posts — one row per post that has comments. */
export interface IgCommentPost {
  mediaId: string;
  permalink: string | null;
  caption: string | null;
  thumbnailUrl: string | null;
  commentCount: number;
  needsReplyCount: number; // replyStatus NONE or FAILED
  draftCount: number; // replyStatus DRAFT
  latestCommentAt: ISODate;
  /** Newest comment that needs a reply or has a draft; null when all are answered. */
  latestPendingAt: ISODate | null;
}

export interface AutoReplySettings {
  dmEnabled: boolean;
  commentsEnabled: boolean;
  mode: AutoReplyMode;
  commentReplyMode: CommentReplyMode;
  businessInfo: string;
  tone: string;
  handoffMessage: string;
  replyDelaySeconds: number;
  maxRepliesPerDay: number;
  createLeads: boolean;
  /** AI asks for the customer's name and phone number (after answering) when the lead has no phone. */
  collectContactDetails: boolean;
  /** Read-only: which AI answers. 'rules' means no key is set and AI replies are off. */
  aiProvider: AiProvider;
  aiModel: string | null;
}

/** POST /auto-reply/test and POST /instagram/conversations/:id/suggest */
export interface AiReplyPreview {
  reply: string | null; // null when the AI decided a person should answer
  handoff: boolean;
  handoffReason: string | null;
  extracted: { name: string | null; email: string | null; phone: string | null };
  provider: AiProvider;
  model: string | null;
}

export interface CommentReplyPreview {
  skip: boolean;
  skipReason: string | null;
  publicReply: string | null;
  privateReply: string | null;
  provider: AiProvider;
  model: string | null;
}

export interface InboxCounts {
  unreadConversations: number;
  needsAttention: number; // conversations with a handoff or a draft waiting
  commentDrafts: number;
  commentsUnanswered: number; // replyStatus NONE or FAILED, last 7 days
}
