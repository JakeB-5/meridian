import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useKeyboardShortcut } from '@/hooks/use-keyboard-shortcut';
import { useDebounce } from '@/hooks/use-debounce';
import { apiClient } from '@/api/client';
import { LoadingSpinner } from './loading-spinner';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  type: 'dashboard' | 'question' | 'datasource' | 'user';
  title: string;
  subtitle?: string;
  updatedAt?: string;
}

interface GlobalSearchProps {
  onNavigate: (path: string) => void;
}

// ── Type icons ───────────────────────────────────────────────────────

const typeIcons: Record<string, React.ReactNode> = {
  dashboard: (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 4.25A2.25 2.25 0 014.25 2h2.5A2.25 2.25 0 019 4.25v2.5A2.25 2.25 0 016.75 9h-2.5A2.25 2.25 0 012 6.75v-2.5zM2 13.25A2.25 2.25 0 014.25 11h2.5A2.25 2.25 0 019 13.25v2.5A2.25 2.25 0 016.75 18h-2.5A2.25 2.25 0 012 15.75v-2.5zM11 4.25A2.25 2.25 0 0113.25 2h2.5A2.25 2.25 0 0118 4.25v2.5A2.25 2.25 0 0115.75 9h-2.5A2.25 2.25 0 0111 6.75v-2.5zM15.25 11h-2.5A2.25 2.25 0 0011 13.25v2.5A2.25 2.25 0 0013.25 18h2.5A2.25 2.25 0 0018 15.75v-2.5A2.25 2.25 0 0015.75 11z" />
    </svg>
  ),
  question: (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.94 6.94a.75.75 0 11-1.061-1.061 3 3 0 112.871 5.026v.345a.75.75 0 01-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 108.94 6.94zM10 15a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  ),
  datasource: (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 1c3.866 0 7 1.79 7 4s-3.134 4-7 4-7-1.79-7-4 3.134-4 7-4zm5.694 8.13c.464-.264.91-.583 1.306-.952V10c0 2.21-3.134 4-7 4s-7-1.79-7-4V8.178c.396.37.842.688 1.306.953C5.838 10.006 7.854 10.5 10 10.5s4.162-.494 5.694-1.37zM17 13.178V15c0 2.21-3.134 4-7 4s-7-1.79-7-4v-1.822c.396.37.842.688 1.306.953C5.838 15.006 7.854 15.5 10 15.5s4.162-.494 5.694-1.37c.464-.264.91-.583 1.306-.952z"
        clipRule="evenodd"
      />
    </svg>
  ),
  user: (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
    </svg>
  ),
};

const typeLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  question: 'Question',
  datasource: 'Data Source',
  user: 'User',
};

const typePaths: Record<string, string> = {
  dashboard: '/dashboards',
  question: '/questions',
  datasource: '/datasources',
  user: '/users',
};

// ── Component ────────────────────────────────────────────────────────

export function GlobalSearch({ onNavigate }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 250);

  // Toggle with keyboard shortcut
  useKeyboardShortcut('/', () => {
    setOpen(true);
  });

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  // Search when query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const abortController = new AbortController();

    apiClient
      .get<SearchResult[]>('/search', {
        params: { q: debouncedQuery },
        signal: abortController.signal,
      })
      .then((data) => {
        setResults(data);
        setSelectedIndex(0);
        setIsSearching(false);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          // Provide fallback empty results on API error
          setResults([]);
          setIsSearching(false);
        }
      });

    return () => abortController.abort();
  }, [debouncedQuery]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      const basePath = typePaths[result.type] ?? '/';
      onNavigate(`${basePath}/${result.id}`);
      setOpen(false);

      // Store recent search
      setRecentSearches((prev) => {
        const next = [query, ...prev.filter((s) => s !== query)].slice(0, 5);
        try {
          localStorage.setItem('meridian_recent_searches', JSON.stringify(next));
        } catch { /* ignore */ }
        return next;
      });
    },
    [onNavigate, query],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex]);
          }
          break;
        case 'Escape':
          setOpen(false);
          break;
      }
    },
    [results, selectedIndex, handleSelect],
  );

  // Load recent searches on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('meridian_recent_searches');
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setOpen(false)} />

      {/* Search dialog */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
        <div
          className="w-full max-w-xl rounded-xl shadow-2xl overflow-hidden"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
        >
          {/* Search input */}
          <div
            className="flex items-center gap-3 px-4 py-3 border-b"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <svg
              className="h-5 w-5 flex-shrink-0"
              style={{ color: 'var(--color-text-tertiary)' }}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                clipRule="evenodd"
              />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search dashboards, questions, data sources..."
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: 'var(--color-text)' }}
            />
            {isSearching && <LoadingSpinner size="sm" />}
            <kbd
              className="hidden sm:inline-flex items-center px-1.5 rounded text-xs font-mono"
              style={{
                backgroundColor: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              Esc
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[50vh] overflow-y-auto scrollbar-thin">
            {query.trim() && results.length === 0 && !isSearching ? (
              <div className="py-8 text-center">
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  No results found for "{query}"
                </p>
              </div>
            ) : results.length > 0 ? (
              <div className="py-2">
                {results.map((result, index) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      'flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors',
                      index === selectedIndex && 'bg-[var(--color-bg-tertiary)]',
                    )}
                  >
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
                      style={{
                        backgroundColor: 'var(--color-primary-light)',
                        color: 'var(--color-primary)',
                      }}
                    >
                      {typeIcons[result.type]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                        {result.title}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                        {typeLabels[result.type]}
                        {result.subtitle && ` - ${result.subtitle}`}
                        {result.updatedAt && ` - ${formatRelativeTime(result.updatedAt)}`}
                      </p>
                    </div>
                    {index === selectedIndex && (
                      <kbd
                        className="text-xs px-1.5 rounded"
                        style={{
                          backgroundColor: 'var(--color-bg-tertiary)',
                          color: 'var(--color-text-tertiary)',
                        }}
                      >
                        Enter
                      </kbd>
                    )}
                  </button>
                ))}
              </div>
            ) : !query.trim() && recentSearches.length > 0 ? (
              <div className="py-3 px-4">
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
                  Recent Searches
                </p>
                {recentSearches.map((recent, i) => (
                  <button
                    key={i}
                    onClick={() => setQuery(recent)}
                    className="flex items-center gap-2 w-full py-1.5 text-sm hover:text-[var(--color-primary)] transition-colors"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {recent}
                  </button>
                ))}
              </div>
            ) : !query.trim() ? (
              <div className="py-8 text-center">
                <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                  Start typing to search...
                </p>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div
            className="flex items-center gap-4 px-4 py-2 border-t text-xs"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-tertiary)',
            }}
          >
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded bg-[var(--color-bg-tertiary)]">Up</kbd>
              <kbd className="px-1 rounded bg-[var(--color-bg-tertiary)]">Down</kbd>
              to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded bg-[var(--color-bg-tertiary)]">Enter</kbd>
              to select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded bg-[var(--color-bg-tertiary)]">Esc</kbd>
              to close
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
