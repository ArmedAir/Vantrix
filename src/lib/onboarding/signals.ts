"use client";

/**
 * Storage for the pre-signup "First Chapter" onboarding flow's choices —
 * see docs/vantrix-onboarding-conversion-build.md §2 for the full spec
 * this implements.
 *
 * Mirrors lib/guest-transcript.ts's approach: an anonymous visitor makes
 * choices before any account exists, so they live in localStorage until
 * there's a user to attach them to. Not a security boundary — same
 * caveat as guest-transcript.ts. Merged into real personalization signal
 * at signup (see use-onboarding-signals.ts's flush hook), never treated
 * as a standalone hidden profile that lives apart from the account.
 *
 * DISCLOSURE PRINCIPLE (see build doc §0/§4): every inferred value here
 * ships with a confidence score and is only ever shown back to the user
 * framed as "based on what you've shown us" — never as a certain claim
 * about who they are. That's a UI-layer rule (see character-reveal.tsx),
 * not enforced by this storage module, but it's why `confidence` exists
 * on OnboardingSignals at all — so nothing downstream can accidentally
 * drop that framing.
 */

const STORAGE_KEY = "vantrix:onboardingSignals";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // matches guest-transcript.ts's window

export type IdentityChoice =
  | "unforgettable"
  | "dangerous"
  | "safe"
  | "irreplaceable"
  | "unsure";

export type IntentChoice = "connection" | "chemistry" | "depth" | "escape" | "surprise";

export interface OnboardingSignals {
  identityChoice?: IdentityChoice;
  intentChoice?: IntentChoice;
  scenarioResponse?: string;
  openingLineChoice?: "a" | "b" | "c" | "silence";
  characterRevealId?: string;
  triedAnotherCount: number;
  /** Per-tag/archetype confidence weights, 0–1 — see build doc §2. Never
   *  surfaced to the user as a number; only ever as the "based on what
   *  you've shown us" copy pattern. */
  confidence: Record<string, number>;
}

interface StoredSignals {
  signals: OnboardingSignals;
  ts: number;
}

const EMPTY: OnboardingSignals = { triedAnotherCount: 0, confidence: {} };

function read(): StoredSignals | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSignals;
    if (Date.now() - parsed.ts > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function write(signals: OnboardingSignals): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredSignals = { signals, ts: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota/private-mode — losing onboarding signal cache degrades
    // personalization, not correctness. Not worth surfacing to the user.
  }
}

export function getOnboardingSignals(): OnboardingSignals {
  return read()?.signals ?? { ...EMPTY, confidence: {} };
}

export function updateOnboardingSignals(
  patch: Partial<OnboardingSignals>
): OnboardingSignals {
  const current = getOnboardingSignals();
  const next: OnboardingSignals = {
    ...current,
    ...patch,
    confidence: { ...current.confidence, ...(patch.confidence ?? {}) },
  };
  write(next);
  return next;
}

export function incrementTriedAnother(): OnboardingSignals {
  const current = getOnboardingSignals();
  return updateOnboardingSignals({ triedAnotherCount: current.triedAnotherCount + 1 });
}

export function clearOnboardingSignals(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
