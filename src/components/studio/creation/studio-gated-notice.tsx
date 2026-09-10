import Link from "next/link";
import { Sparkles, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * FRONTEND GAP FIX: every server-side character-creation path (POST
 * /api/characters, import, generate-concept, generate-image, train-lora)
 * already calls requirePlan(userId, 'premium', ...) — but /studio/create
 * itself had zero tier-awareness, so a free user could work through the
 * entire multi-stage creation wizard (concept → identity → personality →
 * psychology → voice → appearance → memory → preview) only to hit a raw
 * error on final submit. Gating here instead, mirroring
 * digital-twin/gated-notice.tsx's own pattern for the same problem.
 */
export function StudioGatedNotice() {
  return (
    <div className="mx-auto max-w-md text-center py-16">
      <div className="h-14 w-14 mx-auto rounded-full border border-gold-500/50 flex items-center justify-center">
        <Sparkles className="h-6 w-6 text-gold-500" strokeWidth={1.75} />
      </div>
      <h1 className="font-display text-2xl text-text-primary mt-4">Create a Character</h1>
      <p className="text-text-secondary text-sm mt-2">
        Designing your own companion — personality, voice, appearance, memory, all of it —
        is a premium feature.
      </p>
      <Button asChild className="mt-6">
        <Link href="/premium">
          <Crown className="h-4 w-4" /> Upgrade to Premium
        </Link>
      </Button>
    </div>
  );
}
