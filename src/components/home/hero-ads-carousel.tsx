"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SafeImage as Image } from "@/components/ui/safe-image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, resolveImageSrc } from "@/lib/utils";
import type { HeroAd } from "@/lib/frontend/ads";
import { PromoHeroArt, isPromoHeroCode, promoHeroSlugFrom } from "./promo-hero-art";

// AUTO-ROTATE: how long a slide sits before advancing on its own.
const AUTO_ADVANCE_MS = 5500;
// How long a manual interaction (swipe, arrow tap, dot tap) pauses the
// auto-rotate before it resumes — long enough that someone actively
// swiping back and forth never fights the timer, short enough that an
// idle carousel doesn't just sit dead after a single tap.
const RESUME_AFTER_INTERACTION_MS = 8000;

/**
 * Replaces PremiumBanner in the homepage slot below Featured Companions.
 *
 * PERF FIX (supersedes the original client-fetch version): `ads` now
 * arrives as a server-rendered prop from getHeroAds() (see page.tsx and
 * lib/frontend/ads.ts) instead of being fetched client-side in a
 * useEffect. This is above-the-fold hero content — the old version
 * shipped an empty skeleton in the initial HTML and only painted the
 * real banner after hydration + a client fetch resolved, which is a
 * self-inflicted LCP regression for the exact content most likely to
 * BE the page's LCP element. There is now no loading state to handle:
 * the array is either populated or empty by the time this component
 * ever renders.
 *
 * Swipeable via native scroll-snap + onScroll-synced dots, same pattern
 * as hero-carousel.tsx's mobile variant, but unconditional (not
 * `md:hidden`) since this is the only hero content in this slot at
 * every breakpoint — desktop gets hover arrows on top of the same track.
 *
 * AUTO-ROTATE (2026-09-07): the carousel used to be swipe-only — a
 * visitor who never touched it saw exactly one ad for the entire visit,
 * which is a real reach problem for a multi-slide rotation with paid
 * placements in it. Now self-advances every AUTO_ADVANCE_MS via the same
 * scrollTo() the dots/arrows already use (so the motion IS the native
 * swipe animation, just triggered by a timer instead of a finger),
 * loops back to slide 0 after the last one, and pauses for
 * RESUME_AFTER_INTERACTION_MS after any manual interaction — dragging,
 * an arrow click, a dot click — so the auto-advance can never fight a
 * visitor who's actively browsing the slides themselves. Also pauses
 * outright while the tab isn't visible (Page Visibility API) so a
 * backgrounded tab doesn't burn through impressions/slides while no one
 * is looking, and respects prefers-reduced-motion by never starting the
 * timer at all for a visitor who's asked for it.
 *
 * Impressions/clicks are pinged fire-and-forget via POST /api/ads
 * (`{ id, stat }`), matching that route's documented contract. A slide
 * is only counted once per mount (`seen` ref) so re-scrolling back and
 * forth doesn't inflate impressions.
 *
 * REDIRECT-FIX: internal vs. external link handling now mirrors
 * feed-inline-ad.tsx exactly (that component's own ADS-INAPP-FIX comment
 * documents the intended contract) — this component had never been
 * updated to match when that fix landed, so an external ad link here
 * still went straight out via a raw next/link `href`, bypassing /api/go's
 * scheme allowlist and server-side click increment entirely. Internal
 * links (admin/route.ts's create_ad schema only accepts a link starting
 * with a single "/", or a validated http/https URL) are unaffected —
 * both components already handled those identically.
 *
 * IMAGE-FIT FIX (2026-09-07): every baked-in creative in this table
 * (hide_overlay=true — the "Vantrix" hero banners with the headline/
 * icons/CTA already designed into the image, see
 * 20261220_seed_baked_hero_ad_creatives.sql) is ~1280x792-853px, an
 * aspect ratio around 1.5-1.6:1. The slide box this component renders
 * into is 21:10 (2.1:1) on mobile and 28:9 (3.1:1) on desktop — both
 * meaningfully wider than the source art. `object-cover` on that
 * mismatch was cropping 20-50% of the image's height with a plain
 * center object-position and no awareness of where the actual content
 * sits, which for these specific creatives reliably meant slicing off
 * the CTA button baked into the bottom of the image, the "18+" badge or
 * logo baked into the top, or both — the visible symptom being a banner
 * that reads as cut off / unfinished rather than a deliberate crop. A
 * plain photo ad (hide_overlay=false, no fixed baked-in layout, meant to
 * bleed edge-to-edge) doesn't have this problem — cropping a photo is a
 * normal, intentional hero-banner treatment. So the fix is per-row, off
 * the flag that already distinguishes the two cases: baked creatives
 * render with `object-contain` (the full, uncropped image, always 100%
 * visible) over a blurred, scaled-up copy of the same image filling the
 * letterbox bars, while ordinary photo ads keep the original
 * `object-cover` full-bleed treatment unchanged.
 */
