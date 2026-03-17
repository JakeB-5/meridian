import {
  forwardRef,
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
  type KeyboardEvent,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '../../utils/cn.js';
import { useClickOutside } from '../../hooks/use-click-outside.js';

// ---- Types ----

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
  icon?: ReactNode;
}

export interface SelectOptionGroup {
  label: string;
  options: SelectOption[];
}

interface SelectBaseProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Options to display */
  options: SelectOption[];
  /** Placeholder text when no value selected */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Error message */
  error?: string;
  /** Label text */
  label?: string;
  /** Allow search/filter */
  searchable?: boolean;
  /** Search placeholder */
  searchPlaceholder?: string;
  /** Required field */
  required?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Container class */
  containerClassName?: string;
}

export interface SingleSelectProps extends SelectBaseProps {
  /** Single or multi select mode */
  multiple?: false;
  /** Currently selected value */
  value?: string | null;
  /** Change handler for single select */
  onChange?: (value: string | null) => void;
}

export interface MultiSelectProps extends SelectBaseProps {
  multiple: true;
  value?: string[];
  onChange?: (value: string[]) => void;
}

export type SelectProps = SingleSelectProps | MultiSelectProps;

// ---- Helpers ----

const sizeClasses = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-10 px-3 text-sm',
  lg: 'h-12 px-4 text-base',
} as const;

function groupOptions(options: SelectOption[]): SelectOptionGroup[] {
  const grouped = new Map<string, SelectOption[]>();
  const ungrouped: SelectOption[] = [];

  for (const opt of options) {
    if (opt.group) {
      const group = grouped.get(opt.group) ?? [];
      group.push(opt);
      grouped.set(opt.group, group);
    } else {
      ungrouped.push(opt);
    }
  }

  const result: SelectOptionGroup[] = [];
  if (ungrouped.length > 0) {
    result.push({ label: '', options: ungrouped });
  }
  for (const [label, opts] of grouped) {
    result.push({ label, options: opts });
  }
  return result;
}

// ---- Chevron Icon ----

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4', className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-3 w-3', className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ---- Component ----

/**
 * Custom select component supporting single/multi select with search and keyboard navigation.
 * Fully accessible with ARIA combobox/listbox pattern.
 */
