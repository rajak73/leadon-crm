import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { Prisma } from '@prisma/client';
import { ERROR_STATUS, ErrorCode, type ErrorEnvelope } from '@leados/shared';
import { ZodError } from 'zod';
import { AppError } from './errors.js';
import { logger } from './logger.js';

function send(
  res: Parameters<ErrorRequestHandler>[2],
  code: ErrorCode,
  message: string,
  details?: Record<string, string[]>,
  status = ERROR_STATUS[code],
) {
  const payload: ErrorEnvelope = {
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
  };
  res.status(status).json(payload);
}

function zodDetails(err: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_form';
    (details[key] ??= []).push(issue.message);
  }
  return details;
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  send(res, ErrorCode.NOT_FOUND, "We couldn't find what you were looking for.");
};

/** Turns every error into the standard envelope with a message that is safe to show to users. */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) return send(res, err.code, err.message, err.details);
  if (err instanceof ZodError)
    return send(res, ErrorCode.VALIDATION_ERROR, 'Check the highlighted fields.', zodDetails(err));

  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'The file must be 2 MB or smaller.'
        : 'Upload a single CSV file in the "file" field.';
    return send(res, ErrorCode.VALIDATION_ERROR, message, { file: [message] });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002')
      return send(res, ErrorCode.CONFLICT, 'That already exists. Use a different value.');
    if (err.code === 'P2025')
      return send(
        res,
        ErrorCode.NOT_FOUND,
        "We couldn't find that record. It may have been deleted.",
      );
    if (err.code === 'P2003')
      return send(res, ErrorCode.CONFLICT, 'This is still linked to other records.');
  }

  const e = err as { type?: string; status?: number };
  if (e?.type === 'entity.parse.failed')
    return send(res, ErrorCode.VALIDATION_ERROR, "The request couldn't be read. Please try again.");
  if (e?.type === 'entity.too.large')
    return send(res, ErrorCode.VALIDATION_ERROR, 'That request is too large.', undefined, 413);

  logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
  send(res, ErrorCode.INTERNAL_ERROR, 'Something went wrong on our side. Please try again.');
};
