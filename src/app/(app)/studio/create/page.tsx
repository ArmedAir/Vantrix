import { CreationStudio } from "@/components/studio/creation/creation-studio";
import { StudioGatedNotice } from "@/components/studio/creation/studio-gated-notice";
import { getShellSession } from "@/lib/frontend/session";

/**
 * FRONTEND GAP FIX: see studio-gated-notice.tsx's header — every backend
 * creation route already enforces requirePlan('premium'), this just stops
 * a free user from burning time in the wizard before discovering that.
 * Same two-tier check requirePlan() itself uses (anything but 'free' tier,
 * or admin) so this can never be stricter or looser than what the API
 * actually enforces. Uses session?.profile like premium/page.tsx's own
 * second call to getShellSession() — (app)/layout.tsx is the real auth
 * guard, this optional-chains defensively rather than assuming non-null.
 */
export default async function CreateCharacterPage() {
  const session = await getShellSession();
  const tier = session?.profile.tier ?? "free";
  const isAdmin = session?.profile.isAdmin ?? false;
  const gated = tier.toLowerCase() === "free" && !isAdmin;

  return gated ? <StudioGatedNotice /> : <CreationStudio userId={session?.profile.id ?? null} />;
}
