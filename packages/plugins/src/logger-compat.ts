/**
 * Re-exports the Logger interface and createNoopLogger from @meridian/shared
 * so the rest of the plugins package can import from a single local path.
 */
export type { Logger } from '@meridian/shared';
export { createNoopLogger } from '@meridian/shared';
