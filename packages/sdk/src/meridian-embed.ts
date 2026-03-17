// Main SDK entry point — MeridianEmbed class and embedded entity interfaces

import type { QueryResult } from '@meridian/shared';
import { ApiClient } from './api-client.js';
import { EventEmitter } from './events/event-emitter.js';
import type { SdkEventMap, SdkEventName, SdkEventHandler } from './events/event-emitter.js';
import { resolveTheme } from './theme/theme-resolver.js';
import type { ThemeOverride, ResolvedTheme } from './theme/theme-resolver.js';

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface MeridianEmbedOptions {
  /** Base URL of the Meridian API server, e.g. "https://analytics.example.com" */
  baseUrl: string;
  /** Embed token — a short-lived signed token, NOT a user JWT */
  token: string;
  /** Visual theme: 'light', 'dark', or a custom override object */
  theme?: 'light' | 'dark' | ThemeOverride;
  /** BCP-47 locale string, e.g. "en-US", "ko-KR" */
  locale?: string;
  /** Global error handler invoked for unhandled SDK errors */
  onError?: (error: Error) => void;
  /** Max retries for transient API failures (default: 3) */
  maxRetries?: number;
  /** Request timeout in ms (default: 30_000) */
  timeoutMs?: number;
}

export interface DashboardOptions {
  /** Initial filter values */
  filters?: Record<string, unknown>;
  /** Override height of embedded container */
  height?: number | string;
  /** Override width of embedded container */
  width?: number | string;
  /** Disable border/shadow styling */
  borderless?: boolean;
  /** Called when the dashboard finishes loading */
  onLoad?: () => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
}

export interface QuestionOptions {
  /** Initial query parameters */
  parameters?: Record<string, unknown>;
  /** Override height */
  height?: number | string;
  /** Override width */
  width?: number | string;
  /** Called when the question finishes loading */
  onLoad?: () => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
}

// ── EmbeddedDashboard ─────────────────────────────────────────────────────────

export interface EmbeddedDashboard {
  /** Set a single filter value and trigger a re-query */
  setFilter(key: string, value: unknown): void;
  /** Set multiple filter values at once */
  setFilters(filters: Record<string, unknown>): void;
  /** Trigger a fresh data refresh for all cards */
  refresh(): void;
  /** Destroy the embedded dashboard and clean up DOM/listeners */
  destroy(): void;
  /** Register an event listener */
  on<K extends SdkEventName>(event: K, handler: SdkEventHandler<K>): void;
  /** Unregister an event listener */
  off<K extends SdkEventName>(event: K, handler: SdkEventHandler<K>): void;
  /** Get current filter state */
  getFilters(): Record<string, unknown>;
}

// ── EmbeddedQuestion ──────────────────────────────────────────────────────────

export interface EmbeddedQuestion {
  /** Update query parameters and re-execute */
  setParameters(params: Record<string, unknown>): void;
  /** Trigger a fresh re-execution */
  refresh(): void;
  /** Get the latest query result */
  getResult(): Promise<QueryResult>;
  /** Destroy the embedded question and clean up DOM/listeners */
  destroy(): void;
  /** Register an event listener */
  on<K extends SdkEventName>(event: K, handler: SdkEventHandler<K>): void;
  /** Unregister an event listener */
  off<K extends SdkEventName>(event: K, handler: SdkEventHandler<K>): void;
}

// ── Internal implementations ──────────────────────────────────────────────────

class EmbeddedDashboardImpl implements EmbeddedDashboard {
  private readonly emitter = new EventEmitter();
  private filters: Record<string, unknown>;
  private destroyed = false;
  private abortController = new AbortController();

