import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn.js';

export const inputVariants = cva(
  [
    'flex w-full rounded-md border bg-white text-zinc-900 transition-colors duration-150',
    'placeholder:text-zinc-400',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-zinc-50',
    'dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500',
  ],
  {
    variants: {
      inputSize: {
        sm: 'h-8 px-2.5 text-xs',
        md: 'h-10 px-3 text-sm',
        lg: 'h-12 px-4 text-base',
      },
      state: {
        default:
          'border-zinc-300 focus-visible:ring-blue-500 dark:border-zinc-700',
        error:
          'border-red-500 focus-visible:ring-red-500 text-red-900 dark:text-red-400 dark:border-red-500',
      },
    },
    defaultVariants: {
      inputSize: 'md',
      state: 'default',
    },
  },
);

export type InputVariantProps = VariantProps<typeof inputVariants>;

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    InputVariantProps {
  /** Label text above the input */
  label?: string;
  /** Error message displayed below the input */
  error?: string;
  /** Helper text displayed below the input */
  helperText?: string;
  /** Icon or element before the input */
  prefixIcon?: ReactNode;
  /** Icon or element after the input */
  suffixIcon?: ReactNode;
  /** Whether the field is required */
  required?: boolean;
  /** Wrapping container class */
  containerClassName?: string;
}

/**
 * Text input with label, error/helper text, and icon support.
 * Fully accessible with proper aria attributes and label association.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      containerClassName,
      inputSize,
      state,
      label,
      error,
      helperText,
      prefixIcon,
      suffixIcon,
      required,
      id: providedId,
      disabled,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = providedId ?? generatedId;
    const errorId = error ? `${inputId}-error` : undefined;
    const helperId = helperText ? `${inputId}-helper` : undefined;
    const effectiveState = error ? 'error' : state;

    return (
      <div className={cn('flex flex-col gap-1.5', containerClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              'text-sm font-medium text-zinc-700 dark:text-zinc-300',
              disabled && 'opacity-50',
            )}
          >
            {label}
            {required && (
              <span className="ml-0.5 text-red-500" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}
        <div className="relative flex items-center">
          {prefixIcon && (
            <span className="pointer-events-none absolute left-3 flex items-center text-zinc-400 dark:text-zinc-500 [&_svg]:h-4 [&_svg]:w-4">
              {prefixIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            required={required}
            aria-invalid={effectiveState === 'error'}
            aria-describedby={
              [errorId, helperId].filter(Boolean).join(' ') || undefined
            }
            aria-required={required}
            className={cn(
              inputVariants({ inputSize, state: effectiveState }),
              prefixIcon && 'pl-9',
              suffixIcon && 'pr-9',
              className,
            )}
            {...props}
          />
          {suffixIcon && (
            <span className="pointer-events-none absolute right-3 flex items-center text-zinc-400 dark:text-zinc-500 [&_svg]:h-4 [&_svg]:w-4">
              {suffixIcon}
            </span>
          )}
        </div>
        {error && (
          <p id={errorId} className="text-xs text-red-500" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="text-xs text-zinc-500 dark:text-zinc-400">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';
