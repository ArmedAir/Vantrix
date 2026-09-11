import { Sparkles, Heart, Newspaper } from "lucide-react";
import { MediaCard } from "@/components/ui/media-card";
import { Badge } from "@/components/ui/badge";
import { HorizontalScrollRow } from "@/components/ui/horizontal-scroll-row";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { WorldStateBanner } from "@/components/world/world-state-banner";
import { FeedPostCard } from "@/components/feed/feed-post-card";
import { resolveImageSrc } from "@/lib/utils";
import type { CuratorDigest } from "@/lib/curator/curator-engine";

/**
 * Presentational only — every section's data comes straight from
 * getCuratorDigest()'s three engine calls, unmodified. This component
 * doesn't re-rank, re-filter, or otherwise second-guess what those
 * engines already decided; it just lays the three out together.
 *
 * Deliberately does NOT reuse dating's CandidateCard: that component's
 * prop type (DatingWorldCandidate, from lib/frontend/dating.ts) belongs
 * to a different fetch pipeline than curator-engine's RecommendedCharacter
 * — structurally close but not the same contract, and force-fitting one
 * into the other is how two independently-evolving types quietly drift
 * out of sync. MediaCard (the generic building block CandidateCard itself
 * wraps) is reused directly instead.
 */
export function CuratorDigestView({ digest }: { digest: CuratorDigest }) {
  const { dating, feed, universe } = digest;
  const hasAnything = dating.topCandidates.length > 0 || feed.topPosts.length > 0 || universe.overview;

  if (!hasAnything) {
    return (
      <UnavailableState message="Swipe a few matches or follow a character to give the curator something to work with." />
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {universe.overview && (
        <section className="flex flex-col gap-3">
          <SectionHeading icon={Sparkles} label="World right now" />
          <WorldStateBanner state={universe.overview.state} />
        </section>
      )}

      {dating.topCandidates.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading icon={Heart} label="Picked for you" />
          <HorizontalScrollRow>
            {dating.topCandidates.map((candidate) => (
              <MediaCard
                key={candidate.id}
                href={`/characters/${candidate.id}`}
                image={resolveImageSrc(candidate.image_url)}
                alt={candidate.name}
                badge={candidate.is_new ? <Badge>New</Badge> : undefined}
                className="shrink-0 w-[168px] sm:w-[200px]"
              >
                <div className="truncate text-[15px] font-semibold leading-tight text-text-primary">
                  {candidate.name}
                  {candidate.age ? (
                    <span className="font-normal text-text-secondary">, {candidate.age}</span>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-xs text-gold-400">{candidate.reason}</div>
              </MediaCard>
            ))}
          </HorizontalScrollRow>
        </section>
      )}

      {feed.topPosts.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading icon={Newspaper} label="From your feed" />
          <div className="flex flex-col gap-4">
            {feed.topPosts.map((post) => (
              <FeedPostCard key={post.id} post={post} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHeading({ icon: Icon, label }: { icon: typeof Sparkles; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-gold-500" strokeWidth={1.75} />
      <h2 className="text-sm font-semibold text-text-primary">{label}</h2>
    </div>
  );
}
