import {
  forwardRef,
  useState,
  useCallback,
  useRef,
  useEffect,
  useId,
  type TextareaHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '../../utils/cn.js';

// ---- Types ----

export interface CodeEditorProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
  /** Current code value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Language for syntax highlighting */
  language?: 'sql' | 'json' | 'text';
  /** Label text */
  label?: string;
  /** Error message */
  error?: string;
  /** Show line numbers */
  lineNumbers?: boolean;
  /** Minimum height */
  minHeight?: string | number;
  /** Maximum height */
  maxHeight?: string | number;
  /** Placeholder text */
  placeholder?: string;
  /** Read-only mode */
  readOnly?: boolean;
}

// ---- SQL Tokenizer ----

interface Token {
  type: 'keyword' | 'string' | 'number' | 'comment' | 'operator' | 'function' | 'text';
  value: string;
}

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL',
  'AS', 'ON', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS',
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX',
  'GROUP', 'BY', 'ORDER', 'ASC', 'DESC', 'HAVING',
  'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'EXISTS', 'BETWEEN', 'LIKE', 'TRUE', 'FALSE',
  'WITH', 'RECURSIVE', 'OVER', 'PARTITION', 'WINDOW',
  'CAST', 'COALESCE', 'NULLIF',
]);

const SQL_FUNCTIONS = new Set([
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
  'UPPER', 'LOWER', 'TRIM', 'LENGTH', 'SUBSTRING',
  'NOW', 'DATE', 'EXTRACT', 'CONCAT',
  'ROUND', 'FLOOR', 'CEIL', 'ABS',
  'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD',
  'FIRST_VALUE', 'LAST_VALUE', 'NTH_VALUE',
]);

function tokenizeSQL(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < code.length) {
    // Single line comment
    if (code[i] === '-' && code[i + 1] === '-') {
      let comment = '';
      while (i < code.length && code[i] !== '\n') {
        comment += code[i];
        i++;
      }
      tokens.push({ type: 'comment', value: comment });
      continue;
    }

    // Multi-line comment
    if (code[i] === '/' && code[i + 1] === '*') {
      let comment = '';
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        comment += code[i];
        i++;
      }
      if (i < code.length) {
        comment += '*/';
        i += 2;
      }
      tokens.push({ type: 'comment', value: comment });
      continue;
    }

    // String literal (single quote)
    if (code[i] === "'") {
      let str = "'";
      i++;
      while (i < code.length && code[i] !== "'") {
        if (code[i] === "'" && code[i + 1] === "'") {
          str += "''";
          i += 2;
          continue;
        }
        str += code[i];
        i++;
      }
      if (i < code.length) {
        str += "'";
        i++;
      }
      tokens.push({ type: 'string', value: str });
      continue;
    }

    // Number
    if (/\d/.test(code[i]!)) {
      let num = '';
      while (i < code.length && /[\d.]/.test(code[i]!)) {
        num += code[i];
        i++;
      }
      tokens.push({ type: 'number', value: num });
      continue;
    }

    // Word (keyword, function, or identifier)
    if (/[a-zA-Z_]/.test(code[i]!)) {
      let word = '';
      while (i < code.length && /[a-zA-Z0-9_]/.test(code[i]!)) {
        word += code[i];
        i++;
      }
      const upper = word.toUpperCase();
      if (SQL_KEYWORDS.has(upper)) {
        tokens.push({ type: 'keyword', value: word });
      } else if (SQL_FUNCTIONS.has(upper)) {
        tokens.push({ type: 'function', value: word });
      } else {
        tokens.push({ type: 'text', value: word });
      }
      continue;
    }

    // Operators
    if ('=<>!+-*/%&|^~'.includes(code[i]!)) {
      tokens.push({ type: 'operator', value: code[i]! });
      i++;
      continue;
    }

    // Everything else (whitespace, punctuation)
    tokens.push({ type: 'text', value: code[i]! });
    i++;
  }

  return tokens;
}

// ---- Highlighted Code Rendering ----

const tokenColors: Record<Token['type'], string> = {
  keyword: 'text-purple-600 dark:text-purple-400 font-semibold',
  string: 'text-green-600 dark:text-green-400',
  number: 'text-orange-600 dark:text-orange-400',
  comment: 'text-zinc-400 dark:text-zinc-500 italic',
  operator: 'text-red-500 dark:text-red-400',
  function: 'text-blue-600 dark:text-blue-400',
  text: '',
};

