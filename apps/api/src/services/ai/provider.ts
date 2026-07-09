/**
 * AI provider abstraction (BRD §13). Supports Gemini / OpenAI / Groq via a
 * single interface. Stays DISABLED until FLAG_AI_SCORING_ENABLED=true AND a
 * key is configured (BRD §13.1). Keys come from env only, never chat (§13.2).
 *
 * When AI is unavailable, callers fall back to the deterministic rule-based
 * heuristics in ./heuristics.ts so the product still works with zero keys.
 */
import { config } from '../../config.js';

export type AiProviderName = 'gemini' | 'openai' | 'groq';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiProvider {
  name: AiProviderName;
  /** Free-form completion returning plain text. */
  complete(messages: ChatMessage[], opts?: { temperature?: number; maxTokens?: number }): Promise<string>;
}

/** True only when AI features may run (flag on + provider key present). */
export function isAiEnabled(): boolean {
  return config.flags.aiScoringEnabled && Boolean(resolveProviderConfig());
}

interface ResolvedProvider {
  name: AiProviderName;
  apiKey: string;
  model: string;
}

function resolveProviderConfig(): ResolvedProvider | null {
  const ai = config.ai;
  if (!ai.provider) return null;
  switch (ai.provider) {
    case 'openai':
      return ai.openaiKey ? { name: 'openai', apiKey: ai.openaiKey, model: ai.model || 'gpt-4o-mini' } : null;
    case 'groq':
      return ai.groqKey ? { name: 'groq', apiKey: ai.groqKey, model: ai.model || 'llama-3.1-8b-instant' } : null;
    case 'gemini':
      return ai.geminiKey ? { name: 'gemini', apiKey: ai.geminiKey, model: ai.model || 'gemini-1.5-flash' } : null;
    default:
      return null;
  }
}

/** Returns a live provider or null (never throws). */
export function getProvider(): AiProvider | null {
  const cfg = resolveProviderConfig();
  if (!cfg || !config.flags.aiScoringEnabled) return null;

  if (cfg.name === 'openai' || cfg.name === 'groq') {
    // OpenAI-compatible chat completions (Groq shares the schema).
    const baseUrl = cfg.name === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';
    return {
      name: cfg.name,
      async complete(messages, opts) {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
          body: JSON.stringify({
            model: cfg.model,
            messages,
            temperature: opts?.temperature ?? 0.3,
            max_tokens: opts?.maxTokens ?? 400,
          }),
        });
        if (!res.ok) throw new Error(`AI ${cfg.name} error ${res.status}`);
        const data: any = await res.json();
        return data.choices?.[0]?.message?.content?.trim() ?? '';
      },
    };
  }

  // Gemini (generativelanguage API).
  return {
    name: 'gemini',
    async complete(messages, opts) {
      const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
      const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
          contents,
          generationConfig: { temperature: opts?.temperature ?? 0.3, maxOutputTokens: opts?.maxTokens ?? 400 },
        }),
      });
      if (!res.ok) throw new Error(`AI gemini error ${res.status}`);
      const data: any = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    },
  };
}
