import { describe, it, expect, beforeEach } from 'vitest';
import {
  RLSEngine,
  type RLSPolicy,
  DEFAULT_RLS_POLICIES,
} from './row-level-security.js';
import { BUILT_IN_ROLE_IDS } from '../rbac/default-roles.js';
import type { TokenPayload } from '../jwt/token-service.js';

function makeUser(overrides: Partial<TokenPayload> = {}): TokenPayload {
  return {
    sub: 'user-1',
    email: 'user@example.com',
    orgId: 'org-abc',
    roleId: BUILT_IN_ROLE_IDS.VIEWER,
    permissions: ['dashboard:read'],
    ...overrides,
  };
}

function makeAdmin(): TokenPayload {
  return makeUser({
    roleId: BUILT_IN_ROLE_IDS.ADMIN,
    permissions: ['admin'],
  });
}

const ORG_POLICY: RLSPolicy = {
  id: 'p1',
  name: 'Org restriction',
  table: 'dashboards',
  column: 'organization_id',
  operator: 'eq',
  valueExpression: 'orgId',
  roleIds: [BUILT_IN_ROLE_IDS.VIEWER, BUILT_IN_ROLE_IDS.EDITOR],
  enabled: true,
};

const USER_POLICY: RLSPolicy = {
  id: 'p2',
  name: 'User restriction',
  table: 'private_notes',
  column: 'user_id',
  operator: 'eq',
  valueExpression: 'sub',
  roleIds: ['*'],
  enabled: true,
};

const WILDCARD_POLICY: RLSPolicy = {
  id: 'p3',
  name: 'Wildcard org policy',
  table: 'reports',
  column: 'organization_id',
  operator: 'eq',
  valueExpression: 'orgId',
  roleIds: ['*'],
  enabled: true,
};

