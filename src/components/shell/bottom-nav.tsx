"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageCircle, ImageIcon as Feed, Sparkles, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-config";
import { useScrollChromeHidden } from "./scroll-chrome-context";

/**
 * Mobile bottom bar — BOTTOM-NAV-SIMPLIFY PASS (per direct request):
 * back to a 5-item bar — Home, Chat, Feed, Studio, Premium. Characters
 * and Dating are dropped from this shortcut bar specifically (neither
 * route is removed from the app: both stay fully reachable from the
 * desktop rail and mobile drawer via nav-config.ts's NAV_ITEMS, which
 * this file has never derived from — it has always kept its own
 * hardcoded list, same as before this pass).
 *
 * Chat -> "/chats" (the conversation list — NAV_ITEMS' own "Chats" entry
 * uses the same route+icon), not "/chat" (an individual thread has no
 * meaning as a shortcut destination with no id).
 *
 * Current state:
 *   - Home    -> "/"        (this page)
 *   - Chat    -> "/chats"   (conversation list)
 *   - Feed    -> "/feed"    (community feed — /api/feed/posts-backed)
 *   - Studio  -> "/studio"  (character/scene creation tools)
 *   - Premium -> "/premium" (subscription/upsell — gets the same gold
 *                            "premium" treatment NAV_ITEMS marks it
 *                            with elsewhere, not a plain icon)
 * Characters, Dating, and Settings are still one tap away via the
 * drawer (hamburger, top-left) and the desktop rail's account row.
 */
const BOTTOM_NAV_ITEMS: (NavItem & { match: (pathname: string) => boolean })[] = [
  {
    href: "/",
    label: "Home",
    icon: Home,
    match: (p) => p === "/",
  },
  {
    href: "/chats",
    label: "Chat",
    icon: MessageCircle,
    match: (p) => p.startsWith("/chats") || p.startsWith("/chat/"),
  },
  {
    href: "/feed",
    label: "Feed",
    icon: Feed,
    match: (p) => p.startsWith("/feed"),
  },
  {
    href: "/studio",
    label: "Studio",
    icon: Sparkles,
    match: (p) => p.startsWith("/studio"),
  },
  {
    href: "/premium",
    label: "Subscription",
    icon: Crown,
    premium: true,
    match: (p) => p.startsWith("/premium"),
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const hidden = useScrollChromeHidden();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "md:hidden fixed bottom-0 left-0 right-0 z-40 bg-base border-t border-border-hairline pb-[env(safe-area-inset-bottom)] transition-transform duration-200 ease-premium",
        hidden && "translate-y-full"
      )}
    >
      <div className="flex items-stretch justify-between h-16 px-1">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1"
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-8 bg-gold-500 rounded-full" />
              )}
              <Icon
                className={cn(
                  "h-5 w-5",
                  active
                    ? "text-gold-400"
                    : item.premium
                      ? "text-gold-500/80"
                      : "text-text-secondary"
                )}
                strokeWidth={active ? 2 : 1.75}
              />
              <span
                className={cn(
                  "text-[10px] font-medium leading-none",
                  active
                    ? "text-gold-400"
                    : item.premium
                      ? "text-gold-500/80"
                      : "text-text-tertiary"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
