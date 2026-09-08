import Link from "next/link";
import { ChevronLeft, Brain } from "lucide-react";
import { resolveImageSrc } from "@/lib/utils";
import { GiftDrawer } from "@/components/dating/gift-drawer";
import { ChatHeaderAvatar } from "@/components/chat/chat-header-avatar";
import { SanctuaryToggle } from "@/components/chat/sanctuary-toggle";

/**
 * Sits directly under the persistent TopBar (§2). Kept as a Server
 * Component — it's static per-conversation chrome, no client state.
 * The live-status dot is the one non-text signal here; per §7 it must
 * not be gold-only (colorblind users), so it pairs a green/gray fill
 * with a label rather than relying on hue alone.
 */
export function ChatHeader({
  conversationId,
  characterId,
  characterName,
  characterImage,
  isLive,
  introVideoUrl = null,
  galleryImageUrls = [],
  galleryVideoUrls = [],
  sanctuaryMode = false,
}: {
  conversationId: string;
  characterId: string;
  characterName: string;
  characterImage: string | null;
  isLive: boolean;
  introVideoUrl?: string | null;
  galleryImageUrls?: string[];
  galleryVideoUrls?: string[];
  sanctuaryMode?: boolean;
}) {
  return (
    // PREMIUM-POLISH PASS: same h-16/border-b/sticky structure and the
    // same four children in the same order (back / avatar / name+status /
    // brain / gift) as before — nothing moved or was added/removed. The
    // shadow beneath the hairline border is the one purely-cosmetic
    // addition: a hairline alone reads flat once the header stacks above
    // real content (see MessageBubble's own shadow-card addition, same
    // reasoning) — a soft drop shadow gives it the "resting above the
    // page" depth every reference-quality chat surface has.
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border-hairline bg-base/90 px-4 backdrop-blur sticky top-0 z-10 shadow-[0_8px_20px_-16px_rgba(0,0,0,0.9)]">
      <Link
        href="/chats"
        className="text-text-secondary hover:text-text-primary transition-colors ease-premium"
        aria-label="Back to chats"
      >
        <ChevronLeft className="h-5 w-5" />
      </Link>
      <ChatHeaderAvatar
        imageSrc={resolveImageSrc(characterImage)}
        characterName={characterName}
        introVideoUrl={introVideoUrl}
        galleryImageUrls={galleryImageUrls}
        galleryVideoUrls={galleryVideoUrls}
      />
      <div className="min-w-0">
        <p className="font-display text-[15px] font-medium tracking-[-0.01em] text-text-primary truncate">
          {characterName}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-text-secondary">
          <span className="relative flex h-1.5 w-1.5">
            {isLive && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            )}
            <span
              className={
                "relative inline-flex h-1.5 w-1.5 rounded-full " +
                (isLive ? "bg-success" : "bg-text-tertiary")
              }
              aria-hidden
            />
          </span>
          {isLive ? "Online" : "Offline"}
        </p>
      </div>
      <Link
        href={`/chat/${conversationId}/memories`}
        aria-label={`What ${characterName} remembers`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors ease-premium hover:bg-white/[0.04] hover:text-gold-400"
      >
        <Brain className="h-5 w-5" />
      </Link>
      <SanctuaryToggle conversationId={conversationId} initialSanctuaryMode={sanctuaryMode} />
      <GiftDrawer characterId={characterId} characterName={characterName} />
    </div>
  );
}
