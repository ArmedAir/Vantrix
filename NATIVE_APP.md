# Vantrix — Native App Build Plan (Desktop: Tauri · Mobile: Capacitor)

All native targets are thin shells around the deployed web app
(`https://vantrix.ink`) — no UI is duplicated. This keeps every future
Vantrix feature shipping to native automatically with zero extra app-store
release work, but it also means native performance is inherited directly
from the web app's own performance (see "Performance" below) — there's no
separate native codebase to optimize independently.

## The mobile decision: Capacitor, not Tauri mobile

This repo has TWO mobile scaffolds — `mobile-capacitor/` and Tauri's mobile
config (`desktop/src-tauri/tauri.{ios,android}.conf.json`). They solve the
same problem; running both to a real store listing would mean two deep-link
allowlists, two push-registration paths, and two sets of store assets to
keep in sync for no benefit. **Capacitor is the mobile path.** It has by far
the more mature FCM/APNs plugin ecosystem, and as of this doc it's the one
that's actually built out (real Android project, the web-app-side bridge
that makes push/deep-links/back-button actually work — see below). Tauri's
mobile config files are left in place (harmless, config-only) in case that
ever changes, but nothing should be invested in extending them.

Tauri remains the desktop plan — `desktop/` — unrelated to this decision.

## Status by platform

### Desktop (Tauri) — scaffolded, not yet built to a binary
- `desktop/src-tauri/` — real Rust project (`lib.rs`/`main.rs`/`Cargo.toml`),
  not just config. Plugins wired: notifications, deep-link (`vantrix://` +
  `https://vantrix.ink/*`), auto-updater + single-instance (desktop only).
