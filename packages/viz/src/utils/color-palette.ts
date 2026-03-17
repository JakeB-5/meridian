/**
 * Color palettes for chart visualizations.
 * Each palette provides an array of hex color strings.
 */

/** Default 10-color palette — balanced for readability and contrast */
export const DEFAULT_PALETTE: readonly string[] = [
  '#5470C6', // blue
  '#91CC75', // green
  '#FAC858', // yellow
  '#EE6666', // red
  '#73C0DE', // light blue
  '#3BA272', // teal
  '#FC8452', // orange
  '#9A60B4', // purple
  '#EA7CCC', // pink
  '#48DBFB', // cyan
] as const;

/** Extended 20-color categorical palette for many-series charts */
export const CATEGORICAL_PALETTE: readonly string[] = [
  '#5470C6', '#91CC75', '#FAC858', '#EE6666', '#73C0DE',
  '#3BA272', '#FC8452', '#9A60B4', '#EA7CCC', '#48DBFB',
  '#6C5CE7', '#A29BFE', '#FD79A8', '#FDCB6E', '#00CEC9',
  '#E17055', '#55A6E5', '#DFE6E9', '#B2BEC3', '#636E72',
] as const;

/**
 * Sequential palettes — single-hue gradients for ordered data.
 * Useful for heatmaps, choropleth maps, and continuous scales.
 */
export const SEQUENTIAL_PALETTES = {
  blue: [
    '#EBF5FB', '#D6EAF8', '#AED6F1', '#85C1E9', '#5DADE2',
    '#3498DB', '#2E86C1', '#2874A6', '#21618C', '#1B4F72',
  ],
  green: [
    '#EAFAF1', '#D5F5E3', '#ABEBC6', '#82E0AA', '#58D68D',
    '#2ECC71', '#28B463', '#239B56', '#1D8348', '#186A3B',
  ],
  red: [
    '#FDEDEC', '#FADBD8', '#F5B7B1', '#F1948A', '#EC7063',
    '#E74C3C', '#CB4335', '#B03A2E', '#943126', '#78281F',
  ],
  orange: [
    '#FEF5E7', '#FDEBD0', '#FAD7A0', '#F8C471', '#F5B041',
    '#F39C12', '#D68910', '#B9770E', '#9C640C', '#7E5109',
  ],
  purple: [
    '#F5EEF8', '#EBDEF0', '#D7BDE2', '#C39BD3', '#AF7AC5',
    '#9B59B6', '#884EA0', '#76448A', '#633974', '#512E5F',
  ],
} as const;

/**
 * Diverging palettes — two-hue gradients with a neutral midpoint.
 * Useful for showing deviation from a center value (e.g., profit/loss).
 */
export const DIVERGING_PALETTES = {
  /** Red (negative) → White (zero) → Blue (positive) */
  redBlue: [
    '#B71C1C', '#D32F2F', '#E57373', '#FFCDD2', '#FFFFFF',
    '#BBDEFB', '#64B5F6', '#1E88E5', '#0D47A1',
  ],
  /** Brown (negative) → White (zero) → Teal (positive) */
  brownTeal: [
    '#795548', '#8D6E63', '#BCAAA4', '#D7CCC8', '#FFFFFF',
    '#B2DFDB', '#80CBC4', '#26A69A', '#00695C',
  ],
  /** Orange (negative) → White (zero) → Purple (positive) */
  orangePurple: [
    '#E65100', '#EF6C00', '#FFB74D', '#FFE0B2', '#FFFFFF',
    '#E1BEE7', '#BA68C8', '#8E24AA', '#4A148C',
  ],
} as const;

/** Type-safe palette name union */
export type SequentialPaletteName = keyof typeof SEQUENTIAL_PALETTES;
export type DivergingPaletteName = keyof typeof DIVERGING_PALETTES;

/**
 * Get a color from the default palette by index (wraps around).
 */
export function getColor(index: number): string {
  return DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];
}

/**
 * Get N colors from the default palette.
 * If N exceeds palette length, colors wrap around.
 */
export function getColors(count: number): string[] {
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    colors.push(DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]);
  }
  return colors;
}

/**
 * Get a sequential palette by name.
 */
export function getSequentialPalette(name: SequentialPaletteName): readonly string[] {
  return SEQUENTIAL_PALETTES[name];
}

/**
 * Get a diverging palette by name.
 */
export function getDivergingPalette(name: DivergingPaletteName): readonly string[] {
  return DIVERGING_PALETTES[name];
}

/**
 * Interpolate between two hex colors.
 * @param color1 Start hex color
 * @param color2 End hex color
 * @param t Interpolation factor 0..1
 */
export function interpolateColor(color1: string, color2: string, t: number): string {
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);
  if (!c1 || !c2) return color1;

  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b = Math.round(c1.b + (c2.b - c1.b) * t);

  return rgbToHex(r, g, b);
}

/**
 * Generate a continuous color scale from a palette with N steps.
 */
export function generateColorScale(palette: readonly string[], steps: number): string[] {
  if (steps <= 1) return [palette[0]];
  if (steps === palette.length) return [...palette];

  const result: string[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const scaledIndex = t * (palette.length - 1);
    const lower = Math.floor(scaledIndex);
    const upper = Math.min(lower + 1, palette.length - 1);
    const localT = scaledIndex - lower;
    // Return exact palette color when at an exact palette index (no interpolation)
    if (localT === 0) {
      result.push(palette[lower]!);
    } else {
      result.push(interpolateColor(palette[lower]!, palette[upper]!, localT));
    }
  }
  return result;
}

/**
 * Add alpha channel to a hex color.
 * @param hex Hex color string (e.g., '#5470C6')
 * @param alpha Opacity 0..1
 */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.max(0, Math.min(1, alpha))})`;
}

// --- Internal helpers ---

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return null;
  const num = parseInt(cleaned, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b]
    .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
    .join('');
}
