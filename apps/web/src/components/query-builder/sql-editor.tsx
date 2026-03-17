import { useRef, useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/common/loading-spinner';

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute?: () => void;
  isExecuting?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  minHeight?: string;
}

// SQL keyword list for basic highlighting
const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'ALTER',
  'DROP', 'TABLE', 'INDEX', 'VIEW', 'JOIN', 'INNER', 'LEFT', 'RIGHT',
  'OUTER', 'FULL', 'CROSS', 'ON', 'AS', 'GROUP', 'BY', 'ORDER', 'HAVING',
  'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT', 'CASE', 'WHEN', 'THEN',
  'ELSE', 'END', 'NULL', 'IS', 'TRUE', 'FALSE', 'ASC', 'DESC', 'EXISTS',
  'WITH', 'RECURSIVE', 'OVER', 'PARTITION', 'WINDOW', 'RANK', 'ROW_NUMBER',
  'DENSE_RANK', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE', 'COALESCE',
  'CAST', 'EXTRACT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
]);

export function SqlEditor({
  value,
  onChange,
  onExecute,
  isExecuting = false,
  readOnly = false,
  placeholder = 'Write your SQL query here...\n\nExample:\nSELECT column_name, COUNT(*)\nFROM table_name\nWHERE condition = true\nGROUP BY column_name\nORDER BY COUNT(*) DESC\nLIMIT 100',
  minHeight = '300px',
}: SqlEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const [lineCount, setLineCount] = useState(1);

  // Sync scroll between textarea and highlight overlay
  const handleScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl/Cmd + Enter to execute
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onExecute?.();
        return;
      }

      // Tab key for indentation
      if (e.key === 'Tab') {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;

        if (e.shiftKey) {
          // Un-indent
          const beforeCursor = value.slice(0, start);
          const lastLineStart = beforeCursor.lastIndexOf('\n') + 1;
          const linePrefix = value.slice(lastLineStart, start);
          if (linePrefix.startsWith('  ')) {
            const newValue = value.slice(0, lastLineStart) + value.slice(lastLineStart + 2);
            onChange(newValue);
            requestAnimationFrame(() => {
              textarea.selectionStart = Math.max(lastLineStart, start - 2);
              textarea.selectionEnd = Math.max(lastLineStart, end - 2);
            });
          }
        } else {
          // Indent
          const newValue = value.slice(0, start) + '  ' + value.slice(end);
          onChange(newValue);
          requestAnimationFrame(() => {
            textarea.selectionStart = start + 2;
            textarea.selectionEnd = start + 2;
          });
        }
      }
    },
    [value, onChange, onExecute],
  );

  // Update line count
  useEffect(() => {
    const lines = value.split('\n').length;
    setLineCount(Math.max(lines, 1));
  }, [value]);

  // Generate highlighted HTML
  const highlightedHtml = highlightSql(value);

  return (
    <div className="space-y-3">
      {/* Editor toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            SQL Editor
          </span>
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {lineCount} line{lineCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to run
          </span>
          {onExecute && (
            <button
              onClick={onExecute}
              disabled={isExecuting || !value.trim()}
              className="btn btn-primary btn-sm"
            >
              {isExecuting ? (
                <>
                  <LoadingSpinner size="sm" />
                  Running...
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                  Run Query
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Editor area */}
      <div
        className="relative rounded-lg overflow-hidden font-mono text-sm"
        style={{
          border: '1px solid var(--color-border)',
          minHeight,
        }}
      >
        {/* Line numbers */}
        <div
          className="absolute top-0 left-0 w-12 h-full overflow-hidden select-none text-right pr-2 pt-3"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderRight: '1px solid var(--color-border)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          {Array.from({ length: lineCount }).map((_, i) => (
            <div key={i} className="leading-6 text-xs">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Syntax highlight overlay */}
        <pre
          ref={highlightRef}
          className="absolute top-0 left-12 right-0 h-full p-3 overflow-hidden pointer-events-none whitespace-pre-wrap break-words leading-6"
          style={{
            backgroundColor: 'transparent',
            color: 'transparent',
            margin: 0,
            fontFamily: 'inherit',
            fontSize: 'inherit',
          }}
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: highlightedHtml + '\n' }}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          className="relative w-full h-full p-3 pl-[3.5rem] bg-transparent resize-none outline-none leading-6"
          style={{
            minHeight,
            color: 'var(--color-text)',
            caretColor: 'var(--color-text)',
            backgroundColor: 'var(--color-bg)',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
          }}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}

// ── SQL Syntax Highlighting ──────────────────────────────────────────
// Simple token-based highlighting (not a full parser)

function highlightSql(sql: string): string {
  if (!sql) return '';

  // Escape HTML first
  let escaped = sql
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Highlight strings (single-quoted)
  escaped = escaped.replace(
    /('(?:[^'\\]|\\.)*')/g,
    '<span style="color: #22c55e">$1</span>',
  );

  // Highlight numbers
  escaped = escaped.replace(
    /\b(\d+(?:\.\d+)?)\b/g,
    '<span style="color: #f59e0b">$1</span>',
  );

  // Highlight comments (-- single line)
  escaped = escaped.replace(
    /(--[^\n]*)/g,
    '<span style="color: #6b7280; font-style: italic">$1</span>',
  );

  // Highlight SQL keywords
  escaped = escaped.replace(
    /\b([A-Z_]+)\b/g,
    (match) => {
      if (SQL_KEYWORDS.has(match)) {
        return `<span style="color: #3b82f6; font-weight: 600">${match}</span>`;
      }
      return match;
    },
  );

  return escaped;
}
