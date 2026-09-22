import type { Request, Response } from 'express';
import { type PageMeta, idParamSchema } from '@leados/shared';
import type { ZodType, ZodTypeDef } from 'zod';
import { notFound } from './errors.js';

export function ok<T>(res: Response, data: T, meta?: PageMeta, status = 200): void {
  res.status(status).json(meta ? { success: true, data, meta } : { success: true, data });
}

export function created<T>(res: Response, data: T): void {
  ok(res, data, undefined, 201);
}

export function pageMeta(page: number, limit: number, total: number): PageMeta {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/** Parses input with a shared zod schema; ZodErrors become 422 responses in the error handler. */
export function parse<Output, Input>(
  schema: ZodType<Output, ZodTypeDef, Input>,
  data: unknown,
): Output {
  return schema.parse(data);
}

export const body = <O, I>(schema: ZodType<O, ZodTypeDef, I>, req: Request): O =>
  schema.parse(req.body ?? {});
export const query = <O, I>(schema: ZodType<O, ZodTypeDef, I>, req: Request): O =>
  schema.parse(req.query ?? {});

/** Route `:id` param. A malformed id can't match anything, so it's a 404, not a validation error. */
export function idParam(req: Request, what = 'record'): string {
  const result = idParamSchema.safeParse(req.params);
  if (!result.success) throw notFound(what);
  return result.data.id;
}
