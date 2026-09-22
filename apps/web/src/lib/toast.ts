import { toast as sonner } from 'sonner';
import { errorMessage } from './api-client';

/** Errors stay a little longer (6 s) so they can be read. */
export const notify = {
  success: (message: string) => sonner.success(message),
  error: (errOrMessage: unknown, fallback?: string) =>
    sonner.error(
      typeof errOrMessage === 'string' ? errOrMessage : errorMessage(errOrMessage, fallback),
      {
        duration: 6000,
      },
    ),
  info: (message: string) => sonner(message),
};
