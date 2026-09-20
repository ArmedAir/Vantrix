"use client";

import { useState } from "react";
import { SafeImage } from "@/components/ui/safe-image";
import { cn } from "@/lib/utils";

/**
 * Phase 1 Immersive UI Upgrade — LIVING-PORTRAIT (interaction revisit):
 * previously ran `animate-breathe` continuously, unconditionally, the
 * moment the entrance settled. Reworked so the character only "breathes"
 * in response to a direct interaction — tap/click (toggles the loop on,
 * tap again to settle it) or keyboard focus (loops while focused, stops
 * on blur) — rather than animating on every page view regardless of
 * whether anyone's actually looking at it.
 *
 * `focus-visible` (not bare `focus`) so mouse-click focus doesn't itself
 * double-trigger the loop on top of the click toggle — only real keyboard/
 * assistive-tech focus gets the focus-driven loop. `ring-inset` keeps the
 * focus indicator inside the portrait's own rounded/overflow-hidden
 * bounds instead of being clipped by the parent (see character-hero.tsx's
 * OVERFLOW-FIX note on this same container).
 *
 * ROTATION-MOTION PARITY (see tailwind.config.ts's `sway` keyframe doc
 * for the full reasoning): this is the flat-image fallback tier for the
 * same two large hero instances (CharacterHero's detail-page portrait and
 * the landing page's featured portrait — character-portrait-viewer.tsx's
 * only two callers) whose 3D tiers already auto-rotate every frame.
 * `animate-sway` runs unconditionally, independent of `awake` — it's the
 * baseline "this large image has rotation motion" behavior, not an
 * interaction reward like breathe is. `transform-gpu` keeps the
 * continuous rotateY on the compositor rather than triggering layout.
 *
 * Global prefers-reduced-motion kill switch in globals.css still wins
 * regardless of interaction state, for both animations.
 */
export function LivingPortrait({
  src,
  alt,
  sizes,
  priority,
  className,
}: {
  src: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  const [awake, setAwake] = useState(false);

  return (
    <SafeImage
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      tabIndex={0}
      role="button"
      aria-pressed={awake}
      aria-label={`${alt} portrait — tap or focus to animate`}
      onClick={() => setAwake((prev) => !prev)}
      onFocus={() => setAwake(true)}
      onBlur={() => setAwake(false)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setAwake((prev) => !prev);
        }
      }}
      className={cn(
        "object-cover cursor-pointer select-none transform-gpu animate-sway",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400",
        "focus-visible:animate-breathe",
        awake && "animate-breathe",
        className,
      )}
    />
  );
}
