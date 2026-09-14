import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles, Heart, Infinity as InfinityIcon, Check, type LucideIcon } from "lucide-react";
import { getShellSession } from "@/lib/frontend/session";
import { PublicHeader } from "@/components/public/public-header";
import { RELATIONSHIP_TIER_ORDER, RELATIONSHIP_TIER_COPY, type RelationshipTier } from "@/lib/commerce/raas-constants";

/**
 * RaaS surfacing (public half): the last of the three gaps found in this
 * pass (see character-relationship-tier.tsx and raas-pricing-card.tsx for
 * the buyer-facing and Studio halves) — nothing crawlable explained what
 * Spark/Bond/Soulbound even are before a visitor ever reached a character
 * page. Same "/premium is now a public pricing page" precedent this repo
 * already established (see (app)/layout.tsx's PRICING-PUBLIC FIX): pure
 * marketing copy, no account data, safe to render with no session.
 */
export const metadata: Metadata = {
  title: "How Relationships Work — Vantrix",
  description:
    "Every Vantrix companion starts on Spark. Bond and Soulbound unlock full, permanent memory — and for some characters, a specialized personality pack found nowhere else.",
};

const TIER_ICONS: Record<RelationshipTier, LucideIcon> = {
  spark: Sparkles,
  bond: Heart,
  soulbound: InfinityIcon,
};

export default async function RelationshipsPage() {
  const session = await getShellSession();

  return (
    <div className="mx-auto max-w-4xl px-4 md:px-8 py-10">
      {!session && <PublicHeader />}

      <div className="text-center max-w-xl mx-auto">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/40 bg-gold-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-400">
          Relationships
        </div>
        <h1 className="font-display text-4xl leading-tight text-text-primary mt-4 text-balance">
          Memory is the relationship.
        </h1>
        <p className="text-text-secondary mt-3 text-balance">
          Every companion on Vantrix starts on Spark, remembering the last
          week or so. Bond and Soulbound go further — full, permanent
          memory, and for some characters, a personality found nowhere
          else.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {RELATIONSHIP_TIER_ORDER.map((tier) => {
          const copy = RELATIONSHIP_TIER_COPY[tier];
          const Icon = TIER_ICONS[tier];
          return (
            <div
              key={tier}
              className="rounded-lg border border-border-hairline p-5 flex flex-col gap-3"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-gold-400" strokeWidth={1.75} />
                <h2 className="text-sm font-semibold text-text-primary">{copy.label}</h2>
              </div>
              <p className="text-xs text-text-tertiary">{copy.blurb}</p>
              <ul className="flex flex-col gap-1.5 mt-1">
                {copy.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-xs text-text-secondary">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-gold-500" />
                    {perk}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-10 max-w-lg mx-auto text-center">
        <h3 className="text-sm font-semibold text-text-primary">How pricing works</h3>
        <p className="text-xs text-text-secondary mt-2 text-balance">
          Bond and Soulbound are purchased per character with Vantrix Coin —
          pricing is set by each character&rsquo;s creator, so it varies from
          one companion to the next. You&rsquo;ll see the exact cost on a
          character&rsquo;s own page before you buy.
        </p>
      </div>

      <div className="mt-8 flex items-center justify-center gap-3 max-w-xs mx-auto">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-gold-500/25" />
        <div className="h-1.5 w-1.5 rotate-45 border border-gold-500/50" />
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-gold-500/25" />
      </div>

      <div className="mt-8 text-center">
        <Link
          href="/discover"
          className="inline-flex items-center justify-center rounded-md bg-gold-500 px-6 py-3 text-sm font-semibold text-base hover:bg-gold-400 transition-colors duration-150 ease-premium"
        >
          Find a companion
        </Link>
      </div>
    </div>
  );
}
