import { initDeepLinkHandler } from './deep-link';
import { initNativePush } from './push';

/**
 * Single entry point for the Capacitor native shell. Call this once,
 * as early as possible after the webview boots (e.g. from the generated
 * `android/app/src/main/assets/public/index.html` bootstrap script, or
 * wherever `npx cap add` places the native project's web entry).
 *
 * Deep links and push are two separate delivery paths into the same
 * "navigate the existing webview" mechanism — a cold-start universal
 * link (deep-link.ts) and a tapped push notification (push.ts) both end
 * at `window.location.href = <path>`. Initializing them together here
 * keeps that symmetry visible instead of scattering two independent
 * bootstrap calls across the native project.
 */
export function initNativeShell(): void {
  initDeepLinkHandler();
  initNativePush().catch((err) => {
    console.warn('push: init failed', err);
  });
}

export { initDeepLinkHandler } from './deep-link';
export { initNativePush } from './push';
