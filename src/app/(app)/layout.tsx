import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getShellSession } from "@/lib/frontend/session";
import { AppChrome } from "@/components/shell/app-chrome";
import { SessionErrorShell } from "@/components/shell/session-error-shell";
import { PaywallProvider } from "@/components/paywall/paywall-provider";
import { getContactEmail } from "@/lib/config/contact";
import { getTrialEligibility } from "@/lib/frontend/premium";
import { isProviderEnabled } from "@/lib/payments/provider-gate";

/**
 * FORCE-DYNAMIC CLEANUP (2026-09-05, item #11): this layout calls
 * headers() directly and getShellSession() (which reads the session
 * cookie via lib/supabase/server) on every request — both already opt
 * the entire (app) route segment into dynamic rendering per Next.js's
 * own rules, for every nested page, with no per-page opt-in needed. 35
 * nested page.tsx files under (app)/ and admin/ (admin's layout does the
 * same via getAuthedUser()) each redundantly re-declared
 * `export const dynamic = "force-dynamic"` anyway — harmless, but dead
 * weight that also misleads a reader into thinking a given page has its
 * own reason to be dynamic when it's just inheriting this layout's. That
 * export has been removed from all of them; don't re-add it to a new
 * page under this layout — it does nothing here that this file doesn't
 * already do. (SEO landing pages under a different route group ARE
 * static/ISR by design and were deliberately left untouched — this
 * cleanup only reached pages actually nested under an auth-gated layout.)
 */

/**
 * IMMERSIVE-CHAT: a small set of full-bleed, single-screen conversation
 * surfaces are meant to be edge-to-edge, no app chrome above or below them
 * — `/chat/<id>` and `/roleplay/<sessionId>` (not their list/new/sub-page
 * siblings). The actual route match + TopBar/BottomNav opt-out now lives
 * in components/shell/app-chrome.tsx (a Client Component keyed off
 * usePathname()) — see that file's header comment for why this moved out
 * of this Server Component layout (STALE-CHROME FIX, 2026-09-07: headers()
 * here only reflects the *initial* request and goes stale across a
 * client-side navigation to an immersive route, since this layout stays
 * mounted rather than re-running on every soft nav).
 */

/**
 * Shell for every authenticated route (Home, Chats, Characters, World,
 * Dating, Studio, Premium, Profile, Notifications, ...). Session check
 * happens once here via lib/frontend/session.ts (a direct Supabase call,
 * not a fetch to our own API — §10) so every child page gets the current
 * user "for free," matching how the directive describes the middleware's
 * cookie rotation already working.
 *
 * UX AUDIT FIX (item 1): getShellSession() can throw on a genuine
 * failure (network/auth-service blip), separately from returning null
 * for "no user." Those two cases need different handling — a thrown
 * error must not redirect a possibly-still-authenticated user to
 * /login, and (app)/error.tsx can't catch a throw from this same
 * segment's own layout, so an uncaught throw here previously took down
 * the entire document via global-error.tsx (losing Sidebar/TopBar for
 * every route, not just the failing one).
 *
 * 0.3.1 FIX: every route under this group used to redirect a signed-out
 * visitor to /login unconditionally — including "/" itself, which meant
 * the acquisition funnel (landing  character  guest  signup) never
 * had a first step: an unauthenticated visitor could never see Home at
 * all. Every other route ((app)/chats, /characters, /studio, ...) still
 * redirects exactly as before; only the bare root path is exempted, and
 * only into a *different* shell, not into unauthenticated access to
 * account-scoped chrome. Sidebar/TopBar/BottomNav all require
 * session.profile (TopBar takes it as a required prop; Sidebar/BottomNav
 * link to authenticated-only destinations), so a signed-out "/" swaps
 * them for PublicHeader — the same minimal header /discover, /about, and
 * every other standalone public page already use — rather than trying to
 * render authenticated chrome with no session. (app)/page.tsx itself
 * already degrades gracefully with no user (see its own HERO-REMOVED /
 * FAKE-DATA-FIX history) and now adds a logged-out hero pitch on top of
 * that for exactly this path.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session: Awaited<ReturnType<typeof getShellSession>>;
  try {
    session = await getShellSession();
  } catch {
    return <SessionErrorShell />;
  }

  if (!session) {
    const pathname = (await headers()).get("x-pathname") ?? "/";
    if (pathname !== "/") {
      redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
    return (
      <PaywallProvider currentTier="free">
        <div className="min-h-screen bg-base">{children}</div>
      </PaywallProvider>
    );
  }

  // MFA STEP-UP GATE: password auth succeeded (session exists) but the
  // account has a verified TOTP factor this session hasn't verified yet
  // this login. Every route under this layout is account-scoped, so
  // there's nothing here a step-up shouldn't gate — redirect straight to
  // the challenge screen with a way back to wherever they were headed.
  // See lib/auth/mfa.ts's SCOPE NOTE for what this does and doesn't cover.
  if (session.mfaRequired) {
    const pathname = (await headers()).get("x-pathname") ?? "/";
    redirect(`/login/verify?redirect=${encodeURIComponent(pathname)}`);
  }

  // SIDEBAR-FOOTER-REAL-LINKS FIX: the drawer/rail footer's Contact Us row
  // used to have nowhere to source a real destination from inside a
  // "use client" component. Fetched here, same app_config-backed helper
  // home/footer.tsx already uses (so a rotated contact_email picks up on
  // both surfaces with no separate edit), and passed down as a plain prop.
  //
  // DISCORD-FOLD: getDiscordUrl() dropped from this batch — Sidebar/
  // MobileDrawer's standalone Discord tile is gone (see those files' own
  // comments); /support already surfaces the Discord invite alongside
  // the contact email, via its own independent getDiscordUrl() call.
  const contactEmail = await getContactEmail();

  // PAYWALL-TRIAL-FIX: the shared paywall modal (fires at the highest-
  // intent moment — someone just hit a real limit) never mentioned the
  // existing PREMIUM_TRIAL_DAYS free trial at all; only /premium did.
  // Same eligibility computation as premium/page.tsx's trialEligible
  // (free tier + trial not already used + Stripe actually enabled, since
  // the trial has no Paystack/NOWPayments equivalent — see
  // provider-gate.ts's DISABLED_PROVIDERS), so the modal can never offer
  // a trial CTA that the checkout route would just reject.
  const trialEligible =
    session.profile.tier === "free" && isProviderEnabled("stripe")
      ? await getTrialEligibility(session.profile.id)
      : false;

  return (
    <PaywallProvider currentTier={session.profile.tier} trialEligible={trialEligible}>
      <AppChrome profile={session.profile} contactEmail={contactEmail}>
        {children}
      </AppChrome>
    </PaywallProvider>
  );
}
