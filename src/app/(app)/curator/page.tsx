import { getAuthedUser } from "@/lib/auth/get-authed-user";
import { getCuratorDigest, type CuratorDigest } from "@/lib/curator/curator-engine";
import { normalizeTier, type Tier } from "@/lib/rate-limit";
import { resolveNsfwDiscoveryAccess } from "@/lib/access/character-gate";
import { logger } from "@/lib/logger";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { CuratorDigestView } from "@/components/curator/curator-digest";

/**
 * The AI curator — one page pulling the top pick from dating, feed, and
 * universe together. Calls curator-engine.ts in-process rather than
 * fetching /api/curator/home over HTTP, same reasoning as dating/page.tsx's
 * ROOT-CAUSE FIX comment: a server component self-fetching its own API
 * route is an unnecessary network hop inside the same Next.js process, and
 * has been the actual source of intermittent 404s elsewhere in this app.
 * The API route stays in place for client-side/external callers; this page
 * is just another caller of the same shared function, like that one is.
 */
export default async function CuratorPage() {
  let digest: CuratorDigest;
  try {
    const { supabase, user } = await getAuthedUser();
    if (!user) {
      return (
        <div className="mx-auto max-w-3xl px-4 py-10">
          <UnavailableState message="Sign in to see what the curator's picked for you." />
        </div>
      );
    }

    const [{ data: profile }, allowNsfw] = await Promise.all([
      supabase.from("profiles").select("tier").eq("id", user.id).single(),
      resolveNsfwDiscoveryAccess(user.id),
    ]);
    const tier: Tier = normalizeTier((profile?.tier as string) ?? "free");

    digest = await getCuratorDigest(user.id, tier, { allowNsfw });
  } catch (error) {
    logger.error("curator:page-error", { error: String(error) });
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <UnavailableState message="The curator is temporarily unavailable — try again in a moment." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold text-text-primary">For you</h1>
      <CuratorDigestView digest={digest} />
    </div>
  );
}
