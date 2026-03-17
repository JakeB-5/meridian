import {
  forwardRef,
  useState,
  useCallback,
  useRef,
  useId,
  type HTMLAttributes,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import { cn } from '../../utils/cn.js';

// ---- Types ----

export interface TabItem {
  /** Unique key for the tab */
  key: string;
  /** Tab label */
  label: ReactNode;
  /** Tab icon (before label) */
  icon?: ReactNode;
  /** Tab content panel */
  content: ReactNode;
  /** Disabled state */
  disabled?: boolean;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Tab definitions */
  items: TabItem[];
  /** Active tab key (controlled) */
  activeKey?: string;
  /** Default active tab key (uncontrolled) */
  defaultActiveKey?: string;
  /** Change handler */
  onChange?: (key: string) => void;
  /** Visual variant */
  variant?: 'line' | 'pill';
  /** Full width tabs */
  fullWidth?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
} as const;

const tabButtonSizes = {
  sm: 'px-2.5 py-1.5',
  md: 'px-3 py-2',
  lg: 'px-4 py-2.5',
} as const;

/**
 * Tab navigation component with content panels.
 * Supports line and pill variants with full keyboard navigation.
 * Follows WAI-ARIA Tabs pattern.
 */
export const Tabs = forwardRef<HTMLDivElement, TabsProps>(
  (
    {
      items,
      activeKey: controlledActiveKey,
      defaultActiveKey,
      onChange,
      variant = 'line',
      fullWidth = false,
      size = 'md',
      className,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const tabListRef = useRef<HTMLDivElement>(null);

    const [internalActiveKey, setInternalActiveKey] = useState(
      defaultActiveKey ?? items[0]?.key ?? '',
    );
    const isControlled = controlledActiveKey !== undefined;
    const activeKey = isControlled ? controlledActiveKey : internalActiveKey;

    const setActiveKey = useCallback(
      (key: string) => {
        if (!isControlled) {
          setInternalActiveKey(key);
        }
        onChange?.(key);
      },
      [isControlled, onChange],
    );

    const enabledItems = items.filter((item) => !item.disabled);

    const handleKeyDown = useCallback(
      (e: KeyboardEvent) => {
        const currentIndex = enabledItems.findIndex((item) => item.key === activeKey);
        let nextIndex: number | null = null;

        switch (e.key) {
          case 'ArrowRight':
          case 'ArrowDown': {
            e.preventDefault();
            nextIndex = (currentIndex + 1) % enabledItems.length;
            break;
          }
          case 'ArrowLeft':
          case 'ArrowUp': {
            e.preventDefault();
            nextIndex = (currentIndex - 1 + enabledItems.length) % enabledItems.length;
            break;
          }
          case 'Home': {
            e.preventDefault();
            nextIndex = 0;
            break;
          }
          case 'End': {
            e.preventDefault();
            nextIndex = enabledItems.length - 1;
            break;
          }
        }

        if (nextIndex !== null && enabledItems[nextIndex]) {
          setActiveKey(enabledItems[nextIndex]!.key);
          // Focus the tab button
          const tabEl = tabListRef.current?.querySelector(
            `[data-tab-key="${enabledItems[nextIndex]!.key}"]`,
          ) as HTMLElement | null;
          tabEl?.focus();
        }
      },
      [activeKey, enabledItems, setActiveKey],
    );

    const activeItem = items.find((item) => item.key === activeKey);

    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        {/* Tab list */}
        <div
          ref={tabListRef}
          role="tablist"
          aria-orientation="horizontal"
          onKeyDown={handleKeyDown}
          className={cn(
            'flex',
            variant === 'line' && 'border-b border-zinc-200 dark:border-zinc-800',
            variant === 'pill' && 'gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800',
            fullWidth && 'w-full',
            sizeClasses[size],
          )}
        >
          {items.map((item) => {
            const isActive = item.key === activeKey;
            const tabId = `${generatedId}-tab-${item.key}`;
            const panelId = `${generatedId}-panel-${item.key}`;

            return (
              <button
                key={item.key}
                id={tabId}
                role="tab"
                type="button"
                tabIndex={isActive ? 0 : -1}
                aria-selected={isActive}
                aria-controls={panelId}
                aria-disabled={item.disabled}
                data-tab-key={item.key}
                disabled={item.disabled}
                onClick={() => !item.disabled && setActiveKey(item.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 font-medium whitespace-nowrap transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
                  tabButtonSizes[size],
                  fullWidth && 'flex-1 justify-center',
                  item.disabled && 'cursor-not-allowed opacity-50',

                  // Line variant
                  variant === 'line' && [
                    '-mb-px border-b-2',
                    isActive
                      ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                      : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200',
                  ],

                  // Pill variant
                  variant === 'pill' && [
                    'rounded-md',
                    isActive
                      ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200',
                  ],
                )}
              >
                {item.icon && <span className="shrink-0 [&_svg]:h-4 [&_svg]:w-4">{item.icon}</span>}
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Tab panels */}
        {items.map((item) => {
          const isActive = item.key === activeKey;
          const tabId = `${generatedId}-tab-${item.key}`;
          const panelId = `${generatedId}-panel-${item.key}`;

          return (
            <div
              key={item.key}
              id={panelId}
              role="tabpanel"
              tabIndex={0}
              aria-labelledby={tabId}
              hidden={!isActive}
              className={cn('mt-4 focus-visible:outline-none', !isActive && 'hidden')}
            >
              {isActive && item.content}
            </div>
          );
        })}
      </div>
    );
  },
);
Tabs.displayName = 'Tabs';
