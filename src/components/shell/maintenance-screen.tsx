import { Wrench } from "lucide-react";
import { CinematicBackground } from "@/components/immersive/cinematic-background";
import { Logo } from "@/components/shell/logo";

/**
 * MAINTENANCE-MODE: rendered by (app)/layout.tsx in place of the normal
 * app shell whenever /admin/settings → General → "Maintenance mode" is
 * on and the current visitor isn't an admin (admins always pass through
 * — see the layout's own comment at the call site — so the team can
 * still use the product to verify things during the maintenance window
 * itself). No chrome, no nav, nothing account-scoped: this has to render
 * correctly for a signed-out visitor hitting "/" too, not just for a
 * logged-in user bounced off some deeper route.
 */
export function MaintenanceScreen({ message }: { message: string }) {
  return (
    <div className="relative min-h-screen bg-base flex items-center justify-center px-4">
      <CinematicBackground intensity="subtle" />
      <div className="relative z-10 max-w-sm w-full text-center space-y-6">
        <Logo className="mx-auto h-8 w-auto" />
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border-hairline bg-surface-raised">
          <Wrench className="h-5 w-5 text-gold-500" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-xl text-text-primary">
            Be right back
          </h1>
          <p className="text-sm text-text-secondary leading-relaxed">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}
