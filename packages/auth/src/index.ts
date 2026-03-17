// ---- JWT ----
export {
  TokenService,
  type TokenOptions,
  type TokenPayload,
  type UserPayload,
  type TokenPair,
} from './jwt/token-service.js';

// ---- Password ----
export {
  PasswordService,
  type ValidationResult,
  type PasswordHashOptions,
  type PasswordStrengthConfig,
} from './password/password-service.js';

// ---- RBAC ----
export {
  PermissionChecker,
  type ResourceType,
} from './rbac/permission-checker.js';

export {
  buildDefaultRoles,
  getBuiltInRole,
  isBuiltInRoleId,
  ALL_PERMISSIONS,
  VIEWER_PERMISSIONS,
  EDITOR_PERMISSIONS,
  BUILT_IN_ROLE_IDS,
  type BuiltInRoleId,
} from './rbac/default-roles.js';

// ---- RLS ----
export {
  RLSEngine,
  DEFAULT_RLS_POLICIES,
  type RLSPolicy,
  type RLSContext,
  type RLSEvaluationResult,
} from './rls/row-level-security.js';

// ---- Middleware ----
export {
  createAuthPlugin,
  createAuthMiddleware,
  requirePermission,
  requireAnyPermission,
  requireAuth,
  type AuthMiddlewareOptions,
} from './middleware/auth-middleware.js';

export {
  RateLimiter,
  createRateLimitHook,
  createRateLimiter,
  type RateLimitConfig,
  type RateLimitCheckResult,
  type RedisLike,
} from './middleware/rate-limiter.js';

// ---- Session ----
export {
  SessionStore,
  type Session,
  type CreateSessionOptions,
  type SessionStoreConfig,
  type SessionRedisClient,
} from './session/session-store.js';

// ---- SSO ----
export {
  BaseOAuth2Provider,
  GoogleSSOProvider,
  GitHubSSOProvider,
  SSORegistry,
  type SSOProvider,
  type SSOUser,
  type AuthUrlParams,
  type CallbackParams,
  type ProviderTokens,
  type OAuth2ProviderConfig,
} from './sso/sso-provider.js';

// ---- Errors ----
export {
  AuthError,
  TokenExpiredError,
  TokenInvalidError,
  TokenMissingError,
  PermissionDeniedError,
  OrganizationAccessDeniedError,
  PasswordWeakError,
  SessionNotFoundError,
  SessionRevokedError,
  MaxSessionsExceededError,
  RateLimitExceededError,
  SSOError,
} from './errors/auth-errors.js';

// ---- Result type ----
export { ok, err, unwrap, type Result } from './types/result.js';
