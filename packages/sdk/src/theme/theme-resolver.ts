// Theme resolution for Meridian SDK — resolves string or override to CSS variables

// ── Theme types ───────────────────────────────────────────────────────────────

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  borderSubtle: string;
  text: string;
  textMuted: string;
  textInverse: string;
  primary: string;
  primaryHover: string;
  primaryForeground: string;
  error: string;
  errorBackground: string;
  warning: string;
  warningBackground: string;
  success: string;
  successBackground: string;
}

export interface ThemeTypography {
  fontFamily: string;
  fontFamilyMono: string;
  fontSizeBase: string;
  fontSizeSm: string;
  fontSizeLg: string;
  fontWeightNormal: string;
  fontWeightMedium: string;
  fontWeightBold: string;
  lineHeightBase: string;
}

export interface ThemeShape {
  borderRadius: string;
  borderRadiusSm: string;
  borderRadiusLg: string;
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
}

export interface ThemeSpacing {
  unit: string;
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

export interface ThemeChart {
  colors: string[];
  gridColor: string;
  axisColor: string;
  labelColor: string;
  tooltipBackground: string;
  tooltipText: string;
}

export interface ResolvedTheme {
  name: string;
  colors: ThemeColors;
  typography: ThemeTypography;
  shape: ThemeShape;
  spacing: ThemeSpacing;
  chart: ThemeChart;
}

/**
 * Partial overrides that can be applied on top of a base theme.
 */
export type ThemeOverride = {
  colors?: Partial<ThemeColors>;
  typography?: Partial<ThemeTypography>;
  shape?: Partial<ThemeShape>;
  spacing?: Partial<ThemeSpacing>;
  chart?: Partial<ThemeChart>;
};

export type ThemeInput = 'light' | 'dark' | ThemeOverride;

// ── Built-in themes ───────────────────────────────────────────────────────────

const LIGHT_THEME: ResolvedTheme = {
  name: 'light',
  colors: {
    background: '#ffffff',
    surface: '#f9fafb',
    surfaceElevated: '#ffffff',
    border: '#e5e7eb',
    borderSubtle: '#f3f4f6',
    text: '#111827',
    textMuted: '#6b7280',
    textInverse: '#ffffff',
    primary: '#4f46e5',
    primaryHover: '#4338ca',
    primaryForeground: '#ffffff',
    error: '#ef4444',
    errorBackground: '#fef2f2',
    warning: '#f59e0b',
    warningBackground: '#fffbeb',
    success: '#10b981',
    successBackground: '#ecfdf5',
  },
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
    fontFamilyMono: '"JetBrains Mono", "Fira Code", Consolas, "Courier New", monospace',
    fontSizeBase: '14px',
    fontSizeSm: '12px',
    fontSizeLg: '16px',
    fontWeightNormal: '400',
    fontWeightMedium: '500',
    fontWeightBold: '600',
    lineHeightBase: '1.5',
  },
  shape: {
    borderRadius: '6px',
    borderRadiusSm: '4px',
    borderRadiusLg: '10px',
    shadowSm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    shadowMd: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    shadowLg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  },
  spacing: {
    unit: '4px',
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },
  chart: {
    colors: [
      '#4f46e5',
      '#0ea5e9',
      '#10b981',
      '#f59e0b',
      '#ef4444',
      '#8b5cf6',
      '#ec4899',
      '#14b8a6',
      '#f97316',
      '#06b6d4',
    ],
    gridColor: '#f3f4f6',
    axisColor: '#d1d5db',
    labelColor: '#6b7280',
    tooltipBackground: '#1f2937',
    tooltipText: '#f9fafb',
  },
};

const DARK_THEME: ResolvedTheme = {
  name: 'dark',
  colors: {
    background: '#0f172a',
    surface: '#1e293b',
    surfaceElevated: '#334155',
    border: '#334155',
    borderSubtle: '#1e293b',
    text: '#f1f5f9',
    textMuted: '#94a3b8',
    textInverse: '#0f172a',
    primary: '#6366f1',
    primaryHover: '#818cf8',
    primaryForeground: '#ffffff',
    error: '#f87171',
    errorBackground: '#450a0a',
    warning: '#fbbf24',
    warningBackground: '#451a03',
    success: '#34d399',
    successBackground: '#022c22',
  },
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
    fontFamilyMono: '"JetBrains Mono", "Fira Code", Consolas, "Courier New", monospace',
    fontSizeBase: '14px',
    fontSizeSm: '12px',
    fontSizeLg: '16px',
    fontWeightNormal: '400',
    fontWeightMedium: '500',
    fontWeightBold: '600',
    lineHeightBase: '1.5',
  },
  shape: {
    borderRadius: '6px',
    borderRadiusSm: '4px',
    borderRadiusLg: '10px',
    shadowSm: '0 1px 2px 0 rgb(0 0 0 / 0.3)',
    shadowMd: '0 4px 6px -1px rgb(0 0 0 / 0.4), 0 2px 4px -2px rgb(0 0 0 / 0.4)',
    shadowLg: '0 10px 15px -3px rgb(0 0 0 / 0.4), 0 4px 6px -4px rgb(0 0 0 / 0.4)',
  },
  spacing: {
    unit: '4px',
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },
  chart: {
    colors: [
      '#6366f1',
      '#38bdf8',
      '#34d399',
      '#fbbf24',
      '#f87171',
      '#a78bfa',
      '#f472b6',
      '#2dd4bf',
      '#fb923c',
      '#22d3ee',
    ],
    gridColor: '#1e293b',
    axisColor: '#334155',
    labelColor: '#94a3b8',
    tooltipBackground: '#0f172a',
    tooltipText: '#f1f5f9',
  },
};

