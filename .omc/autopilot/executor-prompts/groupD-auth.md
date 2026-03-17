# Group D2: @meridian/auth — Authentication & Authorization

## Task
Implement complete auth system with JWT tokens, password hashing, RBAC, and row-level security.

## Files to Create

### src/jwt/token-service.ts
JWT management using jose:
```typescript
export class TokenService {
  constructor(private secret: string, private options: TokenOptions) {}
  generateAccessToken(user: UserPayload): Promise<string>;
  generateRefreshToken(user: UserPayload): Promise<string>;
  verifyToken(token: string): Promise<Result<TokenPayload>>;
  decodeToken(token: string): TokenPayload | null;
  refreshTokenPair(refreshToken: string): Promise<Result<TokenPair>>;
}

export interface TokenOptions {
  accessTokenExpiry: string;  // '15m'
  refreshTokenExpiry: string; // '7d'
  issuer: string;
}

export interface TokenPayload {
  sub: string;       // user ID
  email: string;
  orgId: string;
  roleId: string;
  permissions: string[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
```

### src/password/password-service.ts
Password hashing using argon2:
```typescript
export class PasswordService {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
  validateStrength(password: string): ValidationResult;
}
```
- Minimum 8 chars, mix of cases/numbers
- Argon2id algorithm

### src/rbac/permission-checker.ts
RBAC engine:
```typescript
export class PermissionChecker {
  hasPermission(user: TokenPayload, permission: Permission): boolean;
  hasAnyPermission(user: TokenPayload, permissions: Permission[]): boolean;
  hasAllPermissions(user: TokenPayload, permissions: Permission[]): boolean;
  isAdmin(user: TokenPayload): boolean;
  canAccessOrganization(user: TokenPayload, orgId: string): boolean;
}
```

### src/rbac/default-roles.ts
Pre-defined roles:
- Admin: all permissions
- Editor: read/write datasource, question, dashboard
- Viewer: read-only
- Custom roles supported

### src/rls/row-level-security.ts
Row-level security engine:
```typescript
export interface RLSPolicy {
  id: string;
  name: string;
  table: string;
  column: string;
  operator: FilterOperator;
  valueExpression: string; // e.g., 'user.organizationId'
  roleIds: string[];
}

export class RLSEngine {
  evaluate(policies: RLSPolicy[], user: TokenPayload): FilterClause[];
  // Returns additional WHERE clauses to apply to queries
}
```

### src/middleware/auth-middleware.ts
Fastify middleware/hook:
```typescript
export function createAuthMiddleware(tokenService: TokenService): FastifyPluginCallback;
// Extracts Bearer token, verifies, attaches user to request
// req.user = TokenPayload

export function requirePermission(...permissions: Permission[]): FastifyPreHandler;
// Checks user has required permissions, returns 403 if not
```

### src/middleware/rate-limiter.ts
Simple rate limiter:
- Per-user/per-IP limits
- Configurable window and max requests
- Redis-backed counter

### src/session/session-store.ts
Session management for refresh tokens:
- Store active sessions per user
- Revoke session
- List active sessions
- Max sessions per user

### src/sso/sso-provider.ts (stub interface)
```typescript
export interface SSOProvider {
  name: string;
  getAuthUrl(callbackUrl: string): string;
  handleCallback(code: string): Promise<Result<SSOUser>>;
}
```

### src/index.ts — re-exports

## Tests
- src/jwt/token-service.test.ts (generate, verify, refresh, expiry)
- src/password/password-service.test.ts (hash, verify, strength validation)
- src/rbac/permission-checker.test.ts (all permission combinations)
- src/rls/row-level-security.test.ts (policy evaluation)
- src/middleware/auth-middleware.test.ts (mock Fastify request/reply)
- src/middleware/rate-limiter.test.ts

## Dependencies
- @meridian/core, @meridian/db, @meridian/shared
- jose, argon2

## Estimated LOC: ~5000 + ~2000 tests
