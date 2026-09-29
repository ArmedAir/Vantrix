/**
 * Canonical allowlist of paths the native shells (iOS Universal Links,
 * Android App Links, and the client-side push/vantrix:// deep-link
 * resolver) will open INSIDE the app rather than falling through to a
 * regular browser tab or being ignored.
 *
 * Deliberately an allowlist, not "everything except auth/admin/api": a
 * cold app launch skips all the normal page-to-page context a browser tab
 * has (referrer, scroll position, an existing session already loaded), so
 * only routes that make sense as a *first* screen belong here. Auth,
 * checkout, admin, and API routes were never designed for that.
 *
 * SINGLE SOURCE OF TRUTH:
 *   - iOS: src/app/.well-known/apple-app-site-association/route.ts
 *     imports EXACT_PATHS/PATH_PREFIXES directly, so it cannot drift.
 *   - Android: mobile-capacitor/android/app/src/main/AndroidManifest.xml's
 *     <intent-filter android:autoVerify="true"> is a static XML file and
 *     can't import this, so it's hand-kept in sync and CHECKED by
 *     src/__tests__/arch-native-deep-links.test.ts, which fails the build
 *     if the two ever disagree.
 *   - Client: resolveDeepLinkPath() below (used by native-bridge.tsx for
 *     both universal links opened while the app is already running AND
 *     the custom vantrix:// scheme) applies the same two lists.
 *
 * Adding a path: add it here, add the matching <data> line to the Android
 * manifest, and the arch test will tell you if you missed one or the
 * other. Do NOT add it in only one place.
 */

/** Exact paths (no trailing segment). */
export const EXACT_PATHS = [
  '/chats',
  '/dating',
  '/feed',
  '/notifications',
  '/profile',
  '/premium',
  '/world',
] as const;

/** Prefixes — anything starting with these opens in-app. */
export const PATH_PREFIXES = [
  '/chat/',
  '/characters/',
  '/community/',
  '/dating/',
  '/notifications/',
  '/profile/',
  '/r/',
  '/roleplay/',
  '/share/',
  '/world/',
] as const;

/**
 * Resolves an arbitrary incoming URL/path (from a push notification's deep
 * link, a universal/app link, or a vantrix:// URI) to an in-app path, or
 * null if it isn't on the allowlist — callers should fall back to opening
 * the system browser (or just the home screen) rather than navigating the
 * WebView to an unvetted path.
 *
 * Accepts a bare path ("/chat/123"), a full https URL, or a vantrix://
 * custom-scheme URL, all normalised the same way. Query strings and
 * fragments are preserved and re-attached to the resolved path so e.g. a
 * notification deep link's tracking params survive.
 */
export function resolveDeepLinkPath(input: string): string | null {
  let path: string;
  let search = '';
  let hash = '';

  try {
    // vantrix://chat/123 — URL treats "chat" as the host, not the path, so
    // rewrite the scheme to a throwaway https URL first to parse it the
    // same way as a universal link.
    const normalized = input.startsWith('vantrix://')
      ? 'https://vantrix.ink/' + input.slice('vantrix://'.length)
      : input;
    const url = new URL(normalized, 'https://vantrix.ink');
    path = url.pathname;
    search = url.search;
    hash = url.hash;
  } catch {
    // Not a parseable URL — treat the raw input as a bare path.
    path = input.startsWith('/') ? input : `/${input}`;
  }

  const isAllowed =
    (EXACT_PATHS as readonly string[]).includes(path) ||
    PATH_PREFIXES.some((prefix) => path.startsWith(prefix));

  return isAllowed ? `${path}${search}${hash}` : null;
}
