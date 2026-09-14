import type { LucideIcon } from "lucide-react";
import { Lock, Clock, ShieldCheck, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * VERIFICATION-UI: the signature visual for every mature-content /
 * identity-verification surface (the [id]/page.tsx access screen,
 * DateOfBirthField's status card) — a circular gold medallion, not a
 * generic lock-in-a-circle. The idea: verification here isn't a paywall
 * or an error state, it's a credential you're issued once you clear it,
 * so the one bold element on either screen is a "seal" that reads as
 * closed (thin ring, dim icon) until earned, then reads as struck
 * (solid gold ring + glow) once it is. Both surfaces import this one
 * component instead of each drawing their own icon-in-a-circle, so the
 * motif stays identical everywhere it appears.
 *
 * Deliberately reuses only existing tokens (gold ramp, shadow-gold-glow,
 * ease-premium) — see tailwind.config.ts's own note that gold/base are
 * the only themed colors and nothing else in the file should be
 * hardcoded, so this earns its "premium" feeling from composition
 * (glow, ring weight, icon choice) rather than a new color.
 */
const STATE_CONFIG: Record<
  "locked" | "pending" | "sealed" | "declined",
  { icon: LucideIcon; ring: string; iconClass: string; glow: boolean }
> = {
  locked: {
    icon: Lock,
    ring: "border-gold-500/25",
    iconClass: "text-gold-500/60",
    glow: false,
  },
  pending: {
    icon: Clock,
    ring: "border-gold-500/50",
    iconClass: "text-gold-400",
    glow: false,
  },
  sealed: {
    icon: ShieldCheck,
    ring: "border-gold-400",
    iconClass: "text-gold-300",
    glow: true,
  },
  declined: {
    icon: ShieldX,
    ring: "border-gold-500/25",
    iconClass: "text-text-tertiary",
    glow: false,
  },
};

export function VerificationSeal({
  state,
  className,
}: {
  state: "locked" | "pending" | "sealed" | "declined";
  className?: string;
}) {
  const { icon: Icon, ring, iconClass, glow } = STATE_CONFIG[state];

  return (
    <div
      aria-hidden
      className={cn(
        "relative mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 bg-base transition-colors duration-500 ease-premium",
        ring,
        glow && "shadow-gold-glow",
        className
      )}
    >
      {/* Inner hairline ring — gives the medallion two edges (like a
          struck coin/wax seal) instead of one flat circle. Static; the
          only thing that changes between states is color/glow above. */}
      <div className="absolute inset-[6px] rounded-full border border-border-hairline" />
      <Icon className={cn("h-7 w-7 relative", iconClass)} strokeWidth={1.75} />
    </div>
  );
}
