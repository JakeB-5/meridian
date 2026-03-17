// ── Color Palette Tests ─────────────────────────────────────────────
// Tests for color palette utilities, interpolation, scale generation,
// and alpha channel support.

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PALETTE,
  CATEGORICAL_PALETTE,
  SEQUENTIAL_PALETTES,
  DIVERGING_PALETTES,
  getColor,
  getColors,
  getSequentialPalette,
  getDivergingPalette,
  interpolateColor,
  generateColorScale,
  withAlpha,
} from './color-palette.js';

// ── Palette Constants ────────────────────────────────────────────────

describe('palette constants', () => {
  it('DEFAULT_PALETTE should have 10 colors', () => {
    expect(DEFAULT_PALETTE).toHaveLength(10);
  });

  it('CATEGORICAL_PALETTE should have 20 colors', () => {
    expect(CATEGORICAL_PALETTE).toHaveLength(20);
  });

  it('all palette colors should be valid hex', () => {
    const hexRegex = /^#[0-9A-Fa-f]{6}$/;
    for (const color of DEFAULT_PALETTE) {
      expect(color).toMatch(hexRegex);
    }
    for (const color of CATEGORICAL_PALETTE) {
      expect(color).toMatch(hexRegex);
    }
  });

  it('SEQUENTIAL_PALETTES should have 5 named palettes', () => {
    const names = Object.keys(SEQUENTIAL_PALETTES);
    expect(names).toContain('blue');
    expect(names).toContain('green');
    expect(names).toContain('red');
    expect(names).toContain('orange');
    expect(names).toContain('purple');
  });

  it('each sequential palette should have 10 colors', () => {
    for (const palette of Object.values(SEQUENTIAL_PALETTES)) {
      expect(palette).toHaveLength(10);
    }
  });

  it('DIVERGING_PALETTES should have 3 named palettes', () => {
    const names = Object.keys(DIVERGING_PALETTES);
    expect(names).toContain('redBlue');
    expect(names).toContain('brownTeal');
    expect(names).toContain('orangePurple');
  });

  it('each diverging palette should have 9 colors', () => {
    for (const palette of Object.values(DIVERGING_PALETTES)) {
      expect(palette).toHaveLength(9);
    }
  });
});

// ── getColor ─────────────────────────────────────────────────────────

describe('getColor', () => {
  it('should return the first color for index 0', () => {
    expect(getColor(0)).toBe(DEFAULT_PALETTE[0]);
  });

  it('should return the correct color for a valid index', () => {
    expect(getColor(3)).toBe(DEFAULT_PALETTE[3]);
  });

  it('should wrap around for indices beyond palette length', () => {
    expect(getColor(10)).toBe(DEFAULT_PALETTE[0]);
    expect(getColor(11)).toBe(DEFAULT_PALETTE[1]);
    expect(getColor(25)).toBe(DEFAULT_PALETTE[5]);
  });

  it('should handle large indices', () => {
    expect(getColor(1000)).toBe(DEFAULT_PALETTE[0]);
  });
});

// ── getColors ────────────────────────────────────────────────────────

describe('getColors', () => {
  it('should return empty array for count 0', () => {
    expect(getColors(0)).toEqual([]);
  });

  it('should return N colors from the palette', () => {
    const colors = getColors(3);
    expect(colors).toHaveLength(3);
    expect(colors[0]).toBe(DEFAULT_PALETTE[0]);
    expect(colors[1]).toBe(DEFAULT_PALETTE[1]);
    expect(colors[2]).toBe(DEFAULT_PALETTE[2]);
  });

  it('should wrap around when count exceeds palette length', () => {
    const colors = getColors(12);
    expect(colors).toHaveLength(12);
    expect(colors[10]).toBe(DEFAULT_PALETTE[0]);
    expect(colors[11]).toBe(DEFAULT_PALETTE[1]);
  });

  it('should return exact palette for count equal to palette length', () => {
    const colors = getColors(10);
    expect(colors).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(colors[i]).toBe(DEFAULT_PALETTE[i]);
    }
  });
});

// ── getSequentialPalette ─────────────────────────────────────────────

describe('getSequentialPalette', () => {
  it('should return blue palette', () => {
    const palette = getSequentialPalette('blue');
    expect(palette).toEqual(SEQUENTIAL_PALETTES.blue);
  });

  it('should return green palette', () => {
    const palette = getSequentialPalette('green');
    expect(palette).toEqual(SEQUENTIAL_PALETTES.green);
  });

  it('should return red palette', () => {
    const palette = getSequentialPalette('red');
    expect(palette).toEqual(SEQUENTIAL_PALETTES.red);
  });

  it('should return orange palette', () => {
    const palette = getSequentialPalette('orange');
    expect(palette).toEqual(SEQUENTIAL_PALETTES.orange);
  });

  it('should return purple palette', () => {
    const palette = getSequentialPalette('purple');
    expect(palette).toEqual(SEQUENTIAL_PALETTES.purple);
  });
});

// ── getDivergingPalette ──────────────────────────────────────────────

