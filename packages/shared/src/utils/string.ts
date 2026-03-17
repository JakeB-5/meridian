import { nanoid } from 'nanoid';

/** Default nanoid length */
const DEFAULT_ID_LENGTH = 21;
/** Short nanoid length */
const SHORT_ID_LENGTH = 12;

// ── String Utilities ────────────────────────────────────────────────

/**
 * Convert a string to a URL-friendly slug.
 * "Hello World!" -> "hello-world"
 */
export const slugify = (input: string): string => {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

/**
 * Truncate a string to `maxLength`, appending suffix if truncated.
 */
export const truncate = (input: string, maxLength: number, suffix: string = '...'): string => {
  if (input.length <= maxLength) {
    return input;
  }
  return input.slice(0, maxLength - suffix.length) + suffix;
};

/**
 * Capitalize the first letter of a string.
 */
export const capitalize = (input: string): string => {
  if (input.length === 0) return input;
  return input.charAt(0).toUpperCase() + input.slice(1);
};

/**
 * Convert camelCase to snake_case.
 */
export const camelToSnake = (input: string): string => {
  return input.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
};

/**
 * Convert snake_case to camelCase.
 */
export const snakeToCamel = (input: string): string => {
  return input.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
};

/**
 * Generate a unique ID using nanoid.
 */
export const generateId = (length: number = DEFAULT_ID_LENGTH): string => {
  return nanoid(length);
};

/**
 * Generate a short ID (12 chars) using nanoid.
 */
export const generateShortId = (): string => {
  return nanoid(SHORT_ID_LENGTH);
};

/**
 * Simple string hash for cache keys (djb2 algorithm).
 * Not cryptographic — use only for cache key generation.
 */
export const hashString = (input: string): string => {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) & 0xffffffff;
  }
  // Convert to unsigned 32-bit hex
  return (hash >>> 0).toString(16).padStart(8, '0');
};

/**
 * Convert a string to title case.
 * "hello world" -> "Hello World"
 */
export const toTitleCase = (input: string): string => {
  return input.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
};

/**
 * Remove leading/trailing whitespace and collapse internal whitespace.
 */
export const normalizeWhitespace = (input: string): string => {
  return input.trim().replace(/\s+/g, ' ');
};
