import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
  variant?: 'underline' | 'pills';
}

export function Tabs({
  tabs,
  activeTab,
  onTabChange,
  className,
  variant = 'underline',
}: TabsProps) {
  return (
    <div
      className={cn(
        'flex gap-1',
        variant === 'underline' && 'border-b',
        variant === 'pills' && 'p-1 rounded-lg',
        className,
      )}
      style={{
        borderColor: variant === 'underline' ? 'var(--color-border)' : undefined,
        backgroundColor: variant === 'pills' ? 'var(--color-bg-tertiary)' : undefined,
      }}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-disabled={tab.disabled}
            onClick={() => !tab.disabled && onTabChange(tab.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
              variant === 'underline' && [
                '-mb-px border-b-2',
                isActive
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent hover:border-gray-300',
              ],
              variant === 'pills' && [
                'rounded-md',
                isActive
                  ? 'bg-white shadow-sm dark:bg-gray-700'
                  : 'hover:bg-white/50 dark:hover:bg-gray-600/50',
              ],
              tab.disabled && 'opacity-50 cursor-not-allowed',
              !isActive && !tab.disabled && 'cursor-pointer',
            )}
            style={{
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

interface TabPanelProps {
  children: React.ReactNode;
  className?: string;
}

export function TabPanel({ children, className }: TabPanelProps) {
  return (
    <div role="tabpanel" className={cn('py-4', className)}>
      {children}
    </div>
  );
}
