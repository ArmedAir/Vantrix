"use client";

import { useEffect, useState, useCallback } from "react";

const DISMISS_KEY = "vantrix-install-prompt-dismissed-at";
// Re-offer after this long if the person dismissed but never installed —
// long enough not to nag every session, short enough to catch people who
// dismissed once out of reflex on their first visit.
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's own flag — display-mode media query support for
    // standalone detection is inconsistent pre-iOS 16.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

function recentlyDismissed(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (Number.isNaN(dismissedAt)) return false;
  return Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
}

export type InstallPromptKind = "native" | "ios-manual" | null;

/**
 * Drives the install banner. Three outcomes:
 *  - "native": a real `beforeinstallprompt` event is in hand (Chrome,
 *    Edge, most Android browsers, desktop Chrome/Edge) — the banner's
 *    button can call `promptInstall()` directly.
 *  - "ios-manual": Safari on iOS never fires `beforeinstallprompt` at
 *    all, so this is the only signal iOS gets; the banner shows
 *    Share → Add to Home Screen instructions instead of a button.
 *  - null: already installed, already dismissed recently, or a browser
 *    (e.g. Firefox desktop) that supports neither path — render nothing.
 */
export function useInstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [kind, setKind] = useState<InstallPromptKind>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    if (isIOS()) {
      setKind("ios-manual");
      setVisible(true);
      return;
    }

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredEvent(event as BeforeInstallPromptEvent);
      setKind("native");
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // If the app gets installed via the browser's own UI (not our
    // banner) mid-session, stop showing the banner immediately.
    const installedHandler = () => setVisible(false);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredEvent) return;
    await deferredEvent.prompt();
    const { outcome } = await deferredEvent.userChoice;
    setDeferredEvent(null);
    setVisible(false);
    if (outcome === "dismissed") {
      // Treat an explicit "no" the same as dismissing our banner —
      // don't re-offer for the full cooldown.
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
  }, [deferredEvent]);

  return { kind, visible, dismiss, promptInstall };
}
