import { History, Instagram } from 'lucide-react';
import type { Activity, Note } from '@leados/shared';
import { useActivities, useNotes, type RecordScope } from '@/api/timeline';
import { Button } from '@/components/ui/button';
import { TextLink } from '@/components/ui/link';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { RelativeTime } from '@/components/domain/relative-time';
import { activityTypeLabels } from '@/lib/labels';
import { personName } from '@/lib/format';
import { errorMessage } from '@/lib/api-client';
import { NoteComposer } from './note-composer';
import { NoteItem } from './note-item';

type Entry =
  | { kind: 'note'; at: string; note: Note }
  | { kind: 'activity'; at: string; activity: Activity };

/** Where an Instagram activity links to, from the metadata the API records. */
export function instagramLink(activity: Activity): { to: string; label: string } | null {
  if (!activity.type.startsWith('INSTAGRAM_')) return null;
  const { conversationId, username } = activity.metadata;
  if (typeof conversationId === 'string')
    return { to: `/inbox/${conversationId}`, label: 'View conversation' };
  if (activity.type.startsWith('INSTAGRAM_COMMENT'))
    return { to: '/inbox/comments', label: 'View comments' };
  if (typeof username === 'string')
    return {
      to: `/inbox?search=${encodeURIComponent(`@${username}`)}`,
      label: 'View conversation',
    };
  return null;
}

function ActivityRow({ activity }: { activity: Activity }) {
  const actor = activity.performedBy ? personName(activity.performedBy) : 'Automation';
  const isInstagram = activity.type.startsWith('INSTAGRAM_');
  const link = instagramLink(activity);
  return (
    <div className="flex gap-3">
      {isInstagram ? (
        <Instagram aria-hidden className="mt-1 ml-1 size-4 shrink-0 text-fg-subtle" />
      ) : (
        <span aria-hidden className="mt-2 ml-2.5 size-1.5 shrink-0 rounded-full bg-border-strong" />
      )}
      <div className="min-w-0 flex-1 pl-1.5">
        <p className="type-body text-fg">
          <span className="sr-only">{activityTypeLabels[activity.type]}: </span>
          {activity.description}
        </p>
        <p className="type-caption text-fg-subtle">
          {actor} · <RelativeTime date={activity.createdAt} />
          {link && (
            <>
              {' · '}
              <TextLink to={link.to}>{link.label}</TextLink>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/** Notes + activity history for a lead, contact or deal, newest first. */
export function RecordTimeline({ scope }: { scope: RecordScope }) {
  const notes = useNotes(scope);
  const activities = useActivities(scope);

  const isLoading = notes.isLoading || activities.isLoading;
  const error = notes.error ?? activities.error;

  const entries: Entry[] = [
    ...(notes.data ?? []).map((note) => ({ kind: 'note' as const, at: note.createdAt, note })),
    ...(activities.data?.pages.flat() ?? [])
      .filter((a) => a.type !== 'NOTE_ADDED') // the note itself is shown instead
      .map((activity) => ({ kind: 'activity' as const, at: activity.createdAt, activity })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="flex flex-col gap-4">
      <NoteComposer scope={scope} />
      {isLoading ? (
        <LoadingRegion label="Loading activity…" className="flex flex-col gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-6 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </LoadingRegion>
      ) : error ? (
        <ErrorState
          compact
          message={errorMessage(error)}
          onRetry={() => {
            void notes.refetch();
            void activities.refetch();
          }}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          compact
          icon={History}
          title="No activity yet"
          text="Notes and changes will show up here."
        />
      ) : (
        <ol className="flex flex-col gap-4" aria-label="Activity">
          {entries.map((e) => (
            <li key={e.kind === 'note' ? `n-${e.note.id}` : `a-${e.activity.id}`}>
              {e.kind === 'note' ? (
                <NoteItem note={e.note} scope={scope} />
              ) : (
                <ActivityRow activity={e.activity} />
              )}
            </li>
          ))}
        </ol>
      )}
      {activities.hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          className="self-center"
          loading={activities.isFetchingNextPage}
          onClick={() => void activities.fetchNextPage()}
        >
          Show older activity
        </Button>
      )}
    </div>
  );
}
