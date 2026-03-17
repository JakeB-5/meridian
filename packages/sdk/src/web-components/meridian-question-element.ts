// Custom Element wrapping MeridianQuestion React component in shadow DOM

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MeridianQuestion } from '../react/meridian-question.js';
import type { MeridianQuestionProps } from '../react/meridian-question.js';
import type { QueryResult } from '@meridian/shared';

// ── Observed attributes ───────────────────────────────────────────────────────

const OBSERVED_ATTRIBUTES = [
  'base-url',
  'token',
  'question-id',
  'theme',
  'height',
  'width',
  'hide-title',
  'hide-meta',
  'borderless',
  'poll-interval', // ms
  'parameters',    // JSON string
] as const;

type ObservedAttribute = (typeof OBSERVED_ATTRIBUTES)[number];

// ── Parsing helpers ───────────────────────────────────────────────────────────

function parseParameters(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    console.warn('[meridian-question] Invalid JSON in "parameters" attribute:', value);
    return {};
  }
}

function parseDimension(value: string | null): string | number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

function parseTheme(value: string | null): MeridianQuestionProps['theme'] {
  if (!value) return undefined;
  if (value === 'light' || value === 'dark') return value;
  try {
    return JSON.parse(value) as MeridianQuestionProps['theme'];
  } catch {
    return 'light';
  }
}

