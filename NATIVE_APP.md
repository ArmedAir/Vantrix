# Vantrix — Native App Build Plan (Desktop → Tauri Mobile → Capacitor Mobile)

All three targets are thin native shells around the deployed web app
(`https://vantrix.app`) — no UI is duplicated. This keeps every future
Vantrix feature shipping to native automatically with zero extra app-store
release work.

## What's in this repo now
- `desktop/` — Tauri 2 project, now shared between **desktop** and
  **mobile** builds via `src-tauri/src/lib.rs`.
  - `tauri.conf.json` — base config (window, icons, updater, deep-link).
  - `tauri.android.conf.json` / `tauri.ios.conf.json` — per-platform
    overrides merged in automatically by the Tauri CLI.
  - `capabilities/default.json` — permission grants (notifications, deep
    links) for desktop + mobile.
  - Plugins wired: notifications, deep-link (`vantrix://`,
    `https://vantrix.app/app/*`), auto-updater + single-instance (desktop
    only).
- `mobile-capacitor/` — alternate mobile path using Capacitor instead of
  Tauri (bigger plugin ecosystem, easier FCM/APNs push setup if you'd
  rather not touch Rust).

## Phase 1 — Desktop (Tauri) — ship this first
```bash
cd desktop
npm install
npm run build        # -> src-tauri/target/release/bundle/{dmg,msi,deb,AppImage}
```
Requires the Rust toolchain locally. Before the first real release:
1. Run `npm run tauri icon ../public/icons/icon-512.png` to regen all
   platform icon sizes from the existing PWA icon.
2. Generate an updater keypair (`tauri signer generate`) and drop the
   public key into `tauri.conf.json` → `plugins.updater.pubkey`; keep the
   private key as a GitHub Actions secret for signing releases.
3. Code-sign: Apple Developer ID cert for macOS notarization, Windows
   Authenticode cert for `.msi` (unsigned builds trigger SmartScreen/
   Gatekeeper warnings).

## Phase 2 — Mobile via Tauri 2.0 (reuses the same Rust project)
Needs Android Studio + NDK (Android) and Xcode (iOS/macOS only) installed
locally — not available in this sandbox, so run these on your machine:
```bash
cd desktop
npm run android:init   # generates src-tauri/gen/android (one-time)
npm run android:dev    # live-reload on emulator/device
npm run android:build  # -> signed-ready .apk / .aab

npm run ios:init       # generates src-tauri/gen/ios (macOS only)
npm run ios:dev
npm run ios:build
```
The generated `gen/android` and `gen/ios` folders are the actual native
Android Studio / Xcode projects — commit them once generated so CI can
build without re-running `init`.

## Phase 3 — Mobile via Capacitor (alternate/parallel path)
```bash
cd mobile-capacitor
npm install
npx cap add android
npx cap add ios       # macOS only
npx cap sync
npx cap open android  # or: npx cap open ios
```
Use this instead of (or alongside) Phase 2 if you want push notifications
via the standard Firebase Cloud Messaging / APNs setup, or need a
Capacitor-only plugin. You do not need both — Tauri mobile and Capacitor
solve the same problem; pick one before investing in store listings.