- **Domain bug fixed this pass**: `tauri.conf.json`, `lib.rs`'s comments, and
  `README.md` all still pointed at `vantrix.app` (not this app's domain) —
  a previous pass's changelog claimed this was already fixed, but the actual
  files still had it. If you built a desktop installer before this fix, it
  loaded the wrong site entirely. Verified fixed now, not just noted as fixed.
- Icons exist (`src-tauri/icons/`). Updater pubkey is still a placeholder —
  generate one (`tauri signer generate`) before enabling auto-update for real.
- Not yet done: actually running `npm run tauri build` (needs the Rust
  toolchain + platform build tools — see "Why nothing was built to a binary
  here" below), a CI workflow for it, code signing for macOS/Windows.

### Android (Capacitor) — built and wired this pass
- Upgraded to Capacitor 8.5.2. Verified App Links restricted to an explicit
  path allowlist (`src/lib/native/deep-link-paths.ts` — the single source of
  truth; see below), `allowBackup="false"` (the WebView holds the session —
  restoring it via cloud backup onto another device would silently sign the
  user in there), `POST_NOTIFICATIONS` permission (required on Android 13+
  or FCM messages deliver with no visible notification).
- Release builds now actually minify + shrink (R8/ProGuard, with keep rules
  for Capacitor's reflection-based JS bridge) — were unminified before, an
  easy way to ship something that works in every dev build and silently
  breaks in the one build nobody manually tests. Signing reads from env vars
  (GitHub Actions secrets), never a committed keystore.
- **The actual gap this pass filled**: `mobile-capacitor/` loads
  `https://vantrix.ink` directly in the WebView (`server.url` in
  `capacitor.config.ts`) — none of `mobile-capacitor/src/*` ever ships to a
  device. The code that has to call native plugins lives in the web app
  itself: `src/lib/native/` (platform detection, the deep-link allowlist)
  and `src/components/shell/native-bridge.tsx` (mounted app-wide in
  `layout.tsx`, no-ops on a normal web visit). It registers for push and
  POSTs the token to the pre-existing `/api/push/register-device`, resolves
  deep links through the allowlist, and handles Android's hardware back
  button through Next's router (without this, a back-tap deep inside the
  app can unexpectedly exit it entirely).
- **Deep-link paths**: `src/lib/native/deep-link-paths.ts` is the one place
  these are defined. The iOS AASA route imports it directly (can't drift).
  Android's manifest is static XML and can't import TypeScript, so
  `src/__tests__/arch-native-deep-links.test.ts` checks the two stay in sync
  and fails the build if they don't.
- **Get a debug APK**: GitHub → Actions → "Build Android app (APK)" → Run
  workflow → download the `vantrix-android-debug-apk` artifact.
- **Get a release AAB**: GitHub → Actions → "Build Android app (signed
  release AAB)" → Run workflow (asks for a version code/name each run —
  Play rejects a duplicate version code, so this has to go up every
  submission). Produces an UNSIGNED build until the four
  `ANDROID_KEYSTORE_*` / `ANDROID_KEY_*` secrets are set (see the
  workflow file's own header for exactly how to generate the keystore) —
  Play will reject an unsigned upload, so treat an unsigned artifact as
  "the build compiles," not "this is submittable."
- **Play Store submission still needs**: the keystore secrets above set for
  real, a Google Play Console account, and a real device smoke test of a
  release (not debug) build — R8 minification (enabled this pass) can
  break things a debug build never exercises.

### iOS — CI-only for now, unsigned
`npx cap add ios` needs Xcode, which needs macOS — there is no path to
generating or building the iOS project from this sandbox, or running it
locally without a Mac. The workaround: GitHub → Actions → "Build iOS app
(simulator smoke test)" runs `cap add ios` + a full simulator build on a
real `macos-latest` runner. This proves the toolchain/config actually
works (catches Podfile issues, Capacitor plugin API breaks, Info.plist
problems) well before anyone touches a real Mac — but it's simulator-only
and unsigned; it does NOT produce anything installable on a real device or
submittable to TestFlight. That step still needs an Apple Developer
Program enrollment ($99/yr), a real signing certificate/provisioning
profile, and either an actual Mac or a follow-up workflow with those
secrets configured (not written — the release-AAB workflow's env-based
signing pattern is the template).

## Store policy — researched, not yet a checklist someone's confirmed against

This is a companion/roleplay app with NSFW content, which puts it under
real, currently-evolving scrutiny on both stores. Worth treating as a
pre-submission legal/policy review, not just an engineering checklist:

- **Apple**: App Review has specific, tightened requirements around AI
  companion / chatbot apps as of 2026 — age rating accuracy, clear
  AI-disclosure, and (for NSFW-capable apps) the account needs to be
  correctly flagged 18+ or it risks rejection or removal after the fact
  rather than at initial review. A pure WebView wrapper can also draw a
  Guideline 4.2 ("minimum functionality") rejection if it doesn't feel like
  more than a bookmarked website — push notifications, deep links, and the
  native back-button/status-bar handling built this pass are exactly the
  kind of native integration that argues against that rejection, but it's
  still a real risk worth designing the store listing around.
- **Apple external purchase links**: US storefront rules around linking out
  to web checkout instead of Apple's IAP have been in flux via ongoing
  litigation/rule changes — confirm the CURRENT rule before assuming
  Vantrix's existing Stripe/Paystack/NOWPayments checkout can be linked to
  from the iOS app without also implementing Apple IAP as a fallback.
- **Google Play**: alternative billing (non-Google-Play payment methods)
  has its own program requirements, separate from just "add a link" — same
  confirm-before-assuming caution applies.
- **Target API level**: Google Play requires new apps/updates to target a
  recent Android API level on a rolling basis; confirm the current
  requirement against `mobile-capacitor/android/variables.gradle`'s
  `targetSdkVersion` before submission, since this requirement moves most
  years and this doc will go stale on that specific number.
- Neither store's policy language here is final legal guidance — get an
  actual review from someone who tracks these policies for a living before
  submitting, especially given the content category.

## Performance

Native performance here is almost entirely the web app's own performance,
inherited wholesale — there's no separate native rendering path to tune.
Concretely:
- LCP/font/image optimization already done in the web app (see git history:
  WOFF2 font conversion, image compression) applies identically inside the
  native WebView.
- Native-specific overhead that IS separate from the web app: cold start
  time (native process launch → WebView init → first paint), and the
  animated splash screen bridging that gap. Current setup: the native layer
  shows nothing (solid `#0A0A0A`, 0ms duration, no icon) and the web app's
  own BootSplash plays automatically inside the shell (`boot-init.js`
  detects `window.Capacitor`) — ONE opening animation, not a native splash
  followed by a web one.
- Release APK size matters for install conversion — R8 + resource shrinking
  (enabled this pass) is the main lever; hasn't been measured against a
  real build yet since that needs the Android SDK this sandbox doesn't have.
- Not yet measured at all: actual cold-start time on a real device, memory
  use of the WebView process, battery impact of the push-notification
  listener setup. All need a real device, not something verifiable from
  here.

## Why nothing gets built to a binary from this sandbox
No Android SDK, no Xcode/macOS, and no Rust toolchain are installed here —
`cargo`/`tauri`/`cap` commands that invoke platform build systems can't run
in this environment at all (this is a hard tooling gap, not a missing
config). Everything above is buildable via the GitHub Actions workflow
that exists (Android debug APK) or the ones still to write (Android release
AAB, iOS on a macOS runner, desktop installers) — CI is genuinely the
practical path here, not "run it locally," unless whoever's driving this
has their own Mac + Android Studio + Rust set up.

## Shared groundwork, either mobile route
- **App Store / Play Store accounts**: Apple Developer Program ($99/yr),
  Google Play Console ($25 one-time) — required before either can be
  submitted, independent of anything above.
- **Store assets**: screenshots (multiple device sizes each store requires),
  a privacy nutrition label (Apple) / Data safety form (Google) accurately
  describing what Vantrix actually collects — neither exists yet.
