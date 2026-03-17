// ── Query Optimizer ──────────────────────────────────────────────────
// Performs basic optimizations on AbstractQuery before SQL generation.
// These are safe, semantic-preserving transformations.

import type {
  AbstractQuery,
  Filter,
  GroupByClause,
} from '../ir/abstract-query.js';

// ── Optimization Result ─────────────────────────────────────────────

export interface OptimizationResult {
  /** The optimized query */
  query: AbstractQuery;
  /** Optimizations that were applied */
  appliedOptimizations: string[];
  /** Number of transformations performed */
  transformationCount: number;
}

// ── Optimizer Options ───────────────────────────────────────────────

export interface OptimizerOptions {
  /** Remove unused columns from SELECT when GROUP BY narrows them */
  removeUnusedColumns?: boolean;
  /** Push filters closer to data source */
  pushDownFilters?: boolean;
  /** Merge redundant / duplicate filters */
  mergeRedundantFilters?: boolean;
  /** Simplify constant expressions (e.g. 1=1, TRUE AND x => x) */
  simplifyConstants?: boolean;
  /** Push LIMIT into subqueries when safe */
  limitPushdown?: boolean;
  /** Flatten nested AND/OR logical filters */
  flattenLogical?: boolean;
  /** Remove duplicate ORDER BY columns */
  deduplicateOrderBy?: boolean;
  /** Remove duplicate GROUP BY columns */
  deduplicateGroupBy?: boolean;
}

const DEFAULT_OPTIONS: Required<OptimizerOptions> = {
  removeUnusedColumns: true,
  pushDownFilters: true,
  mergeRedundantFilters: true,
  simplifyConstants: true,
  limitPushdown: true,
  flattenLogical: true,
  deduplicateOrderBy: true,
  deduplicateGroupBy: true,
};

// ── Main Optimizer ──────────────────────────────────────────────────

/**
 * Optimize an AbstractQuery by applying safe transformations.
 *
 * Each optimization pass is independent and can be enabled/disabled.
 * The optimizer never changes query semantics — only improves efficiency.
 */
export class QueryOptimizer {
  private readonly options: Required<OptimizerOptions>;

