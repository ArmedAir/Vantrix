import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Base card. Per FRONTEND_DIRECTIVE §1: same bg-base as the page, no
 * lighter surface fill. Elevation and separation come only from the
 * hairline border + shadow, brightened on hover (also border-only —
 * see §6, "subtle gold border brighten, no background change").
 *
 * `glass` opts into the premium "glasscard" treatment (dating/premium/
 * community/world surfaces — anywhere a card sits directly on the page
 * background rather than being fully covered by its own image, see
 * media-card.tsx's own comment on why *it* doesn't use this): a
 * translucent bg-base fill + backdrop-blur + backdrop-saturate instead
 * of a flat fill (saturate is what actually reads as "glass" rather
 * than just "blurry" — it's the classic frosted-glass boost that lifts
 * color/contrast in whatever's behind the pane), a brighter gold-tinted
 * hairline, an inset top sheen + edge ring for glass depth, and a soft
 * gold glow on hover instead of just a border-color bump. Still 100%
 * theme-driven (uses the same --color-base / --gold-* CSS vars as
 * everything else), so it re-skins correctly under data-theme="nova"/
 * etc. with zero per-file edits — no new hardcoded hex was introduced
 * here.
 *
 * PERF NOTE: backdrop-filter is real GPU cost per element, so `glass`
 * is meant for the few-per-screen surfaces listed above, not a dense
 * grid/list — media-card.tsx (up to ~200 instances on /characters) is
 * the reason this isn't just the default for every card. Reach for
 * `glass` on singular/small-count cards; leave grids/long lists plain.
 */
export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean; glass?: boolean }
>(({ className, interactive = true, glass = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "border rounded-md overflow-hidden",
      glass
        ? "bg-base/60 backdrop-blur-xl backdrop-saturate-150 border-gold-500/15 shadow-glass ring-1 ring-inset ring-white/[0.05]"
        : "bg-base border-border-hairline shadow-card",
      interactive &&
        (glass
          ? "transition-[border-color,box-shadow,transform] duration-300 ease-premium hover:border-gold-500/50 hover:shadow-glass-hover hover:-translate-y-0.5"
          : "transition-[border-color,box-shadow] duration-200 ease-premium hover:border-gold-500/40"),
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";
