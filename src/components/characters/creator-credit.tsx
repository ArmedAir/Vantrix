import Link from "next/link";
import { SafeImage as Image } from "@/components/ui/safe-image";
import { resolveImageSrc } from "@/lib/utils";
import { getCreatorProfile } from "@/lib/creators/profile";

/**
 * STUDIO-GROWTH-CREDIT (2026-09-14): renders "Created by @handle" on a
 * character page, linking to that creator's public profile
 * (/creators/[id] — see lib/creators/profile.ts). Used on both the
 * auth-gated (app)/characters/[id] page and the public, unauthenticated
 * (seo)/companions/[id] page — the latter is what ShareProfileButton
 * actually points at, so it's the page a shared link's recipient lands
 * on. Without this, a viral user-made character was a dead end: all the
 * traffic landed on that one character and never discovered the creator's
 * other characters, their profile, or that Studio exists at all.
 *
 * Deliberately a server-safe, no-"use client" component — both call sites
 * are server components and this needs no interactivity, just a link.
 *
 * Returns null (renders nothing) rather than a placeholder when:
 *   - the character isn't user-created (staff/canon characters aren't
 *     "created by" anyone in the sense this credit implies), or
 *   - creator_id is missing, or
 *   - getCreatorProfile() itself returns null — which it deliberately
 *     does for any account with no public active character to their name
 *     (see that function's own docstring); surfacing a credit for an
 *     account whose only character just got unpublished would link to a
 *     dead/misleading profile.
 */
export async function CreatorCredit({
  isUserCreated,
  creatorId,
}: {
  isUserCreated: boolean;
  creatorId: string | null;
}) {
  if (!isUserCreated || !creatorId) return null;

  const creator = await getCreatorProfile(creatorId);
  if (!creator) return null;

  const label = creator.displayName || creator.handle;

  return (
    <Link
      href={`/creators/${creatorId}`}
      className="inline-flex items-center gap-2 text-xs text-text-tertiary transition-colors hover:text-text-primary"
    >
      {creator.avatarUrl && (
        <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full border border-border-hairline">
          <Image src={resolveImageSrc(creator.avatarUrl)} alt={label} fill sizes="20px" className="object-cover" />
        </span>
      )}
      <span>
        Created by <span className="font-medium text-text-secondary">@{creator.handle}</span>
      </span>
    </Link>
  );
}
