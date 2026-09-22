import { ERROR_STATUS, ErrorCode } from '@leados/shared';

/** An error whose message is safe to show to end users. */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = ERROR_STATUS[code];
  }
}

export const notFound = (what = 'record') =>
  new AppError(ErrorCode.NOT_FOUND, `We couldn't find that ${what}. It may have been deleted.`);
export const forbidden = (message = "You don't have permission to do that.") =>
  new AppError(ErrorCode.FORBIDDEN, message);
export const conflict = (message: string, details?: Record<string, string[]>) =>
  new AppError(ErrorCode.CONFLICT, message, details);
export const unauthorized = (message = 'Please sign in to continue.') =>
  new AppError(ErrorCode.UNAUTHORIZED, message);
export const invalidTransition = (message: string) =>
  new AppError(ErrorCode.INVALID_TRANSITION, message);

/** A validation error tied to a single field. */
export const fieldError = (field: string, message: string) =>
  new AppError(ErrorCode.VALIDATION_ERROR, 'Check the highlighted fields.', { [field]: [message] });
