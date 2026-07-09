/** Typed HTTP errors so route handlers can throw and the error middleware maps them. */
export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const BadRequest = (msg = 'Bad request', details?: unknown) => new HttpError(400, msg, details);
export const Unauthorized = (msg = 'Unauthorized') => new HttpError(401, msg);
export const Forbidden = (msg = 'Forbidden') => new HttpError(403, msg);
export const NotFound = (msg = 'Not found') => new HttpError(404, msg);
export const Conflict = (msg = 'Conflict') => new HttpError(409, msg);
