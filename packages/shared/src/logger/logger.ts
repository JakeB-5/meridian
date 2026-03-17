import * as pino from 'pino';

// ── Logger Interface ────────────────────────────────────────────────

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

// ── Logger Implementation ───────────────────────────────────────────

class PinoLogger implements Logger {
  private readonly pino: pino.Logger;

  constructor(pinoInstance: pino.Logger) {
    this.pino = pinoInstance;
  }

  debug(msg: string, data?: Record<string, unknown>): void {
    if (data) {
      this.pino.debug(data, msg);
    } else {
      this.pino.debug(msg);
    }
  }

  info(msg: string, data?: Record<string, unknown>): void {
    if (data) {
      this.pino.info(data, msg);
    } else {
      this.pino.info(msg);
    }
  }

  warn(msg: string, data?: Record<string, unknown>): void {
    if (data) {
      this.pino.warn(data, msg);
    } else {
      this.pino.warn(msg);
    }
  }

  error(msg: string, data?: Record<string, unknown>): void {
    if (data) {
      this.pino.error(data, msg);
    } else {
      this.pino.error(msg);
    }
  }

  child(bindings: Record<string, unknown>): Logger {
    return new PinoLogger(this.pino.child(bindings));
  }
}

// ── Factory ─────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface LoggerOptions {
  level?: LogLevel;
  pretty?: boolean;
}

/**
 * Create a named logger instance backed by pino.
 */
export const createLogger = (name: string, options: LoggerOptions = {}): Logger => {
  const level = options.level ?? (process.env['LOG_LEVEL'] as LogLevel | undefined) ?? 'info';

  const pinoInstance = (pino.default || pino)({
    name,
    level,
    ...(options.pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true },
          },
        }
      : {}),
  });

  return new PinoLogger(pinoInstance);
};

/**
 * Create a silent no-op logger (useful for testing).
 */
export const createNoopLogger = (): Logger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => createNoopLogger(),
});
