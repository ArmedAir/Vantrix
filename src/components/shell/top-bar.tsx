"use client";

import Link from "next/link";
import { Menu, Crown } from "lucide-react";
import { useShellStore } from "./shell-store";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { BILLING_DISCOUNT_PCT } from "@/lib/tiers/config";
import type { ShellProfile } from "@/lib/frontend/session";
import { useScrollChromeHidden } from "./scroll-chrome-context";
import { cn } from "@/lib/utils";

// Sourced from the same BILLING_DISCOUNT_PCT map that drives /premium's
// pricing and the paywall modal (see tiers/config.ts) — never a hand-typed
// number, so this badge can't advertise a rate checkout doesn't honor.
const ANNUAL_DISCOUNT_LABEL = `${Math.round(BILLING_DISCOUNT_PCT.annual * 100)}% OFF`;

/**
 * Persistent top bar, all breakpoints (§2, extended): hamburger (left,
 * mobile-only since desktop nav lives in the rail) · search · Upgrade CTA
 * (free tier only, next to notifications — see TOP-BAR/SIDEBAR SWAP
 * below) · notification bell w/ live count + dropdown preview (see
 * components/notifications/notification-bell.tsx, backed by the realtime
 * store — no longer a static count computed once at layout render). No
 * avatar/account button — see AVATAR-OUT-OF-TOPBAR FIX below.
 *
 * LOGO-TO-DRAWER FIX: the mobile logo (mark + "Vantrix" wordmark) that
 * used to sit here, next to the hamburger, moved into MobileDrawer's own
 * header — see that file's own comment. It was permanently occupying
 * space on every mobile page load in a header that's already tight
 * (hamburger, search, Upgrade, notifications, avatar all competing for
 * one row on a 390px viewport), while the drawer — which only opens on
 * tap, so it costs no persistent space — previously showed the wordmark
 * without the mark at all. Desktop is unaffected: Sidebar has always
 * been the only place the logo renders there.
 *
 * TOP-BAR/SIDEBAR SWAP: the Upgrade CTA that used to live in the Sidebar
 * footer moved up here, into the slot next to the notification bell.
 * Free-tier-only per lib/tiers/config.ts's `!== 'free'` convention, same
 * gating Sidebar's Upgrade row used before the swap.
 *
 * MOBILE-THEME-TOGGLE FIX, CORRECTED (2026-09-12): this comment
 * previously claimed a bare-icon ThemeToggle was restored in this header
 * for mobile — it never actually was (no <ThemeToggle> ever rendered
 * here). That left every signed-in mobile visitor with genuinely no way
 * to reach the theme switcher anywhere (Sidebar's own row is `hidden
 * md:flex`-gated). Fixed for real this time, but in mobile-drawer.tsx's
 * footer instead of here — TopBar's row is already tight (hamburger,
 * logo, search, Upgrade, bell), and the drawer already has a natural
 * "controls" footer to extend rather than one more icon competing for
 * space up top.
 *
 * AVATAR-OUT-OF-TOPBAR FIX: the avatar/chevron button that used to sit
 * here (account-menu.tsx) opened a dropdown whose only remaining
 * destinations — Tokens, Digital Twin, Referrals, Sign out — duplicated
 * ground already covered by the merged account row in Sidebar's footer
 * (desktop) and MobileDrawer's footer (mobile), which both link to
 * /profile. Rather than run two separate account surfaces, those four
 * items moved into Sidebar's and MobileDrawer's footers alongside that
 * row (see those files' own ACCOUNT-ROW-EXPANSION comments), and
 * account-menu.tsx is no longer imported anywhere. TopBar keeps no
 * per-account affordance now — profile/settings/tokens/etc. all live in
 * exactly one place per breakpoint: the rail or the drawer.
 *
 * SIDEBAR-ALWAYS-REACHABLE FIX (2026-09-07, replaces DROP-DOWN-ON-STOP's
 * whole-header hide): the previous version translated the *entire*
 * `<header>` off-screen while actively scrolling, hamburger included —
 * on mobile, that hamburger is the only way to open MobileDrawer at all
 * (Sidebar itself only renders `md:` and up), so mid-scroll there was
 * genuinely no way to reach the app's primary nav. A person scrolling a
 * long chat/feed/character list and wanting to jump elsewhere had to stop
 * scrolling, wait ~500ms for the bar to drop back down, then tap it —
 * not "hidden briefly," actually unreachable for as long as they kept
 * scrolling.
 *
 * Fix: the `<header>` itself no longer transforms and keeps its full h-16
 * — the hamburger button lives directly in it, untouched by `hidden`, so
 * it's tappable on every frame regardless of scroll state. Only the
 * secondary-actions group (search / Upgrade / bell) fades via opacity +
 * pointer-events, not a translate, so there's no layout shift and no
 * moment where a real nav control disappears. This keeps the "chrome
 * recedes while you're mid-scroll, reappears the instant you settle"
 * feel useHideOnScroll was built for, just scoped to the controls that
 * don't gate navigation.
 *
 * FIXED-HEADER FIX (permanent-chrome pass): `sticky top-0` only pins the
 * header relative to its own scroll container -- the same gap `fixed`
 * closed for Sidebar (see sidebar.tsx's STATIC-RAIL FIX). Swapped to
 * `fixed inset-x-0 top-0` so it is genuinely pinned to the viewport on
 * every route. Height trimmed h-16 -> h-12 (thinner top bar), and the
 * left edge now reads the same `railCollapsed` flag Sidebar/MainOffset
 * already read so it starts exactly at the rail's edge instead of
 * running full-width under it. A fixed header no longer reserves space
 * in flow, so app-chrome.tsx's <main> adds a matching pt-12 -- must move
 * together with this height.
 *
 * SELECTOR-RERENDER FIX: `useShellStore()` with no selector subscribes
 * to the *entire* store, so this header used to re-render on every
 * drawerOpen toggle too (a mobile-only, unrelated piece of state) --
 * wasted work on every menu open/close on top of the renders it
 * actually needs (railCollapsed, setDrawerOpen). Split into two scoped
 * selectors so each only fires on the slice it actually reads. Same
 * fix applied to mobile-drawer.tsx's own top-level useShellStore() call.
 *
 * BUTTON-FIT FIX: hamburger was h-10 (40px) inside the now-h-12 (48px)
 * header -- workable but visually tight against the border with almost
 * no vertical breathing room. Trimmed to h-9 (36px) to match the icon
 * buttons' own sizing convention (Sidebar's footer icons) and sit
 * centered with real padding above and below.
 *
 * LOGO-OUT-OF-SIDEBAR FIX (2026-09-12): the "Vantrix" mark + wordmark
 * used to only live in Sidebar's own header (desktop) and MobileDrawer's
 * header (mobile-drawer only, on open) — there was no persistent brand
 * mark in the always-visible top navigation itself, unlike the reference
 * layout (candy.ai-style: wordmark sits directly in the top bar, next to
 * the hamburger). Sidebar's header row is now just a spacer (see that
 * file's own LOGO-OUT-OF-SIDEBAR FIX comment) and the mark renders here
 * instead, next to the hamburger on every breakpoint — one persistent
 * brand placement in the top nav rather than a rail-only one that
 * disappears on mobile until the drawer is opened.
 * NARROWER-BAR + SEARCH-REMOVED FIX (2026-09-12): height trimmed h-12 ->
 * h-11 to match the reference (candy.ai-style) slimmer top bar, and the
 * standalone Search icon link (which just pointed at /characters, already
 * reachable via the sidebar/drawer nav) was removed — one fewer redundant
 * control competing for space in an already-tight row.
 */
