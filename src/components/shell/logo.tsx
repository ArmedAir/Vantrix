import { cn } from "@/lib/utils";

/**
 * Shared Vantrix brand mark.
 *
 * LOGO FIX: PublicHeader, Sidebar, and MobileDrawer each hand-rolled the
 * same placeholder — a plain gold `<span>` tile with a hardcoded "V"
 * character — instead of the platform's actual designed logo (the
 * pink-to-orange gradient V mark already shipped as the PWA/app icon at
 * public/icons/icon-512.png, just never wired into any in-app header).
 * That mark is duplicated here as a dedicated branding asset
 * (public/images/vantrix-logo.png) decoupled from the PWA manifest icon
 * set, so this component is the one place the brand mark is defined —
 * three call sites now render the real logo instead of a text-in-a-box
 * placeholder, and can't drift out of sync with each other again.
 *
 * ANIMATION + THEME FIX: adds an idle glow halo behind the mark, and an
 * optional animated wordmark (`withWordmark`) — both driven entirely by
 * the existing theme CSS variables (--gold-400/500/600, --gold-glow-
 * shadow — see globals.css's [data-theme="..."] blocks), not a
 * component-level theme read. That means this needs zero awareness of
 * which of the four themes (gold/nova/velvet/aurora) is active: the
 * glow's color and the wordmark's gradient just re-resolve automatically
 * whenever `data-theme` on <html> changes, the same mechanism every
 * other themed surface in the app already relies on (see
 * theme-toggle.tsx / theme-hydration.tsx for how that attribute gets
 * set). No JS, no re-render, no theme prop threaded through here.
 *
 * MARK RECOLOR FIX: the mark itself used to be a flat <Image> of the
 * static PNG, so — unlike the glow and the wordmark above — it stayed
 * the same fixed pink/gold no matter which theme was active. It's now
 * painted with `.vantrix-mark` (globals.css), which masks a colorless
 * cutout of the same artwork (vantrix-logo-mask.png) with the live
 * gold-400/500/600 gradient. Same "flip data-theme, everything
 * re-skins" contract as the rest of this component — see the comment
 * on `.vantrix-mark` in globals.css for how the cutout was derived.
 *
 * `withWordmark` replaces the old pattern of each call site hand-writing
 * its own `<span>Vantrix</span>` next to `<Logo/>` (TopBar, PublicHeader,
 * /enter all used to do this three separate times, with three separate
 * chances to drift) — one prop, one definition, same "can't drift out of
 * sync" reasoning as the mark itself above.
 */
export function Logo({
  size = 28,
  className,
  withWordmark = false,
  wordmarkClassName,
}: {
  size?: number;
  className?: string;
  /** Render the animated "Vantrix" wordmark next to the mark. */
  withWordmark?: boolean;
  /** Extra classes for the wordmark span (font-size, etc.) — the mark's
   *  own `size` prop doesn't control text size, so callers that need a
   *  bigger/smaller wordmark (TopBar vs PublicHeader use different
   *  scales) pass that here instead of a second numeric prop. */
  wordmarkClassName?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
        {/* Idle glow halo — see ANIMATION + THEME FIX above. Sits behind
            the image (z-0 vs the image's z-10) and matches its rounding
            so the glow reads as bleeding out from the mark's own edges
            rather than a mismatched rectangle behind a rounded icon. */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-xs shadow-gold-glow animate-glow-pulse"
        />
        <span
          role="img"
          aria-label="Vantrix"
          className={cn("relative z-10 block h-full w-full shrink-0 select-none vantrix-mark", className)}
        />
      </span>
      {withWordmark && (
        <span
          className={cn(
            "font-display tracking-tight whitespace-nowrap bg-gradient-to-r from-gold-400 via-gold-500 to-gold-600 bg-clip-text text-transparent bg-[length:200%_100%] animate-shimmer",
            wordmarkClassName
          )}
        >
          Vantrix
        </span>
      )}
    </span>
  );
}
