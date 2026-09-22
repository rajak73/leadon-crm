import { useId, useState } from 'react';
import { useCreateNote, type RecordScope } from '@/api/timeline';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { notify } from '@/lib/toast';

export function NoteComposer({ scope }: { scope: RecordScope }) {
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateNote(scope);
  const id = useId();

  async function submit() {
    if (!content.trim()) {
      setError('Write something first');
      return;
    }
    try {
      await create.mutateAsync(content.trim());
      setContent('');
      setError(null);
      notify.success('Note added');
    } catch (e) {
      notify.error(e, "We couldn't add the note.");
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="rounded-lg border border-border bg-surface p-3"
    >
      <label htmlFor={id} className="sr-only">
        New note
      </label>
      <Textarea
        id={id}
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit();
        }}
        placeholder="Write a note… (Ctrl + Enter to save)"
        rows={2}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="border-0 p-0 shadow-none focus-visible:outline-0"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p id={`${id}-error`} aria-live="polite" className="type-caption text-danger-fg">
          {error}
        </p>
        <Button type="submit" variant="primary" size="sm" loading={create.isPending}>
          {create.isPending ? 'Adding…' : 'Add note'}
        </Button>
      </div>
    </form>
  );
}