export function TopBar({ profile }: { profile: ShellProfile }) {
  const setDrawerOpen = useShellStore((s) => s.setDrawerOpen);
  const railCollapsed = useShellStore((s) => s.railCollapsed);
  const hidden = useScrollChromeHidden();

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 h-11 flex items-center justify-between gap-3 px-4 md:px-6 bg-base/90 backdrop-blur border-b border-border-hairline transition-[left] duration-200 ease-premium",
        railCollapsed ? "md:left-[76px]" : "md:left-[240px]"
      )}
    >
      <div className="flex items-center gap-2">
        <button
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
          className="md:hidden h-9 w-9 flex items-center justify-center rounded-xs text-text-primary transition-colors ease-premium hover:bg-white/[0.04] active:scale-90"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/" className="group flex items-center gap-2 overflow-hidden">
          <Logo
            size={26}
            className="transition-transform duration-200 ease-premium group-hover:scale-105"
          />
          <span className="font-display text-base tracking-tight whitespace-nowrap">
            Vantrix
          </span>
        </Link>
      </div>

      <div
        className={cn(
          "flex items-center gap-1.5 md:gap-2 transition-opacity duration-200 ease-premium",
          hidden && "opacity-0 pointer-events-none md:opacity-100 md:pointer-events-auto"
        )}
      >
        {profile.tier === "free" && (
          <Button
            asChild
            variant="primary"
            className="h-9 px-3 gap-1.5 rounded-xs text-sm transition-[filter,box-shadow] ease-premium hover:shadow-gold-glow"
          >
            <Link href="/premium" aria-label={`Upgrade — ${ANNUAL_DISCOUNT_LABEL} annual`}>
              <Crown className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span className="hidden sm:inline whitespace-nowrap" aria-hidden="true">
                Premium
              </span>
              <span
                className="whitespace-nowrap rounded-xs bg-black/25 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white"
                aria-hidden="true"
              >
                {ANNUAL_DISCOUNT_LABEL}
              </span>
            </Link>
          </Button>
        )}

        <NotificationBell />
      </div>
    </header>
  );
}
