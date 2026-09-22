import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/cn';

const sizes = { sm: 'size-6', md: 'size-8', lg: 'size-10' } as const;

/** Instagram profile picture, falling back to initials when missing or broken. */
export function IgAvatar({
  name,
  src,
  size = 'lg',
  className,
}: {
  name: string;
  src: string | null | undefined;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <Avatar name={name} size={size} className={className} />;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn('shrink-0 rounded-full bg-muted object-cover', sizes[size], className)}
    />
  );
}

/** Display name for an Instagram person: name, else @username, else a friendly fallback. */
export function igDisplayName(p: { name: string | null; username: string | null }): string {
  return p.name || (p.username ? `@${p.username}` : 'Instagram user');
}
