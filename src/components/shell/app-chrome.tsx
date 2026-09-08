"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/shell/sidebar";
import { MobileDrawer } from "@/components/shell/mobile-drawer";
import { MainOffset } from "@/components/shell/main-offset";
import { TopBar } from "@/components/shell/top-bar";
import { BottomNav } from "@/components/shell/bottom-nav";
import { ScrollChromeProvider } from "@/components/shell/scroll-chrome-context";
import { AnalyticsIdentify } from "@/lib/analytics/client";
import { NotificationCenterProvider } from "@/components/notifications/notification-center-provider";
import type { ShellProfile } from "@/lib/frontend/session";
import { cn } from "@/lib/utils";

/**
 * STALE-CHROME FIX (2026-09-07): everything that depends on "is this the
 * immersive /chat/[id] or /roleplay/[sessionId] screen" — the fixed-vs-
 * scrolling outer wrapper, TopBar, BottomNav — used to be decided in
 * (app)/layout.tsx, a Server Component, off the `x-pathname` header the
 * middleware forwards on the *initial* request. That's correct on a hard
 * load, but (app)/layout.tsx wraps nearly every authenticated route, so
 * the App Router keeps it mounted across navigations and does not re-run
 * its Server Component body just because a child page.tsx segment
 * changed — only the initial request's pathname was ever actually
 * captured. Tapping "Message" on a Feed post (use-ensure-conversation.ts's
 * router.push(`/chat/${id}`)) is exactly that kind of soft navigation: it
 * lands on /chat/[id] while the layout still thinks it's on whatever page
 * sent it there, so TopBar/BottomNav kept rendering over the chat screen
 * (and, since the outer wrapper's `fixed inset-0 h-[var(--vvh)]` sizing
 * never kicked in either, could end up overlapping the composer/keyboard
 * entirely). A hard refresh on /chat/[id] always "fixed" it — the value
 * was right on first load and only went stale across a client-side nav.
 *
 * Fix: the whole chrome decision now lives in this Client Component,
 * keyed off usePathname() (the same hook BottomNav already uses for its
 * own active-item highlighting) instead of a server-computed header.
 * usePathname() re-renders on every navigation, hard or soft, so this can
 * never drift from the URL actually on screen. This component now owns
 * the entire shell shape (outer wrapper, Sidebar/MobileDrawer, Analytics/
 * Notifications, TopBar/BottomNav) rather than splitting the immersive
 * class on the outer div from the TopBar/BottomNav decision one level
 * down — those two were the same "is this immersive" question and had to
 * move together or they'd just drift from each other again.
 */
function isImmersiveRoute(pathname: string): boolean {
  return (
    /^\/chat\/[^/]+\/?$/.test(pathname) ||
    /^\/roleplay\/(?!new\b)[^/]+\/?$/.test(pathname)
  );
}

export function AppChrome({
  profile,
  contactEmail,
  children,
}: {
  profile: ShellProfile;
  contactEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const immersive = isImmersiveRoute(pathname);

  return (
    // KEYBOARD-DANCE FIX (kept from the previous server-side version):
    // `fixed inset-0 h-[var(--vvh)]` (not `h-dvh`, which never shrinks
    // for the iOS keyboard) removes the immersive screen from document
    // flow entirely so there's nothing left for iOS's on-focus
    // scrollIntoView to scroll — see chat/[id]/page.tsx and
    // roleplay-stage.tsx, which both already size their own root against
    // `h-[var(--vvh)]` for the same reason.
    <div
      className={cn(
        "flex bg-base",
        immersive ? "fixed inset-0 h-[var(--vvh)] overflow-hidden" : "min-h-screen"
      )}
    >
      <AnalyticsIdentify userId={profile.id} />
      <NotificationCenterProvider
        userId={profile.id}
        initialUnreadCount={profile.unreadNotifications}
        initialRecent={profile.recentNotifications}
      />
      <Sidebar
        isAdmin={profile.isAdmin}
        tier={profile.tier}
        displayName={profile.displayName}
        username={profile.username}
        avatarUrl={profile.avatarUrl}
        contactEmail={contactEmail}
      />
      <MobileDrawer
        isAdmin={profile.isAdmin}
        tier={profile.tier}
        displayName={profile.displayName}
        username={profile.username}
        avatarUrl={profile.avatarUrl}
        tokens={profile.tokens}
        contactEmail={contactEmail}
      />
      {immersive ? (
        <MainOffset className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
        </MainOffset>
      ) : (
        <ScrollChromeProvider>
          <MainOffset className="flex-1 flex flex-col min-w-0">
            <TopBar profile={profile} />
            {/* BOTTOM-NAV-HEIGHT SYNC: matches BottomNav's own h-16
                (Home/Characters/Dating/Feed/Studio/Premium bar) — this
                reserves exactly that much space below page content so
                the fixed bar doesn't overlap the last section on any
                route. Must move together with that component's height;
                a mismatch here means either a gap above the bar or real
                content clipped underneath it. */}
            {/* TOP-BAR now `fixed` (see top-bar.tsx's FIXED-HEADER FIX) and
                no longer reserves its own h-12 in flow -- pt-12 replaces
                that reserved space so content doesn't render under it. */}
            <main className="flex-1 min-w-0 pt-12 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
              {children}
            </main>
          </MainOffset>
          <BottomNav />
        </ScrollChromeProvider>
      )}
    </div>
  );
}
