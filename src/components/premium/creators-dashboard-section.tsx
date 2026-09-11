"use client";

import { Crown, Coins } from "lucide-react";
import { CreatorEarningsDashboard } from "@/components/studio/creator-dashboard/creator-earnings-dashboard";

/**
 * CREATORS-DASHBOARD-IN-SUBSCRIPTION: the earnings/payout view formerly
 * lived only at /studio/earnings, reached via a plain "Earnings" button
 * on the Studio hub. Relocated into the Subscription (/premium) page,
 * gated to paying members server-side by the caller (premium/page.tsx
 * only renders this when `!isFreeUser`) — this component itself stays
 * dumb about tier and just renders the dashboard shell.
 *
 * <CreatorEarningsDashboard> is untouched (still fetches
 * /api/creator/dashboard itself) — this wrapper only supplies the
 * premium-appropriate framing: a gold-leaf header band consistent with
 * the rest of this page's luxury treatment, rather than the plain
 * "Earnings" h1 the old standalone page used.
 */
export function CreatorsDashboardSection() {
  return (
    <section id="creators-dashboard" className="mt-16 max-w-4xl mx-auto scroll-mt-20">
      <div className="flex items-center gap-3 mb-1">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold-500/30 to-transparent" />
        <div className="flex items-center gap-1.5 text-gold-400">
          <Crown className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em]">
            Member Benefit
          </span>
        </div>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold-500/30 to-transparent" />
      </div>

      <div className="relative mt-6 rounded-lg border border-gold-500/20 bg-gradient-to-b from-gold-500/[0.05] to-transparent p-6 md:p-8 overflow-hidden">
        {/* subtle corner glow, matches the paywall's crown-in-ring motif */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-gold-500/10 blur-3xl" />

        <div className="relative flex items-start gap-3 mb-6">
          <div className="mt-0.5 h-9 w-9 shrink-0 rounded-full border border-gold-500/40 flex items-center justify-center">
            <Coins className="h-4 w-4 text-gold-500" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="font-display text-xl text-text-primary">Creators Dashboard</h2>
            <p className="text-sm text-text-secondary mt-1 max-w-xl">
              Your marketplace sales and Creator Fund share, combined. The fund pays out weekly
              based on returning-user engagement, not raw message volume — a Premium-only view
              into how your characters are earning.
            </p>
          </div>
        </div>

        <div className="relative">
          <CreatorEarningsDashboard />
        </div>
      </div>
    </section>
  );
}
