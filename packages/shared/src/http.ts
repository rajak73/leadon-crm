import type { ErrorCode } from './errors.js';

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: PageMeta;
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: ErrorCode;
    message: string; // safe to show to end users
    details?: Record<string, string[]>; // field -> messages, for VALIDATION_ERROR
  };
}

export type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 100;