describe('getDivergingPalette', () => {
  it('should return redBlue palette', () => {
    const palette = getDivergingPalette('redBlue');
    expect(palette).toEqual(DIVERGING_PALETTES.redBlue);
  });

  it('should return brownTeal palette', () => {
    const palette = getDivergingPalette('brownTeal');
    expect(palette).toEqual(DIVERGING_PALETTES.brownTeal);
  });

  it('should return orangePurple palette', () => {
    const palette = getDivergingPalette('orangePurple');
    expect(palette).toEqual(DIVERGING_PALETTES.orangePurple);
  });
});

// ── interpolateColor ─────────────────────────────────────────────────

describe('interpolateColor', () => {
  it('should return color1 when t=0', () => {
    const result = interpolateColor('#000000', '#FFFFFF', 0);
    expect(result).toBe('#000000');
  });

  it('should return color2 when t=1', () => {
    const result = interpolateColor('#000000', '#FFFFFF', 1);
    expect(result).toBe('#ffffff');
  });

  it('should return midpoint color at t=0.5', () => {
    const result = interpolateColor('#000000', '#FFFFFF', 0.5);
    // Should be approximately #808080 (gray)
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
    // Each channel should be approximately 128
    const r = parseInt(result.slice(1, 3), 16);
    const g = parseInt(result.slice(3, 5), 16);
    const b = parseInt(result.slice(5, 7), 16);
    expect(r).toBeGreaterThanOrEqual(127);
    expect(r).toBeLessThanOrEqual(128);
    expect(g).toBeGreaterThanOrEqual(127);
    expect(b).toBeGreaterThanOrEqual(127);
  });

  it('should interpolate red to blue', () => {
    const result = interpolateColor('#FF0000', '#0000FF', 0.5);
    const r = parseInt(result.slice(1, 3), 16);
    const b = parseInt(result.slice(5, 7), 16);
    expect(r).toBeGreaterThanOrEqual(127);
    expect(b).toBeGreaterThanOrEqual(127);
  });

  it('should return color1 for invalid hex input', () => {
    const result = interpolateColor('#ZZZ', '#FFFFFF', 0.5);
    expect(result).toBe('#ZZZ');
  });

  it('should handle same color', () => {
    const result = interpolateColor('#FF0000', '#FF0000', 0.5);
    expect(result).toBe('#ff0000');
  });
});

// ── generateColorScale ──────────────────────────────────────────────

describe('generateColorScale', () => {
  it('should return first color for steps=1', () => {
    const scale = generateColorScale(SEQUENTIAL_PALETTES.blue, 1);
    expect(scale).toHaveLength(1);
    expect(scale[0]).toBe(SEQUENTIAL_PALETTES.blue[0]);
  });

  it('should return exact palette for steps equal to palette length', () => {
    const scale = generateColorScale(SEQUENTIAL_PALETTES.blue, 10);
    expect(scale).toHaveLength(10);
    expect(scale).toEqual([...SEQUENTIAL_PALETTES.blue]);
  });

  it('should generate more steps than palette via interpolation', () => {
    const scale = generateColorScale(SEQUENTIAL_PALETTES.blue, 20);
    expect(scale).toHaveLength(20);
    // First and last should match palette endpoints
    expect(scale[0]).toBe(SEQUENTIAL_PALETTES.blue[0]);
    expect(scale[19]).toBe(SEQUENTIAL_PALETTES.blue[9]);
  });

  it('should generate fewer steps than palette', () => {
    const scale = generateColorScale(SEQUENTIAL_PALETTES.blue, 3);
    expect(scale).toHaveLength(3);
    expect(scale[0]).toBe(SEQUENTIAL_PALETTES.blue[0]);
    expect(scale[2]).toBe(SEQUENTIAL_PALETTES.blue[9]);
  });

  it('should generate 2 steps', () => {
    const scale = generateColorScale(SEQUENTIAL_PALETTES.red, 2);
    expect(scale).toHaveLength(2);
    expect(scale[0]).toBe(SEQUENTIAL_PALETTES.red[0]);
    expect(scale[1]).toBe(SEQUENTIAL_PALETTES.red[9]);
  });

  it('should produce valid hex colors for all steps', () => {
    const scale = generateColorScale(SEQUENTIAL_PALETTES.green, 15);
    for (const color of scale) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

// ── withAlpha ────────────────────────────────────────────────────────

describe('withAlpha', () => {
  it('should convert hex to rgba with alpha', () => {
    const result = withAlpha('#FF0000', 0.5);
    expect(result).toBe('rgba(255, 0, 0, 0.5)');
  });

  it('should handle full opacity', () => {
    const result = withAlpha('#00FF00', 1);
    expect(result).toBe('rgba(0, 255, 0, 1)');
  });

  it('should handle zero opacity', () => {
    const result = withAlpha('#0000FF', 0);
    expect(result).toBe('rgba(0, 0, 255, 0)');
  });

  it('should clamp alpha above 1', () => {
    const result = withAlpha('#FF0000', 1.5);
    expect(result).toBe('rgba(255, 0, 0, 1)');
  });

  it('should clamp alpha below 0', () => {
    const result = withAlpha('#FF0000', -0.5);
    expect(result).toBe('rgba(255, 0, 0, 0)');
  });

  it('should return original hex for invalid input', () => {
    const result = withAlpha('#ZZZ', 0.5);
    expect(result).toBe('#ZZZ');
  });

  it('should correctly parse the first palette color', () => {
    const result = withAlpha('#5470C6', 0.8);
    expect(result).toBe('rgba(84, 112, 198, 0.8)');
  });
});
