// ── Validation Utilities ────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Check if a string is a valid email address (basic check).
 */
export const isEmail = (value: string): boolean => {
  return EMAIL_RE.test(value);
};

/**
 * Check if a string is a valid HTTP/HTTPS URL.
 */
export const isUrl = (value: string): boolean => {
  return URL_RE.test(value);
};

/**
 * Check if a string is a valid UUID (v1-v5).
 */
export const isUUID = (value: string): boolean => {
  return UUID_RE.test(value);
};

/**
 * Basic HTML sanitization to prevent XSS.
 * Escapes <, >, &, ", and ' characters.
 */
export const sanitizeHtml = (input: string): string => {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};

/**
 * Check if a string is non-empty after trimming.
 */
export const isNonEmpty = (value: string): boolean => {
  return value.trim().length > 0;
};

/**
 * Check if a value is within a numeric range (inclusive).
 */
export const isInRange = (value: number, min: number, max: number): boolean => {
  return value >= min && value <= max;
};

/**
 * Validate that a string matches a minimum length requirement.
 */
export const hasMinLength = (value: string, minLength: number): boolean => {
  return value.length >= minLength;
};

/**
 * Validate that a string does not exceed a maximum length.
 */
export const hasMaxLength = (value: string, maxLength: number): boolean => {
  return value.length <= maxLength;
};

/**
 * Check if a string contains only alphanumeric characters and hyphens.
 * Useful for validating slugs.
 */
export const isSlug = (value: string): boolean => {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
};
