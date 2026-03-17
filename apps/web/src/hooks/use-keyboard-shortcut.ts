import { useEffect, useCallback, useRef } from 'react';

interface ShortcutOptions {
  /** Whether the shortcut should work when focused on an input/textarea */
  enableOnInputs?: boolean;
  /** Whether to prevent the default browser behavior */
  preventDefault?: boolean;
  /** Whether to stop event propagation */
  stopPropagation?: boolean;
}

type ModifierKey = 'ctrl' | 'meta' | 'alt' | 'shift';

interface ParsedShortcut {
  key: string;
  modifiers: Set<ModifierKey>;
}

function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.toLowerCase().split('+').map((s) => s.trim());
  const modifiers = new Set<ModifierKey>();
  let key = '';

  for (const part of parts) {
    switch (part) {
      case 'ctrl':
      case 'control':
        modifiers.add('ctrl');
        break;
      case 'meta':
      case 'cmd':
      case 'command':
        modifiers.add('meta');
        break;
      case 'alt':
      case 'option':
        modifiers.add('alt');
        break;
      case 'shift':
        modifiers.add('shift');
        break;
      default:
        key = part;
    }
  }

  return { key, modifiers };
}

function matchesShortcut(event: KeyboardEvent, parsed: ParsedShortcut): boolean {
  if (event.key.toLowerCase() !== parsed.key) return false;
  if (parsed.modifiers.has('ctrl') && !event.ctrlKey) return false;
  if (parsed.modifiers.has('meta') && !event.metaKey) return false;
  if (parsed.modifiers.has('alt') && !event.altKey) return false;
  if (parsed.modifiers.has('shift') && !event.shiftKey) return false;

  // Ensure no extra modifiers are pressed
  if (!parsed.modifiers.has('ctrl') && event.ctrlKey) return false;
  if (!parsed.modifiers.has('meta') && event.metaKey) return false;
  if (!parsed.modifiers.has('alt') && event.altKey) return false;
  if (!parsed.modifiers.has('shift') && event.shiftKey) return false;

  return true;
}

/**
 * Register a keyboard shortcut.
 *
 * @param shortcut - Key combination string, e.g. "ctrl+k", "meta+shift+p", "escape"
 * @param callback - Function to call when the shortcut is pressed
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * useKeyboardShortcut('ctrl+k', () => openSearch());
 * useKeyboardShortcut('escape', () => closeModal());
 * useKeyboardShortcut('meta+s', () => save(), { preventDefault: true });
 * ```
 */
export function useKeyboardShortcut(
  shortcut: string,
  callback: () => void,
  options: ShortcutOptions = {},
): void {
  const {
    enableOnInputs = false,
    preventDefault = true,
    stopPropagation = false,
  } = options;

  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const parsedRef = useRef(parseShortcut(shortcut));

  useEffect(() => {
    parsedRef.current = parseShortcut(shortcut);
  }, [shortcut]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Skip if focused on input and not enabled
      if (!enableOnInputs) {
        const target = event.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }

      if (matchesShortcut(event, parsedRef.current)) {
        if (preventDefault) event.preventDefault();
        if (stopPropagation) event.stopPropagation();
        callbackRef.current();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enableOnInputs, preventDefault, stopPropagation]);
}

/**
 * Register multiple keyboard shortcuts at once.
 */
export function useKeyboardShortcuts(
  shortcuts: Array<{
    shortcut: string;
    callback: () => void;
    options?: ShortcutOptions;
  }>,
): void {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      for (const { shortcut, callback, options = {} } of shortcutsRef.current) {
        const parsed = parseShortcut(shortcut);

        // Skip if focused on input and not enabled
        if (!options.enableOnInputs) {
          const target = event.target as HTMLElement;
          if (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable
          ) {
            continue;
          }
        }

        if (matchesShortcut(event, parsed)) {
          if (options.preventDefault !== false) event.preventDefault();
          if (options.stopPropagation) event.stopPropagation();
          callback();
          return; // Only fire first matching shortcut
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}
