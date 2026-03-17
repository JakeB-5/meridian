import type { Permission, RoleData } from '@meridian/shared';

/** All permissions defined in the system */
export const ALL_PERMISSIONS: Permission[] = [
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

/** Read-only permissions — Viewer role */
export const VIEWER_PERMISSIONS: Permission[] = [
  'datasource:read',
  'question:read',
  'dashboard:read',
];

/** Read + write permissions — Editor role */
export const EDITOR_PERMISSIONS: Permission[] = [
  'datasource:read',
  'datasource:write',
  'question:read',
  'question:write',
  'dashboard:read',
  'dashboard:write',
];

/** Well-known built-in role IDs */
export const BUILT_IN_ROLE_IDS = {
  ADMIN: 'role:admin',
  EDITOR: 'role:editor',
  VIEWER: 'role:viewer',
} as const;

export type BuiltInRoleId = (typeof BUILT_IN_ROLE_IDS)[keyof typeof BUILT_IN_ROLE_IDS];

/**
 * Build the three default roles for a given organization.
 * Each Meridian organization gets its own copy of these roles.
 */
export function buildDefaultRoles(organizationId: string): RoleData[] {
  return [
    {
      id: BUILT_IN_ROLE_IDS.ADMIN,
      name: 'Admin',
      permissions: ALL_PERMISSIONS,
      organizationId,
    },
    {
      id: BUILT_IN_ROLE_IDS.EDITOR,
      name: 'Editor',
      permissions: EDITOR_PERMISSIONS,
      organizationId,
    },
    {
      id: BUILT_IN_ROLE_IDS.VIEWER,
      name: 'Viewer',
      permissions: VIEWER_PERMISSIONS,
      organizationId,
    },
  ];
}

/**
 * Look up a built-in role by its ID.
 * Returns undefined for custom role IDs.
 */
export function getBuiltInRole(
  roleId: string,
  organizationId: string,
): RoleData | undefined {
  return buildDefaultRoles(organizationId).find((r) => r.id === roleId);
}

/** Check if a role ID refers to one of the built-in roles */
export function isBuiltInRoleId(roleId: string): roleId is BuiltInRoleId {
  return (Object.values(BUILT_IN_ROLE_IDS) as string[]).includes(roleId);
}
