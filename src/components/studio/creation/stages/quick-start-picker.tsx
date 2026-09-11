"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { QUICK_START_TEMPLATES, type QuickStartTemplate } from "../quick-start-templates";
import type { CharacterDraft } from "../types";

/** Mirrors the request body AppearanceStage sends to /api/characters/generate-image. */
async function generatePortrait(template: QuickStartTemplate, draft: CharacterDraft) {
  const res = await fetch("/api/characters/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: template.portraitPrompt,
      style: draft.imageStyle,
      hair_color: draft.hair_color || undefined,
      eye_color: draft.eye_color || undefined,
      body_type: draft.body_type || undefined,
      skin_tone: draft.skin_tone || undefined,
      age: Math.min(draft.age, 80),
      occupation: draft.occupation || undefined,
      gender: draft.gender === "anime" ? undefined : draft.gender,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error ?? "Couldn't generate a portrait.") as Error & { code?: string };
    err.code = body.code;
    throw err;
  }
  return body as { url: string; enrichedPrompt?: string };
}

export function QuickStartPicker({
  draft,
  onChange,
  /** Called once the draft (and, if possible, a portrait) are ready — jumps straight to Preview. */
  onReadyForPreview,
  /** Called when a portrait couldn't be generated automatically (plan gate, provider down, etc.) — jumps to Appearance so the creator can finish by hand instead of getting stuck. */
  onNeedsAppearance,
}: {
  draft: CharacterDraft;
  onChange: (draft: CharacterDraft) => void;
  onReadyForPreview: () => void;
  onNeedsAppearance: (notice: string) => void;
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(template: QuickStartTemplate) {
    if (loadingId) return;
    setLoadingId(template.id);
    setError(null);

    const built = template.build();
    const filled: CharacterDraft = {
      ...draft,
      ...built,
      imageStyle: template.gender === "anime" ? "anime" : "realistic",
      imageUrl: null,
      face_prompt: "",
      generation_style: "",
      identity_locked: false,
      memories: draft.memories,
      is_nsfw: false,
      dating_enabled: false,
      visibility: "private",
      creation_prompt: `Quick Start: ${template.label}`,
      usedAI: false,
    };
    onChange(filled);

    try {
      const { url } = await generatePortrait(template, filled);
      onChange({ ...filled, imageUrl: url });
      onReadyForPreview();
    } catch (err) {
      const e = err as Error & { code?: string };
      const notice =
        e.code === "PLAN_GATED"
          ? `${template.label} is ready — portraits need Premium, so generate one here whenever you're ready.`
          : `${template.label} is ready — we couldn't auto-generate a portrait (${e.message}). Generate one here to finish.`;
      onNeedsAppearance(notice);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {QUICK_START_TEMPLATES.map((template) => {
          const busy = loadingId === template.id;
          const disabled = loadingId !== null && !busy;
          return (
            <button
              key={template.id}
              type="button"
              disabled={loadingId !== null}
              onClick={() => pick(template)}
              className={cn(
                "group text-left",
                disabled && "opacity-40 pointer-events-none",
              )}
            >
              <Card
                interactive={!busy}
                className={cn(
                  "p-3 h-full flex flex-col gap-1.5",
                  busy && "border-gold-500/50",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xl leading-none">{template.emoji}</span>
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 text-gold-400 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-text-tertiary/0 group-hover:text-gold-400/70 transition-colors ease-premium" />
                  )}
                </div>
                <p className="text-sm font-semibold text-text-primary leading-tight">{template.label}</p>
                <p className="text-xs text-text-tertiary leading-snug">
                  {busy ? "Bringing them to life\u2026" : template.blurb}
                </p>
              </Card>
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
