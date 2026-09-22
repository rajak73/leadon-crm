import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { SearchInput, TagFilterInput, useOwnerFilterOptions } from '@/features/leads/lead-filters';
import { useContactListParams } from './contact-list-params';

export function ContactFilters() {
  const { filters, update, hasFilters, clearFilters } = useContactListParams();
  const ownerOptions = useOwnerFilterOptions();
  return (
    <div
      role="search"
      aria-label="Filter contacts"
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
    >
      <SearchInput
        label="Search contacts"
        value={filters.search}
        onCommit={(v) => update({ search: v }, { replace: true })}
        className="w-full sm:w-64"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Owner"
          value={filters.assignedToId || 'all'}
          onValueChange={(v) => update({ assignedToId: v === 'all' ? null : v })}
          options={ownerOptions}
          className="w-40"
        />
        <TagFilterInput
          value={filters.tag}
          suggestions={[]}
          onCommit={(v) => update({ tag: v }, { replace: true })}
        />
        {hasFilters && (
          <Button variant="ghost" icon={<X aria-hidden />} onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
