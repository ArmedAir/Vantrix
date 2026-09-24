import { cn } from "@/lib/utils";

/**
 * UX AUDIT FIX (item 4): the app had zero loading.tsx files anywhere, so
 * every server-rendered page showed a blank screen for the duration of
 * its data fetch. tailwind.config.ts already defines a `shimmer`
 * keyframe/animation for exactly this purpose — it just had no consumer
 * yet. Kept to a translucent white overlay rather than a new bg color,
 * per §1 ("one background value everywhere"): this is a transient
 * placeholder element, not a surface panel.
 *
 * PERF FIX: switched from `animate-shimmer` (animates background-position
 * — repaints every frame, flagged by Lighthouse's "avoid non-composited
 * animations") to a `relative overflow-hidden` shape with a separate
 * `animate-shimmer-slide` overlay (animates transform only — compositor
 * thread, no repaint). Same look: a soft light band sweeping across a
 * dim static base, just cheaper to run. See tailwind.config.ts's note on
 * why the original `shimmer` keyframe stays as-is for logo.tsx's
 * gradient-text wordmark, which can't use this same transform trick.
 */
export function Skeleton({ className }: { className?: string }) {
 return (
 <div aria-hidden className={cn("relative overflow-hidden rounded-sm bg-white/[0.04]", className)}>
 <div className="absolute inset-0 -translate-x-full animate-shimmer-slide bg-gradient-to-r from-transparent via-white/[0.09] to-transparent" />
 </div>
 );
}
