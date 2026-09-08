import Link from "next/link";
import { Flame, BookOpen, Vote, type LucideIcon } from "lucide-react";
import { SafeImage as Image } from "@/components/ui/safe-image";
import { resolveImageSrc, timeAgo, WORLD_IMAGE_FALLBACK } from "@/lib/utils";
import type { HomeWorldTeaser } from "@/lib/frontend/world";

interface Tile {
 key: string;
 icon: LucideIcon;
 eyebrow: string;
 title: string;
 caption: string;
 /** Real photo to show behind the tile — a location still for event/
 * choice, the lead participant's portrait for story. Always resolved
 * to a valid src (see resolveImageSrc): null here just means "no
 * location/character was on hand to resolve from," in which case the
 * tile falls back to WORLD_IMAGE_FALLBACK rather than going blank. */
 image: string | null;
 /** LIVING-WORLD FIX (below): short top-right pill — "Active" / a
 * participant count / "Today" — so a tile reads as a running system at
 * a glance, not a static promo card. Always derived from a real column
 * (is_active, participants.length, activeDate), never invented. */
 statusLabel: string;
 /** Small "Updated 2h ago" line under the caption, from the row's own
 * created_at/updated_at — same restraint as statusLabel. */
 freshness: string | null;
}

/**
 * LIVING-WORLD FIX (doc feedback, priority #2 — "the platform's strongest
 * differentiator isn't visually dominant enough"): every tile used to
 * show only a static eyebrow + one-line caption, identical whether the
 * event was still running or had ended hours ago. `is_active`,
 * `participants`, `updated_at`/`created_at`, and `activeDate` were
 * already sitting on these rows (WorldEvent/WorldStory/DailyWorldChoice)
 * and simply weren't surfaced here. Pulled through now — no new fetch,
 * no synthetic "3 characters involved"-style copy invented for rows
 * that don't actually have a count.
 */
function buildTiles(teaser: HomeWorldTeaser): Tile[] {
 const tiles: Tile[] = [];

 if (teaser.event) {
 tiles.push({
 key: `event-${teaser.event.id}`,
 icon: Flame,
 eyebrow: "World event",
 title: teaser.event.title,
 caption: teaser.event.description,
 image: teaser.eventLocationImage,
 statusLabel: teaser.event.is_active ? "Active" : "Ended",
 freshness: `Started ${timeAgo(teaser.event.created_at)}`,
 });
 }

 if (teaser.story) {
 const participantCount = teaser.story.participants?.length ?? 0;
 const lead = teaser.story.participant_characters?.[0]?.name ?? null;
 const extra = (teaser.story.participant_characters?.length ?? 0) - 1;
 tiles.push({
 key: `story-${teaser.story.id}`,
 icon: BookOpen,
 eyebrow: "Ongoing story",
 title: teaser.story.title,
 caption: lead
 ? `${lead}${extra > 0 ? ` +${extra} more` : ""} \u00b7 Chapter ${teaser.story.chapter}`
 : `Chapter ${teaser.story.chapter}`,
 image: teaser.story.participant_characters?.[0]?.image_url ?? null,
 statusLabel: participantCount > 0 ? `${participantCount} character${participantCount === 1 ? "" : "s"}` : `Chapter ${teaser.story.chapter}`,
 freshness: `Updated ${timeAgo(teaser.story.updated_at)}`,
 });
 }

 if (teaser.choice) {
 tiles.push({
 key: `choice-${teaser.choice.id}`,
 icon: Vote,
 eyebrow: "Today's choice",
 title: teaser.choice.prompt,
 caption: teaser.choice.locationName
 ? `A decision for ${teaser.choice.locationName}`
 : "A decision for the world",
 image: teaser.choiceLocationImage,
 statusLabel: "Open today",
 freshness: null,
 });
 }

 return tiles;
}

