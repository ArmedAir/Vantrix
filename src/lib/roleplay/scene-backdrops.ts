/**
 * Story Mode — location backdrop themes
 *
 * RoleplayStage previously rendered every scenario on a flat `bg-base` —
 * the narrator prompt already varies per scenario (setting/tone/premise,
 * see prompt.ts), but nothing visual did. `roleplay_scenarios.cover_image_url`
 * exists in the schema for real art (admin-uploaded, via the same
 * resolveImageSrc/R2 path every other image on the site uses) but is NULL
 * on every seeded scenario today — nobody has uploaded any yet.
 *
 * Rather than ship a visually-flat scene until someone gets around to
 * uploading cover art, this is a CSS-only fallback: a per-slug solid tone
 * tuned to that scene's setting/mood, using only existing design tokens
 * (gold scale + base/void, per the site's dark-glassmorphism language).
 * RoleplayStage prefers a real `cover_image_url` when one is set and only
 * falls back to this for scenarios that don't have one yet — so uploading
 * real art later is a pure upgrade, nothing to migrate away from.
 */
export interface SceneBackdrop {
  /** Tailwind background-color class applied behind the whole stage. */
  base: string;
  /** Low-opacity radial tint layered on top for depth. */
  glow: string;
}

export const SCENE_BACKDROPS: Record<string, SceneBackdrop> = {
  "first-date": {
    base: "bg-[#1a1210]",
    glow: "bg-[rgb(var(--gold-500)/0.16)]",
  },
  "late-night-talk": {
    base: "bg-[#0a0d14]",
    glow: "bg-[rgba(120,140,220,0.10)]",
  },
  jealousy: {
    base: "bg-[#160c0f]",
    glow: "bg-[rgba(210,60,90,0.14)]",
  },
  "at-the-beach": {
    base: "bg-[#0e1a1f]",
    glow: "bg-[rgb(var(--gold-400)/0.14)]",
  },
};

export const DEFAULT_BACKDROP: SceneBackdrop = {
  base: "bg-[#0e0e0e]",
  glow: "bg-[rgb(var(--gold-500)/0.10)]",
};

export function getSceneBackdrop(slug: string | null | undefined): SceneBackdrop {
  if (!slug) return DEFAULT_BACKDROP;
  return SCENE_BACKDROPS[slug] ?? DEFAULT_BACKDROP;
}