// ── CSS variable mapping ───────────────────────────────────────────────────────

/**
 * Converts a resolved theme to a flat CSS variable map.
 * Variable names follow the pattern `--meridian-<section>-<property>`.
 */
export function themeToCssVariables(theme: ResolvedTheme): Record<string, string> {
  const vars: Record<string, string> = {};

  // Colors
  for (const [key, value] of Object.entries(theme.colors)) {
    vars[`--meridian-color-${camelToKebab(key)}`] = value;
  }

  // Typography
  for (const [key, value] of Object.entries(theme.typography)) {
    vars[`--meridian-${camelToKebab(key)}`] = value;
  }

  // Shape
  for (const [key, value] of Object.entries(theme.shape)) {
    vars[`--meridian-${camelToKebab(key)}`] = value;
  }

  // Spacing
  for (const [key, value] of Object.entries(theme.spacing)) {
    if (key !== 'unit') {
      vars[`--meridian-spacing-${key}`] = value;
    } else {
      vars[`--meridian-spacing-unit`] = value;
    }
  }

  // Chart colors as indexed variables
  theme.chart.colors.forEach((color, index) => {
    vars[`--meridian-chart-color-${index + 1}`] = color;
  });
  vars['--meridian-chart-grid-color'] = theme.chart.gridColor;
  vars['--meridian-chart-axis-color'] = theme.chart.axisColor;
  vars['--meridian-chart-label-color'] = theme.chart.labelColor;
  vars['--meridian-chart-tooltip-bg'] = theme.chart.tooltipBackground;
  vars['--meridian-chart-tooltip-text'] = theme.chart.tooltipText;

  return vars;
}

/**
 * Serializes a CSS variable map to an inline style string.
 */
export function cssVariablesToString(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([key, value]) => `${key}: ${value};`)
    .join(' ');
}

/**
 * Applies theme CSS variables to an HTML element.
 */
export function applyThemeToElement(element: HTMLElement, theme: ResolvedTheme): void {
  const vars = themeToCssVariables(theme);
  for (const [key, value] of Object.entries(vars)) {
    element.style.setProperty(key, value);
  }
}

// ── Theme resolution ──────────────────────────────────────────────────────────

/**
 * Resolves a ThemeInput (string name or override object) to a full ResolvedTheme.
 *
 * - `'light'` → LIGHT_THEME
 * - `'dark'`  → DARK_THEME
 * - `ThemeOverride` → Merges overrides on top of LIGHT_THEME
 */
export function resolveTheme(input?: ThemeInput): ResolvedTheme {
  if (!input || input === 'light') {
    return LIGHT_THEME;
  }

  if (input === 'dark') {
    return DARK_THEME;
  }

  // ThemeOverride — merge onto light theme base
  const base = LIGHT_THEME;
  const override = input as ThemeOverride;

  return {
    name: 'custom',
    colors: { ...base.colors, ...(override.colors ?? {}) },
    typography: { ...base.typography, ...(override.typography ?? {}) },
    shape: { ...base.shape, ...(override.shape ?? {}) },
    spacing: { ...base.spacing, ...(override.spacing ?? {}) },
    chart: {
      ...base.chart,
      ...(override.chart ?? {}),
      colors: override.chart?.colors ?? base.chart.colors,
    },
  };
}

/**
 * Resolves a ThemeInput on top of a specific base theme.
 */
export function resolveThemeWithBase(
  input: ThemeInput | undefined,
  baseName: 'light' | 'dark',
): ResolvedTheme {
  const base = baseName === 'dark' ? DARK_THEME : LIGHT_THEME;

  if (!input) return base;
  if (input === 'light') return LIGHT_THEME;
  if (input === 'dark') return DARK_THEME;

  const override = input as ThemeOverride;
  return {
    name: 'custom',
    colors: { ...base.colors, ...(override.colors ?? {}) },
    typography: { ...base.typography, ...(override.typography ?? {}) },
    shape: { ...base.shape, ...(override.shape ?? {}) },
    spacing: { ...base.spacing, ...(override.spacing ?? {}) },
    chart: {
      ...base.chart,
      ...(override.chart ?? {}),
      colors: override.chart?.colors ?? base.chart.colors,
    },
  };
}

// ── Utility helpers ───────────────────────────────────────────────────────────

function camelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

// Export built-in themes for direct use
export { LIGHT_THEME, DARK_THEME };
