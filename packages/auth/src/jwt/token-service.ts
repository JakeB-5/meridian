import {
  SignJWT,
  jwtVerify,
  decodeJwt,
  type JWTPayload,
} from 'jose';
import type { Permission } from '@meridian/shared';
import { TokenExpiredError, TokenInvalidError } from '../errors/auth-errors.js';
import { ok, err, type Result } from '../types/result.js';

/** Options for token generation */
export interface TokenOptions {
  /** Duration string for access tokens, e.g. '15m' */
  accessTokenExpiry: string;
  /** Duration string for refresh tokens, e.g. '7d' */
  refreshTokenExpiry: string;
  /** JWT issuer claim */
  issuer: string;
}

/** The custom claims stored inside a JWT */
export interface TokenPayload {
  /** Subject — user ID */
  sub: string;
  email: string;
  orgId: string;
  roleId: string;
  permissions: Permission[];
}

/** Input for generating a new token pair */
export type UserPayload = TokenPayload;

/** A pair of access + refresh JWTs */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Unix epoch (seconds) when the access token expires */
  accessTokenExpiresAt: number;
  /** Unix epoch (seconds) when the refresh token expires */
  refreshTokenExpiresAt: number;
}

/** Internal JWT payload shape stored in the token */
interface JwtCustomClaims extends JWTPayload {
  email: string;
  orgId: string;
  roleId: string;
  permissions: Permission[];
  tokenType: 'access' | 'refresh';
}

/** Parse a duration string like '15m', '7d', '1h' into seconds */
function parseDurationToSeconds(duration: string): number {
  const units: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
    w: 604800,
  };
  const match = /^(\d+)([smhdw])$/.exec(duration);
  if (!match) {
    throw new Error(`Invalid duration format: '${duration}'. Expected format like '15m', '7d'.`);
  }
  const [, amount, unit] = match;
  return parseInt(amount, 10) * (units[unit] ?? 1);
}

/**
 * Service for generating, verifying, and refreshing JWT token pairs.
 *
 * Uses HS256 signing with a shared secret via the `jose` library.
 */
export class TokenService {
  private readonly secretKey: Uint8Array;

  constructor(
    secret: string,
    private readonly options: TokenOptions,
  ) {
    if (!secret || secret.length < 32) {
      throw new Error('JWT secret must be at least 32 characters long');
    }
    this.secretKey = new TextEncoder().encode(secret);
  }

  /** Generate a short-lived access token for the given user */
  async generateAccessToken(user: UserPayload): Promise<string> {
    const expiresInSeconds = parseDurationToSeconds(this.options.accessTokenExpiry);
    const now = Math.floor(Date.now() / 1000);

    return new SignJWT({
      email: user.email,
      orgId: user.orgId,
      roleId: user.roleId,
      permissions: user.permissions,
      tokenType: 'access',
    } satisfies Partial<JwtCustomClaims>)
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.sub)
      .setIssuer(this.options.issuer)
      .setIssuedAt(now)
      .setExpirationTime(now + expiresInSeconds)
      .sign(this.secretKey);
  }

  /** Generate a long-lived refresh token for the given user */
  async generateRefreshToken(user: UserPayload): Promise<string> {
    const expiresInSeconds = parseDurationToSeconds(this.options.refreshTokenExpiry);
    const now = Math.floor(Date.now() / 1000);

    return new SignJWT({
      email: user.email,
      orgId: user.orgId,
      roleId: user.roleId,
      permissions: user.permissions,
      tokenType: 'refresh',
    } satisfies Partial<JwtCustomClaims>)
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.sub)
      .setIssuer(this.options.issuer)
      .setIssuedAt(now)
      .setExpirationTime(now + expiresInSeconds)
      .sign(this.secretKey);
  }

  /** Generate both tokens at once and return them with expiry timestamps */
  async generateTokenPair(user: UserPayload): Promise<TokenPair> {
    const now = Math.floor(Date.now() / 1000);
    const accessExpiry = parseDurationToSeconds(this.options.accessTokenExpiry);
    const refreshExpiry = parseDurationToSeconds(this.options.refreshTokenExpiry);

    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(user),
      this.generateRefreshToken(user),
    ]);

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: now + accessExpiry,
      refreshTokenExpiresAt: now + refreshExpiry,
    };
  }

  /**
   * Verify a JWT's signature and expiry.
   * Returns a Result so callers can pattern-match without try/catch.
   */
  async verifyToken(token: string): Promise<Result<TokenPayload>> {
    try {
      const { payload } = await jwtVerify<JwtCustomClaims>(token, this.secretKey, {
        issuer: this.options.issuer,
        algorithms: ['HS256'],
      });

      if (!payload.sub) {
        return err(new TokenInvalidError('Token is missing subject claim'));
      }

      const tokenPayload: TokenPayload = {
        sub: payload.sub,
        email: payload.email,
        orgId: payload.orgId,
        roleId: payload.roleId,
        permissions: payload.permissions ?? [],
      };

      return ok(tokenPayload);
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'JWTExpired') {
          return err(new TokenExpiredError());
        }
        return err(new TokenInvalidError(`Token verification failed: ${error.message}`));
      }
      return err(new TokenInvalidError('Token verification failed'));
    }
  }

  /**
   * Decode a token WITHOUT verifying the signature.
   * Use only for extracting claims where trust is not needed (e.g. logging).
   */
  decodeToken(token: string): TokenPayload | null {
    try {
      const payload = decodeJwt(token) as JwtCustomClaims;
      if (!payload.sub) return null;

      return {
        sub: payload.sub,
        email: payload.email ?? '',
        orgId: payload.orgId ?? '',
        roleId: payload.roleId ?? '',
        permissions: payload.permissions ?? [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Exchange a valid refresh token for a new token pair.
   * The refresh token must have tokenType === 'refresh'.
   */
  async refreshTokenPair(refreshToken: string): Promise<Result<TokenPair>> {
    const verifyResult = await this.verifyToken(refreshToken);
    if (!verifyResult.ok) {
      return err(verifyResult.error);
    }

    // Verify this is actually a refresh token
    try {
      const raw = decodeJwt(refreshToken) as JwtCustomClaims;
      if (raw.tokenType !== 'refresh') {
        return err(new TokenInvalidError('Provided token is not a refresh token'));
      }
    } catch {
      return err(new TokenInvalidError('Failed to decode token claims'));
    }

    const newPair = await this.generateTokenPair(verifyResult.value);
    return ok(newPair);
  }

  /** Check if a token string is expired without throwing */
  isTokenExpired(token: string): boolean {
    try {
      const payload = decodeJwt(token);
      if (!payload.exp) return false;
      return payload.exp < Math.floor(Date.now() / 1000);
    } catch {
      return true;
    }
  }

  /** Extract the expiry timestamp (Unix seconds) from a decoded token */
  getTokenExpiry(token: string): number | null {
    try {
      const payload = decodeJwt(token);
      return payload.exp ?? null;
    } catch {
      return null;
    }
  }
}
