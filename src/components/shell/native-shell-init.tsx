"use client";

import { useEffect } from "react";

/**
 * Boots the Capacitor native bridge (push registration + deep-link
 * handling — see mobile-capacitor/src/index.ts) when this build of the app
 * is running inside the Android/iOS shell instead of a normal browser tab.
 *
 * Same reasoning and shape as ServiceWorkerRegister right next to it in
 * layout.tsx: only the browser half of a server layout, renders nothing.
 * initNativeShell() itself already no-ops on the web (Capacitor.isNative
 * Platform() is false there), so this is safe to mount unconditionally
 * rather than needing its own "are we native" check here too.
 *
 * Dynamically imported so `@capacitor/*` (native-only packages) never end
 * up in the web bundle that every non-native visitor downloads.
 */
export function NativeShellInit() {
  useEffect(() => {
    import("vantrix-mobile-capacitor")
      .then((mod) => mod.initNativeShell())
      .catch(() => {
        // Swallowed — see ServiceWorkerRegister's header for why a failed
        // optional-enhancement shouldn't surface to the visitor.
      });
  }, []);

  return null;
}
