import { eq } from 'drizzle-orm';
import { organizations } from './schema/organizations.js';
import { roles } from './schema/roles.js';
import { users } from './schema/users.js';
import { datasources } from './schema/datasources.js';
import type { Database } from './connection.js';
import { createDatabaseFromUrl, closeDatabase } from './connection.js';

// ── Seed Data Constants ─────────────────────────────────────────────

/** Default admin permissions (all permissions) */
const ADMIN_PERMISSIONS = [
  'datasource:read',
  'datasource:write',
  'datasource:delete',
  'question:read',
  'question:write',
  'question:delete',
  'dashboard:read',
  'dashboard:write',
  'dashboard:delete',
  'user:read',
  'user:write',
  'user:delete',
  'role:read',
  'role:write',
  'role:delete',
  'organization:read',
  'organization:write',
  'plugin:read',
  'plugin:write',
  'admin',
];

/** Analyst permissions (read + write questions/dashboards) */
const ANALYST_PERMISSIONS = [
  'datasource:read',
  'question:read',
  'question:write',
  'dashboard:read',
  'dashboard:write',
  'user:read',
  'organization:read',
];

/** Viewer permissions (read-only) */
const VIEWER_PERMISSIONS = [
  'datasource:read',
  'question:read',
  'dashboard:read',
  'user:read',
  'organization:read',
];

/**
 * Default password hash for the seed admin user.
 * This is the argon2id hash of "admin123456" — must be changed on first login.
 *
 * NOTE: In production, this should be generated at seed time via the auth package.
 * This placeholder ensures the seed can run without the auth package present.
 */
const DEFAULT_ADMIN_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c2VlZF9zYWx0X3BsYWNlaG9sZGVy$placeholder_hash_change_on_first_login';

// ── Seed Function ───────────────────────────────────────────────────

export interface SeedOptions {
  /** Admin user email (default: "admin@meridian.local") */
  adminEmail?: string;
  /** Admin user name (default: "Admin") */
  adminName?: string;
  /** Admin password hash (default: placeholder — change immediately) */
  adminPasswordHash?: string;
  /** Organization name (default: "Default Organization") */
  organizationName?: string;
  /** Organization slug (default: "default") */
  organizationSlug?: string;
  /** Whether to skip if data already exists (default: true) */
  skipIfExists?: boolean;
}

export interface SeedResult {
  organizationId: string;
  adminRoleId: string;
  analystRoleId: string;
  viewerRoleId: string;
  adminUserId: string;
  sampleDataSourceId: string | null;
  skipped: boolean;
}

/**
 * Seed the database with essential default data:
 * - Default organization
 * - Admin, Analyst, and Viewer system roles
 * - Admin user
 * - Sample PostgreSQL data source (pointing to Meridian's own DB)
 */
export async function seed(db: Database, options: SeedOptions = {}): Promise<SeedResult> {
  const {
    adminEmail = 'admin@meridian.local',
    adminName = 'Admin',
    adminPasswordHash = DEFAULT_ADMIN_PASSWORD_HASH,
    organizationName = 'Default Organization',
    organizationSlug = 'default',
    skipIfExists = true,
  } = options;

  // ── Check for existing data ───────────────────────────────────

  if (skipIfExists) {
    const existingOrgs = await db
      .select({ id: organizations.id })
      .from(organizations)
      .limit(1);

    if (existingOrgs.length > 0) {
      console.info('[meridian/db] Seed data already exists. Skipping.');

      // Return existing IDs for reference
      const org = existingOrgs[0]!;

      const existingAdmin = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, adminEmail))
        .limit(1);

      const existingAdminRole = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, 'Admin'))
        .limit(1);

      const existingAnalystRole = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, 'Analyst'))
        .limit(1);

      const existingViewerRole = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, 'Viewer'))
        .limit(1);

      return {
        organizationId: org.id,
        adminRoleId: existingAdminRole[0]?.id ?? '',
        analystRoleId: existingAnalystRole[0]?.id ?? '',
        viewerRoleId: existingViewerRole[0]?.id ?? '',
        adminUserId: existingAdmin[0]?.id ?? '',
        sampleDataSourceId: null,
        skipped: true,
      };
    }
  }

  console.info('[meridian/db] Seeding database...');

  // ── 1. Create default organization ────────────────────────────

  const [org] = await db
    .insert(organizations)
    .values({
      name: organizationName,
      slug: organizationSlug,
      settings: {
        timezone: 'UTC',
        locale: 'en-US',
        dateFormat: 'YYYY-MM-DD',
        features: {
          embeddedAnalytics: true,
          naturalLanguageQuery: true,
          scheduledRefresh: true,
        },
      },
    })
    .returning();

  console.info(`  [+] Organization: "${org!.name}" (${org!.id})`);

  // ── 2. Create system roles ────────────────────────────────────

  const [adminRole] = await db
    .insert(roles)
    .values({
      name: 'Admin',
      permissions: ADMIN_PERMISSIONS,
      organizationId: org!.id,
      isSystem: true,
    })
    .returning();

  const [analystRole] = await db
    .insert(roles)
    .values({
      name: 'Analyst',
      permissions: ANALYST_PERMISSIONS,
      organizationId: org!.id,
      isSystem: true,
    })
    .returning();

  const [viewerRole] = await db
    .insert(roles)
    .values({
      name: 'Viewer',
      permissions: VIEWER_PERMISSIONS,
      organizationId: org!.id,
      isSystem: true,
    })
    .returning();

  console.info(`  [+] Roles: Admin (${adminRole!.id}), Analyst (${analystRole!.id}), Viewer (${viewerRole!.id})`);

  // ── 3. Create admin user ──────────────────────────────────────

  const [adminUser] = await db
    .insert(users)
    .values({
      email: adminEmail,
      name: adminName,
      passwordHash: adminPasswordHash,
      organizationId: org!.id,
      roleId: adminRole!.id,
      isActive: true,
    })
    .returning();

  console.info(`  [+] Admin user: "${adminUser!.email}" (${adminUser!.id})`);

  // ── 4. Create sample data source ──────────────────────────────

  let sampleDataSourceId: string | null = null;

  try {
    const [sampleDs] = await db
      .insert(datasources)
      .values({
        name: 'Sample PostgreSQL',
        type: 'postgresql',
        config: {
          host: 'localhost',
          port: 5432,
          database: 'meridian',
          username: 'meridian',
          password: '',
          ssl: false,
        },
        organizationId: org!.id,
        createdBy: adminUser!.id,
        status: 'inactive',
      })
      .returning();

    sampleDataSourceId = sampleDs!.id;
    console.info(`  [+] Sample data source: "${sampleDs!.name}" (${sampleDs!.id})`);
  } catch (error) {
    console.warn('  [!] Could not create sample data source:', error);
  }

  console.info('[meridian/db] Seed complete.');

  return {
    organizationId: org!.id,
    adminRoleId: adminRole!.id,
    analystRoleId: analystRole!.id,
    viewerRoleId: viewerRole!.id,
    adminUserId: adminUser!.id,
    sampleDataSourceId,
    skipped: false,
  };
}

// ── CLI Entry Point ─────────────────────────────────────────────────

export async function seedCli(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('[meridian/db] DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  const db = createDatabaseFromUrl(url);

  try {
    const result = await seed(db);
    if (result.skipped) {
      console.info('[meridian/db] Database already seeded.');
    } else {
      console.info('[meridian/db] Seed result:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error('[meridian/db] Seed failed:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

// Run when invoked directly
const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'));

if (isDirectRun) {
  seedCli();
}