  constructor(
    private readonly id: string,
    private readonly container: HTMLElement,
    private readonly client: ApiClient,
    private readonly theme: ResolvedTheme,
    private readonly options: DashboardOptions,
  ) {
    this.filters = { ...(options.filters ?? {}) };
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      this.renderLoadingState();
      const dashboard = await this.client.getDashboard(this.id, {
        signal: this.abortController.signal,
      });
      this.renderDashboard(dashboard);
      this.emitter.emit('load', { timestamp: Date.now() });
      this.options.onLoad?.();
    } catch (error) {
      if (this.destroyed) return;
      const err = error instanceof Error ? error : new Error(String(error));
      this.renderErrorState(err);
      this.emitter.emit('error', { error: err, timestamp: Date.now() });
      this.options.onError?.(err);
    }
  }

  private renderLoadingState(): void {
    if (this.destroyed) return;
    this.container.innerHTML = '';
    const wrapper = this.createWrapper();
    const loader = document.createElement('div');
    loader.setAttribute('data-meridian-loading', 'true');
    loader.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 200px;
      color: ${this.theme.colors.textMuted};
      font-family: ${this.theme.typography.fontFamily};
      font-size: ${this.theme.typography.fontSizeBase};
    `;
    loader.textContent = 'Loading dashboard…';
    wrapper.appendChild(loader);
    this.container.appendChild(wrapper);
  }

  private renderDashboard(dashboard: { name: string; cards: unknown[] }): void {
    if (this.destroyed) return;
    this.container.innerHTML = '';
    const wrapper = this.createWrapper();
    wrapper.setAttribute('data-meridian-dashboard', this.id);
    wrapper.setAttribute('data-meridian-dashboard-name', dashboard.name);

    const header = document.createElement('div');
    header.style.cssText = `
      padding: ${this.theme.spacing.md};
      border-bottom: 1px solid ${this.theme.colors.border};
      font-family: ${this.theme.typography.fontFamily};
      font-size: ${this.theme.typography.fontSizeLg};
      font-weight: ${this.theme.typography.fontWeightBold};
      color: ${this.theme.colors.text};
    `;
    header.textContent = dashboard.name;
    wrapper.appendChild(header);

    const cardCount = document.createElement('div');
    cardCount.style.cssText = `
      padding: ${this.theme.spacing.md};
      color: ${this.theme.colors.textMuted};
      font-family: ${this.theme.typography.fontFamily};
      font-size: ${this.theme.typography.fontSizeSm};
    `;
    cardCount.textContent = `${dashboard.cards.length} card${dashboard.cards.length !== 1 ? 's' : ''}`;
    wrapper.appendChild(cardCount);

    this.container.appendChild(wrapper);
  }

  private renderErrorState(error: Error): void {
    if (this.destroyed) return;
    this.container.innerHTML = '';
    const wrapper = this.createWrapper();
    const errorEl = document.createElement('div');
    errorEl.setAttribute('data-meridian-error', 'true');
    errorEl.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 200px;
      padding: ${this.theme.spacing.lg};
      background: ${this.theme.colors.errorBackground};
      color: ${this.theme.colors.error};
      font-family: ${this.theme.typography.fontFamily};
      font-size: ${this.theme.typography.fontSizeBase};
      border-radius: ${this.theme.shape.borderRadius};
    `;
    errorEl.textContent = `Failed to load dashboard: ${error.message}`;
    wrapper.appendChild(errorEl);
    this.container.appendChild(wrapper);
  }

  private createWrapper(): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-meridian', 'dashboard-container');
    wrapper.style.cssText = `
      background: ${this.theme.colors.background};
      border: ${this.options.borderless ? 'none' : `1px solid ${this.theme.colors.border}`};
      border-radius: ${this.options.borderless ? '0' : this.theme.shape.borderRadiusLg};
      box-shadow: ${this.options.borderless ? 'none' : this.theme.shape.shadowMd};
      overflow: hidden;
      width: ${typeof this.options.width === 'number' ? `${this.options.width}px` : (this.options.width ?? '100%')};
      height: ${typeof this.options.height === 'number' ? `${this.options.height}px` : (this.options.height ?? 'auto')};
      min-height: 200px;
    `;
    return wrapper;
  }

  // ── EmbeddedDashboard interface ──────────────────────────────────────────

  setFilter(key: string, value: unknown): void {
    if (this.destroyed) return;
    this.filters[key] = value;
    this.emitter.emit('filter-change', {
      key,
      value,
      allFilters: { ...this.filters },
    });
    void this.initialize();
  }

  setFilters(filters: Record<string, unknown>): void {
    if (this.destroyed) return;
    this.filters = { ...this.filters, ...filters };
    for (const [key, value] of Object.entries(filters)) {
      this.emitter.emit('filter-change', {
        key,
        value,
        allFilters: { ...this.filters },
      });
    }
    void this.initialize();
  }

  refresh(): void {
    if (this.destroyed) return;
    // Cancel existing in-flight requests
    this.abortController.abort();
    this.abortController = new AbortController();
    void this.initialize();
  }

  getFilters(): Record<string, unknown> {
    return { ...this.filters };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abortController.abort();
    this.emitter.removeAllListeners();
    this.container.innerHTML = '';
  }

  on<K extends SdkEventName>(event: K, handler: SdkEventHandler<K>): void {
    this.emitter.on(event, handler);
  }

  off<K extends SdkEventName>(event: K, handler: SdkEventHandler<K>): void {
    this.emitter.off(event, handler);
  }
}

