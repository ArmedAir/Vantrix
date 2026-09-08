"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { EASE_VANTRIX, DURATION } from "./motion";

/**
 * Plain page-load entrance (opacity + subtle scale, no blur) — the
 * non-route-scoped sibling of CharacterSectionTransition. That component
 * keys off `pathname` and lives in a layout so it can replay on every
 * navigation within /characters; this one is meant to be dropped directly
 * into a single page's content (premium, profile, ...) that only needs a
 * one-time "this page just arrived" reveal on mount, not a route-change
 * transition. No blur filter — that's an expensive-looking flourish that
 * earns its cost on the immersive character surfaces, but a plain
 * fade+rise reads as more appropriate for a settings/checkout-adjacent
 * page than a cinematic blur-in.
 *
 * Reduced-motion falls back to plain children, matching every other
 * motion primitive in this folder.
 */
export function CinematicEntrance({ children }: { children: ReactNode }) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: DURATION.cinematic, ease: EASE_VANTRIX }}
    >
      {children}
    </motion.div>
  );
}