function highlightCode(code: string, language: string): ReactNode[] {
  if (language !== 'sql') {
    return [code];
  }

  const tokens = tokenizeSQL(code);
  return tokens.map((token, i) => {
    const colorClass = tokenColors[token.type];
    if (!colorClass) {
      return <span key={i}>{token.value}</span>;
    }
    return (
      <span key={i} className={colorClass}>
        {token.value}
      </span>
    );
  });
}

// ---- Component ----

/**
 * Simple code editor based on textarea with syntax highlighting overlay.
 * Supports SQL syntax highlighting, line numbers, and tab indentation.
 */
export const CodeEditor = forwardRef<HTMLTextAreaElement, CodeEditorProps>(
  (
    {
      value,
      onChange,
      language = 'sql',
      label,
      error,
      lineNumbers = true,
      minHeight = '120px',
      maxHeight = '400px',
      placeholder = 'Enter your query...',
      readOnly = false,
      disabled,
      className,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const errorId = error ? `${generatedId}-error` : undefined;
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const highlightRef = useRef<HTMLPreElement>(null);

    // Sync scroll between textarea and highlight overlay
    const handleScroll = useCallback(() => {
      if (textareaRef.current && highlightRef.current) {
        highlightRef.current.scrollTop = textareaRef.current.scrollTop;
        highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
      }
    }, []);

    // Handle tab key for indentation
    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const textarea = e.currentTarget;
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;

          const newValue = value.substring(0, start) + '  ' + value.substring(end);
          onChange(newValue);

          // Restore cursor position
          requestAnimationFrame(() => {
            textarea.selectionStart = start + 2;
            textarea.selectionEnd = start + 2;
          });
        }
      },
      [value, onChange],
    );

    // Line count
    const lines = value.split('\n');
    const lineCount = lines.length;

    const heightStyle = {
      minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight,
      maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
    };

    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        {label && (
          <label
            htmlFor={generatedId}
            className={cn(
              'text-sm font-medium text-zinc-700 dark:text-zinc-300',
              disabled && 'opacity-50',
            )}
          >
            {label}
          </label>
        )}
        <div
          className={cn(
            'relative overflow-hidden rounded-md border font-mono text-sm',
            error
              ? 'border-red-500 focus-within:ring-red-500'
              : 'border-zinc-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 dark:border-zinc-700',
            'bg-white dark:bg-zinc-950',
            disabled && 'opacity-50',
          )}
        >
          <div className="flex" style={heightStyle}>
            {/* Line numbers */}
            {lineNumbers && (
              <div
                className={cn(
                  'flex flex-col items-end border-r border-zinc-200 bg-zinc-50 px-2 py-3 text-xs leading-[1.625rem] text-zinc-400 select-none',
                  'dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600',
                )}
                aria-hidden="true"
              >
                {Array.from({ length: lineCount }, (_, i) => (
                  <span key={i + 1}>{i + 1}</span>
                ))}
              </div>
            )}

            {/* Editor area */}
            <div className="relative flex-1 overflow-auto">
              {/* Syntax highlight overlay */}
              <pre
                ref={highlightRef}
                className={cn(
                  'pointer-events-none absolute inset-0 whitespace-pre-wrap break-words p-3 leading-relaxed',
                  'text-zinc-900 dark:text-zinc-100',
                )}
                aria-hidden="true"
              >
                <code>{highlightCode(value, language)}</code>
                {/* Trailing newline to keep pre and textarea height in sync */}
                {'\n'}
              </pre>

              {/* Textarea (invisible text, handles input) */}
              <textarea
                ref={(el) => {
                  textareaRef.current = el;
                  if (typeof ref === 'function') ref(el);
                  else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
                }}
                id={generatedId}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onScroll={handleScroll}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                readOnly={readOnly}
                disabled={disabled}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                aria-invalid={!!error}
                aria-describedby={errorId}
                className={cn(
                  'relative h-full w-full resize-none whitespace-pre-wrap break-words bg-transparent p-3 leading-relaxed text-transparent caret-zinc-900 outline-none',
                  'placeholder:text-zinc-400 dark:caret-zinc-100 dark:placeholder:text-zinc-600',
                )}
                style={{ ...heightStyle, minHeight: undefined }}
                {...props}
              />
            </div>
          </div>
        </div>
        {error && (
          <p id={errorId} className="text-xs text-red-500" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);
CodeEditor.displayName = 'CodeEditor';
