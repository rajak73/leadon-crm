/**
 * Lightweight structured logger (BRD §19.3 monitoring/logging). Zero-dependency.
 * - Production: single-line JSON (easy to ship to Render/Datadog/Loki).
 * - Development: readable, colorized lines.
 * Never logs secrets (BRD §19.1) — callers must pass safe fields only.
 */
import { config } from '../config.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: Level = (process.env.LOG_LEVEL as Level) || (config.isProduction ? 'info' : 'debug');

const COLORS: Record<Level, string> = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' };
const RESET = '\x1b[0m';

// Keys that must never be logged even if accidentally passed.
const REDACT = new Set(['password', 'passwordHash', 'token', 'authorization', 'accessToken', 'secret', 'apiKey', 'signed_request']);

function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = REDACT.has(k) || /secret|token|password/i.test(k) ? '[redacted]' : v;
  }
  return out;
}

function emit(level: Level, message: string, fields: Record<string, unknown> = {}) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
  const safe = redact(fields);
  if (config.isProduction) {
    process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level, msg: message, ...safe }) + '\n');
  } else {
    const extras = Object.keys(safe).length ? ' ' + JSON.stringify(safe) : '';
    const line = `${COLORS[level]}${level.toUpperCase().padEnd(5)}${RESET} ${message}${extras}`;
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
  }
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
};
