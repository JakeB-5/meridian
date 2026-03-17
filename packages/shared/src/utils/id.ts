/**
 * Generate a unique ID using crypto.randomUUID().
 * Uses the built-in Node.js crypto module for UUID v4 generation.
 */
export const generateId = (): string => {
  return crypto.randomUUID();
};

/**
 * Generate a short ID (first 8 characters of UUID).
 * Useful for display purposes.
 */
export const generateShortId = (): string => {
  return crypto.randomUUID().slice(0, 8);
};
