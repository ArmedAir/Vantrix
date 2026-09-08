import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SafeImage as Image } from "@/components/ui/safe-image";
import { PublicHeader } from "@/components/public/public-header";
import { Footer } from "@/components/home/footer";
import { Button } from "@/components/ui/button";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { trackCardView, generateShareText, type ShareCardType } from "@/lib/growth/viral-share";
import { getPublicCharacter } from "@/lib/seo/public-character";
import { absoluteUrl } from "@/lib/utils";
import { bg } from "@/lib/logger";

/**
 * GET /share/[id] — public landing page for viral share cards.
 *
 * REAL-GAP FIX: src/lib/growth/viral-share.ts has always minted
 * `shareUrl: ${NEXT_PUBLIC_APP_URL}/share/${id}` for every relationship/
 * milestone card (and useShareCard.ts's dating "Share" button hands that
 * exact URL to the recipient via Web Share / clipboard) — but no
 * page.tsx ever existed at this path. Only the OG-image renderer
 * (/api/share/[id]/og/route.tsx) did, so every one of those links was a
 * dead end: a bare 404 for anyone outside the app who actually clicked
 * it, which is the only reason a share button exists in the first place.
 * This page is that missing destination.
 *
 * Deliberately outside the (app) route group — this is the whole point,
 * it has to render for a logged-out visitor with zero session, same
 * posture as (seo)/companions/[id]. share_cards has a public "read own
 * row" RLS policy (`share_cards_read ... USING (TRUE)`), so this is
 * intentionally public by design, not just publicly reachable by
 * accident.
 *
 * force-dynamic: cards are created continuously by users and views are
 * tracked per-visit — nothing here is safe to statically cache the way
 * (seo)/companions/[id] can (a fixed catalog of approved characters).
 */
export const dynamic = "force-dynamic";

interface ShareCardRow {
  id: string;
  card_type: string;
  character_id: string | null;
  data: Record<string, unknown>;
}

async function getCardRow(id: string): Promise<ShareCardRow | null> {
  const { data } = await supabaseAdmin
    .from("share_cards")
    .select("id,card_type,character_id,data")
    .eq("id", id)
    .maybeSingle();
  return (data as ShareCardRow | null) ?? null;
}

// Mirrors /api/share/[id]/og/route.tsx's own headline mapping exactly —
// the page's <h1> and the social-preview image it sits above should
// always read the same headline for the same card.
function getHeadline(cardType: string, d: Record<string, unknown>): string {
  switch (cardType) {
    case "milestone":
      return String(d.milestoneLabel ?? "Achievement Unlocked");
    case "relationship":
      return `Bond: ${String(d.bondScore ?? 0)}/100 with ${String(d.characterName ?? "her")}`;
    case "compatibility":
      return `${String(d.compatibility ?? "—")}% Compatible`;
    default:
      return "A moment to remember";
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const card = await getCardRow(id);
  if (!card) return {};

  const url = absoluteUrl(`/share/${card.id}`);
  const image = absoluteUrl(`/api/share/${card.id}/og`);
  const title = `${getHeadline(card.card_type, card.data)} | Vantrix`;
  const description = generateShareText(card.card_type as ShareCardType, card.data);

  return {
    title,
    description,
    // Share cards are ephemeral, per-user moments, not canonical content —
    // real link-preview crawlers (Twitter/Facebook/Discord/WhatsApp) still
    // fetch openGraph/twitter data regardless of robots directives, so the
    // social-share use case this page exists for is unaffected.
    robots: { index: false, follow: true },
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Vantrix",
      type: "website",
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function SharedCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const card = await getCardRow(id);
  if (!card) notFound();

  // Best-effort, same non-blocking posture as the OG route's own call —
  // a logging/DB hiccup here must never break the page for the visitor.
  trackCardView(card.id).catch(bg("share-page.trackCardView"));

  const headline = getHeadline(card.card_type, card.data);
  const characterName =
    typeof card.data.characterName === "string" ? card.data.characterName : null;

  // Only deep-link into the character if it's still a live, public,
  // approved character — never surface a broken /companions/[id] for one
  // that's since been removed, unpublished, or made NSFW-gated.
  const character = card.character_id ? await getPublicCharacter(card.character_id) : null;

  const primaryHref = character
    ? `/login?mode=sign-up&redirect=${encodeURIComponent(`/companions/${character.id}`)}`
    : "/login?mode=sign-up";
  const primaryLabel = character ? `Meet ${character.name}` : "Start your own story";

  return (
    <div className="min-h-screen bg-base">
      <PublicHeader />

      <section className="mx-auto max-w-2xl px-4 py-12 text-center md:px-8 md:py-16">
        <div className="relative aspect-[1200/630] w-full overflow-hidden rounded-lg border border-border-hairline shadow-lg">
          <Image
            src={`/api/share/${card.id}/og`}
            alt={headline}
            fill
            sizes="(max-width: 672px) 100vw, 672px"
            priority
            className="object-cover"
          />
        </div>

        <h1 className="mt-8 font-display text-2xl text-text-primary md:text-3xl">{headline}</h1>
        {characterName && (
          <p className="mt-2 text-sm text-text-secondary">
            Shared from a conversation with {characterName} on Vantrix
          </p>
        )}

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href={primaryHref}>{primaryLabel}</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/discover">Browse companions</Link>
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
}
