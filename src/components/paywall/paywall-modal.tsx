"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import {
  Check,
  Crown,
  X,
  MessageCircle,
  ImageIcon,
  Video,
  Wand2,
  Flame,
  Bot,
  Lock,
  Heart,
  Coins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TIERS,
  getUpgradePrompt,
  getBillingPlans,
  BASE_MONTHLY_PRICE,
  type UpgradeReason,
} from "@/lib/tiers/config";
import { PREMIUM_TRIAL_DAYS } from "@/lib/tiers/limits";
import { PaywallViewed } from "@/components/premium/paywall-viewed";
import { cn } from "@/lib/utils";

/**
 * The one paywall surface for the whole app. Every gated action — chat
 * limits, image/video generation, LoRA training, Digital Twin, locked
 * characters, dating swipes, tier-locked mood rooms — routes through this
 * component via usePaywall() (see paywall-provider.tsx) instead of each
 * surface hand-rolling its own upgrade copy/link.
 *
 * Deliberately NOT modeled on any specific competitor's paywall layout —
 * built from Vantrix's own TIERS/billing config so the feature checklist
 * and pricing can never drift from what Premium actually includes. Follows
 * FRONTEND_DIRECTIVE §1/§4: no second background color, no large gold
 * fills — separation and emphasis come from border + spacing only, same
 * as every other surface in the app.
 */

const REASON_ICON: Record<UpgradeReason, typeof Crown> = {
  messages: MessageCircle,
  images: ImageIcon,
  videos: Video,
  lora: Wand2,
  nsfw: Flame,
  twin: Bot,
  character: Lock,
  swipes: Heart,
  tokens: Coins,
};

