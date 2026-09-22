import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

const sizes = {
  xs: 'size-5 text-[10px]',
  sm: 'size-6 text-[11px]',
  md: 'size-8 type-caption',
  lg: 'size-10 type-small',
};

// Deterministic tint per name from the chart palette; text stays fg for contrast.
const tints = [
  'bg-chart-1/20 text-fg',
  'bg-chart-2/20 text-fg',
  'bg-chart-3/20 text-fg',
  'bg-chart-4/20 text-fg',
  'bg-chart-5/20 text-fg',
  'bg-chart-6/20 text-fg',
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface AvatarProps {
  name: string;
  size?: keyof typeof sizes;
  className?: string;
  /** Decorative avatars (next to a visible name) are hidden from screen readers. */
  decorative?: boolean;
}

export function Avatar({ name, size = 'md', className, decorative = true }: AvatarProps) {
  return (
    <span
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      title={decorative ? undefined : name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
        sizes[size],
        tints[hash(name) % tints.length],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
