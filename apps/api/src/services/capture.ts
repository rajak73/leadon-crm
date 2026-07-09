/**
 * Interactive lead-capture flow (BRD §12). Rule-based (no AI needed, §13.1).
 *
 * Parses an inbound message for a name and/or phone number and computes the
 * next capture state + the outbound reply text. Three scenarios (§12.1–12.3):
 *   1. New sender w/o name+phone  → ask for both, state = NEEDS_NAME_PHONE
 *   2. Sender provides both       → clear state, confirmation reply
 *   3. Partial (name only, etc.)  → save what we have, keep state, ask for rest
 */

export const CAPTURE_STATE = {
  NEEDS_NAME_PHONE: 'NEEDS_NAME_PHONE',
  NEEDS_PHONE: 'NEEDS_PHONE',
  NEEDS_NAME: 'NEEDS_NAME',
  COMPLETE: 'COMPLETE',
} as const;
export type CaptureState = (typeof CAPTURE_STATE)[keyof typeof CAPTURE_STATE];

/** Extract a phone number (Indian/international-ish, 8–15 digits). */
export function parsePhone(text: string): string | null {
  // Look for a run of digits (optionally +, spaces, dashes) 8–15 long.
  const match = text.replace(/[^\d+\s-]/g, ' ').match(/\+?[\d][\d\s-]{7,16}\d/);
  if (!match) return null;
  const digits = match[0].replace(/[^\d]/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/**
 * Extract a name. Handles "my name is X", "I am X", "this is X", or a bare
 * short capitalized token. Deliberately conservative to avoid saving junk.
 */
export function parseName(text: string): string | null {
  const patterns = [
    /my name is\s+([a-zA-Z][a-zA-Z\s.'-]{0,40})/i,
    /i am\s+([a-zA-Z][a-zA-Z\s.'-]{0,40})/i,
    /i'm\s+([a-zA-Z][a-zA-Z\s.'-]{0,40})/i,
    /this is\s+([a-zA-Z][a-zA-Z\s.'-]{0,40})/i,
    /name[:\-]\s*([a-zA-Z][a-zA-Z\s.'-]{0,40})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      // Trim trailing "and my phone ..." style clauses.
      let name = m[1].split(/\band\b|,|\bphone\b|\bnumber\b/i)[0].trim();
      name = name.replace(/[.]+$/, '').trim();
      if (name.length >= 2) return titleCase(name);
    }
  }
  return null;
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export interface CaptureInput {
  messageText: string;
  currentName?: string | null;
  currentPhone?: string | null;
  currentState?: string | null;
}

export interface CaptureResult {
  parsedName: string | null;
  parsedPhone: string | null;
  nextName: string | null;
  nextPhone: string | null;
  nextState: CaptureState;
  reply: string;
  completed: boolean;
}

/** Compute the capture decision for one inbound message. */
export function runCapture(input: CaptureInput): CaptureResult {
  const parsedName = parseName(input.messageText);
  const parsedPhone = parsePhone(input.messageText);

  // Merge with anything already known (don't overwrite good data with null).
  const nextName = parsedName ?? input.currentName ?? null;
  const nextPhone = parsedPhone ?? input.currentPhone ?? null;

  const hasName = Boolean(nextName);
  const hasPhone = Boolean(nextPhone);

  if (hasName && hasPhone) {
    // Scenario 2 (§12.2): both present → confirm.
    return {
      parsedName,
      parsedPhone,
      nextName,
      nextPhone,
      nextState: CAPTURE_STATE.COMPLETE,
      reply: `Thanks ${nextName}. Our team will contact you shortly.`,
      completed: true,
    };
  }

  if (hasName && !hasPhone) {
    // Scenario 3 (§12.3): name only → ask phone.
    return {
      parsedName,
      parsedPhone,
      nextName,
      nextPhone,
      nextState: CAPTURE_STATE.NEEDS_PHONE,
      reply: `Thanks ${nextName}. Could you please share your phone number so our team can reach you?`,
      completed: false,
    };
  }

  if (!hasName && hasPhone) {
    // Phone only → ask name.
    return {
      parsedName,
      parsedPhone,
      nextName,
      nextPhone,
      nextState: CAPTURE_STATE.NEEDS_NAME,
      reply: `Thanks! Could you please share your name so our team can help you faster?`,
      completed: false,
    };
  }

  // Scenario 1 (§12.1): nothing yet → ask for both.
  return {
    parsedName,
    parsedPhone,
    nextName,
    nextPhone,
    nextState: CAPTURE_STATE.NEEDS_NAME_PHONE,
    reply:
      'Thanks for reaching out. Please share your name and phone number so our team can help you faster.',
    completed: false,
  };
}
