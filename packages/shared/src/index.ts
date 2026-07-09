/**
 * @leados/shared — single source of truth for enums, roles, and validation
 * shared between the API and the web app. Mirrors the BRD (§9 roles,
 * §10.2 password rule, §10.6 lead statuses/sources, §10.8 pipeline stages).
 */

// ---------------------------------------------------------------------------
// Roles (BRD §9)
// ---------------------------------------------------------------------------
export const OrgRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  SALES_MANAGER: 'SALES_MANAGER',
  SALES_AGENT: 'SALES_AGENT',
  SUPPORT_AGENT: 'SUPPORT_AGENT',
} as const;
export type OrgRole = (typeof OrgRole)[keyof typeof OrgRole];

export const ORG_ROLES: OrgRole[] = Object.values(OrgRole);

/** Human-friendly labels for UI. */
export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  OWNER: 'Organization Owner',
  ADMIN: 'Organization Admin',
  SALES_MANAGER: 'Sales Manager',
  SALES_AGENT: 'Sales Agent',
  SUPPORT_AGENT: 'Support Agent',
};

// ---------------------------------------------------------------------------
// Lead statuses & sources (BRD §10.6)
// ---------------------------------------------------------------------------
export const LeadStatus = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  QUALIFIED: 'QUALIFIED',
  PROPOSAL_SENT: 'PROPOSAL_SENT',
  NEGOTIATION: 'NEGOTIATION',
  WON: 'WON',
  LOST: 'LOST',
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];
export const LEAD_STATUSES: LeadStatus[] = Object.values(LeadStatus);

export const LeadSource = {
  INSTAGRAM: 'INSTAGRAM',
  WHATSAPP: 'WHATSAPP',
  FACEBOOK: 'FACEBOOK',
  WEBSITE: 'WEBSITE',
  MANUAL: 'MANUAL',
  REFERRAL: 'REFERRAL',
  CAMPAIGN: 'CAMPAIGN',
  IMPORT: 'IMPORT',
} as const;
export type LeadSource = (typeof LeadSource)[keyof typeof LeadSource];
export const LEAD_SOURCES: LeadSource[] = Object.values(LeadSource);

// ---------------------------------------------------------------------------
// Pipeline stages (BRD §10.8)
// ---------------------------------------------------------------------------
export const DEFAULT_PIPELINE_STAGES = [
  { key: 'NEW_LEAD', name: 'New Lead', order: 1, probability: 10 },
  { key: 'CONTACTED', name: 'Contacted', order: 2, probability: 25 },
  { key: 'QUALIFIED', name: 'Qualified', order: 3, probability: 40 },
  { key: 'PROPOSAL_SENT', name: 'Proposal Sent', order: 4, probability: 60 },
  { key: 'NEGOTIATION', name: 'Negotiation', order: 5, probability: 80 },
  { key: 'WON', name: 'Won', order: 6, probability: 100 },
  { key: 'LOST', name: 'Lost', order: 7, probability: 0 },
] as const;

// ---------------------------------------------------------------------------
// Task status & priority (BRD §10.9)
// ---------------------------------------------------------------------------
export const TaskStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

// ---------------------------------------------------------------------------
// Conversation channels (BRD §10.10)
// ---------------------------------------------------------------------------
export const Channel = {
  INSTAGRAM: 'INSTAGRAM',
  WHATSAPP: 'WHATSAPP',
  FACEBOOK: 'FACEBOOK',
  INTERNAL: 'INTERNAL',
} as const;
export type Channel = (typeof Channel)[keyof typeof Channel];

// ---------------------------------------------------------------------------
// Password validation (BRD §10.2)
//  min 8, >=1 uppercase, >=1 number, >=1 special char
// ---------------------------------------------------------------------------
export const PASSWORD_RULE = {
  minLength: 8,
  hint:
    'Minimum 8 characters, at least one uppercase letter, one number, and one special character. Example: LeadOS@123',
};

export function validatePassword(pw: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!pw || pw.length < PASSWORD_RULE.minLength)
    errors.push(`Password must be at least ${PASSWORD_RULE.minLength} characters.`);
  if (!/[A-Z]/.test(pw)) errors.push('Password must contain at least one uppercase letter.');
  if (!/[0-9]/.test(pw)) errors.push('Password must contain at least one number.');
  if (!/[^A-Za-z0-9]/.test(pw)) errors.push('Password must contain at least one special character.');
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Billing plans & usage limits (BRD §15.2, §19.3)
// ---------------------------------------------------------------------------
export const Plan = {
  TRIAL: 'TRIAL',
  STARTER: 'STARTER',
  PRO: 'PRO',
  ENTERPRISE: 'ENTERPRISE',
} as const;
export type Plan = (typeof Plan)[keyof typeof Plan];

export interface PlanDef {
  key: Plan;
  name: string;
  priceMonthly: number; // in INR
  limits: { leads: number; members: number; deals: number }; // -1 = unlimited
  features: string[];
}

export const PLANS: Record<Plan, PlanDef> = {
  TRIAL: {
    key: 'TRIAL',
    name: 'Trial',
    priceMonthly: 0,
    limits: { leads: 100, members: 3, deals: 50 },
    features: ['Core CRM', 'Social simulation', '14-day trial'],
  },
  STARTER: {
    key: 'STARTER',
    name: 'Starter',
    priceMonthly: 0,
    limits: { leads: 500, members: 3, deals: 200 },
    features: ['1 workspace', 'Up to 500 leads', 'Social simulation'],
  },
  PRO: {
    key: 'PRO',
    name: 'Pro',
    priceMonthly: 2499,
    limits: { leads: -1, members: 25, deals: -1 },
    features: ['Unlimited leads', 'Pipeline & tasks', 'Team roles', 'AI scoring'],
  },
  ENTERPRISE: {
    key: 'ENTERPRISE',
    name: 'Enterprise',
    priceMonthly: -1, // custom
    limits: { leads: -1, members: -1, deals: -1 },
    features: ['Real Meta integration', 'AI features', 'Priority support', 'Custom limits'],
  },
};

export function planLimit(plan: string, resource: 'leads' | 'members' | 'deals'): number {
  const def = PLANS[(plan as Plan)] ?? PLANS.TRIAL;
  return def.limits[resource];
}

// ---------------------------------------------------------------------------
// Slug helper (organization slugs)
// ---------------------------------------------------------------------------
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Shared DTO types
// ---------------------------------------------------------------------------
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
}

export interface OrgMembership {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: OrgRole;
}
