"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { isNativePlatform, getNativePlatform } from "@/lib/native/platform";
import { resolveDeepLinkPath } from "@/lib/native/deep-link-paths";
import { clientLogger } from "@/lib/logger.client";

/**
 * Mounted once, app-wide, in layout.tsx (same pattern as
 * ViewportHeightSync). Renders nothing — a no-op on every regular web
 * visit (isNativePlatform() is false, the whole effect body returns
 * immediately). Only does anything inside the Capacitor shell.
 *
 * WHY THIS FILE EXISTS: mobile-capacitor/ (the native-shell build harness)
 * used to contain its own push.ts / deep-link.ts, but in remote-URL mode
 * (capacitor.config.ts server.url) the WebView loads the deployed web app
 * directly — nothing under mobile-capacitor/ ever ships to a device. The
 * code that actually needs to call native plugins has to live HERE, in the
 * app that's actually running. See NATIVE_APP.md.
 *
 * Three responsibilities, each independent (one failing doesn't block the
 * others — a native shell with, say, push permission denied should still
 * get working deep links and a working back button):
 *   1. Push: register for native push, POST the token to the existing
 *      /api/push/register-device (unchanged — this route already existed
 *      and expects exactly this payload).
 *   2. Deep links: universal/app links opened while the app is already
 *      running (appUrlOpen) and notification taps, both resolved through
 *      the SAME allowlist as the manifest/AASA files (deep-link-paths.ts).
 *   3. Android hardware back button: without a listener, Capacitor's
 *      default is to exit the app from ANY screen at the root of history,
 *      which for a SPA with client-side routing means one back-tap from
 *      deep inside the app can unexpectedly kill it. Goes back through
 *      Next's router first; only exits when there's truly nowhere to go.
 */
export function NativeBridge() {
  const router = useRouter();
  const navigatedHistoryDepth = useRef(0);

  useEffect(() => {
    if (!isNativePlatform()) return;

    let cancelled = false;
    const cleanups: (() => void)[] = [];

    void (async () => {
      const [{ App }, { PushNotifications }, { StatusBar, Style }] = await Promise.all([
        import("@capacitor/app"),
        import("@capacitor/push-notifications"),
        import("@capacitor/status-bar"),
      ]);
      if (cancelled) return;

      // ── Status bar ────────────────────────────────────────────────────
      // Dark content color scheme (light icons) to match the app's dark
      // theme. Best-effort: some OEM Android skins reject style changes —
      // never block startup on this.
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});

      // ── Deep links ────────────────────────────────────────────────────
      // Fires for universal links / vantrix:// URIs opened while the app
      // is already running. The COLD-START case (app opened fresh from a
      // link) is handled server-side: Next.js renders whatever path the
      // WebView requested directly, same as any other server-rendered
      // route — there's nothing extra to do for that case here.
      const urlOpenHandle = await App.addListener("appUrlOpen", ({ url }) => {
        const target = resolveDeepLinkPath(url);
        if (target) {
          navigatedHistoryDepth.current += 1;
          router.push(target);
        } else {
          clientLogger.warn("native-bridge: deep link outside allowlist, ignoring", { url });
        }
      });
      cleanups.push(() => void urlOpenHandle.remove());

      // ── Android hardware back button ─────────────────────────────────
      const backHandle = await App.addListener("backButton", () => {
        if (navigatedHistoryDepth.current > 0 || window.history.length > 1) {
          navigatedHistoryDepth.current = Math.max(0, navigatedHistoryDepth.current - 1);
          router.back();
        } else {
          App.exitApp();
        }
      });
      cleanups.push(() => void backHandle.remove());

      // ── Push registration ─────────────────────────────────────────────
      // Only ask if permission is already granted or not yet decided.
      // Never re-prompt someone who explicitly said no — that's an iOS App
      // Store review flag (4.5.4-adjacent: re-prompting after denial) as
      // well as just bad UX.
      const platform = getNativePlatform();
      if (platform !== "ios" && platform !== "android") return;

      try {
        const current = await PushNotifications.checkPermissions();
        let receive = current.receive;
        if (receive === "prompt" || receive === "prompt-with-rationale") {
          receive = (await PushNotifications.requestPermissions()).receive;
        }
        if (receive !== "granted") return;

        const regHandle = await PushNotifications.addListener("registration", (token) => {
          void fetch("/api/push/register-device", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include", // WebView shares the vantrix.ink session cookie
            body: JSON.stringify({
              token: token.value,
              platform,
              appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
            }),
          }).catch((err) => clientLogger.warn("native-bridge: register-device failed", { error: String(err) }));
        });
        cleanups.push(() => void regHandle.remove());

        const regErrHandle = await PushNotifications.addListener("registrationError", (err) => {
          clientLogger.warn("native-bridge: push registration error", { error: String(err) });
        });
        cleanups.push(() => void regErrHandle.remove());

        // A tapped notification either cold-starts the app (nothing to do,
        // same reasoning as appUrlOpen above) or arrives here if the app
        // was already running/backgrounded.
        const actionHandle = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            const deepLink = action.notification.data?.url as string | undefined;
            const target = deepLink ? resolveDeepLinkPath(deepLink) : null;
            if (target) {
              navigatedHistoryDepth.current += 1;
              router.push(target);
            }
          },
        );
        cleanups.push(() => void actionHandle.remove());

        await PushNotifications.register();
      } catch (err) {
        // Push is additive — a failure here must never break the rest of
        // the native shell (deep links, back button already wired above).
        clientLogger.warn("native-bridge: push setup failed", { error: String(err) });
      }
    })();

    return () => {
      cancelled = true;
      for (const cleanup of cleanups) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router identity is stable from next/navigation; re-running this on every render would re-register listeners
  }, []);

  return null;
}

/**
 * Call from the sign-out flow (in the native shell only — no-ops on web)
 * so a shared/reset device stops receiving that user's pushes immediately
 * rather than waiting for a delivery failure to mark the token invalid.
 * Not wired in automatically: hook this into wherever sign-out currently
 * lives, passing the token this device registered with (PushNotifications'
 * "registration" event fires again on next launch if it's needed again).
 */
export async function unregisterNativePush(token: string): Promise<void> {
  if (!isNativePlatform()) return;
  await fetch("/api/push/unregister-device", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ token }),
  }).catch(() => {});
}
