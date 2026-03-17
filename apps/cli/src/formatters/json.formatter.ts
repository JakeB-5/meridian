// JSON formatter for CLI output

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface JsonFormatterOptions {
  /** Indentation spaces (default: 2) */
  indent?: number;
  /** Whether to sort keys alphabetically (default: false) */
  sortKeys?: boolean;
  /** Whether to colorize the JSON output (default: false) */
  colorize?: boolean;
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

/**
 * Format any value as pretty-printed JSON.
 */
export function formatAsJson(
  value: unknown,
  options: JsonFormatterOptions = {},
): string {
  const { indent = 2, sortKeys = false, colorize = false } = options;

  const replacer = sortKeys
    ? (_key: string, val: unknown) => {
        if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
          const sorted: Record<string, unknown> = {};
          for (const k of Object.keys(val as object).sort()) {
            sorted[k] = (val as Record<string, unknown>)[k];
          }
          return sorted;
        }
        return val;
      }
    : undefined;

  const json = JSON.stringify(value, replacer, indent);

  if (!colorize) {
    return json;
  }

  return colorizeJson(json);
}

// ---------------------------------------------------------------------------
// JSON colorizer (ANSI escape codes)
// ---------------------------------------------------------------------------

/**
 * Apply ANSI color codes to a JSON string for terminal display.
 *
 * Color scheme:
 * - Keys:    cyan
 * - Strings: green
 * - Numbers: yellow
 * - Booleans: magenta
 * - Null:    red
 * - Braces/brackets: white (default)
 */
export function colorizeJson(json: string): string {
  // Token-by-token colorizer using a simple regex
  return json.replace(
    /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          // JSON key
          return `\x1b[36m${match}\x1b[0m`;
        }
        // String value
        return `\x1b[32m${match}\x1b[0m`;
      }
      if (/true|false/.test(match)) {
        // Boolean
        return `\x1b[35m${match}\x1b[0m`;
      }
      if (/null/.test(match)) {
        // Null
        return `\x1b[31m${match}\x1b[0m`;
      }
      // Number
      return `\x1b[33m${match}\x1b[0m`;
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a value as compact single-line JSON (no indentation).
 */
export function formatAsCompactJson(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Parse a JSON string safely, returning null on parse failure.
 */
export function tryParseJson(str: string): unknown | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
