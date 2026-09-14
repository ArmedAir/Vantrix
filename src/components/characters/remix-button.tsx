"use client";

import Link from "next/link";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Links straight into the Creation Studio with ?remixOf=<id> — the studio
 * itself (creation-studio.tsx) does the actual seed fetch on mount, same
 * division of labor as ShareProfileButton just building a URL rather than
 * doing the share itself. No client-side data fetching needed here, so
 * this stays a plain link rather than a click-handler + loading state.
 */
export function RemixButton({ characterId }: { characterId: string }) {
  return (
    <Button variant="ghost" asChild>
      <Link href={`/studio/create?remixOf=${characterId}`}>
        <Wand2 className="h-4 w-4" />
        Remix
      </Link>
    </Button>
  );
}
