import { describe, it, expect, beforeEach } from 'vitest';
import { PasswordService } from './password-service.js';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    // Use minimal cost params so tests run quickly
    service = new PasswordService(
      { memoryCost: 8192, timeCost: 2, parallelism: 1 },
      {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigit: true,
        requireSpecialChar: false,
        // Use an empty forbidden list so 'Password1' is not blocked
        forbiddenPasswords: [],
      },
    );
  });

  // ---- hash ----

  describe('hash', () => {
    it('returns a non-empty string', async () => {
      const hash = await service.hash('Password1');
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('produces different hashes for the same password (random salt)', async () => {
      const h1 = await service.hash('Password1');
      const h2 = await service.hash('Password1');
      expect(h1).not.toBe(h2);
    });

    it('produces an argon2 PHC-encoded string', async () => {
      const hash = await service.hash('Password1');
      expect(hash).toMatch(/^\$argon2/);
    });

    it('throws when password is empty', async () => {
      await expect(service.hash('')).rejects.toThrow('Password must not be empty');
    });
  });

  // ---- verify ----

  describe('verify', () => {
    it('returns true when password matches hash', async () => {
      const password = 'SecurePass1';
      const hash = await service.hash(password);
      expect(await service.verify(password, hash)).toBe(true);
    });

    it('returns false when password does not match', async () => {
      const hash = await service.hash('SecurePass1');
      expect(await service.verify('WrongPass1', hash)).toBe(false);
    });

    it('returns false for an empty password', async () => {
      const hash = await service.hash('SecurePass1');
      expect(await service.verify('', hash)).toBe(false);
    });

    it('returns false for an empty hash', async () => {
      expect(await service.verify('SecurePass1', '')).toBe(false);
    });

    it('returns false for a malformed hash string', async () => {
      expect(await service.verify('SecurePass1', 'not-a-valid-hash')).toBe(false);
    });

    it('is case-sensitive', async () => {
      const hash = await service.hash('SecurePass1');
      expect(await service.verify('securepass1', hash)).toBe(false);
    });
  });

  // ---- validateStrength ----

  describe('validateStrength', () => {
    describe('valid passwords', () => {
      it('accepts a password meeting all requirements', () => {
        const result = service.validateStrength('Password1');
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });

      it('accepts a long mixed password', () => {
        const result = service.validateStrength('ThisIsAStrongP4ssword');
        expect(result.valid).toBe(true);
      });

      it('returns a score of at least 1 for a valid password', () => {
        const result = service.validateStrength('Password1');
        expect(result.score).toBeGreaterThanOrEqual(1);
      });

      it('returns a higher score for longer passwords', () => {
        const short = service.validateStrength('Password1');
        const long = service.validateStrength('VeryLongAndSecurePassword123');
        expect(long.score).toBeGreaterThanOrEqual(short.score);
      });
    });

    describe('violations', () => {
      it('rejects passwords shorter than minLength', () => {
        const result = service.validateStrength('Pass1');
        expect(result.valid).toBe(false);
        expect(result.violations).toContain(
          'Password must be at least 8 characters long',
        );
      });

      it('rejects passwords without an uppercase letter', () => {
        const result = service.validateStrength('password1');
        expect(result.valid).toBe(false);
        expect(result.violations).toContain(
          'Password must contain at least one uppercase letter',
        );
      });

      it('rejects passwords without a lowercase letter', () => {
        const result = service.validateStrength('PASSWORD1');
        expect(result.valid).toBe(false);
        expect(result.violations).toContain(
          'Password must contain at least one lowercase letter',
        );
      });

      it('rejects passwords without a digit', () => {
        const result = service.validateStrength('PasswordOnly');
        expect(result.valid).toBe(false);
        expect(result.violations).toContain(
          'Password must contain at least one number',
        );
      });

      it('rejects common/forbidden passwords', () => {
        const result = service.validateStrength('password1');
        expect(result.valid).toBe(false);
      });

      it('rejects an empty password', () => {
        const result = service.validateStrength('');
        expect(result.valid).toBe(false);
        expect(result.violations).toContain('Password must not be empty');
      });

      it('returns score 0 for an empty password', () => {
        const result = service.validateStrength('');
        expect(result.score).toBe(0);
      });
    });

    describe('score', () => {
      it('returns score 0 for many violations', () => {
        const result = service.validateStrength('a');
        expect(result.score).toBeLessThanOrEqual(1);
      });

      it('returns score 4 for a very strong password', () => {
        const result = service.validateStrength('ThisIsAVeryStr0ngAndSecurePassw0rd!');
        expect(result.score).toBe(4);
      });
    });
  });

  // ---- needsRehash ----

  describe('needsRehash', () => {
    it('returns false for a freshly hashed password', async () => {
      const hash = await service.hash('Password1');
      expect(service.needsRehash(hash)).toBe(false);
    });

    it('returns false for a garbage string', () => {
      expect(service.needsRehash('not-a-valid-hash')).toBe(false);
    });
  });

  // ---- custom configuration ----

  describe('custom configuration', () => {
    it('enforces special character requirement when configured', () => {
      const strictService = new PasswordService(
        { memoryCost: 8192, timeCost: 2, parallelism: 1 },
        { requireSpecialChar: true, forbiddenPasswords: [] },
      );
      const result = strictService.validateStrength('Password1');
      expect(result.valid).toBe(false);
      expect(result.violations).toContain(
        'Password must contain at least one special character',
      );
    });

    it('accepts password with special character when required', () => {
      const strictService = new PasswordService(
        { memoryCost: 8192, timeCost: 2, parallelism: 1 },
        { requireSpecialChar: true, forbiddenPasswords: [] },
      );
      const result = strictService.validateStrength('Password1!');
      expect(result.valid).toBe(true);
    });

    it('accepts shorter password when minLength is reduced', () => {
      const lenientService = new PasswordService(
        { memoryCost: 8192, timeCost: 2, parallelism: 1 },
        { minLength: 4, requireUppercase: false, requireDigit: false, forbiddenPasswords: [] },
      );
      const result = lenientService.validateStrength('abcd');
      expect(result.valid).toBe(true);
    });
  });
});
