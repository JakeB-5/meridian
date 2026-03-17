import '@testing-library/jest-dom/vitest';

// jsdom does not implement scrollIntoView
if (typeof window !== 'undefined') {
  Element.prototype.scrollIntoView = function () {};
}
