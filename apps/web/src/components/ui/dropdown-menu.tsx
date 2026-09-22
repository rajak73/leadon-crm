import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Non-modal by default. A modal menu locks the page (pointer-events: none on <body>); when a
 * menu item opens a Dialog, the two locks can race on close and leave the whole page
 * unclickable until a refresh. Menus still close on outside click and Escape.
 */
export function DropdownMenu({ modal = false, ...props }: ComponentProps<typeof Menu.Root>) {
  return <Menu.Root modal={modal} {...props} />;
}
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
export const DropdownMenuRadioGroup = Menu.RadioGroup;

export function DropdownMenuContent({
  children,
  align = 'end',
  className,
}: {
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={6}
        className={cn(
          'z-50 min-w-48 overflow-hidden rounded-lg border border-border bg-surface-raised p-1 shadow-lg animate-scale-in',
          className,
        )}
      >
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

const itemClass = cn(
  'relative flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 type-body text-fg outline-none select-none',
  'data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-fg-subtle',
);

type ItemProps = React.ComponentPropsWithoutRef<typeof Menu.Item> & {
  icon?: ReactNode;
  destructive?: boolean;
};

export const DropdownMenuItem = forwardRef<HTMLDivElement, ItemProps>(function DropdownMenuItem(
  { icon, destructive, className, children, ...rest },
  ref,
) {
  return (
    <Menu.Item
      ref={ref}
      className={cn(itemClass, destructive && 'text-danger-fg [&_svg]:text-danger-fg', className)}
      {...rest}
    >
      {icon}
      {children}
    </Menu.Item>
  );
});

export function DropdownMenuRadioItem({
  children,
  ...rest
}: React.ComponentPropsWithoutRef<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem className={cn(itemClass, 'pl-8')} {...rest}>
      <span className="absolute left-2 inline-flex">
        <Menu.ItemIndicator>
          <Check aria-hidden className="text-primary-text!" />
        </Menu.ItemIndicator>
      </span>
      {children}
    </Menu.RadioItem>
  );
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return (
    <Menu.Label className="px-2.5 pt-1.5 pb-1 type-caption font-medium text-fg-subtle">
      {children}
    </Menu.Label>
  );
}

export function DropdownMenuSeparator() {
  return <Menu.Separator className="-mx-1 my-1 h-px bg-border" />;
}
