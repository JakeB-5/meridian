/**
 * Convert a string to a URL-safe slug.
 * Lowercases, replaces spaces/special chars with hyphens, trims edges.
 */
export const slugify = (input: string): string => {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Truncate a string to a maximum length, appending an ellipsis if truncated.
 */
export const truncate = (input: string, maxLength: number): string => {
  if (input.length <= maxLength) return input;
  return input.slice(0, maxLength - 3) + '...';
};

/**
 * Capitalize the first letter of a string.
 */
export const capitalize = (input: string): string => {
  if (input.length === 0) return input;
  return input.charAt(0).toUpperCase() + input.slice(1);
};
