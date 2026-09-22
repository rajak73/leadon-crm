import type { ReactNode } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/cn';

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <TabsPrimitive.List
      aria-label={label}
      className={cn(
        'flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]',
        className,
      )}
    >
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({
  value,
  children,
  count,
}: {
  value: string;
  children: ReactNode;
  count?: number;
}) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={cn(
        '-mb-px inline-flex h-10 items-center gap-2 border-b-2 border-transparent px-3 type-body font-medium whitespace-nowrap text-fg-muted transition-colors',
        'hover:text-fg data-[state=active]:border-primary data-[state=active]:text-fg',
      )}
    >
      {children}
      {count !== undefined && (
        <span className="rounded-full bg-muted px-1.5 type-caption text-fg-muted tabular-nums">
          {count}
        </span>
      )}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TabsPrimitive.Content
      value={value}
      className={cn('pt-4 focus-visible:outline-offset-4', className)}
    >
      {children}
    </TabsPrimitive.Content>
  );
}