class EmbeddedQuestionImpl implements EmbeddedQuestion {
  private readonly emitter = new EventEmitter();
  private parameters: Record<string, unknown>;
  private destroyed = false;
  private abortController = new AbortController();
  private latestResult: QueryResult | null = null;
  private resultPromise: Promise<QueryResult> | null = null;

  constructor(
    private readonly id: string,
    private readonly container: HTMLElement,
    private readonly client: ApiClient,
    private readonly theme: ResolvedTheme,
    private readonly options: QuestionOptions,
  ) {
    this.parameters = { ...(options.parameters ?? {}) };
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    this.renderLoadingState();
    this.resultPromise = this.fetchResult();

    try {
      const result = await this.resultPromise;
      if (this.destroyed) return;
      this.latestResult = result;
      this.renderResult(result);
      this.emitter.emit('load', { timestamp: Date.now() });
      this.emitter.emit('data-update', { result, timestamp: Date.now() });
      this.options.onLoad?.();
    } catch (error) {
      if (this.destroyed) return;
      const err = error instanceof Error ? error : new Error(String(error));
      this.renderErrorState(err);
      this.emitter.emit('error', { error: err, timestamp: Date.now() });
      this.options.onError?.(err);
    }
  }

  private async fetchResult(): Promise<QueryResult> {
    return this.client.executeQuestion(this.id, this.parameters, {
      signal: this.abortController.signal,
    });
  }

  private renderLoadingState(): void {
    if (this.destroyed) return;
    this.container.innerHTML = '';
    const wrapper = this.createWrapper();
    const loader = document.createElement('div');
    loader.setAttribute('data-meridian-loading', 'true');
    loader.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 160px;
      color: ${this.theme.colors.textMuted};
      font-family: ${this.theme.typography.fontFamily};
      font-size: ${this.theme.typography.fontSizeBase};
    `;
    loader.textContent = 'Loading…';
    wrapper.appendChild(loader);
    this.container.appendChild(wrapper);
  }

  private renderResult(result: QueryResult): void {
    if (this.destroyed) return;
    this.container.innerHTML = '';
    const wrapper = this.createWrapper();
    wrapper.setAttribute('data-meridian-question', this.id);

    const meta = document.createElement('div');
    meta.style.cssText = `
      padding: ${this.theme.spacing.sm} ${this.theme.spacing.md};
      color: ${this.theme.colors.textMuted};
      font-family: ${this.theme.typography.fontFamily};
      font-size: ${this.theme.typography.fontSizeSm};
      border-bottom: 1px solid ${this.theme.colors.borderSubtle};
    `;
    meta.textContent = `${result.rowCount} rows · ${result.executionTimeMs}ms`;
    wrapper.appendChild(meta);

    this.container.appendChild(wrapper);
  }

  private renderErrorState(error: Error): void {
    if (this.destroyed) return;
    this.container.innerHTML = '';
    const wrapper = this.createWrapper();
    const errorEl = document.createElement('div');
    errorEl.setAttribute('data-meridian-error', 'true');
    errorEl.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 160px;
      padding: ${this.theme.spacing.md};
      background: ${this.theme.colors.errorBackground};
      color: ${this.theme.colors.error};
      font-family: ${this.theme.typography.fontFamily};
      font-size: ${this.theme.typography.fontSizeBase};
      border-radius: ${this.theme.shape.borderRadius};
    `;
    errorEl.textContent = `Error: ${error.message}`;
    wrapper.appendChild(errorEl);
    this.container.appendChild(wrapper);
  }

