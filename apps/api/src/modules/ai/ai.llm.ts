import { z } from 'zod';
import { SYSTEM_PROMPT, buildScoringPrompt } from './ai.prompt.js';
import { chatJson } from './ai.provider.js';
import { type LeadContext, type ScoreResult, clampScore } from './ai.types.js';

const responseSchema = z.object({
  score: z.coerce.number(),
  factors: z
    .array(
      z.object({
        type: z.enum(['POSITIVE', 'NEGATIVE']),
        description: z.string().trim().min(1).max(300),
      }),
    )
    .max(10),
  recommendation: z.string().trim().min(1).max(500),
});

/** Scores with the configured AI provider. Throws on any failure so the caller can fall back to rules. */
export async function scoreWithLlm(ctx: LeadContext): Promise<ScoreResult> {
  const { data, model } = await chatJson(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildScoringPrompt(ctx) },
    ],
    responseSchema,
    { temperature: 0.2 },
  );
  return {
    score: clampScore(data.score),
    factors: data.factors,
    recommendation: data.recommendation,
    modelVersion: model,
  };
}
