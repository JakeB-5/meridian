import type { Result } from '../types/result.js';

/** A user profile returned after a successful SSO callback */
export interface SSOUser {
  /** Unique identifier from the SSO provider */
  providerId: string;
  /** Provider name (e.g. 'google', 'github', 'okta') */
  provider: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  /** Raw profile data from the provider */
  rawProfile: Record<string, unknown>;
}

/** OAuth2 / OIDC authorization parameters */
export interface AuthUrlParams {
  /** The URL the provider should redirect to after authentication */
  callbackUrl: string;
  /** OAuth2 scopes to request */
  scopes?: string[];
  /** Optional state parameter for CSRF protection */
  state?: string;
  /** Optional nonce for OIDC id_token validation */
  nonce?: string;
}

/** Token set returned from the provider's token endpoint */
export interface ProviderTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt?: number;
  scope?: string;
}

/** Callback parameters received after the user authenticates */
export interface CallbackParams {
  /** Authorization code from the provider */
  code: string;
  /** State echoed back from the provider */
  state?: string;
  /** Error code if the provider returned an error */
  error?: string;
  /** Error description from the provider */
  errorDescription?: string;
}

/**
 * Common interface for all SSO / OAuth2 / SAML providers.
 *
 * Implementations should be registered with the SSORegistry and discovered
 * by the auth routes using the provider `name` field.
 */
export interface SSOProvider {
  /** Unique provider name, e.g. 'google', 'github', 'saml:okta' */
  readonly name: string;
  /** Human-readable display name */
  readonly displayName: string;

  /**
   * Return the authorization URL to redirect the user to.
   * Must include all required OAuth2 / OIDC parameters.
   */
  getAuthUrl(params: AuthUrlParams): string;

  /**
   * Exchange the authorization code for user profile information.
   * Returns a Result so callers can pattern-match without try/catch.
   */
  handleCallback(params: CallbackParams): Promise<Result<SSOUser>>;

  /**
   * Optionally refresh the provider access token using a stored refresh token.
   * Returns undefined if the provider does not support token refresh.
   */
  refreshTokens?(refreshToken: string): Promise<Result<ProviderTokens>>;
}

/** Configuration common to OAuth2-based providers */
export interface OAuth2ProviderConfig {
  clientId: string;
  clientSecret: string;
  /** Override the default scopes for this provider */
  scopes?: string[];
  /** Override the authorization endpoint URL */
  authorizationUrl?: string;
  /** Override the token endpoint URL */
  tokenUrl?: string;
  /** Override the userinfo endpoint URL */
  userInfoUrl?: string;
}

/**
 * Abstract base class for OAuth2 providers.
 * Concrete implementations override `getAuthUrl`, `handleCallback`, and
 * `mapProfile` to convert provider-specific profile data to `SSOUser`.
 */
export abstract class BaseOAuth2Provider implements SSOProvider {
  abstract readonly name: string;
  abstract readonly displayName: string;

  constructor(protected readonly config: OAuth2ProviderConfig) {}

  abstract getAuthUrl(params: AuthUrlParams): string;
  abstract handleCallback(params: CallbackParams): Promise<Result<SSOUser>>;

  /** Map a raw provider profile to our SSOUser shape */
  protected abstract mapProfile(
    rawProfile: Record<string, unknown>,
    tokens: ProviderTokens,
  ): SSOUser;

  /** Build a redirect URI with query params */
  protected buildRedirectUrl(
    baseUrl: string,
    params: Record<string, string>,
  ): string {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }
}

/**
 * Google OAuth2 provider stub.
 * Replace the placeholder URLs and implement `handleCallback`
 * to complete the Google OAuth2 integration.
 */
export class GoogleSSOProvider extends BaseOAuth2Provider {
  readonly name = 'google';
  readonly displayName = 'Google';

  private static readonly AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
  private static readonly DEFAULT_SCOPES = ['openid', 'email', 'profile'];

  getAuthUrl(params: AuthUrlParams): string {
    return this.buildRedirectUrl(GoogleSSOProvider.AUTH_URL, {
      client_id: this.config.clientId,
      redirect_uri: params.callbackUrl,
      response_type: 'code',
      scope: (params.scopes ?? GoogleSSOProvider.DEFAULT_SCOPES).join(' '),
      ...(params.state ? { state: params.state } : {}),
      ...(params.nonce ? { nonce: params.nonce } : {}),
      access_type: 'offline',
      prompt: 'consent',
    });
  }

  async handleCallback(params: CallbackParams): Promise<Result<SSOUser>> {
    // Stub — full implementation requires HTTP client for token exchange
    throw new Error(
      `GoogleSSOProvider.handleCallback is not yet implemented. ` +
        `Received code: ${params.code?.substring(0, 8)}...`,
    );
  }

  protected mapProfile(
    rawProfile: Record<string, unknown>,
    _tokens: ProviderTokens,
  ): SSOUser {
    return {
      providerId: String(rawProfile['sub'] ?? rawProfile['id'] ?? ''),
      provider: this.name,
      email: String(rawProfile['email'] ?? ''),
      name: rawProfile['name'] as string | undefined,
      avatarUrl: rawProfile['picture'] as string | undefined,
      rawProfile,
    };
  }
}

/**
 * GitHub OAuth2 provider stub.
 */
export class GitHubSSOProvider extends BaseOAuth2Provider {
  readonly name = 'github';
  readonly displayName = 'GitHub';

  private static readonly AUTH_URL = 'https://github.com/login/oauth/authorize';
  private static readonly DEFAULT_SCOPES = ['read:user', 'user:email'];

  getAuthUrl(params: AuthUrlParams): string {
    return this.buildRedirectUrl(GitHubSSOProvider.AUTH_URL, {
      client_id: this.config.clientId,
      redirect_uri: params.callbackUrl,
      scope: (params.scopes ?? GitHubSSOProvider.DEFAULT_SCOPES).join(' '),
      ...(params.state ? { state: params.state } : {}),
    });
  }

  async handleCallback(params: CallbackParams): Promise<Result<SSOUser>> {
    throw new Error(
      `GitHubSSOProvider.handleCallback is not yet implemented. ` +
        `Received code: ${params.code?.substring(0, 8)}...`,
    );
  }

  protected mapProfile(
    rawProfile: Record<string, unknown>,
    _tokens: ProviderTokens,
  ): SSOUser {
    return {
      providerId: String(rawProfile['id'] ?? ''),
      provider: this.name,
      email: String(rawProfile['email'] ?? ''),
      name: rawProfile['name'] as string | undefined,
      avatarUrl: rawProfile['avatar_url'] as string | undefined,
      rawProfile,
    };
  }
}

/**
 * Registry for SSO providers.
 * Providers are registered by name and looked up at runtime.
 */
export class SSORegistry {
  private readonly providers = new Map<string, SSOProvider>();

  register(provider: SSOProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): SSOProvider | undefined {
    return this.providers.get(name);
  }

  getOrThrow(name: string): SSOProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`SSO provider '${name}' is not registered`);
    }
    return provider;
  }

  list(): SSOProvider[] {
    return Array.from(this.providers.values());
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }

  unregister(name: string): boolean {
    return this.providers.delete(name);
  }
}
