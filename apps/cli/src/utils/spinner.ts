// Ora spinner wrapper for consistent CLI loading indicators

import ora from 'ora';
import type { Ora } from 'ora';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpinnerOptions {
  /** Initial spinner text */
  text?: string;
  /** Spinner color (default: 'cyan') */
  color?: 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'gray';
}

// ---------------------------------------------------------------------------
// Wrapper class
// ---------------------------------------------------------------------------

export class Spinner {
  private readonly ora: Ora;

  constructor(options: SpinnerOptions = {}) {
    this.ora = ora({
      text: options.text ?? '',
      color: options.color ?? 'cyan',
      spinner: 'dots',
    });
  }

  /** Start the spinner with optional text */
  start(text?: string): this {
    if (text) this.ora.text = text;
    this.ora.start();
    return this;
  }

  /** Update spinner text while running */
  setText(text: string): this {
    this.ora.text = text;
    return this;
  }

  /** Stop with a success (green ✔) message */
  succeed(text?: string): this {
    this.ora.succeed(text);
    return this;
  }

  /** Stop with a failure (red ✖) message */
  fail(text?: string): this {
    this.ora.fail(text);
    return this;
  }

  /** Stop with a warning (yellow ⚠) message */
  warn(text?: string): this {
    this.ora.warn(text);
    return this;
  }

  /** Stop with an info (blue ℹ) message */
  info(text?: string): this {
    this.ora.info(text);
    return this;
  }

  /** Stop without any icon */
  stop(): this {
    this.ora.stop();
    return this;
  }

  /** Check whether the spinner is currently spinning */
  get isSpinning(): boolean {
    return this.ora.isSpinning;
  }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

export function createSpinner(text?: string): Spinner {
  return new Spinner({ text });
}

/**
 * Run an async function wrapped in a spinner.
 * Shows a loading indicator, then succeeds or fails based on the result.
 *
 * @param text  Initial spinner text
 * @param fn    Async function to execute
 * @param successText  Optional override for success message
 */
export async function withSpinner<T>(
  text: string,
  fn: () => Promise<T>,
  successText?: string,
): Promise<T> {
  const spinner = new Spinner({ text }).start();
  try {
    const result = await fn();
    spinner.succeed(successText ?? text);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    spinner.fail(`${text}: ${message}`);
    throw error;
  }
}
