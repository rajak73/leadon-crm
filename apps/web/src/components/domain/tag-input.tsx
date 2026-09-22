import { useId, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fieldBase } from '@/components/ui/input';
import { useFieldControl } from '@/components/ui/field-context';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  id?: string;
  max?: number;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/** Chips input: Enter or comma adds a tag, Backspace on an empty field removes the last one. */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Add a tag…',
  max = 20,
  ...props
}: TagInputProps) {
  const { id, ...aria } = useFieldControl(props);
  const [draft, setDraft] = useState('');
  const listId = useId();

  function add(...raws: string[]) {
    const next = [...value];
    for (const raw of raws) {
      const tag = raw.trim().slice(0, 40);
      if (tag && !next.includes(tag) && next.length < max) next.push(tag);
    }
    if (next.length !== value.length) onChange(next);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
      setDraft('');
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div
      className={cn(
        fieldBase,
        'flex min-h-9 flex-wrap items-center gap-1.5 px-2 py-1.5 focus-within:border-focus',
      )}
    >
      {value.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-md bg-muted py-0.5 pr-1 pl-2 type-small text-fg"
        >
          {t}
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== t))}
            aria-label={`Remove tag ${t}`}
            className="rounded p-0.5 text-fg-subtle hover:bg-border hover:text-fg"
          >
            <X aria-hidden className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        list={suggestions.length ? listId : undefined}
        onChange={(e) => {
          // Pasting "a, b, c" adds each tag.
          const v = e.target.value;
          if (v.includes(',')) {
            add(...v.split(',').slice(0, -1));
            setDraft(v.split(',').pop() ?? '');
          } else setDraft(v);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (draft.trim()) {
            add(draft);
            setDraft('');
          }
        }}
        placeholder={value.length ? '' : placeholder}
        className="min-w-24 flex-1 bg-transparent type-body text-fg outline-none placeholder:text-fg-subtle"
        {...aria}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions
            .filter((s) => !value.includes(s))
            .map((s) => (
              <option key={s} value={s} />
            ))}
        </datalist>
      )}
    </div>
  );
}
