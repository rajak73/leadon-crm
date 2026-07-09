import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { logger } from '../lib/logger.js';
import type { AuthedRequest } from './auth.js';

/**
 * Request logging + lightweight in-memory metrics (BRD §19.3). Assigns a
 * request id, logs one structured line per request with latency, and tracks
 * simple counters exposed at /metrics.
 */
export interface Metrics {
  startedAt: number;
  totalRequests: number;
  byStatusClass: Record<string, number>; // '2xx','3xx','4xx','5xx'
  errors: number;
  sumLatencyMs: number;
}

export const metrics: Metrics = {
  startedAt: Date.now(),
  totalRequests: 0,
  byStatusClass: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
  errors: 0,
  sumLatencyMs: 0,
};

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  const reqId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  res.setHeader('X-Request-Id', reqId);

  res.on('finish', () => {
    const durMs = Number(process.hrtime.bigint() - start) / 1e6;
    const cls = `${Math.floor(res.statusCode / 100)}xx`;
    metrics.totalRequests++;
    metrics.byStatusClass[cls] = (metrics.byStatusClass[cls] ?? 0) + 1;
    metrics.sumLatencyMs += durMs;
    if (res.statusCode >= 500) metrics.errors++;

    // Skip noisy health/docs pings at info level.
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    const auth = (req as AuthedRequest).auth;
    logger[level]('request', {
      reqId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durMs: Math.round(durMs * 10) / 10,
      userId: auth?.userId,
      orgId: (req as AuthedRequest).org?.organizationId,
    });
  });

  next();
}
