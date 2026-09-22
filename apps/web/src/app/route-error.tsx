import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button, buttonClasses } from '@/components/ui/button';
import { isApiError } from '@/lib/api-client';

/** Friendly route-level error screen with a retry. */
export function RouteError() {
  const error = useRouteError();
  const notFound =
    (isRouteErrorResponse(error) && error.status === 404) ||
    (isApiError(error) && error.status === 404);
  // A failed lazy import usually means a new version was deployed.
  const chunkFailed =
    error instanceof Error &&
    /dynamically imported module|Importing a module script failed/i.test(error.message);

  const title = notFound ? "We couldn't find that page" : 'Something went wrong';
  const text = notFound
    ? 'It may have been moved or deleted.'
    : chunkFailed
      ? 'A newer version of LeadOS is available. Reload to continue.'
      : 'This page ran into a problem. Try again, and if it keeps happening, reload the app.';

  if (import.meta.env.DEV && error) console.error(error);

  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center"
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-danger-subtle text-danger-fg">
        <AlertTriangle aria-hidden className="size-6" />
      </div>
      <h1 className="type-title text-fg">{title}</h1>
      <p className="mt-2 max-w-md type-body text-fg-muted">{text}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button
          variant="primary"
          icon={<RotateCw aria-hidden />}
          onClick={() => window.location.reload()}
        >
          {chunkFailed ? 'Reload' : 'Try again'}
        </Button>
        <Link to="/dashboard" className={buttonClasses({ variant: 'secondary' })}>
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
