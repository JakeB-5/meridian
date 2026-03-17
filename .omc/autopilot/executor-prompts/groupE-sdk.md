# Group E1: @meridian/sdk — Embeddable Analytics SDK

## Task
Build a client SDK that allows third-party applications to embed Meridian dashboards and questions.

## Files to Create

### src/meridian-embed.ts
Main SDK entry point:
```typescript
export interface MeridianEmbedOptions {
  baseUrl: string;
  token: string;           // Embed token (not user JWT)
  theme?: 'light' | 'dark' | ThemeOverride;
  locale?: string;
  onError?: (error: MeridianError) => void;
}

export class MeridianEmbed {
  constructor(options: MeridianEmbedOptions);
  dashboard(id: string, container: HTMLElement, options?: DashboardOptions): EmbeddedDashboard;
  question(id: string, container: HTMLElement, options?: QuestionOptions): EmbeddedQuestion;
  destroy(): void;
}

export interface EmbeddedDashboard {
  setFilter(key: string, value: unknown): void;
  refresh(): void;
  destroy(): void;
  on(event: string, handler: Function): void;
}

export interface EmbeddedQuestion {
  setParameters(params: Record<string, unknown>): void;
  refresh(): void;
  getResult(): Promise<QueryResult>;
  destroy(): void;
  on(event: string, handler: Function): void;
}
```

### src/api-client.ts
HTTP client for SDK:
```typescript
export class ApiClient {
  constructor(private baseUrl: string, private token: string) {}
  getDashboard(id: string): Promise<Dashboard>;
  getQuestion(id: string): Promise<Question>;
  executeQuestion(id: string, params?: Record<string, unknown>): Promise<QueryResult>;
  getEmbedToken(entityType: string, entityId: string): Promise<string>;
}
```
- Fetch-based (no external deps)
- Error handling with retry
- Request cancellation via AbortController

### src/react/meridian-dashboard.tsx
React component for embedding dashboards:
```typescript
export interface MeridianDashboardProps {
  baseUrl: string;
  token: string;
  dashboardId: string;
  filters?: Record<string, unknown>;
  theme?: 'light' | 'dark';
  height?: number | string;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

export function MeridianDashboard(props: MeridianDashboardProps): JSX.Element;
```

### src/react/meridian-question.tsx
React component for embedding individual questions/charts

### src/react/hooks/use-meridian.ts
```typescript
export function useMeridian(options: MeridianEmbedOptions): MeridianEmbed;
export function useQuestion(questionId: string, params?: Record<string, unknown>): {
  data: QueryResult | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
};
```

### src/web-components/meridian-dashboard-element.ts
Web Component wrapper (Custom Element):
```typescript
class MeridianDashboardElement extends HTMLElement {
  // Attributes: base-url, token, dashboard-id, theme
  // Renders MeridianDashboard inside shadow DOM
}
customElements.define('meridian-dashboard', MeridianDashboardElement);
```

### src/web-components/meridian-question-element.ts
Web Component for single question

### src/theme/theme-resolver.ts
Resolve theme from string or override object:
- Built-in light/dark themes
- Custom CSS variable overrides
- Font family, colors, border radius

### src/events/event-emitter.ts
Simple typed event emitter for SDK events:
- 'load', 'error', 'filter-change', 'data-update', 'click'

### src/index.ts — re-exports

## Tests
- src/meridian-embed.test.ts (init, destroy, options)
- src/api-client.test.ts (mock fetch, retry, error handling)
- src/react/meridian-dashboard.test.tsx (render, loading, error states)
- src/react/hooks/use-meridian.test.ts
- src/events/event-emitter.test.ts

## Dependencies
- @meridian/shared, @meridian/viz
- react (peer)

## Estimated LOC: ~4000 + ~1200 tests
