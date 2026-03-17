import {
  forwardRef,
  useId,
  type HTMLAttributes,
  type ReactNode,
  type ReactElement,
  cloneElement,
  isValidElement,
  Children,
} from 'react';
import { cn } from '../../utils/cn.js';

// ---- Types ----

export interface FormFieldProps extends HTMLAttributes<HTMLDivElement> {
  /** Field label */
  label?: string;
  /** Helper description text */
  description?: string;
  /** Error message */
  error?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Custom ID for the field control */
  htmlFor?: string;
  /** Orientation of label relative to input */
  orientation?: 'vertical' | 'horizontal';
}

/**
 * Form field wrapper providing label, description, error message, and required indicator.
 * Automatically associates label with the first child input via generated ID.
 */
export const FormField = forwardRef<HTMLDivElement, FormFieldProps>(
  (
    {
      label,
      description,
      error,
      required,
      disabled,
      htmlFor: providedHtmlFor,
      orientation = 'vertical',
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const fieldId = providedHtmlFor ?? generatedId;
    const errorId = error ? `${fieldId}-error` : undefined;
    const descriptionId = description ? `${fieldId}-desc` : undefined;

    // Clone children to inject aria props and id
    const enhancedChildren = Children.map(children, (child) => {
      if (isValidElement(child)) {
        const childProps: Record<string, unknown> = {};

        // Only inject id if the child doesn't already have one
        if (!(child.props as Record<string, unknown>)['id']) {
          childProps['id'] = fieldId;
        }
        if (error) {
          childProps['aria-invalid'] = true;
        }
        const describedBy = [errorId, descriptionId].filter(Boolean).join(' ');
        if (describedBy) {
          childProps['aria-describedby'] = describedBy;
        }
        if (required) {
          childProps['aria-required'] = true;
        }
        if (disabled) {
          childProps['disabled'] = true;
        }

        return cloneElement(child as ReactElement<Record<string, unknown>>, childProps);
      }
      return child;
    });

    const isHorizontal = orientation === 'horizontal';

    return (
      <div
        ref={ref}
        className={cn(
          'flex gap-1.5',
          isHorizontal ? 'flex-row items-start gap-4' : 'flex-col',
          className,
        )}
        {...props}
      >
        {label && (
          <label
            htmlFor={fieldId}
            className={cn(
              'text-sm font-medium text-zinc-700 dark:text-zinc-300',
              disabled && 'opacity-50',
              isHorizontal && 'mt-2 w-32 shrink-0',
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
        <div className={cn('flex flex-col gap-1', isHorizontal && 'flex-1')}>
          {enhancedChildren}
          {description && !error && (
            <p
              id={descriptionId}
              className="text-xs text-zinc-500 dark:text-zinc-400"
            >
              {description}
            </p>
          )}
          {error && (
            <p id={errorId} className="text-xs text-red-500" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  },
);
FormField.displayName = 'FormField';
