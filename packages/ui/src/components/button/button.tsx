import {
  forwardRef,
  type ButtonHTMLAttributes,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn.js';
import { Spinner } from '../spinner/spinner.js';

export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium',
    'transition-colors duration-150 ease-in-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        default:
          'bg-zinc-900 text-white hover:bg-zinc-800 focus-visible:ring-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200',
        primary:
          'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-600',
        secondary:
          'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 focus-visible:ring-zinc-400 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700',
        destructive:
          'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600',
        outline:
          'border border-zinc-300 bg-transparent text-zinc-900 hover:bg-zinc-100 focus-visible:ring-zinc-400 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800',
        ghost:
          'bg-transparent text-zinc-900 hover:bg-zinc-100 focus-visible:ring-zinc-400 dark:text-zinc-100 dark:hover:bg-zinc-800',
        link: 'bg-transparent text-blue-600 underline-offset-4 hover:underline focus-visible:ring-blue-600 dark:text-blue-400',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonVariantProps {
  /** Show loading spinner and disable interactions */
  loading?: boolean;
  /** Content to show before the label */
  leftIcon?: ReactNode;
  /** Content to show after the label */
  rightIcon?: ReactNode;
  /** Render as an anchor tag */
  asChild?: boolean;
}

export interface ButtonLinkProps
  extends AnchorHTMLAttributes<HTMLAnchorElement>,
    ButtonVariantProps {
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

/**
 * Primary button component with multiple variants and sizes.
 * Supports loading state, icons, and accessible keyboard interaction.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      loading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <Spinner size="sm" className="mr-1" />
        ) : leftIcon ? (
          <span className="inline-flex shrink-0">{leftIcon}</span>
        ) : null}
        {children}
        {rightIcon && !loading ? (
          <span className="inline-flex shrink-0">{rightIcon}</span>
        ) : null}
      </button>
    );
  },
);
Button.displayName = 'Button';

/**
 * Button rendered as an anchor element for link-style buttons.
 */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(
  (
    { className, variant = 'link', size, loading, leftIcon, rightIcon, children, ...props },
    ref,
  ) => {
    return (
      <a
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <Spinner size="sm" className="mr-1" />
        ) : leftIcon ? (
          <span className="inline-flex shrink-0">{leftIcon}</span>
        ) : null}
        {children}
        {rightIcon && !loading ? (
          <span className="inline-flex shrink-0">{rightIcon}</span>
        ) : null}
      </a>
    );
  },
);
ButtonLink.displayName = 'ButtonLink';
