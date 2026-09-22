import {
  useId,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { errorMessage, isApiError } from '@/lib/api-client';

interface EditorProps<T> {
  value: T;
  onChange: (value: T) => void;
}

interface InlineFieldProps<T> {
  label: string;
  /** What to show when not editing. */
  display: ReactNode;
  /** Current value, used to seed the editor. */
  value: T;
  /** Renders the single control used while editing (FormField wires its id/aria). */
  editor: (props: EditorProps<T>) => ReactElement<{ id?: string }>;
  /** Returns an error message, or undefined when valid. */
  validate?: (value: T) => string | undefined;
  /** Saves the value; may throw an ApiError (422 details for `field` are shown inline). */
  onSave: (value: T) => Promise<unknown>;
  /** API field name, for mapping validation errors. */
  field: string;
  canEdit?: boolean;
}

/** A label/value row in a <dl> that can be edited in place (pencil → field → Save / Cancel). */
export function InlineField<T>({
  label,
  display,
  value,
  editor,
  validate,
  onSave,
  field,
  canEdit = true,
}: InlineFieldProps<T>) {
  const formId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<T>(value);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  function start() {
    setDraft(value);
    setError(undefined);
    setEditing(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const problem = validate?.(draft);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (err) {
      const detail = isApiError(err) ? err.details?.[field]?.[0] : undefined;
      setError(detail ?? errorMessage(err, "We couldn't save that change."));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setEditing(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[8rem_1fr] sm:gap-3">
      <dt className="type-small text-fg-muted sm:pt-0.5">{label}</dt>
      <dd className="min-w-0">
        {editing ? (
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape cancels editing
          <form
            id={formId}
            onSubmit={save}
            onKeyDown={onKeyDown}
            noValidate
            className="flex flex-col gap-2"
          >
            <FormField label={label} hideLabel error={error}>
              {editor({ value: draft, onChange: setDraft })}
            </FormField>
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="primary" loading={busy}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="group flex items-start justify-between gap-2">
            <div className="min-w-0 break-words type-body text-fg">{display}</div>
            {canEdit && (
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                aria-label={`Edit ${label.toLowerCase()}`}
                icon={<Pencil aria-hidden />}
                className="-my-1 size-7 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={start}
              />
            )}
          </div>
        )}
      </dd>
    </div>
  );
}

/** Read-only row matching InlineField's layout. */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[8rem_1fr] sm:gap-3">
      <dt className="type-small text-fg-muted sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 break-words type-body text-fg">{children}</dd>
    </div>
  );
}

export const Empty = () => <span className="text-fg-subtle">—</span>;

/** First validation message from a zod schema, for InlineField's `validate`. */
export function zodMessage(schema: {
  safeParse: (v: unknown) => { success: boolean; error?: { issues: Array<{ message: string }> } };
}) {
  return (v: unknown) => {
    const r = schema.safeParse(v);
    return r.success ? undefined : (r.error?.issues[0]?.message ?? 'Check this value');
  };
}
