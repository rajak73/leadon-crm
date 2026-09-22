import { describe, expect, it } from 'vitest';
import { scoreWithRules } from './ai.rules.js';
import type { LeadContext } from './ai.types.js';

const now = new Date('2026-09-01T10:00:00Z');
const ctx = (
  lead: Partial<LeadContext['lead']> = {},
  extra: Partial<LeadContext> = {},
): LeadContext => ({
  lead: {
    firstName: 'Asha',
    lastName: null,
    email: null,
    phone: null,
    company: null,
    source: 'MANUAL',
    status: 'NEW',
    tags: [],
    createdAt: now,
    lastActivityAt: null,
    ...lead,
  },
  openDeals: [],
  activities: [],
  now,
  ...extra,
});

describe('rules-v1 scorer', () => {
  it('gives a bare lead a low score with explanations', () => {
    const r = scoreWithRules(ctx());
    expect(r).toMatchObject({ score: 10, modelVersion: 'rules-v1' });
    expect(r.factors).toEqual([
      { type: 'NEGATIVE', description: 'No email address (-5)' },
      { type: 'NEGATIVE', description: 'No phone number (-5)' },
    ]);
    expect(r.recommendation).toMatch(/Cold lead/);
  });

  it('rewards contact details, progress, referrals, recent activity, deals and hot tags', () => {
    const r = scoreWithRules(
      ctx(
        {
          email: 'a@b.in',
          phone: '+91 1',
          company: 'Zerodha',
          status: 'NEGOTIATION',
          source: 'REFERRAL',
          tags: ['VIP'],
          lastActivityAt: new Date(now.getTime() - 3600_000),
        },
        { openDeals: [{ title: 'D', value: 1000, currency: 'INR', stageName: 'Proposal' }] },
      ),
    );
    // 20 + 15 + 10 + 10 + 25 + 10 + 10 + 15 + 5 + 10 = 130 → clamped
    expect(r.score).toBe(100);
    expect(r.recommendation).toMatch(/Hot lead/);
    expect(r.factors.every((f) => f.type === 'POSITIVE')).toBe(true);
  });

  it('penalises lost, stale and cold leads and never goes below 0', () => {
    const r = scoreWithRules(
      ctx({ status: 'LOST', tags: ['cold'], createdAt: new Date(now.getTime() - 90 * 86400_000) }),
    );
    expect(r.score).toBe(0);
    expect(r.factors.map((f) => f.description)).toEqual(
      expect.arrayContaining([
        'Marked as lost (-30)',
        'No activity in over 30 days (-10)',
        'Tagged "cold" (-15)',
      ]),
    );
    expect(r.recommendation).toMatch(/lost/);
  });

  it('scores converted leads 100', () => {
    expect(scoreWithRules(ctx({ status: 'WON' })).score).toBe(100);
  });

  it('is deterministic', () => {
    const c = ctx({ email: 'x@y.in', source: 'WEBSITE', status: 'QUALIFIED' });
    expect(scoreWithRules(c)).toEqual(scoreWithRules(c));
    expect(scoreWithRules(c).score).toBe(20 + 15 - 5 + 15 + 5);
  });
});
