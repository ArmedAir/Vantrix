/**
 * Thin, SSR-safe wrapper around Capacitor's platform detection. The actual
 * @capacitor/core import is safe on a normal web visit too (Capacitor's
 * "web" platform target is a real, supported no-op-by-default
 * implementation, not native-only) — the guard here is about not touching
 * `window` during server rendering, not about avoiding the import.
 *
 * Mirrors public/boot-init.js's nativeShell check (kept in sync by hand —
 * that file is a plain pre-hydration script and can't import this).
 */
export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

/** 'ios' | 'android' | 'web' — 'web' includes SSR (server has no window). */
export function getNativePlatform(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web';
  const p = window.Capacitor?.getPlatform?.();
  return p === 'ios' || p === 'android' ? p : 'web';
}

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
  }
}
