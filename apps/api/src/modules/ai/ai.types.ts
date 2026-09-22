import type { LeadSource, LeadStatus, ScoringFactor } from '@leados/shared';

/** Everything the scorers look at. Built from the database by the AI service. */
export interface LeadContext {
  lead: {
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    source: LeadSource;
    status: LeadStatus;
    tags: string[];
    createdAt: Date;
    lastActivityAt: Date | null;
  };
  openDeals: Array<{ title: string; value: number | null; currency: string; stageName: string }>;
  activities: Array<{ type: string; description: string; createdAt: Date }>; // newest first, max 20
  now: Date;
}

export interface ScoreResult {
  score: number;
  factors: ScoringFactor[];
  recommendation: string;
  modelVersion: string;
}

export const clampScore = (n: number) =>
  Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));
