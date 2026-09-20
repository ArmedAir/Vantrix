/**
 * Pure (no I/O, no env) extraction of the ONLY twin fields that may leave the
 * twin's own page. Split out so the privacy boundary is unit-testable.
 *
 * PRIVACY BY CONSTRUCTION — this is an ALLOWLIST, not a filter. The twin's
 * intimate inferred fields (coreBeliefs, contradictions, emotionalPatterns,
 * manual_notes, manual_sample_phrases, source_breakdown, …) are never read
 * here, so no later change to a caller can accidentally leak them.
 *
 *   • mirror summary  → tone / humor / formality / style summary
 *                       (goes into ONE opted-in character's chat context)
 *   • match signals   → humor / values / tone
 *                       (used only by the deterministic recommendation scorer;
 *                        never sent to any LLM)
 *
 * auto_traits is a JSON column typed as TwinTraits in engine.ts. Field names
 * below are the real ones (tone, formality, avgMessageLength, emojiUsage,
 * punctuationStyle, humorStyle, values) with snake_case tolerated. humorStyle
 * and values only exist on deep/master-trained twins — a standard-trained twin
 * simply yields fewer signals. Anything unrecognised yields null → the feature
 * is inert, never broken.
 *
 * Deliberately NOT allowlisted even though they are "style": commonPhrases and
 * vocabularyNotes (verbatim tics — echoing them back would read as parroting).
 *
 * topics are allowed for MATCHING ONLY (as `interests`): they exist at every
 * training depth, so a standard-trained twin still has signal beyond tone. They
 * are reduced to abstract concepts by the deterministic scorer and never shown,
 * logged, or sent to any model; the chat/roleplay mirror summary never includes them.
 */

export interface TwinProfileRow {
  auto_traits?: unknown;
  auto_style_summary?: string | null;
}

export interface TwinMirrorSummary {
  tone: string | null;
  humor: string | null;
  formality: string | null;
  /** Texting rhythm — the mechanics a character can adapt to without echoing content. */
  messageLength: 'short' | 'medium' | 'long' | null;
  emoji: 'none' | 'light' | 'frequent' | null;
  punctuation: string | null;
  styleSummary: string | null;
}

export interface TwinMatchSignals {
  humor: string[];
  values: string[];
  tone: string[];
  /** TwinTraits.topics — present on EVERY training depth, so standard twins have something to match on. */
  interests: string[];
}

const MAX_FIELD = 80;
const MAX_STYLE_SUMMARY = 240;
const MAX_LIST_ITEMS = 6;

/** Flatten to one short line and remove anything that could fake a prompt-block boundary. */
export function sanitizeSnippet(input: unknown, max: number): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')   // control chars incl. newlines
    .replace(/[<>\[\]{}`]+/g, '')               // block/tag delimiters
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.length > max ? `${cleaned.slice(0, max - 1).trimEnd()}…` : cleaned;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pick(rec: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (rec[k] !== undefined && rec[k] !== null) return rec[k];
  return undefined;
}

function asStringList(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;\n]/) : [];
  const out: string[] = [];
  for (const item of raw) {
    const s = sanitizeSnippet(item, MAX_FIELD);
    if (s) out.push(s);
    if (out.length >= MAX_LIST_ITEMS) break;
  }
  return out;
}

function asLabel(v: unknown): string | null {
  if (Array.isArray(v)) return sanitizeSnippet(v.filter(x => typeof x === 'string').join(', '), MAX_FIELD);
  return sanitizeSnippet(v, MAX_FIELD);
}

/** Formality may arrive as a label ("casual") or a number on a 0–1 or 0–10 scale. */
function asFormality(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
    const n = v <= 1 ? v : v <= 10 ? v / 10 : null;
    if (n === null) return null;
    return n < 0.34 ? 'casual' : n < 0.67 ? 'balanced' : 'formal';
  }
  return asLabel(v);
}

function asEnum<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

export function extractMirrorSummary(row: TwinProfileRow | null | undefined): TwinMirrorSummary | null {
  if (!row) return null;
  const traits = asRecord(row.auto_traits) ?? {};
  const summary: TwinMirrorSummary = {
    tone: asLabel(pick(traits, 'tone', 'communicationTone', 'communication_tone')),
    humor: asLabel(pick(traits, 'humorStyle', 'humor_style', 'humor')),
    formality: asFormality(pick(traits, 'formality', 'formalityLevel', 'formality_level')),
    messageLength: asEnum(pick(traits, 'avgMessageLength', 'avg_message_length'), ['short', 'medium', 'long'] as const),
    emoji: asEnum(pick(traits, 'emojiUsage', 'emoji_usage'), ['none', 'light', 'frequent'] as const),
    punctuation: sanitizeSnippet(pick(traits, 'punctuationStyle', 'punctuation_style'), MAX_FIELD),
    styleSummary: sanitizeSnippet(row.auto_style_summary, MAX_STYLE_SUMMARY),
  };
  const hasAny = Object.values(summary).some(v => v !== null);
  return hasAny ? summary : null;
}

export function extractMatchSignals(row: TwinProfileRow | null | undefined): TwinMatchSignals | null {
  if (!row) return null;
  const traits = asRecord(row.auto_traits);
  if (!traits) return null;
  const signals: TwinMatchSignals = {
    humor: asStringList(pick(traits, 'humorStyle', 'humor_style', 'humor')),
    values: asStringList(pick(traits, 'values', 'coreValues', 'core_values')),
    tone: asStringList(pick(traits, 'tone', 'communicationTone', 'communication_tone')),
    interests: asStringList(pick(traits, 'topics', 'interests')),
  };
  return signals.humor.length || signals.values.length || signals.tone.length || signals.interests.length ? signals : null;
}
