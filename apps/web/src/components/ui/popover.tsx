import type { ReactNode } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/cn';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  children,
  className,
  align = 'start',
  ...rest
}: { children: ReactNode; className?: string; align?: 'start' | 'center' | 'end' } & Omit<
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>,
  'align'
>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn(
          'z-50 w-72 rounded-lg border border-border bg-surface-raised p-3 shadow-lg animate-scale-in',
          className,
        )}
        {...rest}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
