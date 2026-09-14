"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Lock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  fetchFineTunes,
  createFineTune,
  updateFineTune,
  deleteFineTune,
  type CharacterFineTune,
  type FineTuneTier,
} from "@/lib/frontend/raas-studio";

const inputClass =
  "w-full rounded-sm bg-base border border-interactive px-3 h-10 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold-500/60";

interface TraitDraft {
  key: string;
  value: string;
}

const emptyDraft = {
  name: "",
  description: "",
  tierRequired: "soulbound" as FineTuneTier,
  loraModelId: "",
};

/**
 * RaaS surfacing (Studio half, fine-tunes): character_fine_tunes lets a
 * creator package a specialized personality/voice variant, gated at
 * 'bond' or 'soulbound', reusing the FLUX LoRA pipeline's model-id shape
 * for anything visual (lora_model_id — paste an ID already trained via
 * this character's Appearance builder; training a new one isn't done
 * here). Voice traits are collected as simple key/value rows and merged
 * into voice_profile_overrides on submit, matching how
 * formatFineTuneForPrompt() in lib/commerce/raas.ts renders them back out.
 *
 * At most one active pack per tier (DB partial unique index) — creating
 * or activating a new pack for a tier that already has one replaces it;
 * the server enforces this, this UI just reflects the result.
 */
export function FineTuneManager({ characterId }: { characterId: string }) {
  const [fineTunes, setFineTunes] = useState<CharacterFineTune[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [traits, setTraits] = useState<TraitDraft[]>([{ key: "", value: "" }]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    fetchFineTunes(characterId)
      .then(setFineTunes)
      .catch(() => setError("Couldn't load fine-tunes."))
      .finally(() => setLoading(false));
  }, [characterId]);

  function updateTrait(i: number, field: keyof TraitDraft, value: string) {
    setTraits((t) => t.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  }

  async function handleCreate() {
    if (!draft.name.trim()) return;
    setCreating(true);
    setError(null);
    const voiceProfileOverrides: Record<string, string> = {};
    for (const t of traits) {
      const key = t.key.trim().toLowerCase().replace(/\s+/g, "_");
      if (key && t.value.trim()) voiceProfileOverrides[key] = t.value.trim();
    }
    const result = await createFineTune(characterId, {
      name: draft.name.trim(),
      description: draft.description.trim(),
      tierRequired: draft.tierRequired,
      voiceProfileOverrides,
      loraModelId: draft.loraModelId.trim() || null,
    });
    if (result.ok && result.fineTune) {
      // A new active pack replaces any existing active one for the same
      // tier server-side — reflect that here too instead of waiting on a refetch.
      setFineTunes((prev) => [
        result.fineTune!,
        ...prev.map((f) =>
          f.tier_required === result.fineTune!.tier_required ? { ...f, is_active: false } : f
        ),
      ]);
      setDraft(emptyDraft);
      setTraits([{ key: "", value: "" }]);
    } else {
      setError(result.error ?? "Couldn't create fine-tune.");
    }
    setCreating(false);
  }

  async function handleToggleActive(fineTune: CharacterFineTune) {
    setBusyId(fineTune.id);
    const next = !fineTune.is_active;
    const result = await updateFineTune(characterId, fineTune.id, { isActive: next });
    if (result.ok) {
      setFineTunes((prev) =>
        prev.map((f) => {
          if (f.id === fineTune.id) return { ...f, is_active: next };
          if (next && f.tier_required === fineTune.tier_required) return { ...f, is_active: false };
          return f;
        })
      );
    } else {
      setError(result.error ?? "Couldn't update fine-tune.");
    }
    setBusyId(null);
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    const result = await deleteFineTune(characterId, id);
    if (result.ok) {
      setFineTunes((prev) => prev.filter((f) => f.id !== id));
    } else {
      setError(result.error ?? "Couldn't delete fine-tune.");
    }
    setBusyId(null);
  }

  if (loading) {
    return <Card interactive={false} className="p-4 h-24 animate-pulse bg-white/[0.02]" />;
  }

  return (
    <div className="space-y-4">
      <Card interactive={false} className="p-4 space-y-3">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
          New specialized pack
        </h3>
        <input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder={'Pack name (e.g. "Devoted")'}
          maxLength={80}
          className={inputClass}
        />
        <textarea
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder="What makes this variant different?"
          maxLength={1000}
          rows={2}
          className="w-full rounded-sm bg-base border border-interactive px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold-500/60 resize-none"
        />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            Unlocks at
            <select
              value={draft.tierRequired}
              onChange={(e) => setDraft((d) => ({ ...d, tierRequired: e.target.value as FineTuneTier }))}
              className="rounded-sm bg-base border border-interactive px-2 h-9 text-sm text-text-primary focus:outline-none focus:border-gold-500/60"
            >
              <option value="bond">Bond</option>
              <option value="soulbound">Soulbound</option>
            </select>
          </label>
          <input
            value={draft.loraModelId}
            onChange={(e) => setDraft((d) => ({ ...d, loraModelId: e.target.value }))}
            placeholder="LoRA model ID (optional)"
            maxLength={200}
            className={inputClass + " flex-1"}
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs text-text-secondary">Voice traits</p>
          {traits.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={t.key}
                onChange={(e) => updateTrait(i, "key", e.target.value)}
                placeholder="Trait (e.g. warmth)"
                maxLength={40}
                className={inputClass + " max-w-[140px]"}
              />
              <input
                value={t.value}
                onChange={(e) => updateTrait(i, "value", e.target.value)}
                placeholder="Description (e.g. much more affectionate)"
                maxLength={200}
                className={inputClass + " flex-1"}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setTraits((t) => [...t, { key: "", value: "" }])}
            className="text-xs text-gold-400 hover:text-gold-300 flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Add trait
          </button>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={handleCreate}
          disabled={creating || !draft.name.trim()}
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create pack
        </Button>
        {error && <p className="text-xs text-danger">{error}</p>}
      </Card>

      {fineTunes.length === 0 ? (
        <p className="text-sm text-text-tertiary text-center py-8">No specialized packs yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {fineTunes.map((f) => (
            <div
              key={f.id}
              className="flex items-start gap-3 rounded-md border border-border-hairline px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-text-primary">{f.name}</span>
                  <span className="text-[11px] text-text-tertiary uppercase">{f.tier_required}</span>
                  {f.is_active ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-success">
                      <CheckCircle2 className="h-3 w-3" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-text-tertiary">
                      <Lock className="h-3 w-3" /> Inactive
                    </span>
                  )}
                </div>
                {f.description && <p className="text-xs text-text-secondary mt-1">{f.description}</p>}
                {Object.keys(f.voice_profile_overrides ?? {}).length > 0 && (
                  <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {Object.entries(f.voice_profile_overrides).map(([k, v]) => (
                      <li key={k} className="text-[11px] text-text-tertiary">
                        <span className="text-gold-400">{k.replace(/_/g, " ")}:</span> {v}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleToggleActive(f)}
                  disabled={busyId === f.id}
                  className="text-xs text-gold-400 hover:text-gold-300 disabled:opacity-40"
                >
                  {f.is_active ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={() => handleDelete(f.id)}
                  disabled={busyId === f.id}
                  className="text-text-tertiary hover:text-danger disabled:opacity-40"
                  aria-label="Delete fine-tune"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
