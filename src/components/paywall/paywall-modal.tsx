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
import { SafeImage as Image } from "@/components/ui/safe-image";
import {
  TIERS,
  getUpgradePrompt,
  getBillingPlans,
  BASE_MONTHLY_PRICE,
  type UpgradeReason,
} from "@/lib/tiers/config";
import { PREMIUM_TRIAL_DAYS } from "@/lib/tiers/limits";
import { PaywallViewed } from "@/components/premium/paywall-viewed";
import { cn, resolveImageSrc } from "@/lib/utils";

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
 *
 * Tone is deliberately an invitation, not an ad: copy in getUpgradePrompt()
 * describes what Premium membership includes rather than manufacturing
 * urgency or scarcity around the free tier, and the visual language (serif
 * display type, hairline dividers, restrained gold) is meant to read as a
 * membership card, not a promotional banner.
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: UpgradeReason;
  currentTier: string;
  trialEligible?: boolean;
  characterName?: string;
  // Accepted for backward compatibility with existing callers (chat-window's
  // media-generation error path, paywall-provider) but deliberately not
  // rendered: surfacing "X of Y used today / resets at midnight UTC" showed
  // users the server's internal rate-limit accounting, which is a production
  // enforcement detail, not something the upgrade prompt should expose.
  usageStat?: { used: number; limit: number };
  /**
   * BLURRED-PREVIEW FIX (candy.ai reference pass): when the gated thing is
   * a specific piece of visual content (a locked character post, a locked
   * gallery image), show a heavily blurred, lock-badged preview of that
   * actual image above the headline instead of only the generic icon
   * medallion — the same "show them what they're missing" teaser several
   * competitor paywalls use (candy.ai's "Private Content" sheet stacks a
   * blurred photo above its checklist). Optional and additive: reasons
   * with no associated image (messages, tokens, twin, etc.) keep the
   * existing icon-medallion header exactly as before.
   */
  previewImageUrl?: string | null;
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
            className="relative w-full max-w-md max-h-full overflow-y-auto rounded-md border border-gold-500/30 bg-base shadow-gold-glow focus:outline-none before:pointer-events-none before:absolute before:inset-0 before:rounded-md before:bg-gradient-to-b before:from-gold-500/[0.06] before:via-transparent before:to-transparent"
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

            {previewImageUrl && (
              <div className="relative mx-auto mt-2 h-40 w-full max-w-[220px]">
                {/* Two faint offset cards behind the real preview — reads as
                    "a stack of locked content," not just one blurred photo,
                    same silhouette as the candy.ai reference without
                    borrowing its copy or colors. Rotation values are fixed,
                    not random, so this never looks glitchy on re-render. */}
                <div className="absolute inset-0 -rotate-6 translate-x-2 rounded-md border border-gold-500/20 bg-white/[0.03]" />
                <div className="absolute inset-0 rotate-3 -translate-x-1 rounded-md border border-gold-500/25 bg-white/[0.04]" />
                <div className="relative h-full w-full overflow-hidden rounded-md border border-gold-500/40 shadow-gold-glow">
                  <Image
                    src={resolveImageSrc(previewImageUrl)}
                    alt=""
                    fill
                    sizes="220px"
                    className="object-cover blur-xl scale-110"
                    aria-hidden
                  />
                  <div className="absolute inset-0 bg-black/35" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full border border-gold-500/60 bg-black/40 backdrop-blur-sm">
                      <Lock className="h-4.5 w-4.5 text-gold-400" strokeWidth={1.75} />
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="px-6 pt-8 pb-6">
            <div className="text-center">
              {/* PREMIUM-CRAFT FIX: double-ring medallion instead of a flat
                  circle — still border-only (no fill added), just two
                  concentric rings so the header icon reads as a considered
                  badge rather than a plain icon container. The one place
                  this pass spends its "boldness," per frontend-design's
                  restraint principle; everything else below stays quiet.
                  BLURRED-PREVIEW FIX: skipped entirely when previewImageUrl
                  is set — the blurred stack above already fills that role,
                  and showing both stacked on top of each other duplicated
                  the same "here's what's locked" signal twice. */}
              {!previewImageUrl && (
                <div className="relative mx-auto h-14 w-14">
                  <div className="absolute -inset-[7px] rounded-full border border-gold-500/15" />
                  <div className="relative h-14 w-14 rounded-full border border-gold-500/50 flex items-center justify-center">
                    <ReasonIcon className="h-6 w-6 text-gold-500" strokeWidth={1.75} />
                  </div>
                </div>
              )}

              {/* Lucide Crown, not the raw 👑 glyph tiers/config.ts stores
                  for other surfaces (TierCard etc.) — an emoji renders as a
                  different weight/style on every OS (flat on Android, glossy
                  on iOS, monochrome on Windows), which reads inconsistent
                  rather than premium. Icon inherits the badge's own color
                  instead. */}
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-gold-500/40 bg-gold-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-400">
                <Crown className="h-3 w-3" strokeWidth={2} />
                {premium.badge.label}
              </div>

              <Dialog.Title className="font-display text-[28px] leading-tight text-text-primary tracking-tight mt-5 text-balance">
                {characterName ? `Unlock ${characterName}` : prompt.headline}
              </Dialog.Title>
              {characterName && (
                <p className="mt-2 font-display text-sm italic text-text-secondary">{prompt.headline}</p>
              )}
              <p className="mt-3 text-sm leading-relaxed text-text-secondary text-balance">{prompt.subhead}</p>
            </div>

            {/* Ornamental divider — a centered diamond flanked by hairlines,
                reads as considered rather than a plain rule. */}
            <div className="mt-7 flex items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-gold-500/25" />
              <div className="h-1.5 w-1.5 rotate-45 border border-gold-500/50" />
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-gold-500/25" />
            </div>
            <ul className="mt-7 space-y-3.5 text-left">
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
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-gold-400">
                        Preferred
                      </div>
                    )}
                    <div className="font-display text-base font-semibold text-text-primary tabular-nums">
                      ${plan.pricePerMonth.toFixed(2)}
                      <span className="text-[10px] font-sans font-normal text-text-tertiary">/mo</span>
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

            <div className="mt-7 rounded-sm shadow-gold-glow">
              <Button asChild size="lg" className="w-full tracking-[0.06em]">
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
                  {bestPlan.label.toLowerCase()} &middot; no obligation, cancel anytime
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
