"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ADMIN_NAV_ITEMS } from "./admin-nav-config";
import { ScrollSignalBar } from "./motion/scroll-signal-bar";
import { ScrollReactiveHeaderShade } from "./motion/scroll-reactive-header-shade";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function AdminTopBar() {
  const pathname = usePathname();
  const current = [...ADMIN_NAV_ITEMS]
    .reverse()
    .find((i) => (i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href)));

  return (
    <header className="sticky top-0 z-40 h-16">
      <ScrollReactiveHeaderShade />
      <ScrollSignalBar />
      <div className="relative h-full flex items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-2 md:hidden">
          <span className="h-6 w-6 rounded-xs bg-gold-fill flex items-center justify-center font-display font-bold text-[#160F02] text-xs">
            V
          </span>
          <span className="font-display text-[15px]">Admin</span>
        </div>
        <h1 className="hidden md:block font-display text-lg">
          {current?.label ?? "Admin"}
        </h1>
        <nav className="flex md:hidden items-center gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0 mx-2">
          {ADMIN_NAV_ITEMS.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-full border transition-colors ease-premium",
                  active
                    ? "border-gold-500/60 text-gold-400"
                    : "border-border-hairline text-text-secondary"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Tooltip content="Back to Vantrix" side="bottom">
          <Link
            href="/"
            aria-label="Back to Vantrix"
            className="group hidden md:flex items-center gap-2 shrink-0 rounded-full border border-border-hairline px-3.5 py-1.5 text-xs font-medium text-text-secondary transition-all ease-premium hover:border-gold-500/60 hover:text-gold-400 hover:shadow-[0_0_0_1px_rgba(212,175,55,0.15)]"
          >
            <ArrowLeft
              className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 ease-premium group-hover:-translate-x-0.5"
              strokeWidth={1.75}
            />
            <span className="whitespace-nowrap">Back to Vantrix</span>
          </Link>
        </Tooltip>
        <Link
          href="/"
          aria-label="Back to Vantrix"
          className="group flex md:hidden items-center justify-center shrink-0 h-8 w-8 rounded-full border border-border-hairline text-text-secondary transition-all ease-premium active:scale-95 hover:border-gold-500/60 hover:text-gold-400"
        >
          <ArrowLeft
            className="h-4 w-4 transition-transform duration-200 ease-premium group-hover:-translate-x-0.5"
            strokeWidth={1.75}
          />
        </Link>
      </div>
    </header>
  );
}
