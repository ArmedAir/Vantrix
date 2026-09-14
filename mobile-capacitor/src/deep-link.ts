import { App, type URLOpenListenerEvent } from '@capacitor/app';

/**
 * Mirrors the Tauri deep-link handler in desktop/src-tauri/src/lib.rs:
 * the whole app is a webview around vantrix.app, so "handling" a deep
 * link is just navigating to the URL that was opened. Call this once
 * from the native shell's bootstrap (not from within the Next.js app
 * itself — this only exists inside the Capacitor-wrapped webview).
 *
 * Covers:
 *  - universal/app links: https://vantrix.app/chat/123
 *  - custom scheme:        vantrix://chat/123
 *  - a notification tap forwarding a ctaUrl (see NATIVE_APP.md push bridge)
 */
export function initDeepLinkHandler() {
  App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
    const url = new URL(event.url);
    // Custom-scheme links (vantrix://chat/123) parse with host="chat",
    // pathname="/123" — reassemble into a normal site path. Universal
    // links (https://vantrix.app/chat/123) already have the right
    // pathname and just pass through.
    const path = url.protocol === 'vantrix:'
      ? `/${url.host}${url.pathname}${url.search}`
      : `${url.pathname}${url.search}`;

    window.location.href = path;
  });
}
