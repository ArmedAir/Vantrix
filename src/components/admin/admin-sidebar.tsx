"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  ADMIN_NAV_ITEMS,
  ADMIN_NAV_GROUP_LABELS,
  type AdminNavGroup,
} from "./admin-nav-config";
import { NavLink, isNavItemActive } from "@/components/ui/nav-link";
import { Tooltip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

const RAIL_STORAGE_KEY = "vantrix-admin-rail-collapsed";

const GROUP_ORDER: AdminNavGroup[] = ["overview", "content", "growth", "platform"];
const GROUPED_ITEMS = GROUP_ORDER.map((group) => ({
  group,
  label: ADMIN_NAV_GROUP_LABELS[group],
  items: ADMIN_NAV_ITEMS.filter((item) => item.group === group),
}));

/**
 * SIDEBAR REDESIGN — luxurious pass (was: SIDEBAR UPGRADE PASS).
 *
 * The old version was a single unbroken 14-row list — every destination
 * given equal visual weight, no rhythm, no sense of where one kind of
 * task ends and another begins. That's the opposite of "professional":
 * a dense flat list is what a sidebar looks like *before* someone
 * designs its IA. This pass groups the same 14 destinations into four
 * clusters (Overview / Content / Growth / Platform — see
 * admin-nav-config.ts) rendered as labeled sections with a hairline
 * between them, so the eye can chunk the rail into "sections" instead
 * of "a list." Four is deliberate — few enough that the grouping itself
 * still reads as restraint rather than a second layer of clutter.
 *
 * Also added, reusing infrastructure that already existed for exactly
 * this (see nav-link.tsx's `collapsed`/`Tooltip` support, built for
 * Sidebar's rail but never wired up here): a collapse-to-icons toggle,
 * matching the flagship Sidebar's 76px rail width and tablet-breakpoint
 * auto-collapse, persisted locally so the choice survives a refresh.
 * Unlike Sidebar this one doesn't need `fixed` + a layout-level margin
 * offset — admin/layout.tsx already lays this out as a plain flex
 * child, so the width transition alone reflows the content column for
 * free.
 *
 * Active-row rendering still goes through the shared NavLink (icon
 * size, aria-current, accent bar) — unchanged from the prior pass.
 * isAdminItemActive below only patches one thing on top of NavLink's
 * own isNavItemActive: "/admin" was matching every /admin/* route via
 * startsWith (the same way "/" is special-cased upstream), which meant
 * Overview rendered active on every single admin page, not just the
 * dashboard root. Scoped to this file rather than editing the shared
 * helper, since Sidebar/MobileDrawer's own root item is a real "/" and
 * don't have this problem.
 */
function isAdminItemActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return isNavItemActive(pathname, href);
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const isTabletRange = useMediaQuery("(min-width: 768px) and (max-width: 1023px)");

  // Read the persisted choice once on mount; fall back to the tablet
  // breakpoint default when the user has never toggled it manually.
  // Deliberately not read synchronously at module scope so the server
  // render and first client paint both use the plain expanded default
  // and never mismatch during hydration (same rationale as Sidebar's
  // own rehydrate-in-an-effect pattern).
  useEffect(() => {
    const stored = window.localStorage.getItem(RAIL_STORAGE_KEY);
    setCollapsed(stored !== null ? stored === "1" : isTabletRange);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(RAIL_STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed, hydrated]);

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col shrink-0 h-screen sticky top-0 bg-base border-r border-border-hairline transition-[width] duration-200 ease-premium",
        collapsed ? "w-[76px]" : "w-[220px]"
      )}
    >
      <div className="h-16 flex items-center px-5 border-b border-border-hairline shrink-0 overflow-hidden">
        <Link href="/admin" className="group flex items-center gap-2 overflow-hidden">
          <span className="h-6 w-6 shrink-0 rounded-xs bg-gold-fill shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset] flex items-center justify-center font-display font-bold text-[#160F02] text-xs transition-transform duration-200 ease-premium group-hover:scale-105">
            V
          </span>
          {!collapsed && (
            <span className="font-display text-[15px] tracking-tight whitespace-nowrap animate-fade-in">
              Admin
            </span>
          )}
        </Link>
      </div>

      <nav aria-label="Admin" className="flex-1 overflow-y-auto py-4 px-2">
        {GROUPED_ITEMS.map((section, gi) => (
          <div
            key={section.group}
            className={cn(gi > 0 && "mt-5 pt-4 border-t border-border-hairline")}
          >
            {!collapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary animate-fade-in">
                {section.label}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item, i) => (
                <div
                  key={item.href}
                  className="animate-fade-in"
                  style={{ animationDelay: `${Math.min(i * 30, 150)}ms`, animationFillMode: "backwards" }}
                >
                  <NavLink
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={isAdminItemActive(pathname, item.href)}
                    collapsed={collapsed}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-2 border-t border-border-hairline shrink-0 space-y-1">
        <Tooltip content="Back to Vantrix" side="right" disabled={!collapsed}>
          <Link
            href="/"
            className={cn(
              "group flex items-center gap-3 rounded-xs px-3 py-2.5 text-sm font-medium text-text-tertiary hover:text-text-secondary hover:bg-white/[0.04] transition-colors ease-premium",
              collapsed && "justify-center px-0"
            )}
          >
            <ArrowLeft className="h-4 w-4 shrink-0 transition-transform duration-200 ease-premium group-hover:-translate-x-0.5" strokeWidth={1.75} />
            {!collapsed && <span className="whitespace-nowrap">Back to Vantrix</span>}
          </Link>
        </Tooltip>

        <Tooltip content={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="right" disabled={!collapsed}>
          <Button
            variant="ghost"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "group h-auto w-full justify-start gap-3 rounded-xs px-3 py-2.5 text-sm font-medium",
              collapsed && "justify-center px-0"
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4 transition-transform duration-200 ease-premium group-hover:scale-110" strokeWidth={1.75} />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4 shrink-0 transition-transform duration-200 ease-premium group-hover:scale-110" strokeWidth={1.75} />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </Tooltip>
      </div>
    </aside>
  );
}
