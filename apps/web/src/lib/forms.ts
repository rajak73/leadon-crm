import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { notify } from '@/lib/toast';
import { errorMessage, isApiError } from './api-client';

/**
 * Maps a 422 `details` object onto react-hook-form field errors. Anything the
 * form can't show next to a field is surfaced as a toast (or returned for an
 * inline form-level message).
 */
export function applyApiErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  opts: { fields?: ReadonlyArray<string>; toastFallback?: boolean; fallback?: string } = {},
): string {
  const message = errorMessage(error, opts.fallback);
  let mapped = 0;
  if (isApiError(error) && error.details) {
    for (const [field, messages] of Object.entries(error.details)) {
      if (!messages?.length) continue;
      if (opts.fields && !opts.fields.includes(field)) continue;
      setError(
        field as Path<T>,
        { type: 'server', message: messages[0] },
        { shouldFocus: mapped === 0 },
      );
      mapped++;
    }
  }
  if (mapped === 0 && opts.toastFallback !== false) notify.error(message);
  return message;
}

/** Converts '' to null for optional text inputs before sending. */
export const blankToNull = (v: string | null | undefined) => (v && v.trim() !== '' ? v : null);