export function PaywallModal({
  open,
  onOpenChange,
  reason,
  currentTier,
  trialEligible = false,
  characterName,
  usageStat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: UpgradeReason;
  currentTier: string;
  trialEligible?: boolean;
  characterName?: string;
  usageStat?: { used: number; limit: number };
}) {
  const premium = TIERS.premium;
  const prompt = getUpgradePrompt(currentTier as never, reason);
  const ReasonIcon = REASON_ICON[reason] ?? Crown;
  const plans = getBillingPlans();
  const bestPlan = plans.find((p) => p.id === "annual") ?? plans[0];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        {/*
          MODAL-SIZE FIX: centering used to be done on Dialog.Content itself
          via `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`, with
          `max-h-[calc(100dvh-2rem)]` as the only thing capping its height.
          `dvh` is an invalid unit in some mobile browsers/webviews — and an
          invalid value doesn't fall back to anything, it just makes the
          whole `max-height` declaration get dropped, so the card had no
          height cap at all on those and rendered at its full natural
          content height (icon + title + usage bar + up to 9 feature rows +
          3-plan pricing grid + CTA), overflowing off both the top and
          bottom of the screen — "too big for the screen."
          This wrapper centers with flexbox + `inset-0` instead, which sizes
          off the actual viewport box rather than a length-unit calculation
          (no vh/dvh anywhere), and `p-4` reserves the outer margin that
          `calc(...- 2rem)` used to carve out by subtraction. `max-h-full`
          on the card then resolves against that flex box's height, which
          is always a real, definite number in every browser — there's no
          value here that can go invalid and silently remove the cap.
        */}
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <Dialog.Content
            className="w-full max-w-md max-h-full overflow-y-auto rounded-md border border-gold-500/30 bg-base shadow-gold-glow focus:outline-none"
            aria-describedby={undefined}
          >
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="absolute right-4 top-4 z-10 text-text-tertiary hover:text-text-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>

            <PaywallViewed surface={reason} currentTier={currentTier} />

            <div className="px-6 pt-8 pb-6">
            <div className="text-center">
              {/* PREMIUM-CRAFT FIX: double-ring medallion instead of a flat
                  circle — still border-only (no fill added), just two
                  concentric rings so the header icon reads as a considered
                  badge rather than a plain icon container. The one place
                  this pass spends its "boldness," per frontend-design's
                  restraint principle; everything else below stays quiet. */}
              <div className="relative mx-auto h-14 w-14">
                <div className="absolute -inset-[7px] rounded-full border border-gold-500/15" />
                <div className="relative h-14 w-14 rounded-full border border-gold-500/50 flex items-center justify-center">
                  <ReasonIcon className="h-6 w-6 text-gold-500" strokeWidth={1.75} />
                </div>
              </div>

              {/* Lucide Crown, not the raw 👑 glyph tiers/config.ts stores
                  for other surfaces (TierCard etc.) — an emoji renders as a
                  different weight/style on every OS (flat on Android, glossy
                  on iOS, monochrome on Windows), which reads inconsistent
                  rather than premium. Icon inherits the badge's own color
                  instead. */}
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-gold-500/40 bg-gold-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-gold-400">
                <Crown className="h-3 w-3" strokeWidth={2} />
                {premium.badge.label}
              </div>

              <Dialog.Title className="font-display text-2xl text-text-primary tracking-tight mt-5 text-balance">
                {characterName ? `Unlock ${characterName}` : prompt.headline}
              </Dialog.Title>
              {characterName && (
                <p className="mt-2 text-sm italic text-text-secondary">{prompt.headline}</p>
              )}
              <p className="mt-2.5 text-sm leading-relaxed text-text-secondary text-balance">{prompt.subhead}</p>

              {/* Real usage stat, not a fabricated countdown — pulled straight
                  from the same Redis-backed caps that enforce the limit
                  server-side (checkDailyMessageCap / checkDailyImageCap /
                  checkDailyVideoCap), so this can never overstate how close
                  to the cap someone actually is. */}
              {usageStat && (
                <div className="mt-4 mx-auto max-w-[220px]">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-gold-500"
                      style={{
                        width: `${Math.min(100, (usageStat.used / Math.max(1, usageStat.limit)) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] tabular-nums text-text-tertiary">
                    {usageStat.used} of {usageStat.limit} used today &middot; resets at midnight UTC
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 border-t border-gold-500/15" />
            <ul className="mt-6 space-y-3.5 text-left">
              {premium.features
                .filter((f) => f.included)
                .map((f) => (
                  <li key={f.label} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-gold-500/15">
                      <Check className="h-3.5 w-3.5 text-gold-400" strokeWidth={2.5} />
                    </span>
                    <span className="text-sm leading-snug text-text-primary">
                      {f.label}
                      {f.note && (
                        <span className="block text-xs text-text-tertiary mt-0.5">{f.note}</span>
                      )}
                    </span>
                  </li>
                ))}
            </ul>

            {/* Billing comparison — same numbers as /premium (getBillingPlans(),
                tiers/config.ts), so this can never quote a different price than
                checkout actually charges. Informational only; plan selection
                itself still happens on /premium, not here. */}
            <div className="mt-6 grid grid-cols-3 gap-2">
              {plans.map((plan) => {
                const isBest = plan.id === "annual";
                return (
                  <div
                    key={plan.id}
                    className={cn(
                      "rounded-sm border px-2 py-3.5 text-center",
                      isBest ? "border-gold-500/60 shadow-gold-glow" : "border-border-hairline"
                    )}
                  >
                    {isBest && (
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gold-400">
                        Best value
                      </div>
                    )}
                    <div className="text-sm font-semibold text-text-primary tabular-nums">
                      ${plan.pricePerMonth.toFixed(2)}
                      <span className="text-[10px] font-normal text-text-tertiary">/mo</span>
                    </div>
                    {/* Real (pre-discount) price, struck through, right under
                        the discounted figure — "was $9.99" is what makes the
                        Save% line below actually register as an offer. */}
                    {plan.discountPct > 0 && (
                      <div className="text-[10px] text-text-tertiary line-through tabular-nums">
                        ${BASE_MONTHLY_PRICE.toFixed(2)}/mo
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-text-tertiary">{plan.label}</div>
                    {plan.discountPct > 0 && (
                      <div className="mt-1 text-[10px] font-medium text-gold-400 tabular-nums">
                        Save {Math.round(plan.discountPct * 100)}%
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-sm shadow-gold-glow">
              <Button asChild size="lg" className="w-full tracking-wide">
                {/* PAYWALL-TRIAL-FIX: trialEligible is computed server-side
                    the same way /premium computes it (free tier + trial not
                    already used + Stripe actually enabled — see
                    (app)/layout.tsx), so this can only ever offer a trial
                    to someone who can actually start one. Still routes to
                    /premium rather than starting the Stripe session itself
                    — TrialButton there already owns that flow (loading
                    state, CARD_PAYMENT_NOT_ALLOWED / TRIAL_ALREADY_USED
                    error copy); duplicating it here would just be a second
                    place that logic could drift out of sync. */}
                <Link href="/premium">
                  {trialEligible ? `Start your ${PREMIUM_TRIAL_DAYS}-day free trial` : prompt.cta}
                </Link>
              </Button>
            </div>

            <p className="mt-3 text-center text-xs text-text-tertiary">
              {trialEligible ? (
                <>
                  Then from ${bestPlan.pricePerMonth.toFixed(2)}/mo billed{" "}
                  {bestPlan.label.toLowerCase()} &middot; cancel anytime
                </>
              ) : (
                <>
                  From ${bestPlan.pricePerMonth.toFixed(2)}/mo billed{" "}
                  {bestPlan.label.toLowerCase()} &middot; cancel anytime
                </>
              )}
            </p>
          </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
