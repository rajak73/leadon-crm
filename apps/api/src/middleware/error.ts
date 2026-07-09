import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/** Central error handler — maps thrown errors to safe JSON (no secrets in logs, BRD §19.1). */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  // Unknown error: log minimally, never leak internals to client.
  logger.error('unhandled_error', { message: err instanceof Error ? err.message : String(err) });
  return res.status(500).json({ error: 'Internal server error' });
}

/** Wraps async handlers so thrown errors reach the error middleware. */
export function asyncHandler<T extends (req: any, res: any, next: any) => Promise<any>>(fn: T) {
  return (req: any, res: any, next: any) => fn(req, res, next).catch(next);
}