export function HeroAdsCarousel({ ads }: { ads: HeroAd[] }) {
 const [active, setActive] = useState(0);
 const trackRef = useRef<HTMLDivElement>(null);
 const seen = useRef(new Set<string>());
 // Guards the auto-advance timer against manual interaction and
 // backgrounded tabs — see scrollTo()/handleScroll() and the visibility
 // listener below for where each is flipped.
 const pausedUntil = useRef(0);
 const tabHidden = useRef(false);

 useEffect(() => {
 const ad = ads[active];
 if (ad && !seen.current.has(ad.id)) {
 seen.current.add(ad.id);
 pingAdStat(ad.id, "impression");
 }
 }, [ads, active]);

 // ease-premium as a JS function, mirroring tailwind.config's
 // cubic-bezier(0.16, 1, 0.3, 1) so the manual/auto slide transition
 // reads as the same "expensive" glide as the Ken-Burns zoom, not the
 // browser's own default smooth-scroll timing.
 const easePremium = (t: number) => {
 const p0 = 0.16, p1 = 1, p2 = 0.3, p3 = 1;
 const cx = 3 * p0, bx = 3 * (p2 - p0) - cx, ax = 1 - cx - bx;
 const cy = 3 * p1, by = 3 * (p3 - p1) - cy, ay = 1 - cy - by;
 let x = t;
 for (let i = 0; i < 8; i++) {
 const currentX = ((ax * x + bx) * x + cx) * x - t;
 if (Math.abs(currentX) < 1e-4) break;
 const derivative = (3 * ax * x + 2 * bx) * x + cx || 1e-6;
 x -= currentX / derivative;
 }
 return ((ay * x + by) * x + cy) * x;
 };

 const scrollRaf = useRef<number | null>(null);

 const scrollTo = useCallback((index: number) => {
 const el = trackRef.current;
 if (!el) return;
 if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
 el.scrollTo({ left: index * el.clientWidth, behavior: "auto" });
 return;
 }
 if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
 const from = el.scrollLeft;
 const to = index * el.clientWidth;
 const distance = to - from;
 const duration = 700;
 const start = performance.now();
 const step = (now: number) => {
 const elapsed = Math.min(1, (now - start) / duration);
 el.scrollLeft = from + distance * easePremium(elapsed);
 if (elapsed < 1) {
 scrollRaf.current = requestAnimationFrame(step);
 } else {
 scrollRaf.current = null;
 }
 };
 scrollRaf.current = requestAnimationFrame(step);
 }, []);

 useEffect(() => {
 return () => {
 if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
 };
 }, []);

 // AUTO-ROTATE: a plain interval calling the same scrollTo() the dots/
 // arrows use — onScroll (handleScroll below) picks up the resulting
 // scroll position and updates `active`/pings the impression exactly as
 // it would for a manual swipe, so this needed no separate state-sync
 // path. Skipped entirely for a single slide (nothing to rotate to) and
 // for prefers-reduced-motion (checked once per mount, matching how the
 // rest of this codebase treats that media query — an auto-moving
 // carousel is exactly the kind of motion that preference exists to
 // suppress).
 useEffect(() => {
 if (ads.length <= 1) return;
 if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

 const onVisibilityChange = () => {
 tabHidden.current = document.hidden;
 };
 document.addEventListener("visibilitychange", onVisibilityChange);

 const id = window.setInterval(() => {
 if (tabHidden.current) return;
 if (Date.now() < pausedUntil.current) return;
 const el = trackRef.current;
 if (!el) return;
 const current = Math.round(el.scrollLeft / el.clientWidth);
 scrollTo((current + 1) % ads.length);
 }, AUTO_ADVANCE_MS);

 return () => {
 window.clearInterval(id);
 document.removeEventListener("visibilitychange", onVisibilityChange);
 };
 }, [ads.length, scrollTo]);

 if (ads.length === 0) return null;

 function handleScroll(e: React.UIEvent<HTMLDivElement>) {
 const el = e.currentTarget;
 const index = Math.round(el.scrollLeft / el.clientWidth);
 if (index !== active) setActive(index);
 }

 // Any scroll-track interaction (a real finger drag) is what onScroll
 // actually fires for — pause auto-advance for the same window a
 // deliberate arrow/dot tap gets, via handleManualNav below, so a
 // visitor mid-swipe never has the timer yank the track out from under
 // their thumb.
 function handlePointerDown() {
 pausedUntil.current = Date.now() + RESUME_AFTER_INTERACTION_MS;
 }

 function handleManualNav(index: number) {
 pausedUntil.current = Date.now() + RESUME_AFTER_INTERACTION_MS;
 scrollTo(index);
 }

 return (
 <section className="px-0 md:px-8 py-0 md:py-6">
 <div className="max-w-7xl mx-auto relative group/hero">
 <div
 ref={trackRef}
 onScroll={handleScroll}
 onPointerDown={handlePointerDown}
 className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth rounded-none md:rounded-md"
 >
 {ads.map((ad, i) => {
 const isExternal = !ad.link.startsWith("/");
 const href = isExternal
 ? `/api/go?url=${encodeURIComponent(ad.link)}&adId=${encodeURIComponent(ad.id)}`
 : ad.link || "#";
 // code: slides render as pure SVG/CSS (see promo-hero-art.tsx) —
 // no <Image> download, no gradient/title overlay needed since
 // the art already composes its own headline + tagline.
 const isCode = isPromoHeroCode(ad.image_url);
 const isActive = i === active;
 // PURE-IMAGE FIX (2026-09-08): every prior treatment here — the
 // blurred object-contain letterbox fill, the Ken-Burns scale-up on
 // the active slide, the darkening gradient + duplicated title text
 // baked on top of plain photo ads — added something between the
 // visitor and the actual creative. The image itself (baked
 // creatives already have their own headline/CTA/badge designed in;
 // plain photo ads are meant to stand alone) is now the entire
 // slide: one object-contain image, no blur layer, no zoom
 // animation, no gradient, no overlay text, for every ad regardless
 // of hide_overlay. isActive/AUTO_ADVANCE_MS above still drive the
 // dot/impression logic but no longer feed any visual transform.
 const slideContent = isCode ? (
 <PromoHeroArt slug={promoHeroSlugFrom(ad.image_url)} />
 ) : (
 <Image
 src={resolveImageSrc(ad.image_url)}
 alt={ad.title}
 fill
 sizes="(min-width: 1280px) 1280px, 100vw"
 priority={i === 0}
 loading={i === 0 ? undefined : "lazy"}
 className="object-contain"
 />
 );
 const slideClassName = cn(
 "relative shrink-0 w-full aspect-[4/5] sm:aspect-[21/10] md:aspect-[28/9] snap-center overflow-hidden rounded-none md:rounded-md",
 // Baked creatives get a solid backdrop behind the blurred fill
 // layer so there's never a flash of raw page background before
 // the image paints.
 ad.hide_overlay && !isCode && "bg-black"
 );

 // External links skip pingAdStat's own click — /api/go already
 // increments server-side before redirecting (same reasoning as
 // feed-inline-ad.tsx's AdLink).
 return isExternal ? (
 <a
 key={ad.id}
 href={href}
 target="_blank"
 rel="noopener noreferrer sponsored"
 className={slideClassName}
 >
 {slideContent}
 </a>
 ) : (
 <Link
 key={ad.id}
 href={href}
 onClick={() => pingAdStat(ad.id, "click")}
 className={slideClassName}
 >
 {slideContent}
 </Link>
 );
 })}
 </div>

 {ads.length > 1 && (
 <>
 <button
 aria-label="Previous"
 onClick={() => handleManualNav(Math.max(0, active - 1))}
 className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-black/50 border border-white/10 text-text-primary opacity-0 group-hover/hero:opacity-100 transition-opacity ease-premium hover:border-gold-500/50"
 >
 <ChevronLeft className="h-5 w-5" />
 </button>
 <button
 aria-label="Next"
 onClick={() => handleManualNav(Math.min(ads.length - 1, active + 1))}
 className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-black/50 border border-white/10 text-text-primary opacity-0 group-hover/hero:opacity-100 transition-opacity ease-premium hover:border-gold-500/50"
 >
 <ChevronRight className="h-5 w-5" />
 </button>

 <div className="flex items-center justify-center gap-1.5 mt-3">
 {ads.map((ad, i) => (
 <button
 key={ad.id}
 aria-label={`Go to slide ${i + 1}`}
 onClick={() => handleManualNav(i)}
 className={cn(
 "h-1.5 rounded-full transition-all ease-premium duration-500",
 i === active
 ? "w-6 bg-gold-500 shadow-[0_0_8px_rgba(212,175,55,0.6)]"
 : "w-1.5 bg-white/20"
 )}
 />
 ))}
 </div>
 </>
 )}
 </div>
 </section>
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