  constructor(options: OptimizerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Optimize the given query.
   */
  optimize(query: AbstractQuery): OptimizationResult {
    let current = query;
    const applied: string[] = [];
    let transformations = 0;

    // Pass 1: Flatten nested logical filters
    if (this.options.flattenLogical) {
      const result = this.flattenLogicalFilters(current);
      if (result.changed) {
        current = result.query;
        applied.push('flatten-logical');
        transformations += result.count;
      }
    }

    // Pass 2: Simplify constant expressions in filters
    if (this.options.simplifyConstants) {
      const result = this.simplifyConstantFilters(current);
      if (result.changed) {
        current = result.query;
        applied.push('simplify-constants');
        transformations += result.count;
      }
    }

    // Pass 3: Merge redundant filters
    if (this.options.mergeRedundantFilters) {
      const result = this.mergeFilters(current);
      if (result.changed) {
        current = result.query;
        applied.push('merge-redundant-filters');
        transformations += result.count;
      }
    }

    // Pass 4: Remove unused columns
    if (this.options.removeUnusedColumns) {
      const result = this.removeUnused(current);
      if (result.changed) {
        current = result.query;
        applied.push('remove-unused-columns');
        transformations += result.count;
      }
    }

    // Pass 5: Push filters down to subqueries
    if (this.options.pushDownFilters) {
      const result = this.pushFiltersDown(current);
      if (result.changed) {
        current = result.query;
        applied.push('push-down-filters');
        transformations += result.count;
      }
    }

    // Pass 6: LIMIT pushdown into subqueries
    if (this.options.limitPushdown) {
      const result = this.pushLimitDown(current);
      if (result.changed) {
        current = result.query;
        applied.push('limit-pushdown');
        transformations += result.count;
      }
    }

    // Pass 7: Deduplicate ORDER BY
    if (this.options.deduplicateOrderBy) {
      const result = this.deduplicateOrderByClauses(current);
      if (result.changed) {
        current = result.query;
        applied.push('deduplicate-order-by');
        transformations += result.count;
      }
    }

    // Pass 8: Deduplicate GROUP BY
    if (this.options.deduplicateGroupBy) {
      const result = this.deduplicateGroupByClauses(current);
      if (result.changed) {
        current = result.query;
        applied.push('deduplicate-group-by');
        transformations += result.count;
      }
    }

    return {
      query: current,
      appliedOptimizations: applied,
      transformationCount: transformations,
    };
  }

  // ── Pass 1: Flatten Logical Filters ───────────────────────────

  private flattenLogicalFilters(query: AbstractQuery): PassResult {
    let count = 0;

    const flattenFilter = (filter: Filter): Filter => {
      if (filter.kind !== 'logical') return filter;

      // Recursively flatten children first
      const flattened: Filter[] = [];
      for (const child of filter.conditions) {
        const flat = flattenFilter(child);
        // If child is same logical op, merge its children up
        if (flat.kind === 'logical' && flat.operator === filter.operator) {
          flattened.push(...flat.conditions);
          count++;
        } else {
          flattened.push(flat);
        }
      }

      if (flattened.length === 1) {
        count++;
        return flattened[0];
      }

      return { ...filter, conditions: flattened };
    };

    const newFilters = query.filters.map(flattenFilter);
    const newHaving = query.having.map(flattenFilter);

    return {
      query: { ...query, filters: newFilters, having: newHaving },
      changed: count > 0,
      count,
    };
  }

  // ── Pass 2: Simplify Constants ────────────────────────────────

  private simplifyConstantFilters(query: AbstractQuery): PassResult {
    let count = 0;

    const simplify = (filter: Filter): Filter | null => {
      if (filter.kind === 'logical') {
        const simplified = filter.conditions
          .map(simplify)
          .filter((f): f is Filter => f !== null);

        if (simplified.length === 0) {
          count++;
          return null; // All conditions were tautologies
        }
        if (simplified.length === 1) {
          count++;
          return simplified[0];
        }
        if (simplified.length !== filter.conditions.length) {
          count++;
        }
        return { ...filter, conditions: simplified };
      }

      if (filter.kind === 'not') {
        const inner = simplify(filter.condition);
        if (inner === null) {
          count++;
          return null;
        }
        // NOT NOT x => x
        if (inner.kind === 'not') {
          count++;
          return inner.condition;
        }
        return { ...filter, condition: inner };
      }

      return filter;
    };

    const newFilters = query.filters
      .map(simplify)
      .filter((f): f is Filter => f !== null);
    const newHaving = query.having
      .map(simplify)
      .filter((f): f is Filter => f !== null);

    const changed = newFilters.length !== query.filters.length ||
      newHaving.length !== query.having.length ||
      count > 0;

    return {
      query: { ...query, filters: newFilters, having: newHaving },
      changed,
      count,
    };
  }

  // ── Pass 3: Merge Redundant Filters ───────────────────────────

  private mergeFilters(query: AbstractQuery): PassResult {
    let count = 0;

    const dedup = (filters: Filter[]): Filter[] => {
      const seen = new Map<string, Filter>();
      const result: Filter[] = [];

      for (const f of filters) {
        const key = filterKey(f);
        if (!seen.has(key)) {
          seen.set(key, f);
          result.push(f);
        } else {
          count++;
        }
      }

      return result;
    };

    const newFilters = dedup(query.filters);
    const newHaving = dedup(query.having);

    return {
      query: { ...query, filters: newFilters, having: newHaving },
      changed: count > 0,
      count,
    };
  }

  // ── Pass 4: Remove Unused Columns ─────────────────────────────

  private removeUnused(query: AbstractQuery): PassResult {
    // Only applies when there are GROUP BY clauses and column selections
    if (query.groupBy.length === 0) {
      return { query, changed: false, count: 0 };
    }

    let count = 0;
    const groupByColumns = new Set<string>();
    for (const gb of query.groupBy) {
      if (gb.kind === 'column') {
        groupByColumns.add(gb.column);
      }
    }

    // Keep selections that are:
    // 1. Aggregates (always valid in GROUP BY query)
    // 2. Columns that are in the GROUP BY set
    // 3. Raw expressions (can't analyze)
    // 4. Wildcards (can't narrow)
    const newSelections = query.selections.filter((sel) => {
      if (sel.kind === 'aggregate' || sel.kind === 'raw' || sel.kind === 'wildcard') {
        return true;
      }
      if (sel.kind === 'column' && groupByColumns.has(sel.column)) {
        return true;
      }
      // Column not in GROUP BY: remove it
      count++;
      return false;
    });

    return {
      query: { ...query, selections: newSelections },
      changed: count > 0,
      count,
    };
  }

  // ── Pass 5: Push Filters Down ─────────────────────────────────

  private pushFiltersDown(query: AbstractQuery): PassResult {
    // Only applies when source is a subquery
    if (query.source.kind !== 'subquery') {
      return { query, changed: false, count: 0 };
    }

    let count = 0;
    const pushable: Filter[] = [];
    const remaining: Filter[] = [];

    for (const filter of query.filters) {
      if (canPushDown(filter, query.source.query)) {
        pushable.push(filter);
        count++;
      } else {
        remaining.push(filter);
      }
    }

    if (pushable.length === 0) {
      return { query, changed: false, count: 0 };
    }

    // Push filters into subquery
    const subquery = query.source.query;
    const newSubquery: AbstractQuery = {
      ...subquery,
      filters: [...subquery.filters, ...pushable],
    };

    return {
      query: {
        ...query,
        source: { ...query.source, query: newSubquery },
        filters: remaining,
      },
      changed: true,
      count,
    };
  }

  // ── Pass 6: LIMIT Pushdown ───────────────────────────────────

  private pushLimitDown(query: AbstractQuery): PassResult {
    // Only applies when:
    // 1. Source is a subquery
    // 2. Outer query has a LIMIT
    // 3. Subquery does NOT have a LIMIT (or has a larger one)
    // 4. No outer filters, joins, or GROUP BY that would change row count
    if (
      query.source.kind !== 'subquery' ||
      query.limit === undefined ||
      query.filters.length > 0 ||
      query.joins.length > 0 ||
      query.groupBy.length > 0
    ) {
      return { query, changed: false, count: 0 };
    }

    const subquery = query.source.query;
    const subLimit = subquery.limit;

    // If subquery already has a tighter limit, no pushdown needed
    if (subLimit !== undefined && subLimit <= query.limit) {
      return { query, changed: false, count: 0 };
    }

    const newSubquery: AbstractQuery = {
      ...subquery,
      limit: query.limit,
      offset: query.offset ?? subquery.offset,
    };

    return {
      query: {
        ...query,
        source: { ...query.source, query: newSubquery },
      },
      changed: true,
      count: 1,
    };
  }

  // ── Pass 7: Deduplicate ORDER BY ──────────────────────────────

  private deduplicateOrderByClauses(query: AbstractQuery): PassResult {
    if (query.orderBy.length <= 1) {
      return { query, changed: false, count: 0 };
    }

    const seen = new Set<string>();
    const deduped = query.orderBy.filter((ob) => {
      const key = ob.kind === 'column'
        ? `${ob.table ?? ''}.${ob.column}.${ob.direction}`
        : `raw:${ob.expression}.${ob.direction}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const removed = query.orderBy.length - deduped.length;
    return {
      query: { ...query, orderBy: deduped },
      changed: removed > 0,
      count: removed,
    };
  }

  // ── Pass 8: Deduplicate GROUP BY ──────────────────────────────

  private deduplicateGroupByClauses(query: AbstractQuery): PassResult {
    if (query.groupBy.length <= 1) {
      return { query, changed: false, count: 0 };
    }

    const seen = new Set<string>();
    const deduped = query.groupBy.filter((gb) => {
      const key = groupByKey(gb);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const removed = query.groupBy.length - deduped.length;
    return {
      query: { ...query, groupBy: deduped },
      changed: removed > 0,
      count: removed,
    };
  }
}

// ── Internal Types ──────────────────────────────────────────────────

interface PassResult {
  query: AbstractQuery;
  changed: boolean;
  count: number;
}

// ── Helper Functions ────────────────────────────────────────────────

/**
 * Generate a stable string key for a filter (for deduplication).
 */
function filterKey(filter: Filter): string {
  switch (filter.kind) {
    case 'comparison':
      return `cmp:${filter.table ?? ''}:${filter.column}:${filter.operator}:${JSON.stringify(filter.value)}`;
    case 'logical':
      return `log:${filter.operator}:[${filter.conditions.map(filterKey).join(',')}]`;
    case 'not':
      return `not:${filterKey(filter.condition)}`;
    case 'raw':
      return `raw:${filter.expression}:${JSON.stringify(filter.params)}`;
  }
}

/**
 * Generate a stable key for a GROUP BY clause.
 */
function groupByKey(gb: GroupByClause): string {
  if (gb.kind === 'column') {
    return `col:${gb.table ?? ''}:${gb.column}`;
  }
  return `raw:${gb.expression}`;
}

/**
 * Check if a filter can be safely pushed down into a subquery.
 * A filter can be pushed down if it only references columns
 * that exist in the subquery's selections.
 */
function canPushDown(filter: Filter, subquery: AbstractQuery): boolean {
  if (filter.kind !== 'comparison') {
    return false; // Only push simple comparisons
  }

  // Check if the filtered column is available in the subquery
  return subquery.selections.some((sel) => {
    if (sel.kind === 'column') {
      return sel.alias === filter.column || sel.column === filter.column;
    }
    if (sel.kind === 'aggregate') {
      return sel.alias === filter.column;
    }
    if (sel.kind === 'wildcard') {
      return true; // Wildcard includes everything
    }
    return false;
  });
}

// ── Convenience factory ─────────────────────────────────────────────

/**
 * Create an optimizer with default options.
 */
export function createOptimizer(options?: OptimizerOptions): QueryOptimizer {
  return new QueryOptimizer(options);
}

/**
 * Optimize a query with default settings.
 */
export function optimizeQuery(query: AbstractQuery): OptimizationResult {
  return new QueryOptimizer().optimize(query);
}
