/**
 * Deterministic, rule-based fallbacks for AI features (BRD §13.1: works with
 * no AI key). Used whenever the AI provider is disabled/unavailable so lead
 * scoring, reply suggestions and summaries still function.
 */

export interface LeadLike {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status?: string | null;
  notes?: string | null;
  messageCount?: number;
}

/** Score 0–100 with a short reason (transparent, explainable). */
export function ruleScore(lead: LeadLike): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (lead.phone) { score += 20; reasons.push('Has phone (+20)'); }
  if (lead.email) { score += 15; reasons.push('Has email (+15)'); }
  if (lead.name && lead.name !== 'New Lead' && lead.name !== 'Unknown Contact') {
    score += 10; reasons.push('Has name (+10)');
  }

  // Higher-intent sources.
  const hotSources = ['REFERRAL', 'WEBSITE', 'CAMPAIGN'];
  if (lead.source && hotSources.includes(lead.source)) { score += 15; reasons.push(`High-intent source ${lead.source} (+15)`); }
  else if (lead.source && ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK'].includes(lead.source)) { score += 10; reasons.push(`Social source ${lead.source} (+10)`); }

  // Pipeline progress.
  const statusWeight: Record<string, number> = {
    NEW: 0, CONTACTED: 10, QUALIFIED: 20, PROPOSAL_SENT: 25, NEGOTIATION: 30, WON: 40, LOST: -10,
  };
  const sw = statusWeight[lead.status ?? 'NEW'] ?? 0;
  if (sw !== 0) { score += sw; reasons.push(`Stage ${lead.status} (${sw > 0 ? '+' : ''}${sw})`); }

  // Engagement.
  if ((lead.messageCount ?? 0) >= 3) { score += 10; reasons.push('Engaged (3+ messages, +10)'); }

  // Intent keywords in notes.
  const text = (lead.notes ?? '').toLowerCase();
  if (/\b(buy|price|pricing|quote|book|demo|urgent|budget|interested)\b/.test(text)) {
    score += 10; reasons.push('Buying-intent keywords (+10)');
  }

  score = Math.max(0, Math.min(100, score));
  return { score, reasons };
}

/** Suggest up to 3 reply drafts based on lead/message state. */
export function ruleReplySuggestions(ctx: { lastInbound?: string; leadName?: string | null; hasPhone?: boolean }): string[] {
  const name = ctx.leadName && ctx.leadName !== 'New Lead' ? ctx.leadName : 'there';
  const suggestions: string[] = [];
  if (!ctx.hasPhone) {
    suggestions.push(`Hi ${name}, thanks for reaching out! Could you share your phone number so our team can call you?`);
  }
  suggestions.push(`Hi ${name}, happy to help. Would you like to schedule a quick call to discuss the details?`);
  suggestions.push(`Thanks ${name}! I'll share the pricing and options right away — is there a preferred time to connect?`);
  return suggestions.slice(0, 3);
}

/** Simple extractive summary of a conversation. */
export function ruleSummary(messages: Array<{ direction: string; body: string }>): string {
  if (messages.length === 0) return 'No messages yet.';
  const inbound = messages.filter((m) => m.direction === 'INBOUND');
  const first = inbound[0]?.body ?? messages[0].body;
  const last = messages[messages.length - 1].body;
  return `Conversation with ${messages.length} message(s). Opened with: "${truncate(first, 80)}". Latest: "${truncate(last, 80)}".`;
}

/** Rule-based sentiment: positive | neutral | negative with a score -1..1. */
export function ruleSentiment(text: string): { label: 'positive' | 'neutral' | 'negative'; score: number } {
  const t = (text || '').toLowerCase();
  const pos = ['thanks', 'great', 'love', 'interested', 'yes', 'perfect', 'good', 'awesome', 'please', 'want', 'buy'];
  const neg = ['no', 'not', 'expensive', 'bad', 'angry', 'refund', 'cancel', 'worst', 'never', 'disappointed', 'problem', 'issue'];
  let s = 0;
  for (const w of pos) if (t.includes(w)) s += 1;
  for (const w of neg) if (t.includes(w)) s -= 1;
  const score = Math.max(-1, Math.min(1, s / 3));
  return { label: score > 0.15 ? 'positive' : score < -0.15 ? 'negative' : 'neutral', score: Number(score.toFixed(2)) };
}

/** Deal close probability 0–100 from stage + value + age (deterministic). */
export function ruleCloseProbability(deal: {
  stageProbability?: number;
  status?: string;
  ageDays?: number;
}): { probability: number; reasons: string[] } {
  const reasons: string[] = [];
  let p = deal.stageProbability ?? 20;
  reasons.push(`Base from stage (${p}%)`);
  if (deal.status === 'WON') return { probability: 100, reasons: ['Deal already won'] };
  if (deal.status === 'LOST') return { probability: 0, reasons: ['Deal already lost'] };
  // Stale deals lose probability.
  if ((deal.ageDays ?? 0) > 30) { p = Math.max(5, p - 15); reasons.push('Stale >30 days (-15)'); }
  else if ((deal.ageDays ?? 0) > 14) { p = Math.max(5, p - 5); reasons.push('Aging >14 days (-5)'); }
  return { probability: Math.round(p), reasons };
}

/** Next best action recommendation for a lead. */
export function ruleNextBestAction(lead: {
  status?: string | null;
  hasPhone?: boolean;
  hasEmail?: boolean;
  captureState?: string | null;
  lastActivityDays?: number;
}): { action: string; why: string } {
  if (lead.captureState && lead.captureState !== 'COMPLETE') {
    return { action: 'Collect contact details', why: 'Lead has not shared full name/phone yet.' };
  }
  if (!lead.hasPhone) return { action: 'Get phone number', why: 'No phone on file — hard to follow up.' };
  switch (lead.status) {
    case 'NEW': return { action: 'Make first contact call', why: 'New lead — respond fast to boost conversion.' };
    case 'CONTACTED': return { action: 'Qualify the lead', why: 'Contacted — confirm budget/need to qualify.' };
    case 'QUALIFIED': return { action: 'Send a proposal', why: 'Qualified — move to proposal.' };
    case 'PROPOSAL_SENT': return { action: 'Follow up on proposal', why: 'Proposal sent — check for questions.' };
    case 'NEGOTIATION': return { action: 'Close the deal', why: 'In negotiation — push to close.' };
    default: return { action: 'Review lead', why: 'Keep momentum with a timely touchpoint.' };
  }
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
