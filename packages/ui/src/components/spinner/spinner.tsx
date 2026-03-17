import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn.js';

export const spinnerVariants = cva(
  'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
  {
    variants: {
      size: {
        xs: 'h-3 w-3 border-[1.5px]',
        sm: 'h-4 w-4 border-2',
        md: 'h-6 w-6 border-2',
        lg: 'h-8 w-8 border-[3px]',
        xl: 'h-12 w-12 border-4',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

export type SpinnerVariantProps = VariantProps<typeof spinnerVariants>;

export interface SpinnerProps
  extends HTMLAttributes<HTMLDivElement>,
    SpinnerVariantProps {
  /** Accessible label for screen readers */
  label?: string;
}

/**
 * Loading spinner with configurable sizes.
 * Includes accessible sr-only label for screen readers.
 */
export const Spinner = forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, size, label = 'Loading...', ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="status"
        aria-label={label}
        className={cn('inline-flex items-center justify-center', className)}
        {...props}
      >
        <div className={cn(spinnerVariants({ size }))} />
        <span className="sr-only">{label}</span>
      </div>
    );
  },
);
Spinner.displayName = 'Spinner';
