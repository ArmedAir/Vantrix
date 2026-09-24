"use client";

import { TextField, TextAreaField, SelectField } from "@/components/studio/builder/field-helpers";
import type { CharacterDraft, Gender, Orientation } from "../types";
import { ORIENTATIONS_FOR_GENDER, orientationOptions } from "../types";

const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "anime", label: "Anime" },
  { value: "other", label: "Other" },
];

export function IdentityStage({
  draft,
  onChange,
}: {
  draft: CharacterDraft;
  onChange: (patch: Partial<CharacterDraft>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg text-text-primary mb-1">Identity</h2>
        <p className="text-sm text-text-tertiary">Who they are, before anything else.</p>
      </div>

      <TextField label="Name" value={draft.name} onChange={(v) => onChange({ name: v })} maxLength={80} />

      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Age"
          value={String(draft.age)}
          onChange={(v) => {
            const n = Number(v.replace(/\D/g, ""));
            onChange({ age: Number.isFinite(n) ? Math.min(100, Math.max(18, n || 18)) : draft.age });
          }}
          maxLength={3}
        />
        <SelectField
          label="Gender"
          value={draft.gender}
          onChange={(v) => {
            const gender = v as Gender;
            // Changing gender can make the current orientation read as a
            // mismatch (e.g. switching a "lesbian" character to male) —
            // reset to "Not set" rather than silently carrying over a
            // combination the picker itself no longer offers.
            const orientationStillFits = draft.orientation === "" || ORIENTATIONS_FOR_GENDER[gender].includes(draft.orientation);
            onChange({ gender, ...(orientationStillFits ? {} : { orientation: "" }) });
          }}
          options={GENDER_OPTIONS}
        />
      </div>

      <SelectField
        label="Orientation"
        value={draft.orientation}
        onChange={(v) => onChange({ orientation: v as Orientation })}
        options={orientationOptions(draft.gender)}
        hint="Optional — powers the Discover LGBTQ+ tab. It's one fact about them, not a personality: build who they are the same way regardless of what you pick here."
      />

      <div className="grid grid-cols-2 gap-4">
        <TextField label="Pronouns" value={draft.pronouns} onChange={(v) => onChange({ pronouns: v })} maxLength={50} placeholder="she/her" />
        <TextField label="Occupation" value={draft.occupation} onChange={(v) => onChange({ occupation: v })} maxLength={100} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TextField label="Origin" value={draft.origin} onChange={(v) => onChange({ origin: v })} maxLength={500} placeholder="Where they're from" />
        <TextField label="Category" value={draft.category} onChange={(v) => onChange({ category: v })} maxLength={50} placeholder="romance, fantasy…" />
      </div>

      <TextAreaField
        label="Description"
        value={draft.description}
        onChange={(v) => onChange({ description: v })}
        maxLength={1000}
        rows={4}
        placeholder="The short public bio shown on their character card."
      />
    </div>
  );
}
