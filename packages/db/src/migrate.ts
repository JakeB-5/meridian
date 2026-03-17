import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabaseFromUrl, closeDatabase } from './connection.js';
import type { Database } from './connection.js';

// ── Migration Runner ────────────────────────────────────────────────

/** Default directory for generated SQL migration files */
const DEFAULT_MIGRATIONS_DIR = './drizzle';

export interface MigrationOptions {
  /** Path to the migrations directory (default: "./drizzle") */
  migrationsFolder?: string;
}

/**
 * Run all pending Drizzle migrations against the given database.
 *
 * @param db - Drizzle database instance
 * @param options - Migration configuration
 *
 * @example
 * ```ts
 * const db = createDatabaseFromUrl(process.env.DATABASE_URL!);
 * await runMigrations(db, { migrationsFolder: './drizzle' });
 * ```
 */
export async function runMigrations(
  db: Database,
  options: MigrationOptions = {},
): Promise<void> {
  const folder = options.migrationsFolder ?? DEFAULT_MIGRATIONS_DIR;

  console.info(`[meridian/db] Running migrations from: ${folder}`);

  await migrate(db, { migrationsFolder: folder });

  console.info('[meridian/db] Migrations complete.');
}

/**
 * CLI entry point: reads DATABASE_URL from the environment,
 * runs all pending migrations, then shuts down cleanly.
 *
 * Usage: `tsx src/migrate.ts`
 */
export async function runMigrationsCli(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('[meridian/db] DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  const db = createDatabaseFromUrl(url);

  try {
    await runMigrations(db);
  } catch (error) {
    console.error('[meridian/db] Migration failed:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

// Run when invoked directly (not when imported as a module)
const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('migrate.ts') || process.argv[1].endsWith('migrate.js'));

if (isDirectRun) {
  runMigrationsCli();
}
