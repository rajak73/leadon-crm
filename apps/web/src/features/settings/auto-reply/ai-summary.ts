import type { AiProvider } from '@leados/shared';
import { aiProviderLabels } from '@/lib/labels';

/** "Gemini · gemini-2.5-flash" or the built-in rules explanation. */
export function aiSummary(provider: AiProvider, model: string | null): string {
  if (provider === 'rules') return 'Built-in rules — no AI key set';
  return model ? `${aiProviderLabels[provider]} · ${model}` : aiProviderLabels[provider];
}
