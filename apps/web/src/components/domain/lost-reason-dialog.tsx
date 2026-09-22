import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/input';

interface LostReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Name of the lead or deal, shown in the title. */
  name: string;
  kind: 'lead' | 'deal';
  onConfirm: (reason: string) => unknown | Promise<unknown>;
}

/** Asks why a lead or deal was lost before marking it Lost. */
export function LostReasonDialog({
  open,
  onOpenChange,
  name,
  kind,
  onConfirm,
}: LostReasonDialogProps) {
  const formId = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(undefined);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = reason.trim();
    if (!value) {
      setError('Add a short reason so the team can learn from it');
      return;
    }
    if (value.length > 500) {
      setError('Must be 500 characters or fewer');
      return;
    }
    setBusy(true);
    try {
      await onConfirm(value);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        size="sm"
        title={`Mark “${name}” as lost?`}
        description={`Tell us why this ${kind} was lost.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="danger" loading={busy}>
              Mark as lost
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} noValidate>
          <FormField label="Reason" required error={error}>
            <Textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(undefined);
              }}
              rows={3}
              placeholder="e.g. Went with a competitor on price"
              autoFocus
            />
          </FormField>
        </form>
      </DialogContent>
    </Dialog>
  );
}
