import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../app.js';
import { createTestContainer, type ServiceContainer } from '../services/container.js';

// ── Test Setup ──────────────────────────────────────────────────────

let app: FastifyInstance;
let container: ServiceContainer;

beforeAll(async () => {
  container = await createTestContainer();
  const result = await createApp({
    config: container.config,
    container,
    skipRateLimit: true,
    skipWebSocket: true,
  });
  app = result.app;
});

afterAll(async () => {
  await app.close();
});

// ── Helper ──────────────────────────────────────────────────────────

const testUser = {
  email: 'test@meridian.dev',
  name: 'Test User',
  password: 'SecurePassword123',
};

async function registerUser(userData = testUser) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: userData,
  });
}

async function loginUser(email = testUser.email, password = testUser.password) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Auth Routes', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user and return tokens', async () => {
      const response = await registerUser({
        email: 'register-test@meridian.dev',
        name: 'Register Test',
        password: 'SecurePassword123',
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.payload);
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.accessTokenExpiresAt).toBeDefined();
      expect(body.refreshTokenExpiresAt).toBeDefined();
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe('register-test@meridian.dev');
      expect(body.user.name).toBe('Register Test');
      expect(body.user.role).toBe('Admin');
    });

    it('should reject registration with weak password', async () => {
      const response = await registerUser({
        email: 'weak@meridian.dev',
        name: 'Weak Password',
        password: 'short',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject registration with invalid email', async () => {
      const response = await registerUser({
        email: 'not-an-email',
        name: 'Bad Email',
        password: 'SecurePassword123',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject registration with empty name', async () => {
      const response = await registerUser({
        email: 'noname@meridian.dev',
        name: '',
        password: 'SecurePassword123',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject duplicate registration', async () => {
      const email = 'duplicate@meridian.dev';

      await registerUser({
        email,
        name: 'First',
        password: 'SecurePassword123',
      });

      const response = await registerUser({
        email,
        name: 'Second',
        password: 'SecurePassword123',
      });

      expect(response.statusCode).toBe(409);
    });

    it('should create organization with custom name', async () => {
      const response = await registerUser({
        email: 'orgtest@meridian.dev',
        name: 'Org Test',
        password: 'SecurePassword123',
        organizationName: 'My Org',
      } as any);

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.user.organizationId).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await registerUser({
        email: 'login-test@meridian.dev',
        name: 'Login Test',
        password: 'SecurePassword123',
      });
    });

    it('should login with valid credentials', async () => {
      const response = await loginUser('login-test@meridian.dev', 'SecurePassword123');

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.user.email).toBe('login-test@meridian.dev');
    });

    it('should reject login with wrong password', async () => {
      const response = await loginUser('login-test@meridian.dev', 'WrongPassword123');

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('ERR_AUTHENTICATION');
    });

    it('should reject login with non-existent email', async () => {
      const response = await loginUser('nonexistent@meridian.dev', 'SecurePassword123');

      expect(response.statusCode).toBe(401);
    });

    it('should reject login with empty password', async () => {
      const response = await loginUser('login-test@meridian.dev', '');

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh tokens with valid refresh token', async () => {
      const registerResponse = await registerUser({
        email: 'refresh-test@meridian.dev',
        name: 'Refresh Test',
        password: 'SecurePassword123',
      });

      const registerBody = JSON.parse(registerResponse.payload);
      const refreshToken = registerBody.refreshToken;

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
    });

    it('should reject refresh with invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: 'invalid-token' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject refresh with empty token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: '' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const registerResponse = await registerUser({
        email: 'logout-test@meridian.dev',
        name: 'Logout Test',
        password: 'SecurePassword123',
      });

      const body = JSON.parse(registerResponse.payload);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { authorization: `Bearer ${body.accessToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(200);

      const logoutBody = JSON.parse(response.payload);
      expect(logoutBody.message).toBe('Logged out successfully');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user profile', async () => {
      const registerResponse = await registerUser({
        email: 'me-test@meridian.dev',
        name: 'Me Test',
        password: 'SecurePassword123',
      });

      const registerBody = JSON.parse(registerResponse.payload);

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Bearer ${registerBody.accessToken}` },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.email).toBe('me-test@meridian.dev');
      expect(body.name).toBe('Me Test');
      expect(body.role).toBeDefined();
      expect(body.role.permissions).toBeDefined();
      expect(body.organizationId).toBeDefined();
    });

    it('should reject without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject with invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: 'Bearer invalid-token-here' },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