  private createWrapper(): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-meridian', 'question-container');
    wrapper.style.cssText = `
      background: ${this.theme.colors.background};
      border: 1px solid ${this.theme.colors.border};
      border-radius: ${this.theme.shape.borderRadiusLg};
      box-shadow: ${this.theme.shape.shadowMd};
      overflow: hidden;
      width: ${typeof this.options.width === 'number' ? `${this.options.width}px` : (this.options.width ?? '100%')};
      height: ${typeof this.options.height === 'number' ? `${this.options.height}px` : (this.options.height ?? 'auto')};
      min-height: 160px;
    `;
    return wrapper;
  }

  // ── EmbeddedQuestion interface ───────────────────────────────────────────

  setParameters(params: Record<string, unknown>): void {
    if (this.destroyed) return;
    this.parameters = { ...this.parameters, ...params };
    this.abortController.abort();
    this.abortController = new AbortController();
    void this.initialize();
  }

  refresh(): void {
    if (this.destroyed) return;
    this.abortController.abort();
    this.abortController = new AbortController();
    void this.initialize();
  }

  async getResult(): Promise<QueryResult> {
    if (this.latestResult) return this.latestResult;
    if (this.resultPromise) return this.resultPromise;
    return this.client.executeQuestion(this.id, this.parameters);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abortController.abort();
    this.emitter.removeAllListeners();
    this.container.innerHTML = '';
  }

  on<K extends SdkEventName>(event: K, handler: SdkEventHandler<K>): void {
    this.emitter.on(event, handler);
  }

  off<K extends SdkEventName>(event: K, handler: SdkEventHandler<K>): void {
    this.emitter.off(event, handler);
  }
}

// ── MeridianEmbed ─────────────────────────────────────────────────────────────

/**
 * Main SDK entry point.
 *
 * @example
 * ```ts
 * const sdk = new MeridianEmbed({ baseUrl: 'https://analytics.example.com', token });
 * const dash = sdk.dashboard('dash-123', document.getElementById('container'));
 * dash.on('load', () => console.log('dashboard loaded'));
 * ```
 */
export class MeridianEmbed {
  private readonly client: ApiClient;
  private readonly theme: ResolvedTheme;
  private readonly options: MeridianEmbedOptions;
  private readonly instances = new Set<EmbeddedDashboardImpl | EmbeddedQuestionImpl>();
  private destroyed = false;

  constructor(options: MeridianEmbedOptions) {
    this.options = options;
    this.client = new ApiClient({
      baseUrl: options.baseUrl,
      token: options.token,
      maxRetries: options.maxRetries,
      timeoutMs: options.timeoutMs,
    });
    this.theme = resolveTheme(options.theme);
  }

  /**
   * Embed a dashboard into the given container element.
   */
  dashboard(
    id: string,
    container: HTMLElement,
    options?: DashboardOptions,
  ): EmbeddedDashboard {
    this.assertNotDestroyed('dashboard');
    const instance = new EmbeddedDashboardImpl(
      id,
      container,
      this.client,
      this.theme,
      options ?? {},
    );
    this.instances.add(instance);

    // Propagate errors to global handler if provided
    if (this.options.onError) {
      const globalHandler = this.options.onError;
      instance.on('error', ({ error }) => globalHandler(error));
    }

    return instance;
  }

  /**
   * Embed a question (chart/table) into the given container element.
   */
  question(
    id: string,
    container: HTMLElement,
    options?: QuestionOptions,
  ): EmbeddedQuestion {
    this.assertNotDestroyed('question');
    const instance = new EmbeddedQuestionImpl(
      id,
      container,
      this.client,
      this.theme,
      options ?? {},
    );
    this.instances.add(instance);

    if (this.options.onError) {
      const globalHandler = this.options.onError;
      instance.on('error', ({ error }) => globalHandler(error));
    }

    return instance;
  }

  /**
   * Destroy all embedded instances and cancel all pending requests.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const instance of this.instances) {
      instance.destroy();
    }
    this.instances.clear();
    this.client.cancelAll();
  }

  /**
   * Returns the resolved theme for external access.
   */
  getTheme(): ResolvedTheme {
    return this.theme;
  }

  /**
   * Returns the underlying API client for advanced use cases.
   */
  getClient(): ApiClient {
    return this.client;
  }

  private assertNotDestroyed(method: string): void {
    if (this.destroyed) {
      throw new Error(`MeridianEmbed.${method}() called after destroy()`);
    }
  }
}

// Re-export event types for external consumers
export type { SdkEventMap, SdkEventName, SdkEventHandler };