function parsePollInterval(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// ── MeridianQuestionElement ───────────────────────────────────────────────────

/**
 * `<meridian-question>` Custom Element.
 *
 * Renders the MeridianQuestion React component inside a shadow DOM.
 * Supports data access and parameter updates via JS properties.
 *
 * @example HTML usage:
 * ```html
 * <meridian-question
 *   base-url="https://analytics.example.com"
 *   token="embed-token-here"
 *   question-id="q-456"
 *   theme="light"
 *   height="400"
 *   poll-interval="30000"
 * ></meridian-question>
 * ```
 *
 * @example JS usage:
 * ```js
 * const el = document.createElement('meridian-question');
 * el.baseUrl = 'https://analytics.example.com';
 * el.token = 'embed-token-here';
 * el.questionId = 'q-456';
 * el.parameters = { date_from: '2024-01-01', date_to: '2024-12-31' };
 * document.body.appendChild(el);
 *
 * el.addEventListener('meridian:load', (e) => {
 *   console.log('Loaded:', e.detail.result.rowCount, 'rows');
 * });
 * ```
 */
export class MeridianQuestionElement extends HTMLElement {
  private root: Root | null = null;
  private mountPoint: HTMLDivElement | null = null;

  // JS property overrides
  private _baseUrl?: string;
  private _token?: string;
  private _questionId?: string;
  private _parameters?: Record<string, unknown>;
  private _theme?: MeridianQuestionProps['theme'];
  private _height?: string | number;
  private _width?: string | number;
  private _hideTitle?: boolean;
  private _hideMeta?: boolean;
  private _borderless?: boolean;
  private _pollInterval?: number;

  // Latest query result (accessible via JS)
  private _latestResult: QueryResult | null = null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  static get observedAttributes(): readonly string[] {
    return OBSERVED_ATTRIBUTES;
  }

  connectedCallback(): void {
    const shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
        box-sizing: border-box;
      }
      *, *::before, *::after {
        box-sizing: inherit;
      }
    `;
    shadow.appendChild(style);

    this.mountPoint = document.createElement('div');
    this.mountPoint.style.cssText = 'width: 100%; height: 100%;';
    shadow.appendChild(this.mountPoint);

    this.root = createRoot(this.mountPoint);
    this.renderComponent();

    this.dispatchEvent(new CustomEvent('meridian:connected', { bubbles: false }));
  }

  disconnectedCallback(): void {
    Promise.resolve().then(() => {
      this.root?.unmount();
      this.root = null;
      this.mountPoint = null;
    });

    this.dispatchEvent(new CustomEvent('meridian:disconnected', { bubbles: false }));
  }

  attributeChangedCallback(
    _name: ObservedAttribute,
    _oldValue: string | null,
    _newValue: string | null,
  ): void {
    if (this.root) {
      this.renderComponent();
    }
  }

  // ── JS Property accessors ──────────────────────────────────────────────────

  get baseUrl(): string {
    return this._baseUrl ?? this.getAttribute('base-url') ?? '';
  }
  set baseUrl(value: string) {
    this._baseUrl = value;
    this.renderComponent();
  }

  get token(): string {
    return this._token ?? this.getAttribute('token') ?? '';
  }
  set token(value: string) {
    this._token = value;
    this.renderComponent();
  }

  get questionId(): string {
    return this._questionId ?? this.getAttribute('question-id') ?? '';
  }
  set questionId(value: string) {
    this._questionId = value;
    this.renderComponent();
  }

  get parameters(): Record<string, unknown> {
    return this._parameters ?? parseParameters(this.getAttribute('parameters'));
  }
  set parameters(value: Record<string, unknown>) {
    this._parameters = value;
    this.renderComponent();
  }

  get theme(): MeridianQuestionProps['theme'] {
    return this._theme ?? parseTheme(this.getAttribute('theme'));
  }
  set theme(value: MeridianQuestionProps['theme']) {
    this._theme = value;
    this.renderComponent();
  }

  get height(): string | number | undefined {
    return this._height ?? parseDimension(this.getAttribute('height'));
  }
  set height(value: string | number | undefined) {
    this._height = value;
    this.renderComponent();
  }

  get width(): string | number | undefined {
    return this._width ?? parseDimension(this.getAttribute('width'));
  }
  set width(value: string | number | undefined) {
    this._width = value;
    this.renderComponent();
  }

  get hideTitle(): boolean {
    return this._hideTitle ?? this.hasAttribute('hide-title');
  }
  set hideTitle(value: boolean) {
    this._hideTitle = value;
    this.renderComponent();
  }

  get hideMeta(): boolean {
    return this._hideMeta ?? this.hasAttribute('hide-meta');
  }
  set hideMeta(value: boolean) {
    this._hideMeta = value;
    this.renderComponent();
  }

  get borderless(): boolean {
    return this._borderless ?? this.hasAttribute('borderless');
  }
  set borderless(value: boolean) {
    this._borderless = value;
    this.renderComponent();
  }

  get pollInterval(): number | undefined {
    return this._pollInterval ?? parsePollInterval(this.getAttribute('poll-interval'));
  }
  set pollInterval(value: number | undefined) {
    this._pollInterval = value;
    this.renderComponent();
  }

  /**
   * The most recent QueryResult loaded by this question.
   * Available after the `meridian:load` event fires.
   */
  get latestResult(): QueryResult | null {
    return this._latestResult;
  }

  // ── Public methods ─────────────────────────────────────────────────────────

  /**
   * Update query parameters programmatically.
   */
  setParameters(params: Record<string, unknown>): void {
    this.parameters = { ...this.parameters, ...params };
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  private renderComponent(): void {
    if (!this.root) return;

    const baseUrl = this.baseUrl;
    const token = this.token;
    const questionId = this.questionId;

    if (!baseUrl || !token || !questionId) {
      this.root.render(null);
      return;
    }

    const props: MeridianQuestionProps = {
      baseUrl,
      token,
      questionId,
      parameters: this.parameters,
      theme: this.theme,
      height: this.height,
      width: this.width,
      hideTitle: this.hideTitle,
      hideMeta: this.hideMeta,
      borderless: this.borderless,
      pollInterval: this.pollInterval,
      onLoad: (result) => {
        this._latestResult = result;
        this.dispatchEvent(
          new CustomEvent('meridian:load', {
            bubbles: true,
            composed: true,
            detail: { result },
          }),
        );
      },
      onError: (error) => {
        this.dispatchEvent(
          new CustomEvent('meridian:error', {
            bubbles: true,
            composed: true,
            detail: { error },
          }),
        );
      },
      onDataPointClick: (row) => {
        this.dispatchEvent(
          new CustomEvent('meridian:click', {
            bubbles: true,
            composed: true,
            detail: { row },
          }),
        );
      },
    };

    this.root.render(React.createElement(MeridianQuestion, props));
  }
}

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Registers the `<meridian-question>` custom element.
 * Safe to call multiple times — skips if already defined.
 */
export function registerMeridianQuestionElement(): void {
  if (!customElements.get('meridian-question')) {
    customElements.define('meridian-question', MeridianQuestionElement);
  }
}

if (typeof customElements !== 'undefined') {
  registerMeridianQuestionElement();
}
