// Custom Element wrapping MeridianDashboard React component in shadow DOM

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MeridianDashboard } from '../react/meridian-dashboard.js';
import type { MeridianDashboardProps } from '../react/meridian-dashboard.js';

// ── Observed attributes ───────────────────────────────────────────────────────

const OBSERVED_ATTRIBUTES = [
  'base-url',
  'token',
  'dashboard-id',
  'theme',
  'height',
  'width',
  'borderless',
  'filters', // JSON string
] as const;

type ObservedAttribute = (typeof OBSERVED_ATTRIBUTES)[number];

// ── Helper utilities ──────────────────────────────────────────────────────────

function parseFilters(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    console.warn('[meridian-dashboard] Invalid JSON in "filters" attribute:', value);
    return {};
  }
}

function parseHeight(value: string | null): string | number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

function parseTheme(value: string | null): MeridianDashboardProps['theme'] {
  if (!value) return undefined;
  if (value === 'light' || value === 'dark') return value;
  try {
    return JSON.parse(value) as MeridianDashboardProps['theme'];
  } catch {
    return 'light';
  }
}

// ── MeridianDashboardElement ──────────────────────────────────────────────────

/**
 * `<meridian-dashboard>` Custom Element.
 *
 * Renders the MeridianDashboard React component inside a shadow DOM.
 * Supports all major options as HTML attributes and JS properties.
 *
 * @example HTML usage:
 * ```html
 * <meridian-dashboard
 *   base-url="https://analytics.example.com"
 *   token="embed-token-here"
 *   dashboard-id="dash-123"
 *   theme="dark"
 *   height="600"
 * ></meridian-dashboard>
 * ```
 *
 * @example JS usage:
 * ```js
 * const el = document.createElement('meridian-dashboard');
 * el.baseUrl = 'https://analytics.example.com';
 * el.token = 'embed-token-here';
 * el.dashboardId = 'dash-123';
 * el.filters = { region: 'EU' };
 * document.body.appendChild(el);
 * ```
 */
export class MeridianDashboardElement extends HTMLElement {
  private root: Root | null = null;
  private mountPoint: HTMLDivElement | null = null;

  // JS property overrides (take precedence over attributes)
  private _baseUrl?: string;
  private _token?: string;
  private _dashboardId?: string;
  private _filters?: Record<string, unknown>;
  private _theme?: MeridianDashboardProps['theme'];
  private _height?: string | number;
  private _width?: string | number;
  private _borderless?: boolean;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  static get observedAttributes(): readonly string[] {
    return OBSERVED_ATTRIBUTES;
  }

  connectedCallback(): void {
    // Create shadow DOM
    const shadow = this.attachShadow({ mode: 'open' });

    // Inject reset styles into shadow root
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

    // Mount point for React
    this.mountPoint = document.createElement('div');
    this.mountPoint.style.cssText = 'width: 100%; height: 100%;';
    shadow.appendChild(this.mountPoint);

    this.root = createRoot(this.mountPoint);
    this.renderComponent();

    // Dispatch connected event
    this.dispatchEvent(new CustomEvent('meridian:connected', { bubbles: false }));
  }

  disconnectedCallback(): void {
    // Schedule unmount asynchronously to avoid React warnings
    Promise.resolve().then(() => {
      this.root?.unmount();
      this.root = null;
      this.mountPoint = null;
    });

    this.dispatchEvent(new CustomEvent('meridian:disconnected', { bubbles: false }));
  }

  attributeChangedCallback(
    name: ObservedAttribute,
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

  get dashboardId(): string {
    return this._dashboardId ?? this.getAttribute('dashboard-id') ?? '';
  }
  set dashboardId(value: string) {
    this._dashboardId = value;
    this.renderComponent();
  }

  get filters(): Record<string, unknown> {
    return this._filters ?? parseFilters(this.getAttribute('filters'));
  }
  set filters(value: Record<string, unknown>) {
    this._filters = value;
    this.renderComponent();
  }

  get theme(): MeridianDashboardProps['theme'] {
    return this._theme ?? parseTheme(this.getAttribute('theme'));
  }
  set theme(value: MeridianDashboardProps['theme']) {
    this._theme = value;
    this.renderComponent();
  }

  get height(): string | number | undefined {
    return this._height ?? parseHeight(this.getAttribute('height'));
  }
  set height(value: string | number | undefined) {
    this._height = value;
    this.renderComponent();
  }

  get width(): string | number | undefined {
    return this._width ?? parseHeight(this.getAttribute('width'));
  }
  set width(value: string | number | undefined) {
    this._width = value;
    this.renderComponent();
  }

  get borderless(): boolean {
    return this._borderless ?? this.hasAttribute('borderless');
  }
  set borderless(value: boolean) {
    this._borderless = value;
    this.renderComponent();
  }

  // ── Public methods ─────────────────────────────────────────────────────────

  /**
   * Update filters programmatically without re-mounting.
   */
  setFilters(filters: Record<string, unknown>): void {
    this.filters = filters;
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  private renderComponent(): void {
    if (!this.root) return;

    const baseUrl = this.baseUrl;
    const token = this.token;
    const dashboardId = this.dashboardId;

    if (!baseUrl || !token || !dashboardId) {
      // Render nothing until required attributes are set
      this.root.render(null);
      return;
    }

    const props: MeridianDashboardProps = {
      baseUrl,
      token,
      dashboardId,
      filters: this.filters,
      theme: this.theme,
      height: this.height,
      width: this.width,
      borderless: this.borderless,
      onLoad: () => {
        this.dispatchEvent(
          new CustomEvent('meridian:load', { bubbles: true, composed: true }),
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
    };

    this.root.render(React.createElement(MeridianDashboard, props));
  }
}

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Registers the `<meridian-dashboard>` custom element.
 * Safe to call multiple times — skips registration if already defined.
 */
export function registerMeridianDashboardElement(): void {
  if (!customElements.get('meridian-dashboard')) {
    customElements.define('meridian-dashboard', MeridianDashboardElement);
  }
}

// Auto-register when the module is imported in a browser context
if (typeof customElements !== 'undefined') {
  registerMeridianDashboardElement();
}
