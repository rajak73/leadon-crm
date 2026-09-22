import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { newKey, type HeaderRow } from './builder-state';
import { headerPath, type BuilderErrors } from './builder-validation';

interface WebhookHeadersProps {
  actionIndex: number;
  rows: HeaderRow[];
  errors: BuilderErrors;
  readOnly: boolean;
  onChange: (rows: HeaderRow[]) => void;
}

/** Key/value rows for webhook headers — sent to the API as a plain object. */
export function WebhookHeaders({
  actionIndex,
  rows,
  errors,
  readOnly,
  onChange,
}: WebhookHeadersProps) {
  const update = (i: number, patch: Partial<HeaderRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <fieldset>
      <legend className="type-small font-medium text-fg">Headers</legend>
      <p className="type-caption text-fg-subtle">
        Optional, e.g. an API key the other app expects.
      </p>
      {rows.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {rows.map((row, i) => {
            const nameErr = errors[headerPath(actionIndex, i, 'name')];
            const valueErr = errors[headerPath(actionIndex, i, 'value')];
            const errId = `hdr-${row.key}-error`;
            return (
              <li key={row.key}>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                  <Input
                    aria-label={`Header ${i + 1} name`}
                    placeholder="Name"
                    value={row.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    disabled={readOnly}
                    aria-invalid={nameErr ? true : undefined}
                    aria-describedby={nameErr || valueErr ? errId : undefined}
                    autoComplete="off"
                  />
                  <Input
                    aria-label={`Header ${i + 1} value`}
                    placeholder="Value"
                    value={row.value}
                    onChange={(e) => update(i, { value: e.target.value })}
                    disabled={readOnly}
                    aria-invalid={valueErr ? true : undefined}
                    aria-describedby={nameErr || valueErr ? errId : undefined}
                    autoComplete="off"
                  />
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      iconOnly
                      aria-label={`Remove header ${row.name || i + 1}`}
                      icon={<Trash2 aria-hidden />}
                      onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                    />
                  )}
                </div>
                <p
                  id={errId}
                  aria-live="polite"
                  className="mt-1 type-caption font-medium text-danger-fg empty:hidden"
                >
                  {nameErr ?? valueErr}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {!readOnly && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2"
          icon={<Plus aria-hidden />}
          onClick={() => onChange([...rows, { key: newKey(), name: '', value: '' }])}
          disabled={rows.length >= 20}
        >
          Add header
        </Button>
      )}
    </fieldset>
  );
}
