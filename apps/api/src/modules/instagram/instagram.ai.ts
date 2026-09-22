import type { AiReplyPreview, CommentReplyMode, CommentReplyPreview } from '@leados/shared';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { ErrorCode } from '@leados/shared';
import { AiError, chatJson, currentProvider } from '../ai/index.js';
import {
  DM_REPLY_MAX_CHARS,
  PUBLIC_COMMENT_MAX_CHARS,
  type KnownLead,
  type PromptSettings,
  type TranscriptLine,
  commentSystemPrompt,
  commentUserPrompt,
  dmSystemPrompt,
  dmUserPrompt,
} from './instagram.prompt.js';

// Models are sloppy with types: accept "true"/"false", "" and "null" and normalise them.
const text = z.preprocess(
  (v) =>
    typeof v === 'string' && ['', 'null', 'none', 'n/a'].includes(v.trim().toLowerCase())
      ? null
      : v,
  z
    .string()
    .nullable()
    .optional()
    .transform((v) => v?.trim() || null),
);
const bool = z.preprocess(
  (v) => (v === 'true' ? true : v === 'false' ? false : v == null ? false : v),
  z.boolean(),
);

const dmSchema = z.object({
  reply: text,
  handoff: bool,
  handoffReason: text,
  name: text,
  email: text,
  phone: text,
});

const commentSchema = z.object({
  skip: bool,
  skipReason: text,
  publicReply: text,
  privateReply: text,
});

/** Removes markdown the model may add anyway and clips at a word boundary. */
export function tidyReply(value: string | null, max: number): string | null {
  if (!value) return null;
  let s = value
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (s.length > max) {
    const cut = s.slice(0, max - 1);
    const at = Math.max(
      cut.lastIndexOf('. '),
      cut.lastIndexOf('? '),
      cut.lastIndexOf('! '),
      cut.lastIndexOf('। '),
    );
    s =
      at > max * 0.5
        ? cut.slice(0, at + 1)
        : `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : cut.length)}…`;
  }
  return s || null;
}

const emailSchema = z.string().trim().toLowerCase().email().max(255);
export function cleanEmail(value: string | null): string | null {
  const r = emailSchema.safeParse(value);
  return r.success ? r.data : null;
}

/** A person's name as the customer typed it: letters (any script), spaces, dots, hyphens, apostrophes. */
export function cleanName(value: string | null): string | null {
  if (!value) return null;
  const s = value.replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > 60 || s.startsWith('@')) return null;
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(s)) return null;
  if (s.split(' ').length > 4) return null;
  return s
    .split(' ')
    .map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function cleanPhone(value: string | null): string | null {
  if (!value) return null;
  const s = value.trim().replace(/[^\d+\s()-]/g, '');
  const digits = s.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15 || s.length > 20) return null;
  return /^[+\d][\d\s()-]*$/.test(s) ? s : null;
}

const PERSONAL_DATA = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/g, // emails
  /\+?\d[\d\s-]{8,}\d/g, // phone numbers
];
/** Public comment replies must never carry personal data. */
function scrubPublic(value: string | null): string | null {
  if (!value) return null;
  const cleaned = PERSONAL_DATA.reduce((s, re) => s.replace(re, ''), value)
    .replace(/\s{2,}/g, ' ')
    .trim();
  return tidyReply(cleaned, PUBLIC_COMMENT_MAX_CHARS);
}

function unavailable(err: unknown): AppError {
  const message =
    err instanceof AiError
      ? err.message
      : 'The AI assistant is unavailable right now. Try again in a moment.';
  return new AppError(ErrorCode.AI_UNAVAILABLE, message);
}

/** Throws AiError (reply pipeline) — callers decide whether to surface it. */
export async function generateDmReply(
  settings: PromptSettings,
  lines: TranscriptLine[],
  lead: KnownLead,
): Promise<AiReplyPreview> {
  const { data, provider, model } = await chatJson(
    [
      { role: 'system', content: dmSystemPrompt(settings) },
      { role: 'user', content: dmUserPrompt(lines, lead) },
    ],
    dmSchema,
  );
  const reply = tidyReply(data.reply, DM_REPLY_MAX_CHARS);
  const handoff = data.handoff || !reply;
  return {
    reply: handoff ? null : reply,
    handoff,
    handoffReason: handoff
      ? (data.handoffReason?.slice(0, 200) ?? 'The assistant didn’t have an answer for this')
      : null,
    extracted: {
      name: cleanName(data.name),
      email: cleanEmail(data.email),
      phone: cleanPhone(data.phone),
    },
    provider,
    model,
  };
}

export async function generateCommentReply(
  settings: PromptSettings,
  mode: CommentReplyMode,
  input: { caption: string | null; username: string | null; text: string },
): Promise<CommentReplyPreview> {
  const { data, provider, model } = await chatJson(
    [
      { role: 'system', content: commentSystemPrompt(settings, mode) },
      { role: 'user', content: commentUserPrompt(input) },
    ],
    commentSchema,
  );
  let publicReply = mode === 'PRIVATE' ? null : scrubPublic(data.publicReply);
  let privateReply = mode === 'PUBLIC' ? null : tidyReply(data.privateReply, DM_REPLY_MAX_CHARS);
  // Use what the model gave if it filled the wrong field.
  if (mode === 'PRIVATE' && !privateReply)
    privateReply = tidyReply(data.publicReply, DM_REPLY_MAX_CHARS);
  if (mode === 'PUBLIC' && !publicReply) publicReply = scrubPublic(data.privateReply);
  const skip = data.skip || (!publicReply && !privateReply);
  return {
    skip,
    skipReason: skip ? (data.skipReason?.slice(0, 200) ?? 'No reply needed') : null,
    publicReply: skip ? null : publicReply,
    privateReply: skip ? null : privateReply,
    provider,
    model,
  };
}

/** For the suggest/test endpoints: 503 AI_UNAVAILABLE with a friendly message. */
export async function orUnavailable<T>(fn: () => Promise<T>): Promise<T> {
  if (currentProvider().provider === 'rules')
    throw new AppError(
      ErrorCode.AI_UNAVAILABLE,
      'Add a Gemini, Groq or OpenAI API key to use AI replies.',
    );
  try {
    return await fn();
  } catch (err) {
    throw unavailable(err);
  }
}