## Deep links — done in this pass
The Next.js app now serves both platform verification files (required
before iOS/Android will trust `vantrix.app` as the app's domain):
- `src/app/.well-known/apple-app-site-association/route.ts` — iOS
  Universal Links. Set `APPLE_TEAM_ID` once enrolled in the Apple
  Developer Program; until then it serves an inert placeholder.
- `src/app/.well-known/assetlinks.json/route.ts` — Android App Links.
  Set `ANDROID_SHA256_FINGERPRINTS` (comma-separated if you keep both a
  debug and release cert) from your signing keystore.
- `src/middleware.ts` — excluded `/.well-known` from the matcher so
  these routes are never touched by auth/session logic.

Both are route handlers (not static files in `public/`) so they're
guaranteed to serve `Content-Type: application/json`, which iOS in
particular requires.

Navigation on both native shells is identical in spirit: the whole app is
just a webview around `vantrix.app`, so handling a deep link is "navigate
to that URL" — no native routing layer duplicating the Next.js router.
- **Tauri** (`desktop/src-tauri/src/lib.rs`): `on_open_url` listener
  navigates the existing window via `window.location.href`.
- **Capacitor** (`mobile-capacitor/src/deep-link.ts`): `appUrlOpen`
  listener does the same; normalizes the custom `vantrix://` scheme and
  `https://vantrix.app/...` universal links to the same path format.

Allowed paths (kept in sync between the AASA file and what actually
exists in `src/app/(app)`): chat, chats, characters, community, dating,
feed, notifications, profile, premium, referral (`/r/*`), roleplay,
share, world. Add new ones to the `paths` array in the AASA route as new
sections ship — Android's assetlinks.json verifies domain ownership only
(no per-path allowlist) so nothing there needs updating for new routes.

## Push notifications — done in this pass (Capacitor path)
The native push bridge is wired end-to-end for the Capacitor shell:
`emitNotification()` (`src/lib/notifications/emit.ts`) now fans out to
Web Push (`send-push.ts`) AND native push (`send-native-push.ts`) in
parallel for every trigger site — dating matches, gift received,
community replies, crons, the SSE route's character-initiative/surprise
loop, everything.

- **Server** (`src/lib/push/send-native-push.ts`): sends via Firebase
  Cloud Messaging (`firebase-admin`), covering both platforms with one
  protocol — FCM relays to APNs for iOS tokens automatically once the iOS
  app is registered with Firebase (see setup below). No-ops entirely if
  `FIREBASE_SERVICE_ACCOUNT_JSON` isn't set, same pattern as the VAPID
  keys already do for Web Push.
- **Storage**: new `device_push_tokens` table
  (`supabase/migrations/20261101_native_push_tokens.sql`), sibling to
  `push_subscriptions` — one row per app instance, upserted on FCM token,
  soft-invalidated on permanent send failure.
- **Registration**: `POST /api/push/register-device` /
  `POST /api/push/unregister-device` — same shape as
  `/api/push/subscribe`/`unsubscribe` for Web Push.
- **Client** (`mobile-capacitor/src/push.ts` +
  `mobile-capacitor/src/index.ts`): requests permission, registers with
  FCM, POSTs the resulting token to `/api/push/register-device`, and —
  the actual "tap carries a ctaUrl" bridge — listens for
  `pushNotificationActionPerformed` and navigates the webview to
  `notification.data.url`. Call `initNativeShell()` from `index.ts` once,
  as early as possible after the webview boots; it wires this up
  alongside the existing deep-link handler (both ultimately do the same
  `window.location.href = <path>` navigation, just from two different
  trigger events — a tapped push vs. a cold-start universal/app link).

**Setup required before this actually delivers a notification:**
1. Create a Firebase project (free tier is fine — this only uses FCM,
   not any other Firebase product) and add both an Android app and an
   iOS app to it.
2. Android: download `google-services.json` into the generated
   `mobile-capacitor/android/app/` once `cap add android` has been run.
3. iOS: download `GoogleService-Info.plist` into the generated
   `mobile-capacitor/ios/App/App/` once `cap add ios` has been run, AND
   upload an APNs authentication key (or cert) to the Firebase console
   under Project Settings → Cloud Messaging → Apple app configuration —
   without this, iOS tokens register successfully but FCM can't actually
   reach APNs to deliver.
4. Firebase Console → Project Settings → Service Accounts → Generate new
   private key → set the resulting JSON (raw or base64) as
   `FIREBASE_SERVICE_ACCOUNT_JSON` in the server's env.
5. `npm install` in `vantrix/` to pull in `firebase-admin`, and run the
   new migration (`supabase db push` or your usual migration flow).

Tauri mobile (Phase 2) does not have an equivalent push bridge yet —
`tauri-plugin-notification` only covers local notifications, not remote
push, which is exactly why NATIVE_APP.md originally called out Capacitor
as "easier FCM/APNs push setup." Pick Capacitor if push matters for
launch; Tauri mobile would need `tauri-plugin-push-notifications` (community
plugin) wired through the same `/api/push/register-device` /
`send-native-push.ts` pair if that path is preferred instead.

## Shared groundwork needed either mobile route
- **Deep links**: `vantrix://` and `https://vantrix.app/app/*` are
  pre-wired in the Tauri config; the Next.js app needs an `/app/*` catch
  route (or reuse existing routes) so links from a push notification land
  on the right screen.
- **App Store / Play Store accounts**: Apple Developer Program ($99/yr)
  and Google Play Console ($25 one-time) — required before either mobile
  build can be submitted, independent of which toolchain you pick.

## Why nothing was built to a binary here
This sandbox has no network access and no Android SDK/Xcode installed, so
`cargo`/`tauri`/`cap` commands that fetch toolchains or invoke platform
build systems can't run here. Everything above is the exact command
sequence to run locally (or in CI) to go from this scaffolding to signed
installers/APKs/IPAs.
