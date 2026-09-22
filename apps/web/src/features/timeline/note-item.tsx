import { useState } from 'react';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { Note } from '@leados/shared';
import { useDeleteNote, useUpdateNote, type RecordScope } from '@/api/timeline';
import { useSession } from '@/providers/session';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/input';
import { RelativeTime } from '@/components/domain/relative-time';
import { personName } from '@/lib/format';
import { notify } from '@/lib/toast';

export function NoteItem({ note, scope }: { note: Note; scope: RecordScope }) {
  const { user, isAdmin } = useSession();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const update = useUpdateNote(scope);
  const remove = useDeleteNote(scope);
  const canEdit = isAdmin || note.createdBy.id === user?.id;
  const author = personName(note.createdBy);

  async function save() {
    if (!draft.trim()) return;
    try {
      await update.mutateAsync({ id: note.id, content: draft.trim() });
      setEditing(false);
      notify.success('Note updated');
    } catch (e) {
      notify.error(e, "We couldn't save the note.");
    }
  }

  return (
    <div className="flex gap-3">
      <Avatar name={author} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1 rounded-lg border border-border bg-surface p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="type-small text-fg-muted">
            <span className="font-medium text-fg">{author}</span> added a note ·{' '}
            <RelativeTime date={note.createdAt} />
            {note.updatedAt !== note.createdAt && <span className="text-fg-subtle"> (edited)</span>}
          </p>
          {canEdit && !editing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label="Note actions"
                  className="-mt-1 -mr-1 size-7"
                  icon={<MoreHorizontal aria-hidden />}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem icon={<Pencil aria-hidden />} onSelect={() => setEditing(true)}>
                  Edit note
                </DropdownMenuItem>
                <DropdownMenuItem
                  destructive
                  icon={<Trash2 aria-hidden />}
                  onSelect={() => setConfirmOpen(true)}
                >
                  Delete note
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {editing ? (
          <div className="mt-2">
            <Textarea
              aria-label="Edit note"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setDraft(note.content);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={update.isPending}
                onClick={() => void save()}
              >
                Save note
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-1.5 type-body whitespace-pre-wrap break-words text-fg">{note.content}</p>
        )}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this note?"
        description="The note will be removed for everyone. This can't be undone."
        confirmLabel="Delete note"
        onConfirm={async () => {
          await remove.mutateAsync(note.id);
          notify.success('Note deleted');
        }}
      />
    </div>
  );
}
