import { NextResponse } from "next/server";
import { EXACT_PATHS, PATH_PREFIXES } from "@/lib/native/deep-link-paths";

/**
 * Apple Universal Links association file. Must be served at exactly
 * https://vantrix.app/.well-known/apple-app-site-association with
 * Content-Type: application/json and NO file extension (iOS fetches this
 * path literally, ignores redirects, and requires HTTPS — this is why it's
 * a route handler and not a static file in /public, where Next/Vercel
 * would otherwise guess a generic content-type for an extensionless file).
 *
 * appID = "<Apple Team ID>.<bundle identifier>". The bundle identifier
 * must match desktop/src-tauri/tauri.ios.conf.json's `identifier`
 * (app.vantrix.mobile). Replace TEAMID once the Apple Developer Program
 * enrollment is complete — this file is inert (matches nothing) until then.
 */
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID ?? "TEAMID";
const IOS_BUNDLE_ID = "app.vantrix.mobile";
const APP_ID = `${APPLE_TEAM_ID}.${IOS_BUNDLE_ID}`;

export function GET() {
  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appID: APP_ID,
          appIDs: [APP_ID],
          // Built from src/lib/native/deep-link-paths.ts — the single
          // source of truth shared with the Android manifest and the
          // client-side resolver. An explicit allowlist (vs. "*" with
          // excludes) avoids accidentally deep-linking marketing/admin/api
          // routes that were never designed to be opened from a cold
          // app launch.
          paths: [
            ...EXACT_PATHS,
            ...PATH_PREFIXES.map((prefix) => `${prefix}*`),
          ],
        },
      ],
    },
    // Shared-webcredentials optional — omitted since Vantrix uses its own
    // Supabase-backed auth, not the iOS system password manager.
    webcredentials: {
      apps: [APP_ID],
    },
  };

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      // Apple caches this aggressively client-side already; keep server
      // caching short so a bundle-ID/team-ID fix propagates quickly.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
