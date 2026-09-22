import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './button';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' };

interface DialogContentProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Footer buttons, right-aligned (stacked on mobile). */
  footer?: ReactNode;
  size?: keyof typeof widths;
  className?: string;
  /** Hide the visible description but keep it for screen readers. */
  hideDescription?: boolean;
}

export function DialogContent({
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
  hideDescription,
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in" />
      <DialogPrimitive.Content
        {...(!description && { 'aria-describedby': undefined })}
        className={cn(
          'fixed z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col',
          'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
          'rounded-xl border border-border bg-surface-raised shadow-lg animate-scale-in',
          widths[size],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-4 pt-5 pb-3">
          <div className="min-w-0">
            <DialogPrimitive.Title className="type-section text-fg">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description
                className={cn('mt-1 type-small text-fg-muted', hideDescription && 'sr-only')}
              >
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close asChild>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label="Close"
              className="-mt-1 -mr-2"
              icon={<X aria-hidden />}
            />
          </DialogPrimitive.Close>
        </div>
        {children && <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">{children}</div>}
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

interface SheetContentProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  side?: 'left' | 'right';
  className?: string;
}

/** Side sheet / drawer built on the same Radix dialog (focus trap, Esc, aria-modal). */
export function SheetContent({
  title,
  description,
  children,
  side = 'right',
  className,
}: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in" />
      <DialogPrimitive.Content
        {...(!description && { 'aria-describedby': undefined })}
        className={cn(
          'fixed inset-y-0 z-50 flex w-full flex-col border-border bg-surface-raised shadow-lg',
          side === 'right'
            ? 'right-0 border-l animate-slide-in-right sm:max-w-xl'
            : 'left-0 border-r animate-slide-in-left max-w-72',
          className,
        )}
      >
        {/* The sheet body renders its own visible heading; this one names the dialog. */}
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        {description && (
          <DialogPrimitive.Description className="sr-only">
            {description}
          </DialogPrimitive.Description>
        )}
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
