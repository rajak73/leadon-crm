import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg shadow-sm hover:bg-primary-hover',
  accent: 'bg-accent text-accent-fg shadow-sm hover:bg-accent-hover',
  secondary:
    'border border-border bg-surface text-fg shadow-sm hover:bg-muted hover:border-border-strong',
  ghost: 'text-fg-muted hover:bg-muted hover:text-fg',
  danger: 'bg-danger text-white shadow-sm hover:bg-danger-hover',
  link: 'text-primary-text underline-offset-4 hover:underline px-0! h-auto!',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-md px-2.5 type-small',
  md: 'h-9 gap-2 rounded-md px-3.5 type-body',
  lg: 'h-10 gap-2 rounded-lg px-4 type-body',
};

const iconSizes: Record<ButtonSize, string> = { sm: 'size-8', md: 'size-9', lg: 'size-10' };

type BaseProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Icon shown before the label (hidden while loading). */
  icon?: ReactNode;
};

/** Icon-only buttons must have an accessible name. */
type IconOnlyProps = BaseProps & { iconOnly: true; 'aria-label': string };
type LabelledProps = BaseProps & { iconOnly?: false };
export type ButtonProps = IconOnlyProps | LabelledProps;

export function buttonClasses({
  variant = 'secondary',
  size = 'md',
  iconOnly = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  className?: string;
}) {
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center font-medium whitespace-nowrap transition-colors',
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
    variants[variant],
    sizes[size],
    iconOnly && cn(iconSizes[size], 'px-0'),
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading,
    icon,
    iconOnly,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, iconOnly, className })}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden className="animate-spin" /> : icon}
      {children}
    </button>
  );
});
