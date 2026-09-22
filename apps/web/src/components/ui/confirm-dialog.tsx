import { useState, type ReactNode } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { notify } from '@/lib/toast';
import { cn } from '@/lib/cn';
import { Button } from './button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Label for the confirm button, e.g. "Delete lead". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive actions use the danger style. */
  destructive?: boolean;
  /** May return a promise; the dialog shows a busy state and closes when it resolves. */
  onConfirm: () => unknown | Promise<unknown>;
  children?: ReactNode;
}

/**
 * Confirmation for destructive or irreversible actions (replaces window.confirm).
 * Focus starts on Cancel so Enter never destroys anything by accident.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm(e: React.MouseEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      // Keep the dialog open so the person can retry or cancel.
      notify.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in" />
        <AlertDialog.Content
          {...(!description && { 'aria-describedby': undefined })}
          className={cn(
            'fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2',
            'rounded-xl border border-border bg-surface-raised p-5 shadow-lg animate-scale-in',
          )}
        >
          <AlertDialog.Title className="type-section text-fg">{title}</AlertDialog.Title>
          {description && (
            <AlertDialog.Description className="mt-2 type-body text-fg-muted">
              {description}
            </AlertDialog.Description>
          )}
          {children && <div className="mt-4">{children}</div>}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={busy}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                variant={destructive ? 'danger' : 'primary'}
                loading={busy}
                onClick={handleConfirm}
              >
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
