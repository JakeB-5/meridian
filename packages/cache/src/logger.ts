/**
 * Minimal structured logger for the cache package.
 * Uses console under the hood so there is no external dependency.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getEnvLevel(): LogLevel {
  const raw = (typeof process !== 'undefined' && process.env?.LOG_LEVEL) || 'info';
  return (raw as LogLevel) in LEVELS ? (raw as LogLevel) : 'info';
}

function buildEntry(
  level: LogLevel,
  name: string,
  message: string,
  meta?: Record<string, unknown>,
): string {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    name,
    msg: message,
    ...meta,
  };
  return JSON.stringify(entry);
}

/**
 * Create a named logger. Log level is controlled by the LOG_LEVEL env var.
 */
export function createLogger(name: string): Logger {
  const minLevel = LEVELS[getEnvLevel()];

  function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVELS[level] < minLevel) return;
    const line = buildEntry(level, name, message, meta);
    if (level === 'error' || level === 'warn') {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  return {
    debug: (msg, meta) => log('debug', msg, meta),
    info: (msg, meta) => log('info', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
  };
}
