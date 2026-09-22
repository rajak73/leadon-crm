import { useId } from 'react';
import { Search, X } from 'lucide-react';
import { LEAD_SOURCES, LEAD_STATUSES } from '@leados/shared';
import { useActiveUsers } from '@/api/account';
import { useLeadTags } from '@/api/leads';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { leadSourceLabels, leadStatusLabels } from '@/lib/labels';
import { personName } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useLeadListParams } from './lead-list-params';
import { MultiSelectFilter } from './multi-select-filter';
import { useCommittedText } from './use-committed-text';

const ALL = 'all';
const statusOptions = LEAD_STATUSES.map((s) => ({ value: s, label: leadStatusLabels[s] }));
const sourceOptions = LEAD_SOURCES.map((s) => ({ value: s, label: leadSourceLabels[s] }));

/** Owner filter options shared by leads and contacts. */
export function useOwnerFilterOptions() {
  const { data: users = [] } = useActiveUsers();
  return [
    { value: ALL, label: 'All owners' },
    { value: 'me', label: 'Me' },
    { value: 'unassigned', label: 'Unassigned' },
    ...users.map((u) => ({ value: u.id, label: personName(u) })),
  ];
}

export function SearchInput({
  value,
  onCommit,
  label,
  className,
}: {
  value: string;
  onCommit: (v: string) => void;
  label: string;
  className?: string;
}) {
  const { draft, setDraft, flush } = useCommittedText(value, onCommit, 300);
  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
      />
      <Input
        type="search"
        aria-label={label}
        placeholder={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && flush()}
        maxLength={200}
        className="pl-9"
      />
    </div>
  );
}

/** Tag filter: free text with autocomplete. Kept exactly as typed (commas too). */
export function TagFilterInput({
  value,
  onCommit,
  suggestions,
}: {
  value: string;
  onCommit: (v: string) => void;
  suggestions: string[];
}) {
  const listId = useId();
  const { draft, setDraft, flush } = useCommittedText(value, onCommit, 500);
  return (
    <>
      <Input
        aria-label="Tag"
        placeholder="Tag"
        value={draft}
        list={suggestions.length ? listId : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            flush();
          }
        }}
        onBlur={flush}
        maxLength={40}
        className="w-full sm:w-36"
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </>
  );
}

function ScoreInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number | undefined;
  onCommit: (v: string) => void;
}) {
  const { draft, setDraft, flush } = useCommittedText(
    value === undefined ? '' : String(value),
    (v) => onCommit(v),
    500,
  );
  const n = Number(draft);
  const invalid = draft.trim() !== '' && (!Number.isInteger(n) || n < 0 || n > 100);
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      max={100}
      step={1}
      aria-label={label}
      placeholder={label === 'Minimum AI score' ? 'Min' : 'Max'}
      aria-invalid={invalid || undefined}
      title={invalid ? 'Use a whole number from 0 to 100' : undefined}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && flush()}
      onBlur={flush}
      className="w-20 tabular-nums"
    />
  );
}

export function LeadFilters() {
  const { filters, update, hasFilters, clearFilters } = useLeadListParams();
  const { data: tags = [] } = useLeadTags();
  const ownerOptions = useOwnerFilterOptions();

  const commitScore = (key: 'scoreMin' | 'scoreMax') => (v: string) => {
    const n = Number(v);
    if (v.trim() === '') update({ [key]: null }, { replace: true });
    else if (Number.isInteger(n) && n >= 0 && n <= 100)
      update({ [key]: String(n) }, { replace: true });
  };

  return (
    <div
      role="search"
      aria-label="Filter leads"
      className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center"
    >
      <SearchInput
        label="Search leads"
        value={filters.search}
        onCommit={(v) => update({ search: v }, { replace: true })}
        className="w-full lg:w-64"
      />
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectFilter
          label="Status"
          options={statusOptions}
          value={filters.status}
          onChange={(v) => update({ status: v })}
        />
        <MultiSelectFilter
          label="Source"
          options={sourceOptions}
          value={filters.source}
          onChange={(v) => update({ source: v })}
        />
        <Select
          aria-label="Owner"
          value={filters.assignedToId || ALL}
          onValueChange={(v) => update({ assignedToId: v === ALL ? null : v })}
          options={ownerOptions}
          className="w-40"
        />
        <TagFilterInput
          value={filters.tag}
          suggestions={tags}
          onCommit={(v) => update({ tag: v }, { replace: true })}
        />
        <fieldset className="flex items-center gap-1.5">
          <legend className="sr-only">AI score range</legend>
          <span aria-hidden className="type-small text-fg-muted">
            Score
          </span>
          <ScoreInput
            label="Minimum AI score"
            value={filters.scoreMin}
            onCommit={commitScore('scoreMin')}
          />
          <span aria-hidden className="text-fg-subtle">
            –
          </span>
          <ScoreInput
            label="Maximum AI score"
            value={filters.scoreMax}
            onCommit={commitScore('scoreMax')}
          />
        </fieldset>
        {hasFilters && (
          <Button variant="ghost" icon={<X aria-hidden />} onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
