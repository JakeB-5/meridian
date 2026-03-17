// @meridian/sdk — Embeddable Analytics SDK
// Re-exports all public API surface

// ── Core SDK ──────────────────────────────────────────────────────────────────
export {
  MeridianEmbed,
  type MeridianEmbedOptions,
  type DashboardOptions,
  type QuestionOptions,
  type EmbeddedDashboard,
  type EmbeddedQuestion,
  type SdkEventMap,
  type SdkEventName,
  type SdkEventHandler,
} from './meridian-embed.js';

// ── API Client ────────────────────────────────────────────────────────────────
export {
  ApiClient,
  ApiError,
  NetworkError,
  TimeoutError,
  type ApiClientOptions,
  type Dashboard,
  type DashboardCard,
  type DashboardFilterDef,
  type Question,
  type RequestOptions,
} from './api-client.js';

// ── Events ────────────────────────────────────────────────────────────────────
export {
  EventEmitter,
  type LoadEvent,
  type ErrorEvent,
  type FilterChangeEvent,
  type DataUpdateEvent,
  type ClickEvent,
} from './events/event-emitter.js';

// ── Theme ─────────────────────────────────────────────────────────────────────
export {
  resolveTheme,
  resolveThemeWithBase,
  themeToCssVariables,
  cssVariablesToString,
  applyThemeToElement,
  LIGHT_THEME,
  DARK_THEME,
  type ThemeInput,
  type ThemeOverride,
  type ResolvedTheme,
  type ThemeColors,
  type ThemeTypography,
  type ThemeShape,
  type ThemeSpacing,
  type ThemeChart,
} from './theme/theme-resolver.js';

// ── React components ──────────────────────────────────────────────────────────
export {
  MeridianDashboard,
  type MeridianDashboardProps,
} from './react/meridian-dashboard.js';

export {
  MeridianQuestion,
  type MeridianQuestionProps,
} from './react/meridian-question.js';

// ── React hooks ───────────────────────────────────────────────────────────────
export {
  useMeridian,
  useQuestion,
  useDashboardFilters,
  type UseQuestionOptions,
  type UseQuestionResult,
  type UseDashboardFiltersResult,
} from './react/hooks/use-meridian.js';

// ── Web Components ────────────────────────────────────────────────────────────
export {
  MeridianDashboardElement,
  registerMeridianDashboardElement,
} from './web-components/meridian-dashboard-element.js';

export {
  MeridianQuestionElement,
  registerMeridianQuestionElement,
} from './web-components/meridian-question-element.js';

// ── Package identifier (kept for compatibility) ───────────────────────────────
export const PKG_NAME = '@meridian/sdk';
export const SDK_VERSION = '0.0.1';
