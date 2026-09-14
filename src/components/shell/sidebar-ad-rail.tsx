"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { SafeImage as Image } from "@/components/ui/safe-image";
import { ExternalLink, Megaphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { resolveImageSrc } from "@/lib/utils";
import type { HeroAd } from "@/lib/frontend/ads";

/**
 * SIDEBAR-ADS-WIRING: consumer for the 'sidebar' ad position — the third
 * and last of the `ads` table's position values to get a frontend
 * consumer (see feed-inline-ad.tsx's own FEED-ADS-WIRING note for the
 * 'inline' precedent this follows). Rendered once, app-wide, as a
 * persistent rail in AppChrome (desktop-only — see that component)
 * rather than per-page, so unlike FeedInlineAd this stacks a short list
 * rather than rendering a single ad per mount.
 *
 * Link routing, impression/click tracking, and hide_overlay handling
 * are copied verbatim from FeedInlineAd — same contract, same
 * /api/go outbound router, same POST /api/ads {id, stat} ping — kept as
 * a separate component (not a shared generic) because the two render
 * completely different card shapes (portrait 4/5 feed card vs. a
 * compact 16/10 rail tile) and diverging that further later shouldn't
 * mean untangling a shared one.
 */
export function SidebarAdRail({ ads }: { ads: HeroAd[] }) {
  if (ads.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
        <Megaphone className="h-3 w-3" />
        Sponsored
      </div>
      {ads.map((ad) => (
        <SidebarAdTile key={ad.id} ad={ad} />
      ))}
    </div>
  );
}

function SidebarAdTile({ ad }: { ad: HeroAd }) {
  const pinged = useRef(false);

  useEffect(() => {
    if (pinged.current) return;
    pinged.current = true;
    pingAdStat(ad.id, "impression");
  }, [ad.id]);

  const isExternal = !ad.link.startsWith("/");
  const href = isExternal
    ? `/api/go?url=${encodeURIComponent(ad.link)}&adId=${encodeURIComponent(ad.id)}`
    : ad.link || "#";

  return (
    <Card className="p-0" interactive={false}>
      <AdTileLink
        href={href}
        isExternal={isExternal}
        adId={ad.id}
        className="relative block aspect-[16/10] w-full overflow-hidden bg-black/40"
      >
        <Image
          src={resolveImageSrc(ad.image_url)}
          alt={ad.title}
          fill
          sizes="280px"
          className="object-cover"
        />
        {ad.hide_overlay ? (
          isExternal && (
            <div className="absolute right-2 top-2 rounded-full bg-black/50 p-1">
              <ExternalLink className="h-3 w-3 text-text-secondary" aria-hidden />
            </div>
          )
        ) : (
          <>
            <div
              className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent"
              aria-hidden
            />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2.5">
              <p className="font-display text-sm leading-tight text-text-primary">{ad.title}</p>
              {isExternal && (
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-secondary" aria-hidden />
              )}
            </div>
          </>
        )}
      </AdTileLink>
    </Card>
  );
}

function AdTileLink({
  href,
  isExternal,
  adId,
  className,
  children,
}: {
  href: string;
  isExternal: boolean;
  adId: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (isExternal) {
    // /api/go already increments the click stat server-side before
    // redirecting, so no onClick ping here — see feed-inline-ad.tsx's
    // identical note.
    return (
      <a href={href} target="_blank" rel="noopener noreferrer sponsored" className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} onClick={() => pingAdStat(adId, "click")} className={className}>
      {children}
    </Link>
  );
}

function pingAdStat(id: string, stat: "impression" | "click") {
  fetch("/api/ads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, stat }),
    keepalive: true,
  }).catch(() => {});
}
