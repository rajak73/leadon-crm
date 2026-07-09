import type { Request, Response, NextFunction } from 'express';
import type { AuthedRequest } from './auth.js';

/**
 * Lightweight in-memory rate limiter (BRD §19.3 rate limiting). Zero-cost — no
 * Redis required for the free single-instance tier. Uses a fixed-window counter
 * keyed by user id (if authenticated) or client IP.
 *
 * When scaling horizontally (multiple instances), swap the store for a Redis
 * INCR/EXPIRE implementation using the same interface — see note below.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

// Periodically evict expired buckets so the Map can't grow unbounded (memory
// safety on free tiers). Runs every 5 minutes.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, b] of store) {
    if (b.resetAt <= now) store.delete(key);
  }
}, 5 * 60 * 1000);
// Don't keep the process alive just for the sweeper.
if (typeof sweep.unref === 'function') sweep.unref();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix?: string;
}

export function rateLimit(opts: RateLimitOptions) {
  const { windowMs, max, keyPrefix = 'rl' } = opts;
  return (req: Request, res: Response, next: NextFunction) => {
    const authed = req as AuthedRequest;
    const id = authed.auth?.userId || req.ip || 'anon';
    const key = `${keyPrefix}:${id}`;
    const now = Date.now();

    let bucket = store.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      store.set(key, bucket);
    }
    bucket.count++;

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many requests. Please slow down.', retryAfter });
    }
    return next();
  };
}

/** Sensible free-tier defaults. */
export const globalRateLimit = rateLimit({ windowMs: 60_000, max: 300, keyPrefix: 'global' }); // 300 req/min/user
export const authRateLimit = rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'auth' }); // 20 login/signup/min/ip
export const aiRateLimit = rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'ai' }); // 30 AI calls/min (protects provider quota)
