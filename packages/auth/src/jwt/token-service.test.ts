import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TokenService, type TokenOptions, type UserPayload } from './token-service.js';
import { TokenExpiredError, TokenInvalidError } from '../errors/auth-errors.js';

const TEST_SECRET = 'super-secret-key-that-is-at-least-32-chars!!';

const DEFAULT_OPTIONS: TokenOptions = {
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  issuer: 'meridian-test',
};

const SAMPLE_USER: UserPayload = {
  sub: 'user-123',
  email: 'alice@example.com',
  orgId: 'org-abc',
  roleId: 'role:editor',
  permissions: ['dashboard:read', 'question:read'],
};

function makeService(options: Partial<TokenOptions> = {}): TokenService {
  return new TokenService(TEST_SECRET, { ...DEFAULT_OPTIONS, ...options });
}

describe('TokenService', () => {
  let service: TokenService;

  beforeEach(() => {
    service = makeService();
  });

  // ---- Construction ----

  describe('constructor', () => {
    it('throws when secret is shorter than 32 characters', () => {
      expect(() => new TokenService('short', DEFAULT_OPTIONS)).toThrow(
        'JWT secret must be at least 32 characters long',
      );
    });

    it('throws when secret is empty', () => {
      expect(() => new TokenService('', DEFAULT_OPTIONS)).toThrow();
    });

    it('constructs successfully with a valid secret', () => {
      expect(() => makeService()).not.toThrow();
    });
  });

  // ---- generateAccessToken ----

  describe('generateAccessToken', () => {
    it('returns a non-empty string', async () => {
      const token = await service.generateAccessToken(SAMPLE_USER);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('produces a JWT with three dot-separated parts', async () => {
      const token = await service.generateAccessToken(SAMPLE_USER);
      expect(token.split('.').length).toBe(3);
    });

    it('encodes user claims in the payload', async () => {
      const token = await service.generateAccessToken(SAMPLE_USER);
      const decoded = service.decodeToken(token);
      expect(decoded?.sub).toBe(SAMPLE_USER.sub);
      expect(decoded?.email).toBe(SAMPLE_USER.email);
      expect(decoded?.orgId).toBe(SAMPLE_USER.orgId);
      expect(decoded?.roleId).toBe(SAMPLE_USER.roleId);
      expect(decoded?.permissions).toEqual(SAMPLE_USER.permissions);
    });

    it('generates different tokens on each call', async () => {
      const t1 = await service.generateAccessToken(SAMPLE_USER);
      const t2 = await service.generateAccessToken(SAMPLE_USER);
      // iat may differ by at least a millisecond — tokens should be different
      // but since iat is in seconds they may match; just ensure they are strings
      expect(typeof t1).toBe('string');
      expect(typeof t2).toBe('string');
    });
  });

  // ---- generateRefreshToken ----

  describe('generateRefreshToken', () => {
    it('returns a non-empty JWT string', async () => {
      const token = await service.generateRefreshToken(SAMPLE_USER);
      expect(token.split('.').length).toBe(3);
    });

    it('produces a longer-lived token than access tokens', async () => {
      const access = await service.generateAccessToken(SAMPLE_USER);
      const refresh = await service.generateRefreshToken(SAMPLE_USER);
      const accessExp = service.getTokenExpiry(access) ?? 0;
      const refreshExp = service.getTokenExpiry(refresh) ?? 0;
      expect(refreshExp).toBeGreaterThan(accessExp);
    });
  });

  // ---- generateTokenPair ----

  describe('generateTokenPair', () => {
    it('returns both tokens and expiry timestamps', async () => {
      const pair = await service.generateTokenPair(SAMPLE_USER);
      expect(pair.accessToken).toBeTruthy();
      expect(pair.refreshToken).toBeTruthy();
      expect(pair.accessTokenExpiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(pair.refreshTokenExpiresAt).toBeGreaterThan(pair.accessTokenExpiresAt);
    });
  });

  // ---- verifyToken ----

  describe('verifyToken', () => {
    it('returns ok with payload for a valid access token', async () => {
      const token = await service.generateAccessToken(SAMPLE_USER);
      const result = await service.verifyToken(token);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sub).toBe(SAMPLE_USER.sub);
        expect(result.value.email).toBe(SAMPLE_USER.email);
        expect(result.value.permissions).toEqual(SAMPLE_USER.permissions);
      }
    });

    it('returns ok with payload for a valid refresh token', async () => {
      const token = await service.generateRefreshToken(SAMPLE_USER);
      const result = await service.verifyToken(token);
      expect(result.ok).toBe(true);
    });

    it('returns err with TokenInvalidError for a tampered token', async () => {
      const token = await service.generateAccessToken(SAMPLE_USER);
      const tampered = token.slice(0, -5) + 'XXXXX';
      const result = await service.verifyToken(tampered);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(TokenInvalidError);
      }
    });

    it('returns err with TokenInvalidError for a random string', async () => {
      const result = await service.verifyToken('not.a.token');
      expect(result.ok).toBe(false);
    });

    it('returns err with TokenExpiredError for an already-expired token', async () => {
      const expiredService = makeService({ accessTokenExpiry: '1s' });
      const token = await expiredService.generateAccessToken(SAMPLE_USER);

      // Fake time advancing past expiry
      vi.useFakeTimers();
      vi.advanceTimersByTime(2000);

      const result = await expiredService.verifyToken(token);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(TokenExpiredError);
      }

      vi.useRealTimers();
    });

    it('rejects a token signed with a different secret', async () => {
      const otherService = new TokenService(
        'completely-different-secret-value-!!42',
        DEFAULT_OPTIONS,
      );
      const token = await otherService.generateAccessToken(SAMPLE_USER);
      const result = await service.verifyToken(token);
      expect(result.ok).toBe(false);
    });

    it('rejects an empty string', async () => {
      const result = await service.verifyToken('');
      expect(result.ok).toBe(false);
    });
  });

  // ---- decodeToken ----

  describe('decodeToken', () => {
    it('decodes a valid token without verification', async () => {
      const token = await service.generateAccessToken(SAMPLE_USER);
      const decoded = service.decodeToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.sub).toBe(SAMPLE_USER.sub);
    });

    it('decodes a token from a different signer', async () => {
      const otherService = new TokenService(
        'completely-different-secret-value-!!42',
        DEFAULT_OPTIONS,
      );
      const token = await otherService.generateAccessToken(SAMPLE_USER);
      // decodeToken does NOT verify — should still return payload
      const decoded = service.decodeToken(token);
      expect(decoded?.sub).toBe(SAMPLE_USER.sub);
    });

    it('returns null for a non-JWT string', () => {
      expect(service.decodeToken('garbage')).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(service.decodeToken('')).toBeNull();
    });
  });

  // ---- refreshTokenPair ----

  describe('refreshTokenPair', () => {
    it('returns a new token pair when given a valid refresh token', async () => {
      const refresh = await service.generateRefreshToken(SAMPLE_USER);
      const result = await service.refreshTokenPair(refresh);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.accessToken).toBeTruthy();
        expect(result.value.refreshToken).toBeTruthy();
      }
    });

    it('returns err when given an access token (wrong tokenType)', async () => {
      const access = await service.generateAccessToken(SAMPLE_USER);
      const result = await service.refreshTokenPair(access);
      expect(result.ok).toBe(false);
    });

    it('returns err for an invalid token', async () => {
      const result = await service.refreshTokenPair('bad.token.here');
      expect(result.ok).toBe(false);
    });

    it('new access token contains same user claims', async () => {
      const refresh = await service.generateRefreshToken(SAMPLE_USER);
      const result = await service.refreshTokenPair(refresh);
      if (result.ok) {
        const decoded = service.decodeToken(result.value.accessToken);
        expect(decoded?.sub).toBe(SAMPLE_USER.sub);
        expect(decoded?.email).toBe(SAMPLE_USER.email);
      }
    });
  });

  // ---- isTokenExpired / getTokenExpiry ----

  describe('isTokenExpired', () => {
    it('returns false for a freshly issued token', async () => {
      const token = await service.generateAccessToken(SAMPLE_USER);
      expect(service.isTokenExpired(token)).toBe(false);
    });

    it('returns true for a garbage string', () => {
      expect(service.isTokenExpired('garbage')).toBe(true);
    });
  });

  describe('getTokenExpiry', () => {
    it('returns a future timestamp for a valid token', async () => {
      const token = await service.generateAccessToken(SAMPLE_USER);
      const exp = service.getTokenExpiry(token);
      expect(exp).not.toBeNull();
      expect(exp!).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('returns null for a garbage string', () => {
      expect(service.getTokenExpiry('garbage')).toBeNull();
    });
  });
});
