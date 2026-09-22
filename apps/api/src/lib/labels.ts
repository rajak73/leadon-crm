import type {
  DealStatus,
  LeadSource,
  LeadStatus,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '@leados/shared';

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  MANUAL: 'Manual',
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

export const DEAL_STATUS_LABEL: Record<DealStatus, string> = {
  OPEN: 'Open',
  WON: 'Won',
  LOST: 'Lost',
};

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  CALL: 'Call',
  EMAIL: 'Email',
  MEETING: 'Meeting',
  FOLLOW_UP: 'Follow-up',
  DEMO: 'Demo',
  OTHER: 'Other',
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const fullName = (p: { firstName: string; lastName?: string | null }) =>
  [p.firstName, p.lastName].filter(Boolean).join(' ');