describe('RLSEngine', () => {
  let engine: RLSEngine;

  beforeEach(() => {
    engine = new RLSEngine();
  });

  // ---- Admin bypass ----

  describe('admin bypass', () => {
    it('returns no filters for admin users (full access)', () => {
      const admin = makeAdmin();
      const filters = engine.evaluate([ORG_POLICY], admin, 'dashboards');
      expect(filters).toHaveLength(0);
    });

    it('returns no filters for a user with admin permission', () => {
      const user = makeUser({ permissions: ['admin'] });
      const filters = engine.evaluate([ORG_POLICY], user, 'dashboards');
      expect(filters).toHaveLength(0);
    });
  });

  // ---- Policy matching ----

  describe('policy matching by table', () => {
    it('applies a policy that matches the queried table', () => {
      const user = makeUser();
      const filters = engine.evaluate([ORG_POLICY], user, 'dashboards');
      expect(filters).toHaveLength(1);
      expect(filters[0]).toMatchObject({
        column: 'organization_id',
        operator: 'eq',
        value: 'org-abc',
      });
    });

    it('does not apply a policy for a different table', () => {
      const user = makeUser();
      const filters = engine.evaluate([ORG_POLICY], user, 'reports');
      expect(filters).toHaveLength(0);
    });

    it('applies all matching policies when multiple tables are present', () => {
      const user = makeUser({ roleId: BUILT_IN_ROLE_IDS.VIEWER });
      const filters = engine.evaluate(
        [ORG_POLICY, USER_POLICY, WILDCARD_POLICY],
        user,
        // No table filter — all policies should be returned
      );
      // ORG_POLICY and WILDCARD_POLICY apply to viewer; USER_POLICY uses '*'
      expect(filters.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ---- Role matching ----

  describe('role matching', () => {
    it('applies policy when user role is in roleIds', () => {
      const viewer = makeUser({ roleId: BUILT_IN_ROLE_IDS.VIEWER });
      const filters = engine.evaluate([ORG_POLICY], viewer, 'dashboards');
      expect(filters).toHaveLength(1);
    });

    it('does not apply policy when user role is not in roleIds', () => {
      const adminRoleUser = makeUser({ roleId: BUILT_IN_ROLE_IDS.ADMIN, permissions: [] });
      // Non-admin permission but admin role — orgPolicy only applies to VIEWER and EDITOR
      const filters = engine.evaluate([ORG_POLICY], adminRoleUser, 'dashboards');
      // Admin roleId bypasses all policies
      expect(filters).toHaveLength(0);
    });

    it('applies wildcard (*) policy to any role', () => {
      const editor = makeUser({ roleId: BUILT_IN_ROLE_IDS.EDITOR, permissions: [] });
      const filters = engine.evaluate([WILDCARD_POLICY], editor, 'reports');
      expect(filters).toHaveLength(1);
    });
  });

  // ---- Value expression resolution ----

  describe('value expression resolution', () => {
    it('resolves orgId expression to user.orgId', () => {
      const user = makeUser({ orgId: 'org-xyz' });
      const filters = engine.evaluate([WILDCARD_POLICY], user, 'reports');
      expect(filters[0]?.value).toBe('org-xyz');
    });

    it('resolves sub expression to user.sub', () => {
      const user = makeUser({ sub: 'user-999' });
      const filters = engine.evaluate([USER_POLICY], user, 'private_notes');
      expect(filters[0]?.value).toBe('user-999');
    });

    it('resolves email expression', () => {
      const emailPolicy: RLSPolicy = {
        id: 'ep',
        name: 'Email filter',
        table: 'audit_logs',
        column: 'actor_email',
        operator: 'eq',
        valueExpression: 'email',
        roleIds: ['*'],
        enabled: true,
      };
      const user = makeUser({ email: 'test@example.com' });
      const filters = engine.evaluate([emailPolicy], user, 'audit_logs');
      expect(filters[0]?.value).toBe('test@example.com');
    });

    it('injects a blocking clause when expression cannot be resolved', () => {
      const badPolicy: RLSPolicy = {
        id: 'bp',
        name: 'Bad expression',
        table: 'test_table',
        column: 'col',
        operator: 'eq',
        valueExpression: 'nonExistentField',
        roleIds: ['*'],
        enabled: true,
      };
      const user = makeUser();
      const filters = engine.evaluate([badPolicy], user, 'test_table');
      expect(filters).toHaveLength(1);
      expect(filters[0]?.value).toBe('__UNRESOLVABLE__');
    });
  });

  // ---- Disabled policies ----

  describe('disabled policies', () => {
    it('skips policies with enabled: false', () => {
      const disabled: RLSPolicy = { ...ORG_POLICY, enabled: false };
      const user = makeUser();
      const filters = engine.evaluate([disabled], user, 'dashboards');
      expect(filters).toHaveLength(0);
    });

    it('applies policies with enabled: true', () => {
      const user = makeUser();
      const filters = engine.evaluate([ORG_POLICY], user, 'dashboards');
      expect(filters).toHaveLength(1);
    });

    it('skips policies with no roleIds', () => {
      const noRoles: RLSPolicy = { ...ORG_POLICY, roleIds: [] };
      const user = makeUser();
      const filters = engine.evaluate([noRoles], user, 'dashboards');
      expect(filters).toHaveLength(0);
    });
  });

  // ---- evaluateWithDetails ----

  describe('evaluateWithDetails', () => {
    it('includes applied policy IDs in the result', () => {
      const user = makeUser();
      const result = engine.evaluateWithDetails([ORG_POLICY], user, 'dashboards');
      expect(result.appliedPolicies).toContain('p1');
    });

    it('reports blocked: false for normal evaluation', () => {
      const user = makeUser();
      const result = engine.evaluateWithDetails([ORG_POLICY], user, 'dashboards');
      expect(result.blocked).toBe(false);
    });

    it('returns empty appliedPolicies for admin', () => {
      const admin = makeAdmin();
      const result = engine.evaluateWithDetails([ORG_POLICY], admin, 'dashboards');
      expect(result.appliedPolicies).toHaveLength(0);
    });
  });

  // ---- Static builders ----

  describe('RLSEngine.buildOrgPolicy', () => {
    it('creates an org-scoped policy with default column name', () => {
      const policy = RLSEngine.buildOrgPolicy('test', 'Test', 'users');
      expect(policy.column).toBe('organization_id');
      expect(policy.valueExpression).toBe('orgId');
      expect(policy.operator).toBe('eq');
      expect(policy.enabled).toBe(true);
    });
  });

  describe('RLSEngine.buildUserPolicy', () => {
    it('creates a user-scoped policy with default column name', () => {
      const policy = RLSEngine.buildUserPolicy('test', 'Test', 'items');
      expect(policy.column).toBe('user_id');
      expect(policy.valueExpression).toBe('sub');
    });
  });

  // ---- DEFAULT_RLS_POLICIES ----

  describe('DEFAULT_RLS_POLICIES', () => {
    it('contains at least 3 policies', () => {
      expect(DEFAULT_RLS_POLICIES.length).toBeGreaterThanOrEqual(3);
    });

    it('applies to editors querying data_sources', () => {
      const editor = makeUser({
        roleId: BUILT_IN_ROLE_IDS.EDITOR,
        orgId: 'org-xyz',
        permissions: [],
      });
      const filters = engine.evaluate(DEFAULT_RLS_POLICIES, editor, 'data_sources');
      expect(filters).toHaveLength(1);
      expect(filters[0]?.value).toBe('org-xyz');
    });

    it('does not apply to admin querying data_sources', () => {
      const admin = makeAdmin();
      const filters = engine.evaluate(DEFAULT_RLS_POLICIES, admin, 'data_sources');
      expect(filters).toHaveLength(0);
    });
  });
});
