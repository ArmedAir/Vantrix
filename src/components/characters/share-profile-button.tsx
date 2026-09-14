"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * ENGAGEMENT-RETENTION: reuses feed-post-card.tsx's exact native-share/
 * clipboard-fallback pattern (Web Share API, falling back to copying the
 * link) — see that component's own handleShare, which this mirrors byte-
 * for-byte apart from the URL/title. That one shares a single post; this
 * one shares the character's own profile, so every visit to this page is
 * a "come meet {name}" link a visitor can hand off, not just individual
 * posts in the feed.
 *
 * OUTSIDE-THE-APP FIX: this used to build `/characters/${characterId}` —
 * but that path is the (app)-group, auth-gated detail page. Anyone the
 * link is actually meant for (a logged-out recipient on the other end of
 * a DM/social share, which is the entire point of a "Share" button) hit
 * (app)/layout.tsx's session redirect and landed on a bare /login with no
 * memory of which character they were invited to meet — the invite's
 * entire payload was silently dropped. /companions/${characterId}
 * ((seo)/companions/[id]/page.tsx) is this app's actual public,
 * unauthenticated, crawlable/OG-tagged equivalent for this exact
 * character — already fully built (GuestChatWidget, structured data,
 * social preview image) and simply never wired up as this button's
 * target. Signed-in visitors who follow the link still reach the same
 * character; /companions/[id] itself only offers the sign-up CTA once a
 * guest actually engages, so this costs nothing for an already-signed-in
 * recipient either.
 */
export function ShareProfileButton({
  characterId,
  characterName,
}: {
  characterId: string;
  characterName: string;
}) {
  const [justCopied, setJustCopied] = useState(false);

  async function handleShare() {
    const url =
      typeof window !== "undefined" ? `${window.location.origin}/companions/${characterId}` : "";
    try {
      if (navigator.share) {
        await navigator.share({ url, title: `${characterName} on Vantrix` });
        return;
      }
    } catch {
      // user cancelled the native share sheet — fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(url);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 1500);
    } catch {
      // clipboard unavailable — nothing else we can do here
    }
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="lg"
        onClick={handleShare}
        className="w-full sm:w-auto"
      >
        <Share2 className="h-4 w-4" strokeWidth={1.75} />
        Share
      </Button>
      {justCopied && (
        <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-xs bg-white/10 px-1.5 py-0.5 text-[10px] text-text-secondary">
          Link copied
        </span>
      )}
    </div>
  );
}
