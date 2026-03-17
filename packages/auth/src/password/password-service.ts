import argon2 from 'argon2';

/** Result of a password strength validation check */
export interface ValidationResult {
  valid: boolean;
  violations: string[];
  score: number; // 0-4, where 4 is strongest
}

/** Configuration options for password hashing */
export interface PasswordHashOptions {
  /** Argon2 memory cost in KiB — default 65536 (64 MiB) */
  memoryCost?: number;
  /** Argon2 time cost (iterations) — default 3 */
  timeCost?: number;
  /** Argon2 parallelism factor — default 4 */
  parallelism?: number;
}

/** Strength requirements for passwords */
export interface PasswordStrengthConfig {
  /** Minimum character length — default 8 */
  minLength?: number;
  /** Require at least one uppercase letter — default true */
  requireUppercase?: boolean;
  /** Require at least one lowercase letter — default true */
  requireLowercase?: boolean;
  /** Require at least one digit — default true */
  requireDigit?: boolean;
  /** Require at least one special character — default false */
  requireSpecialChar?: boolean;
  /** List of forbidden passwords (e.g. 'password', '12345678') */
  forbiddenPasswords?: string[];
}

const DEFAULT_HASH_OPTIONS: Required<PasswordHashOptions> = {
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
};

const DEFAULT_STRENGTH_CONFIG: Required<PasswordStrengthConfig> = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecialChar: false,
  forbiddenPasswords: [
    'password',
    'password1',
    '12345678',
    '123456789',
    'qwerty123',
    'letmein1',
    'iloveyou',
    'admin123',
    'welcome1',
  ],
};

/**
 * Service for securely hashing and verifying passwords using Argon2id,
 * and validating password strength.
 */
export class PasswordService {
  private readonly hashOptions: Required<PasswordHashOptions>;
  private readonly strengthConfig: Required<PasswordStrengthConfig>;

  constructor(
    hashOptions: PasswordHashOptions = {},
    strengthConfig: PasswordStrengthConfig = {},
  ) {
    this.hashOptions = { ...DEFAULT_HASH_OPTIONS, ...hashOptions };
    this.strengthConfig = { ...DEFAULT_STRENGTH_CONFIG, ...strengthConfig };
  }

  /**
   * Hash a plain-text password using Argon2id.
   * The returned string includes the algorithm parameters and salt,
   * so it is self-contained and can be stored directly.
   */
  async hash(password: string): Promise<string> {
    if (!password) {
      throw new Error('Password must not be empty');
    }

    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.hashOptions.memoryCost,
      timeCost: this.hashOptions.timeCost,
      parallelism: this.hashOptions.parallelism,
    });
  }

  /**
   * Verify a plain-text password against a stored Argon2 hash.
   * Returns true if the password matches the hash, false otherwise.
   */
  async verify(password: string, hash: string): Promise<boolean> {
    if (!password || !hash) return false;
    try {
      return await argon2.verify(hash, password);
    } catch {
      // Malformed hash or other argon2 error — treat as mismatch
      return false;
    }
  }

  /**
   * Check whether argon2 recommends re-hashing (e.g., parameters have been upgraded).
   * Call this after a successful verify(); if true, re-hash and store the new hash.
   */
  needsRehash(hash: string): boolean {
    try {
      return argon2.needsRehash(hash, {
        memoryCost: this.hashOptions.memoryCost,
        timeCost: this.hashOptions.timeCost,
        parallelism: this.hashOptions.parallelism,
      });
    } catch {
      return false;
    }
  }

  /**
   * Validate the strength of a plain-text password.
   * Returns a ValidationResult with a list of violations and a strength score.
   */
  validateStrength(password: string): ValidationResult {
    const violations: string[] = [];
    const config = this.strengthConfig;

    if (!password) {
      return {
        valid: false,
        violations: ['Password must not be empty'],
        score: 0,
      };
    }

    // Length check
    if (password.length < config.minLength) {
      violations.push(`Password must be at least ${config.minLength} characters long`);
    }

    // Uppercase check
    if (config.requireUppercase && !/[A-Z]/.test(password)) {
      violations.push('Password must contain at least one uppercase letter');
    }

    // Lowercase check
    if (config.requireLowercase && !/[a-z]/.test(password)) {
      violations.push('Password must contain at least one lowercase letter');
    }

    // Digit check
    if (config.requireDigit && !/\d/.test(password)) {
      violations.push('Password must contain at least one number');
    }

    // Special character check
    if (config.requireSpecialChar && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      violations.push('Password must contain at least one special character');
    }

    // Forbidden password check
    if (config.forbiddenPasswords.includes(password.toLowerCase())) {
      violations.push('Password is too common — please choose a more unique password');
    }

    // Score calculation (0–4)
    const score = this.calculateScore(password, violations.length);

    return {
      valid: violations.length === 0,
      violations,
      score,
    };
  }

  /** Compute a rough 0–4 strength score independent of violations */
  private calculateScore(password: string, violationCount: number): number {
    if (violationCount > 0) return Math.max(0, 1 - Math.floor(violationCount / 2));

    let score = 0;

    // Length bonuses
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;

    // Character variety bonus
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

    const varietyCount = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;
    if (varietyCount >= 3) score++;

    return Math.min(4, score);
  }
}
