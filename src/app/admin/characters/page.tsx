import { getPendingCharacters } from "@/lib/frontend/admin-characters";
import { CharacterAdminTabs } from "@/components/admin/characters/character-admin-tabs";

export default async function AdminCharactersPage() {
  const pending = await getPendingCharacters();

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      <div>
        <h2 className="font-display text-2xl mb-1">Characters</h2>
        <p className="text-text-secondary text-sm">
          {pending.length} awaiting review.
        </p>
      </div>
      <CharacterAdminTabs initialPending={pending} />
    </div>
  );
}
