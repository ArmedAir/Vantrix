import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Base card. Per FRONTEND_DIRECTIVE §1: same bg-base as the page, no
 * lighter surface fill. Elevation and separation come only from the
 * hairline border + shadow, brightened on hover (also border-only —
 * see §6, "subtle gold border brighten, no background change").
 *
 * `glass` opts into the premium "glasscard" treatment (character cards
 * etc.): a translucent bg-base fill + backdrop-blur instead of a flat
 * fill, a brighter gold-tinted hairline, an inset top sheen for glass
 * depth, and a soft gold glow on hover instead of just a border-color
 * bump. Still 100% theme-driven (uses the same --color-base / --gold-*
 * CSS vars as everything else), so it re-skins correctly under
 * data-theme="nova"/etc. with zero per-file edits — no new hardcoded
 * hex was introduced here.
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
        ? "bg-base/60 backdrop-blur-xl border-gold-500/15 shadow-glass"
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
