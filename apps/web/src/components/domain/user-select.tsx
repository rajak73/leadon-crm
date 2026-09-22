import { forwardRef } from 'react';
import { Select, type SelectOption } from '@/components/ui/select';
import { useActiveUsers } from '@/api/account';
import { useSession } from '@/providers/session';
import { personName } from '@/lib/format';

export const NONE = 'none';

interface UserSelectProps {
  value: string | null | undefined;
  onChange: (userId: string | null) => void;
  /** Label for the "nobody" option; omit to hide it. */
  noneLabel?: string;
  /** Extra leading options, e.g. { value: 'record_owner', label: 'Record owner' }. */
  extraOptions?: SelectOption[];
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/** Picks an active teammate. The current user is labelled "(you)". */
export const UserSelect = forwardRef<HTMLButtonElement, UserSelectProps>(function UserSelect(
  { value, onChange, noneLabel, extraOptions = [], placeholder = 'Choose a person', ...rest },
  ref,
) {
  const { data: users = [], isLoading } = useActiveUsers();
  const { user: me } = useSession();
  const options: SelectOption[] = [
    ...(noneLabel ? [{ value: NONE, label: noneLabel }] : []),
    ...extraOptions,
    ...users.map((u) => ({
      value: u.id,
      label: u.id === me?.id ? `${personName(u)} (you)` : personName(u),
    })),
  ];
  return (
    <Select
      ref={ref}
      value={value ?? (noneLabel ? NONE : undefined)}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      options={options}
      placeholder={isLoading ? 'Loading…' : placeholder}
      {...rest}
    />
  );
});
