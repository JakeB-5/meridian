import { describe, it, expect } from 'vitest';
import {
  isEmail,
  isUrl,
  isUUID,
  sanitizeHtml,
  isNonEmpty,
  isInRange,
  hasMinLength,
  hasMaxLength,
  isSlug,
} from './validation.js';

describe('isEmail', () => {
  it('returns true for valid emails', () => {
    expect(isEmail('user@example.com')).toBe(true);
    expect(isEmail('name.surname@domain.co')).toBe(true);
    expect(isEmail('user+tag@gmail.com')).toBe(true);
  });

  it('returns false for invalid emails', () => {
    expect(isEmail('')).toBe(false);
    expect(isEmail('not-an-email')).toBe(false);
    expect(isEmail('@domain.com')).toBe(false);
    expect(isEmail('user@')).toBe(false);
    expect(isEmail('user @domain.com')).toBe(false);
  });
});

describe('isUrl', () => {
  it('returns true for valid URLs', () => {
    expect(isUrl('https://example.com')).toBe(true);
    expect(isUrl('http://localhost:3000')).toBe(true);
    expect(isUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('returns false for invalid URLs', () => {
    expect(isUrl('')).toBe(false);
    expect(isUrl('not-a-url')).toBe(false);
    expect(isUrl('ftp://server.com')).toBe(false);
    expect(isUrl('//no-protocol.com')).toBe(false);
  });
});

describe('isUUID', () => {
  it('returns true for valid UUIDs', () => {
    expect(isUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
    expect(isUUID('F47AC10B-58CC-4372-A567-0E02B2C3D479')).toBe(true); // uppercase
  });

  it('returns false for invalid UUIDs', () => {
    expect(isUUID('')).toBe(false);
    expect(isUUID('not-a-uuid')).toBe(false);
    expect(isUUID('550e8400-e29b-41d4-a716')).toBe(false); // too short
    expect(isUUID('550e8400-e29b-61d4-a716-446655440000')).toBe(false); // version 6
  });
});

describe('sanitizeHtml', () => {
  it('escapes angle brackets', () => {
    expect(sanitizeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('escapes ampersand', () => {
    expect(sanitizeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes single quotes', () => {
    expect(sanitizeHtml("it's")).toBe('it&#x27;s');
  });

  it('handles strings without special characters', () => {
    expect(sanitizeHtml('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});

describe('isNonEmpty', () => {
  it('returns true for non-empty strings', () => {
    expect(isNonEmpty('hello')).toBe(true);
    expect(isNonEmpty(' hello ')).toBe(true);
  });

  it('returns false for empty or whitespace-only strings', () => {
    expect(isNonEmpty('')).toBe(false);
    expect(isNonEmpty('   ')).toBe(false);
    expect(isNonEmpty('\t\n')).toBe(false);
  });
});

describe('isInRange', () => {
  it('returns true for values within range', () => {
    expect(isInRange(5, 1, 10)).toBe(true);
    expect(isInRange(1, 1, 10)).toBe(true); // lower bound
    expect(isInRange(10, 1, 10)).toBe(true); // upper bound
  });

  it('returns false for values outside range', () => {
    expect(isInRange(0, 1, 10)).toBe(false);
    expect(isInRange(11, 1, 10)).toBe(false);
  });
});

describe('hasMinLength', () => {
  it('validates minimum length', () => {
    expect(hasMinLength('hello', 3)).toBe(true);
    expect(hasMinLength('hi', 3)).toBe(false);
    expect(hasMinLength('abc', 3)).toBe(true);
  });
});

describe('hasMaxLength', () => {
  it('validates maximum length', () => {
    expect(hasMaxLength('hi', 5)).toBe(true);
    expect(hasMaxLength('hello', 5)).toBe(true);
    expect(hasMaxLength('hello world', 5)).toBe(false);
  });
});

describe('isSlug', () => {
  it('returns true for valid slugs', () => {
    expect(isSlug('hello-world')).toBe(true);
    expect(isSlug('my-dashboard-123')).toBe(true);
    expect(isSlug('test')).toBe(true);
  });

  it('returns false for invalid slugs', () => {
    expect(isSlug('')).toBe(false);
    expect(isSlug('Hello-World')).toBe(false); // uppercase
    expect(isSlug('hello_world')).toBe(false); // underscore
    expect(isSlug('-hello')).toBe(false); // leading hyphen
    expect(isSlug('hello-')).toBe(false); // trailing hyphen
    expect(isSlug('hello--world')).toBe(false); // double hyphen
  });
});
