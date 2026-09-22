import { Link as RouterLink, type LinkProps } from 'react-router';
import { cn } from '@/lib/cn';

/** In-text link styled with the primary text colour. */
export function TextLink({ className, ...rest }: LinkProps) {
  return (
    <RouterLink
      className={cn('font-medium text-primary-text underline-offset-4 hover:underline', className)}
      {...rest}
    />
  );
}