/**
 * Reference-image parity: "Your World" strip — a 3-tile teaser for the
 * full World hub (live event / ongoing story / today's world choice).
 *
 * REAL-IMAGE FIX: this used to render a graded gradient + icon on every
 * tile with no photo at all — at the time, no location photography
 * existed for events/stories/choices. That's no longer true: locations
 * now carry real image_url stills (world_locations.image_url, the same
 * field LocationCard already renders in world-cards.tsx) and world
 * stories already resolve each participant's real portrait
 * (participant_characters[i].image_url). getHomeWorldTeaser (see
 * lib/frontend/world.ts's own REAL-IMAGE FIX comment) now resolves and
 * hands down eventLocationImage / choiceLocationImage alongside the
 * story's already-available participant photo, so every tile gets an
 * actual still behind it. resolveImageSrc always returns a usable src
 * (falling back to WORLD_IMAGE_FALLBACK), so a tile with no
 * location/character on hand degrades to that neutral placeholder
 * rather than rendering nothing — never a broken image. All three tap
 * through to /world; none of this data has a dedicated detail route of
 * its own (an event/story/choice lives inside the World hub's Overview
 * tab, not at its own slug), so a single consistent destination is more
 * honest than inventing per-tile routes.
 */
export function YourWorld({ teaser }: { teaser: HomeWorldTeaser }) {
 const tiles = buildTiles(teaser);
 if (tiles.length === 0) return null;

 // Real signal, not decoration — only true when getHomeWorldTeaser()
 // actually returned an event flagged is_active.
 const hasLiveEvent = teaser.event?.is_active === true;

 return (
 <section className="px-4 md:px-8 py-10 md:py-14 border-t border-border-hairline">
 <div className="max-w-7xl mx-auto">
 {/* HIERARCHY FIX (doc feedback, priority #5): was text-xl/mb-3, the
 same weight as every other row header on Home despite this being
 the section meant to carry the platform's core differentiator.
 Bumped to match the marketing page's own section-header scale
 (text-xs eyebrow + text-4xl display heading, see landing-page.tsx)
 so it reads as a distinct, larger moment on the page rather than
 one more card row. */}
 <div className="flex items-end justify-between gap-4 mb-6 md:mb-8">
 <div>
 <div className="flex items-center gap-2 mb-2">
 {hasLiveEvent && (
 <span className="relative flex h-2 w-2">
 <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-500/60" />
 <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-500" />
 </span>
 )}
 <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold-500">
 {hasLiveEvent ? "Live now" : "Your world"}
 </p>
 </div>
 <h2 className="font-display text-3xl md:text-4xl tracking-[-0.02em] text-text-primary">
 Your world is waiting
 </h2>
 <p className="mt-2 text-sm text-text-secondary max-w-md">
 It keeps moving whether you&rsquo;re here or not — events, stories, and decisions in progress right now.
 </p>
 </div>
 <Link
 href="/world"
 className="hidden sm:inline-flex items-center text-sm font-semibold text-gold-400 hover:text-gold-300 transition-colors ease-premium shrink-0"
 >
 Open world
 </Link>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
 {tiles.map((tile) => {
 const Icon = tile.icon;
 return (
 <Link
 key={tile.key}
 href="/world"
 className="group relative rounded-lg overflow-hidden border border-border-hairline min-h-[220px] sm:min-h-[260px] shadow-card transition-colors duration-200 ease-premium hover:border-gold-500/40"
 >
 <Image
 src={resolveImageSrc(tile.image, WORLD_IMAGE_FALLBACK)}
 fallback={WORLD_IMAGE_FALLBACK}
 alt=""
 fill
 sizes="(max-width: 640px) 100vw, 33vw"
 className="object-cover transition-transform duration-300 ease-premium group-hover:scale-105"
 />
 <div
 className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"
 aria-hidden
 />
 <div className="absolute top-3 right-3 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white/90 backdrop-blur-sm">
 {tile.statusLabel}
 </div>
 <div className="relative z-10 h-full flex flex-col justify-end p-4 md:p-5">
 <Icon className="h-4 w-4 text-gold-400 mb-2" strokeWidth={2} />
 <p className="text-[10px] font-extrabold tracking-[0.08em] uppercase text-gold-400 mb-1">
 {tile.eyebrow}
 </p>
 <h3 className="font-display text-[19px] font-semibold text-text-primary leading-tight mb-1 line-clamp-2">
 {tile.title}
 </h3>
 <p className="text-xs text-text-secondary line-clamp-1">{tile.caption}</p>
 {tile.freshness && (
 <p className="text-[11px] text-text-tertiary mt-1.5">{tile.freshness}</p>
 )}
 </div>
 </Link>
 );
 })}
 </div>
 <Link
 href="/world"
 className="sm:hidden mt-5 flex items-center justify-center rounded-md border border-border-hairline py-3 text-sm font-semibold text-gold-400"
 >
 Open world
 </Link>
 </div>
 </section>
 );
}
