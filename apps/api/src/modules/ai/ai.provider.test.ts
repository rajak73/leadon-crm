import { describe, expect, it } from 'vitest';
import { resolveProvider } from './ai.provider.js';

const none = {
  AI_PROVIDER: undefined,
  AI_MODEL: undefined,
  GEMINI_API_KEY: undefined,
  GROQ_API_KEY: undefined,
  OPENAI_API_KEY: undefined,
  OPENAI_MODEL: undefined,
} as const;

describe('AI provider selection', () => {
  it('is "rules" without any key, even when AI_PROVIDER is set', () => {
    expect(resolveProvider(none)).toMatchObject({ provider: 'rules', model: null, apiKey: null });
    expect(resolveProvider({ ...none, AI_PROVIDER: 'groq', OPENAI_API_KEY: 'sk' })).toMatchObject({
      provider: 'rules',
    });
  });

  it('picks the first configured key: Gemini, then Groq, then OpenAI', () => {
    expect(
      resolveProvider({ ...none, OPENAI_API_KEY: 'sk', GROQ_API_KEY: 'gsk', GEMINI_API_KEY: 'g' }),
    ).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      apiKey: 'g',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });
    expect(resolveProvider({ ...none, OPENAI_API_KEY: 'sk', GROQ_API_KEY: 'gsk' })).toEqual({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      apiKey: 'gsk',
      baseURL: 'https://api.groq.com/openai/v1',
    });
    expect(resolveProvider({ ...none, OPENAI_API_KEY: 'sk' })).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'sk',
      baseURL: undefined,
    });
  });

  it('honours AI_PROVIDER over the key order', () => {
    expect(
      resolveProvider({
        ...none,
        AI_PROVIDER: 'openai',
        GEMINI_API_KEY: 'g',
        OPENAI_API_KEY: 'sk',
      }),
    ).toMatchObject({ provider: 'openai', apiKey: 'sk' });
  });

  it('uses AI_MODEL, and OPENAI_MODEL only as a fallback for OpenAI', () => {
    expect(
      resolveProvider({ ...none, GROQ_API_KEY: 'gsk', AI_MODEL: 'llama-3.1-8b-instant' }).model,
    ).toBe('llama-3.1-8b-instant');
    expect(resolveProvider({ ...none, GROQ_API_KEY: 'gsk', OPENAI_MODEL: 'gpt-4.1' }).model).toBe(
      'llama-3.3-70b-versatile',
    );
    expect(resolveProvider({ ...none, OPENAI_API_KEY: 'sk', OPENAI_MODEL: 'gpt-4.1' }).model).toBe(
      'gpt-4.1',
    );
    expect(
      resolveProvider({ ...none, OPENAI_API_KEY: 'sk', OPENAI_MODEL: 'gpt-4.1', AI_MODEL: 'o4' })
        .model,
    ).toBe('o4');
  });
});
