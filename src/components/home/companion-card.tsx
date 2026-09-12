"use client";

import { Heart, Flame, Crown } from "lucide-react";
import { MediaCard } from "@/components/ui/media-card";
import { Badge } from "@/components/ui/badge";
import { cn, resolveImageSrc, formatCompactCount } from "@/lib/utils";
import type { DiscoverCharacter } from "@/lib/frontend/discover";

/**
 * §3.3 Featured Companions card spec: image, "NEW" badge (gold, not
 * pink — §9.4 resolved gold-monochrome in badge.tsx), name, one-line
 * trait tags, like count (gold heart icon + number).
 *
 * `className` defaults to the fixed scroll-row width (unchanged
 * behavior for every existing caller) but is overridable — the
 * Characters browse page (§12 Phase 3) reuses this same card inside a
 * CSS grid, where a fixed width would leave ragged gaps instead of
 * filling its cell.
 *
 * CLICK-TRACKING: this is the single card component reused across every
 * discovery surface (Home's Explore/Featured rows, /characters browse,
 * dating suggestions, anon hero) — so it's the one place to ping
 * POST /api/characters/click, rather than wiring each caller separately.
 * Marked "use client" so the tap handler works even for callers that
 * render this from a Server Component (featured-companions.tsx,
 * home-side-rail.tsx, anon-hero.tsx, post-chat-suggestions.tsx) — a
 * Server Component can't hand a function prop to a Client Component
 * (MediaCard  next/link), but it CAN render a Client Component and let
 * that component build its own handler internally, which is what
 * happens here. See lib/recommendations/trending.ts for what the count
 * feeds into.
 *
 * CARD-POLISH FIX (homepage luxury pass): three real changes, no
 * fabricated signals —
 *   1. `character.description` (a real, already-typed column that this
 *      card never rendered) now fills the line under the trait tags
 *      when there's no `reason` string, at a clean `line-clamp-2` so it
 *      always ends on a full line instead of the old raw truncation
 *      that could cut off mid-word/mid-sentence with no fade.
 *   2. `like_count` now goes through `formatCompactCount` (12,200,394 ->
 *      "12.2M") instead of `.toLocaleString()` — the raw thousands-
 *      separator version read like an unstyled DB dump next to
 *      everything else on this card.
 *   3. `is_live` (real column, previously unused on this card) gets a
 *      small pulsing dot + "Live" label next to the like count. This is
 *      deliberately NOT a synthetic "Active now" — it only renders when
 *      the row is actually flagged live, same restraint as the
 *      Premium-badge fix above it.
 */
export function CompanionCard({
  character,
  className,
  hot = false,
}: {
  character: DiscoverCharacter;
  className?: string;
  /** Trending-tab flame badge — takes priority over the New badge. */
  hot?: boolean;
}) {
  // DEFENSIVE (2026-08-25): tags is expected to always be an array (see
  // DiscoverCharacter), but this is the one component every discovery
  // surface on Home shares — Featured Companions, Explore Characters,
  // the side rail, dating suggestions — so a single record with a null/
  // missing tags column (a bad migration default, a partially-seeded
  // row) would take out every one of those sections' renders at once
  // with a bare TypeError, not just fail to show that one card. `?? []`
  // costs nothing when tags is already a real array.
  const traitLine = (character.tags ?? []).slice(0, 3).join(" · ");
  const badge = hot ? (
    <Badge className="gap-1">
      <Flame className="h-3 w-3" strokeWidth={2.5} />
      Hot
    </Badge>
  ) : character.is_new ? (
    <Badge>New</Badge>
  ) : undefined;

  // PREMIUM COSMETIC BADGE ONLY (2026-09-05 fix): checkCharacterTierAccess
  // in lib/rate-limit/index.ts is a hardcoded `{ allowed: true }` — per its
  // own "PRODUCT DECISION" comment, no character is tier-locked anymore,
  // for anyone. This card used to pair the Crown badge with an "Unlock"
  // CTA (see git history), which told every viewer a paywall existed and
  // a tap would hit it — false on both counts, since the backend never
  // blocks. Badge kept (still useful as a premium/prestige marker) but the
  // "Unlock" affordance below is removed; do not reintroduce a lock/unlock
  // label here unless checkCharacterTierAccess is also restored to
  // actually gate, or this goes back to promising a gate that isn't there.
  const cornerBadge = character.is_premium ? (
    <Badge
      variant="outline"
      className="gap-1 border-gold-500/60 bg-black/50 shadow-gold-glow backdrop-blur-md"
    >
      <Crown className="h-3 w-3 fill-gold-400" strokeWidth={1.5} />
      Premium
    </Badge>
  ) : undefined;

  // Real column, not a synthetic presence signal — see CARD-POLISH FIX above.
  const showDescription = !character.reason && character.description;

  return (
    <MediaCard
      href={`/characters/${character.id}`}
      image={resolveImageSrc(character.image_url)}
      alt={character.name}
      badge={badge}
      cornerBadge={cornerBadge}
      onClick={() => pingCharacterClick(character.id)}
      className={cn("shrink-0 w-[168px] sm:w-[200px]", className)}
    >
      <div className="text-text-primary font-semibold text-[15px] leading-tight truncate">
        {character.name}
        {character.age ? (
          <span className="text-text-secondary font-normal">, {character.age}</span>
        ) : null}
      </div>
      {traitLine && (
        <div className="text-text-secondary text-xs mt-0.5 truncate">
          {traitLine}
        </div>
      )}
      {character.reason && (
        <div className="text-gold-400/90 text-xs mt-1 leading-snug line-clamp-2">
          {character.reason}
        </div>
      )}
      {showDescription && (
        <p className="text-text-secondary/90 text-xs mt-1 leading-snug line-clamp-2">
          {character.description}
        </p>
      )}
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-1 text-gold-400 text-xs font-semibold tabular-nums">
          <Heart className="h-3.5 w-3.5 fill-gold-400" strokeWidth={0} />
          {formatCompactCount(character.like_count)}
        </div>
        {character.is_live && (
          <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-danger">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger/75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-danger" />
            </span>
            Live
          </div>
        )}
      </div>
    </MediaCard>
  );
}

/** Fire-and-forget — never blocks or delays the navigation it's attached to. */
function pingCharacterClick(id: string) {
  fetch("/api/characters/click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
    keepalive: true,
  }).catch(() => {});
}
