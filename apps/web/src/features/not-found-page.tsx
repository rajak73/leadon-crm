import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { buttonClasses } from '@/components/ui/button';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-fg-muted">
        <Compass aria-hidden className="size-6" />
      </div>
      <h1 className="type-title text-fg">We couldn't find that page</h1>
      <p className="mt-2 max-w-md type-body text-fg-muted">
        The link may be broken, or the page may have been removed.
      </p>
      <Link to="/dashboard" className={buttonClasses({ variant: 'primary', className: 'mt-6' })}>
        Go to dashboard
      </Link>
    </div>
  );
}