export const Select = forwardRef<HTMLDivElement, SelectProps>(
  (props, ref) => {
    const {
      options,
      placeholder = 'Select...',
      disabled = false,
      error,
      label,
      searchable = false,
      searchPlaceholder = 'Search...',
      required,
      size = 'md',
      className,
      containerClassName,
      multiple,
      value,
      onChange,
      ...restProps
    } = props;

    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    const generatedId = useId();
    const listboxId = `${generatedId}-listbox`;
    const labelId = label ? `${generatedId}-label` : undefined;
    const errorId = error ? `${generatedId}-error` : undefined;

    const containerRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    useClickOutside(containerRef, () => {
      setIsOpen(false);
      setSearch('');
    });

    // Filter options based on search
    const filteredOptions = search
      ? options.filter((o) =>
          o.label.toLowerCase().includes(search.toLowerCase()),
        )
      : options;

    const groups = groupOptions(filteredOptions);
    const flatFiltered = filteredOptions.filter((o) => !o.disabled);

    // Scroll highlighted item into view
    useEffect(() => {
      if (isOpen && listRef.current) {
        const highlighted = listRef.current.querySelector(
          `[data-index="${highlightedIndex}"]`,
        );
        highlighted?.scrollIntoView({ block: 'nearest' });
      }
    }, [highlightedIndex, isOpen]);

    // Focus search when opening
    useEffect(() => {
      if (isOpen && searchable && searchRef.current) {
        searchRef.current.focus();
      }
    }, [isOpen, searchable]);

    // Reset highlight when search changes
    useEffect(() => {
      setHighlightedIndex(0);
    }, [search]);

    const isSelected = useCallback(
      (optionValue: string): boolean => {
        if (multiple) {
          return ((value as string[] | undefined) ?? []).includes(optionValue);
        }
        return value === optionValue;
      },
      [multiple, value],
    );

    const handleSelect = useCallback(
      (optionValue: string) => {
        if (multiple) {
          const current = ((value as string[] | undefined) ?? []) as string[];
          const next = current.includes(optionValue)
            ? current.filter((v) => v !== optionValue)
            : [...current, optionValue];
          (onChange as MultiSelectProps['onChange'])?.(next);
        } else {
          (onChange as SingleSelectProps['onChange'])?.(optionValue);
          setIsOpen(false);
          setSearch('');
        }
      },
      [multiple, value, onChange],
    );

    const handleClear = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        if (multiple) {
          (onChange as MultiSelectProps['onChange'])?.([]);
        } else {
          (onChange as SingleSelectProps['onChange'])?.(null);
        }
      },
      [multiple, onChange],
    );

    const handleKeyDown = useCallback(
      (e: KeyboardEvent) => {
        if (disabled) return;

        switch (e.key) {
          case 'Enter':
          case ' ': {
            e.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
            } else if (flatFiltered[highlightedIndex]) {
              handleSelect(flatFiltered[highlightedIndex]!.value);
            }
            break;
          }
          case 'ArrowDown': {
            e.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
            } else {
              setHighlightedIndex((prev) =>
                prev < flatFiltered.length - 1 ? prev + 1 : 0,
              );
            }
            break;
          }
          case 'ArrowUp': {
            e.preventDefault();
            if (isOpen) {
              setHighlightedIndex((prev) =>
                prev > 0 ? prev - 1 : flatFiltered.length - 1,
              );
            }
            break;
          }
          case 'Escape': {
            e.preventDefault();
            setIsOpen(false);
            setSearch('');
            break;
          }
          case 'Home': {
            if (isOpen) {
              e.preventDefault();
              setHighlightedIndex(0);
            }
            break;
          }
          case 'End': {
            if (isOpen) {
              e.preventDefault();
              setHighlightedIndex(flatFiltered.length - 1);
            }
            break;
          }
        }
      },
      [disabled, isOpen, flatFiltered, highlightedIndex, handleSelect],
    );

    // Build display value
    const displayValue = (() => {
      if (multiple) {
        const vals = (value as string[] | undefined) ?? [];
        if (vals.length === 0) return null;
        const labels = vals
          .map((v) => options.find((o) => o.value === v)?.label)
          .filter(Boolean);
        return labels.join(', ');
      }
      if (!value) return null;
      return options.find((o) => o.value === value)?.label ?? null;
    })();

    const hasValue = multiple
      ? ((value as string[] | undefined) ?? []).length > 0
      : !!value;

    // Track flat index across groups
    let flatIndex = -1;

    return (
      <div
        ref={containerRef}
        className={cn('relative flex flex-col gap-1.5', containerClassName)}
      >
        {label && (
          <label
            id={labelId}
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
        <div
          ref={ref}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-owns={listboxId}
          aria-labelledby={labelId}
          aria-describedby={errorId}
          aria-disabled={disabled}
          aria-required={required}
          aria-invalid={!!error}
          tabIndex={disabled ? -1 : 0}
          className={cn(
            'flex cursor-pointer items-center justify-between rounded-md border transition-colors',
            sizeClasses[size],
            error
              ? 'border-red-500 focus:ring-red-500'
              : 'border-zinc-300 dark:border-zinc-700',
            'bg-white dark:bg-zinc-900',
            'text-zinc-900 dark:text-zinc-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
            disabled && 'cursor-not-allowed opacity-50',
            className,
          )}
          onClick={() => !disabled && setIsOpen((o) => !o)}
          onKeyDown={handleKeyDown}
          {...restProps}
        >
          <span className={cn('truncate', !displayValue && 'text-zinc-400 dark:text-zinc-500')}>
            {displayValue ?? placeholder}
          </span>
          <div className="ml-2 flex shrink-0 items-center gap-1">
            {hasValue && !disabled && (
              <button
                type="button"
                tabIndex={-1}
                className="rounded p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={handleClear}
                aria-label="Clear selection"
              >
                <XIcon />
              </button>
            )}
            <ChevronDown
              className={cn(
                'text-zinc-400 transition-transform duration-150',
                isOpen && 'rotate-180',
              )}
            />
          </div>
        </div>

        {/* Dropdown */}
        {isOpen && (
          <div
            className={cn(
              'absolute top-full z-50 mt-1 w-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg',
              'dark:border-zinc-700 dark:bg-zinc-900',
            )}
          >
            {searchable && (
              <div className="border-b border-zinc-200 p-2 dark:border-zinc-700">
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className={cn(
                    'w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-sm outline-none',
                    'placeholder:text-zinc-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
                    'dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100',
                  )}
                  aria-label="Search options"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={handleKeyDown}
                />
              </div>
            )}
            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-multiselectable={multiple}
              aria-labelledby={labelId}
              className="max-h-60 overflow-y-auto py-1"
            >
              {flatFiltered.length === 0 ? (
                <li className="px-3 py-2 text-center text-sm text-zinc-400">
                  No options found
                </li>
              ) : (
                groups.map((group) => {
                  const groupFiltered = group.options.filter(
                    (o) =>
                      !search ||
                      o.label.toLowerCase().includes(search.toLowerCase()),
                  );
                  if (groupFiltered.length === 0) return null;

                  return (
                    <li key={group.label || '__ungrouped'} role="presentation">
                      {group.label && (
                        <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                          {group.label}
                        </div>
                      )}
                      <ul role="group" aria-label={group.label || undefined}>
                        {groupFiltered.map((option) => {
                          if (!option.disabled) flatIndex++;
                          const currentIndex = flatIndex;
                          const selected = isSelected(option.value);
                          const highlighted =
                            !option.disabled && currentIndex === highlightedIndex;

                          return (
                            <li
                              key={option.value}
                              role="option"
                              aria-selected={selected}
                              aria-disabled={option.disabled}
                              data-index={option.disabled ? undefined : currentIndex}
                              className={cn(
                                'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors',
                                highlighted && 'bg-blue-50 dark:bg-blue-900/20',
                                selected &&
                                  !highlighted &&
                                  'bg-zinc-50 dark:bg-zinc-800',
                                option.disabled &&
                                  'cursor-not-allowed text-zinc-300 dark:text-zinc-600',
                                !option.disabled &&
                                  !highlighted &&
                                  'text-zinc-900 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-800',
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!option.disabled) handleSelect(option.value);
                              }}
                              onMouseEnter={() => {
                                if (!option.disabled) setHighlightedIndex(currentIndex);
                              }}
                            >
                              {multiple && (
                                <span
                                  className={cn(
                                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                    selected
                                      ? 'border-blue-600 bg-blue-600 text-white'
                                      : 'border-zinc-300 dark:border-zinc-600',
                                  )}
                                  aria-hidden="true"
                                >
                                  {selected && (
                                    <svg
                                      className="h-3 w-3"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth={3}
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                  )}
                                </span>
                              )}
                              {option.icon && (
                                <span className="shrink-0">{option.icon}</span>
                              )}
                              <span className="truncate">{option.label}</span>
                              {!multiple && selected && (
                                <svg
                                  className="ml-auto h-4 w-4 shrink-0 text-blue-600"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  aria-hidden="true"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}

        {error && (
          <p id={errorId} className="text-xs text-red-500" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Select.displayName = 'Select';
