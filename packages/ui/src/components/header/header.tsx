import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../utils/cn.js';

// ---- Types ----

export interface HeaderProps extends HTMLAttributes<HTMLElement> {
  /** Logo/brand element */
  logo?: ReactNode;
  /** Navigation elements */
  nav?: ReactNode;
  /** Right-side action elements (buttons, avatar, etc.) */
  actions?: ReactNode;
  /** Whether to show bottom border */
  bordered?: boolean;
  /** Make header sticky */
  sticky?: boolean;
  /** Height variant */
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-12',
  md: 'h-14',
  lg: 'h-16',
} as const;

/**
 * Application header with logo, navigation, and actions slots.
 * Supports sticky positioning and responsive layout.
 */
export const Header = forwardRef<HTMLElement, HeaderProps>(
  (
    {
      logo,
      nav,
      actions,
      bordered = true,
      sticky = false,
      size = 'md',
      className,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <header
        ref={ref}
        className={cn(
          'flex w-full items-center bg-white px-4 dark:bg-zinc-950',
          sizeClasses[size],
          bordered && 'border-b border-zinc-200 dark:border-zinc-800',
          sticky && 'sticky top-0 z-40',
          className,
        )}
        role="banner"
        {...props}
      >
        {/* Logo */}
        {logo && (
          <div className="flex shrink-0 items-center">
            {logo}
          </div>
        )}

        {/* Navigation */}
        {nav && (
          <nav className="ml-6 flex items-center gap-1" role="navigation" aria-label="Main navigation">
            {nav}
          </nav>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}

        {/* Custom children */}
        {children}
      </header>
    );
  },
);
Header.displayName = 'Header';

// ---- Header Nav Link ----

export interface HeaderNavLinkProps extends HTMLAttributes<HTMLAnchorElement> {
  href?: string;
  active?: boolean;
}

/**
 * Navigation link styled for use within the Header nav slot.
 */
export const HeaderNavLink = forwardRef<HTMLAnchorElement, HeaderNavLinkProps>(
  ({ href, active, className, children, ...props }, ref) => {
    return (
      <a
        ref={ref}
        href={href}
        className={cn(
          'inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
          active
            ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
            : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100',
          className,
        )}
        aria-current={active ? 'page' : undefined}
        {...props}
      >
        {children}
      </a>
    );
  },
);
HeaderNavLink.displayName = 'HeaderNavLink';
