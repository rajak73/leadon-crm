/**
 * AI service (BRD §13.2). Each function tries the configured AI provider first;
 * if AI is disabled or the call fails, it falls back to deterministic
 * heuristics so the feature always returns a useful result (BRD §13.1).
 */
import { getProvider, isAiEnabled } from './provider.js';
import {
  ruleScore,
  ruleReplySuggestions,
  ruleSummary,
  ruleSentiment,
  ruleCloseProbability,
  ruleNextBestAction,
  type LeadLike,
} from './heuristics.js';

export interface ScoreResult {
  score: number;
  reasons: string[];
  method: 'ai' | 'rules';
}

export async function scoreLead(lead: LeadLike): Promise<ScoreResult> {
  const provider = getProvider();
  if (isAiEnabled() && provider) {
    try {
      const out = await provider.complete(
        [
          {
            role: 'system',
            content:
              'You are a CRM lead-scoring assistant. Given a lead, respond ONLY with strict JSON: {"score": <0-100 int>, "reasons": ["short reason", ...]}. Higher = more likely to convert.',
          },
          { role: 'user', content: JSON.stringify(lead) },
        ],
        { temperature: 0.2, maxTokens: 200 }
      );
      const parsed = safeJson(out);
      if (parsed && typeof parsed.score === 'number') {
        return {
          score: Math.max(0, Math.min(100, Math.round(parsed.score))),
          reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 6).map(String) : [],
          method: 'ai',
        };
      }
    } catch {
      /* fall through to rules */
    }
  }
  const r = ruleScore(lead);
  return { ...r, method: 'rules' };
}

export interface ReplyResult {
  suggestions: string[];
  method: 'ai' | 'rules';
}

export async function suggestReplies(ctx: {
  lastInbound?: string;
  leadName?: string | null;
  hasPhone?: boolean;
  channel?: string;
}): Promise<ReplyResult> {
  const provider = getProvider();
  if (isAiEnabled() && provider) {
    try {
      const out = await provider.complete(
        [
          {
            role: 'system',
            content:
              'You are a helpful sales assistant. Suggest 3 short, friendly reply options for the salesperson. Respond ONLY with a JSON array of 3 strings.',
          },
          {
            role: 'user',
            content: `Channel: ${ctx.channel ?? 'chat'}. Lead name: ${ctx.leadName ?? 'unknown'}. Last customer message: "${ctx.lastInbound ?? ''}". Phone on file: ${ctx.hasPhone ? 'yes' : 'no'}.`,
          },
        ],
        { temperature: 0.6, maxTokens: 300 }
      );
      const parsed = safeJson(out);
      if (Array.isArray(parsed)) return { suggestions: parsed.slice(0, 3).map(String), method: 'ai' };
    } catch {
      /* fall through */
    }
  }
  return { suggestions: ruleReplySuggestions(ctx), method: 'rules' };
}

export interface SummaryResult {
  summary: string;
  method: 'ai' | 'rules';
}

export async function summarizeConversation(
  messages: Array<{ direction: string; body: string }>
): Promise<SummaryResult> {
  const provider = getProvider();
  if (isAiEnabled() && provider && messages.length > 0) {
    try {
      const transcript = messages
        .map((m) => `${m.direction === 'INBOUND' ? 'Customer' : 'Us'}: ${m.body}`)
        .join('\n');
      const out = await provider.complete(
        [
          { role: 'system', content: 'Summarize this sales conversation in 2 sentences. Note any next action.' },
          { role: 'user', content: transcript },
        ],
        { temperature: 0.3, maxTokens: 200 }
      );
      if (out) return { summary: out, method: 'ai' };
    } catch {
      /* fall through */
    }
  }
  return { summary: ruleSummary(messages), method: 'rules' };
}

export async function analyzeSentiment(text: string): Promise<{ label: string; score: number; method: 'ai' | 'rules' }> {
  const provider = getProvider();
  if (isAiEnabled() && provider && text) {
    try {
      const out = await provider.complete(
        [
          { role: 'system', content: 'Classify sentiment. Respond ONLY with JSON: {"label":"positive|neutral|negative","score":<-1..1>}.' },
          { role: 'user', content: text },
        ],
        { temperature: 0, maxTokens: 60 }
      );
      const parsed = safeJson(out);
      if (parsed && parsed.label) return { label: String(parsed.label), score: Number(parsed.score ?? 0), method: 'ai' };
    } catch { /* fall through */ }
  }
  return { ...ruleSentiment(text), method: 'rules' };
}

export function dealCloseProbability(deal: { stageProbability?: number; status?: string; ageDays?: number }) {
  // Deterministic — no need for an AI call; explainable to sales users.
  return { ...ruleCloseProbability(deal), method: 'rules' as const };
}

export async function nextBestAction(lead: {
  status?: string | null; hasPhone?: boolean; hasEmail?: boolean; captureState?: string | null; lastActivityDays?: number;
}): Promise<{ action: string; why: string; method: 'ai' | 'rules' }> {
  const provider = getProvider();
  if (isAiEnabled() && provider) {
    try {
      const out = await provider.complete(
        [
          { role: 'system', content: 'You are a sales coach. Given a lead state, respond ONLY with JSON: {"action":"...","why":"..."} — the single next best action.' },
          { role: 'user', content: JSON.stringify(lead) },
        ],
        { temperature: 0.3, maxTokens: 120 }
      );
      const parsed = safeJson(out);
      if (parsed && parsed.action) return { action: String(parsed.action), why: String(parsed.why ?? ''), method: 'ai' };
    } catch { /* fall through */ }
  }
  return { ...ruleNextBestAction(lead), method: 'rules' };
}

function safeJson(s: string): any {
  if (!s) return null;
  // Strip code fences if the model wrapped JSON.
  const cleaned = s.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract the first {...} or [...] block.
    const m = cleaned.match(/[[{][\s\S]*[\]}]/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}
