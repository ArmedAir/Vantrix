import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { AccountAwareCta } from "@/components/public/account-aware-cta";
import { Logo } from "@/components/shell/logo";

/**
 * Shared header for standalone public pages (about, careers, blog, support,
 * terms, privacy, /discover, /premium). These sit outside the (app) route
 * group, so they don't get Sidebar/TopBar — this is the minimal
 * equivalent: brand mark back to "/", theme toggle (so a signed-out
 * visitor can preview nova too — see components/theme/theme-toggle.tsx),
 * plus a Log In CTA, matching TopBar's mark markup (src/components/shell/
 * top-bar.tsx) so the brand looks identical whether a visitor is signed
 * in or not.
 *
 * WORDMARK-REMOVED FIX: dropped the "Vantrix" text span next to the
 * logo image — logo only, matching TopBar's own identical fix.
 * LOGO-ANIMATION FIX: wordmark restored via Logo's `withWordmark` prop
 * (animated + theme-reactive, see logo.tsx) instead of a hand-written
 * span, matching TopBar again.
 *
 * SIGNED-IN-SEES-LOG-IN FIX: this used to render the "Log In" CTA
 * unconditionally, with no auth check at all — a signed-in user who
 * landed on any of these pages (e.g. via Sidebar/MobileDrawer's Help
 * Center link, which points at /support) saw a header telling them to
 * log in despite already having an active session.
 *
 * STATIC-RENDERING FIX (this revision): the first fix for the above did
 * the auth check here, server-side, via getAuthedUser() — which reads
 * headers()/cookies() and so forces Next to opt the *entire page* out of
 * static rendering. That silently broke /discover's `revalidate = 120`
 * ISR and blog/[slug]'s generateStaticParams build-time generation for
 * every page that mounts this header, trading a real correctness bug for
 * a real performance regression. The CTA now lives in AccountAwareCta, a
 * client component that checks session via a tiny dedicated endpoint
 * after mount — PublicHeader itself stays a plain static component again,
 * so pages that should be static/ISR-cached still are.
 */
export function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 h-16 flex items-center justify-between gap-3 px-4 md:px-8 bg-base/90 backdrop-blur border-b border-border-hairline">
      <Link href="/" className="flex items-center">
        <Logo size={28} withWordmark wordmarkClassName="text-lg" />
      </Link>
      <div className="flex items-center gap-1.5">
        <ThemeToggle />
        <AccountAwareCta />
      </div>
    </header>
  );
}
