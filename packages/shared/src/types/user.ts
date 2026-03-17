/** Permission identifiers for RBAC */
export type Permission =
  | 'datasource:read' | 'datasource:write' | 'datasource:delete'
  | 'question:read' | 'question:write' | 'question:delete'
  | 'dashboard:read' | 'dashboard:write' | 'dashboard:delete'
  | 'user:read' | 'user:write' | 'user:delete'
  | 'role:read' | 'role:write' | 'role:delete'
  | 'organization:read' | 'organization:write'
  | 'plugin:read' | 'plugin:write'
  | 'admin';

/** Role definition with associated permissions */
export interface RoleData {
  id: string;
  name: string;
  permissions: Permission[];
  organizationId: string;
}

/** User status */
export type UserStatus = 'active' | 'inactive' | 'pending';
