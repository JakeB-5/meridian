import type { FilterClause, FilterOperator } from '@meridian/shared';
import type { TokenPayload } from '../jwt/token-service.js';
import { BUILT_IN_ROLE_IDS } from '../rbac/default-roles.js';

/**
 * A row-level security policy definition.
 *
 * When a user whose roleId appears in `roleIds` runs a query against `table`,
 * the engine injects an additional WHERE clause:
 *   `<column> <operator> <resolved value>`
 *
 * `valueExpression` is a dot-separated path into the TokenPayload
 * (e.g. 'orgId' resolves to `user.orgId`, 'sub' resolves to `user.sub`).
 */
export interface RLSPolicy {
  /** Unique policy identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Table this policy applies to */
  table: string;
  /** Column to filter on */
  column: string;
  /** Comparison operator */
  operator: FilterOperator;
  /**
   * A dot-path expression resolved against the TokenPayload at runtime.
   * Supported paths:
   *   'sub'         → user.sub
   *   'email'       → user.email
   *   'orgId'       → user.orgId
   *   'roleId'      → user.roleId
   */
  valueExpression: string;
  /**
   * Role IDs that this policy applies to.
   * Use ['*'] to apply to every role.
   * Leave empty to disable the policy.
   */
  roleIds: string[];
  /**
   * Whether this policy is currently active.
   * Inactive policies are skipped during evaluation.
   */
  enabled?: boolean;
}

/** Context for policy evaluation — may be extended with extra metadata */
export interface RLSContext {
  user: TokenPayload;
  /** Optional: override the table name when evaluating (useful for aliased tables) */
  tableAlias?: string;
}

/** Result of evaluating all policies for a user + table */
export interface RLSEvaluationResult {
  /** Additional WHERE clauses to inject */
  filters: FilterClause[];
  /** Policies that were applied */
  appliedPolicies: string[];
  /** Whether the user was completely blocked (no access at all) */
  blocked: boolean;
}

/**
 * Resolve a dot-path expression against a TokenPayload.
 * Returns undefined if the path is not found.
 */
function resolveValueExpression(
  expression: string,
  user: TokenPayload,
): unknown {
  const parts = expression.split('.');
  let current: unknown = user as unknown as Record<string, unknown>;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Row-level security engine.
 *
 * Evaluates a set of RLSPolicy objects against a user's TokenPayload and
 * returns the additional FilterClauses to inject into every query.
 */
export class RLSEngine {
  /**
   * Evaluate all policies that apply to the given user and table,
   * returning the filter clauses to inject.
   *
   * @param policies - Full list of policies to consider
   * @param user     - Authenticated user whose queries are being filtered
   * @param table    - The table being queried
   */
  evaluate(
    policies: RLSPolicy[],
    user: TokenPayload,
    table?: string,
  ): FilterClause[] {
    const result = this.evaluateWithDetails(policies, user, table);
    return result.filters;
  }

  /**
   * Evaluate policies and return detailed results including which policies fired.
   */
  evaluateWithDetails(
    policies: RLSPolicy[],
    user: TokenPayload,
    table?: string,
  ): RLSEvaluationResult {
    // Admins bypass all RLS policies
    if (this.isAdmin(user)) {
      return { filters: [], appliedPolicies: [], blocked: false };
    }

    const filters: FilterClause[] = [];
    const appliedPolicies: string[] = [];

    for (const policy of policies) {
      // Skip disabled policies
      if (policy.enabled === false) continue;

      // Skip if no roles are configured
      if (policy.roleIds.length === 0) continue;

      // Filter by table if specified
      if (table && policy.table !== table) continue;

      // Check if this policy applies to the user's role
      const appliesToRole =
        policy.roleIds.includes('*') || policy.roleIds.includes(user.roleId);

      if (!appliesToRole) continue;

      // Resolve the value expression
      const value = resolveValueExpression(policy.valueExpression, user);
      if (value === undefined || value === null) {
        // If the value cannot be resolved, block access conservatively
        // by injecting a never-true clause
        filters.push({
          column: policy.column,
          operator: 'eq',
          value: '__UNRESOLVABLE__',
        });
        appliedPolicies.push(policy.id);
        continue;
      }

      filters.push({
        column: policy.column,
        operator: policy.operator,
        value,
      });
      appliedPolicies.push(policy.id);
    }

    return {
      filters,
      appliedPolicies,
      blocked: false,
    };
  }

  /**
   * Build a standard organization-scoped policy for a table.
   * The most common RLS pattern: restrict rows to the user's organization.
   */
  static buildOrgPolicy(
    id: string,
    name: string,
    table: string,
    orgColumn = 'organization_id',
    roleIds: string[] = ['*'],
  ): RLSPolicy {
    return {
      id,
      name,
      table,
      column: orgColumn,
      operator: 'eq',
      valueExpression: 'orgId',
      roleIds,
      enabled: true,
    };
  }

  /**
   * Build a user-scoped policy (restrict rows to the current user).
   */
  static buildUserPolicy(
    id: string,
    name: string,
    table: string,
    userColumn = 'user_id',
    roleIds: string[] = ['*'],
  ): RLSPolicy {
    return {
      id,
      name,
      table,
      column: userColumn,
      operator: 'eq',
      valueExpression: 'sub',
      roleIds,
      enabled: true,
    };
  }

  private isAdmin(user: TokenPayload): boolean {
    return (
      user.permissions.includes('admin') ||
      user.roleId === BUILT_IN_ROLE_IDS.ADMIN
    );
  }
}

/**
 * Pre-built default RLS policies for standard Meridian tables.
 * These restrict all non-admin users to their own organization's data.
 */
export const DEFAULT_RLS_POLICIES: RLSPolicy[] = [
  RLSEngine.buildOrgPolicy(
    'rls:datasource:org',
    'Restrict datasources to organization',
    'data_sources',
    'organization_id',
    [BUILT_IN_ROLE_IDS.EDITOR, BUILT_IN_ROLE_IDS.VIEWER],
  ),
  RLSEngine.buildOrgPolicy(
    'rls:dashboard:org',
    'Restrict dashboards to organization',
    'dashboards',
    'organization_id',
    [BUILT_IN_ROLE_IDS.EDITOR, BUILT_IN_ROLE_IDS.VIEWER],
  ),
  RLSEngine.buildOrgPolicy(
    'rls:question:org',
    'Restrict questions to organization',
    'questions',
    'organization_id',
    [BUILT_IN_ROLE_IDS.EDITOR, BUILT_IN_ROLE_IDS.VIEWER],
  ),
];
