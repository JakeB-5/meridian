import { describe, it, expect } from 'vitest';
import {
  slugify,
  truncate,
  capitalize,
  camelToSnake,
  snakeToCamel,
  generateId,
  generateShortId,
  hashString,
  toTitleCase,
  normalizeWhitespace,
} from './string.js';

describe('slugify', () => {
  it('converts basic string to slug', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
  });

  it('replaces multiple spaces and underscores', () => {
    expect(slugify('hello   world__test')).toBe('hello-world-test');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('  --hello--  ')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('converts uppercase to lowercase', () => {
    expect(slugify('MY DASHBOARD')).toBe('my-dashboard');
  });
});

describe('truncate', () => {
  it('returns original if within limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates with default suffix', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('truncates with custom suffix', () => {
    expect(truncate('hello world', 7, '~')).toBe('hello ~');
  });

  it('handles exact length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});

describe('capitalize', () => {
  it('capitalizes first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('returns empty string unchanged', () => {
    expect(capitalize('')).toBe('');
  });

  it('does not change already capitalized', () => {
    expect(capitalize('Hello')).toBe('Hello');
  });
});

describe('camelToSnake', () => {
  it('converts camelCase to snake_case', () => {
    expect(camelToSnake('helloWorld')).toBe('hello_world');
  });

  it('handles multiple uppercase letters', () => {
    expect(camelToSnake('myHTTPClient')).toBe('my_h_t_t_p_client');
  });

  it('handles single word', () => {
    expect(camelToSnake('hello')).toBe('hello');
  });

  it('does not add leading underscore', () => {
    expect(camelToSnake('HelloWorld')).toBe('hello_world');
  });
});

describe('snakeToCamel', () => {
  it('converts snake_case to camelCase', () => {
    expect(snakeToCamel('hello_world')).toBe('helloWorld');
  });

  it('handles multiple underscores', () => {
    expect(snakeToCamel('my_long_variable_name')).toBe('myLongVariableName');
  });

  it('handles single word', () => {
    expect(snakeToCamel('hello')).toBe('hello');
  });
});

describe('generateId', () => {
  it('generates a 21-character ID by default', () => {
    const id = generateId();
    expect(id).toHaveLength(21);
    expect(typeof id).toBe('string');
  });

  it('generates a custom-length ID', () => {
    const id = generateId(10);
    expect(id).toHaveLength(10);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe('generateShortId', () => {
  it('generates a 12-character ID', () => {
    const id = generateShortId();
    expect(id).toHaveLength(12);
  });
});

describe('hashString', () => {
  it('returns consistent hash for same input', () => {
    const h1 = hashString('test input');
    const h2 = hashString('test input');
    expect(h1).toBe(h2);
  });

  it('returns different hashes for different inputs', () => {
    const h1 = hashString('input A');
    const h2 = hashString('input B');
    expect(h1).not.toBe(h2);
  });

  it('returns an 8-character hex string', () => {
    const hash = hashString('anything');
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('handles empty string', () => {
    const hash = hashString('');
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('toTitleCase', () => {
  it('converts to title case', () => {
    expect(toTitleCase('hello world')).toBe('Hello World');
  });

  it('handles mixed case', () => {
    expect(toTitleCase('hELLO wORLD')).toBe('Hello World');
  });

  it('handles single word', () => {
    expect(toTitleCase('hello')).toBe('Hello');
  });
});

describe('normalizeWhitespace', () => {
  it('collapses multiple spaces', () => {
    expect(normalizeWhitespace('hello   world')).toBe('hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeWhitespace('  hello  ')).toBe('hello');
  });

  it('handles tabs and newlines', () => {
    expect(normalizeWhitespace("hello\t\nworld")).toBe('hello world');
  });
});
