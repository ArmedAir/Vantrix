import { describe, it, expect } from "vitest";
import { CHARACTER_INTELLIGENCE, DEFAULT_INTELLIGENCE, getIntelligenceProfile } from "../intelligence";

/**
 * STALE-KEY FIX (2027-01-29): CHARACTER_INTELLIGENCE is looked up live by
 * character.name (getIntelligenceProfile), with no error on a miss -- just a
 * silent fallback to DEFAULT_INTELLIGENCE. That's exactly how 12 of 13 keys
 * went stale unnoticed after a rename this file was never updated for. These
 * tests can't see the live database, so they can't catch the NEXT rename --
 * but they lock in this fix and make a future accidental revert (or typo)
 * fail loudly instead of silently degrading five characters back to generic.
 */
describe("CHARACTER_INTELLIGENCE — stale-key fix", () => {
  it("the 5 renamed keys are present, each still carrying its identifying vtx_ face slug", () => {
    const expected: Record<string, string> = {
      "Michael Sanchez": "vtx_ivan_korrath",
      "Mason Reed": "vtx_elan",
      "Tyler Nguyen": "vtx_kael_ashvane",
      "Alexander Wright": "vtx_lordadrian",
      "Jasmine Ortiz": "vtx_yanefes",
    };
    for (const [name, slug] of Object.entries(expected)) {
      const entry = CHARACTER_INTELLIGENCE[name];
      expect(entry, `missing profile for ${name}`).toBeDefined();
      expect(entry.image?.face_prompt, `${name} lost its identifying face_prompt`).toContain(slug);
    }
  });

  it("Countess Chloe was already current and is untouched", () => {
    expect(CHARACTER_INTELLIGENCE["Countess Chloe"]?.image?.face_prompt).toContain("vtx_countessvesper");
  });

  it("the old, now-stale keys are gone (guards against an accidental revert)", () => {
    for (const staleKey of ["David", "Anthony", "James", "Lord Mason", "Ava"]) {
      expect(CHARACTER_INTELLIGENCE[staleKey], `${staleKey} should have been renamed, not left in place`).toBeUndefined();
    }
  });

  it("getIntelligenceProfile resolves the renamed characters to their real profile, not the generic fallback", () => {
    expect(getIntelligenceProfile("Michael Sanchez")).not.toBe(DEFAULT_INTELLIGENCE);
    expect(getIntelligenceProfile("Michael Sanchez").domain).toMatch(/game theory/i);
    // An actually-unmatched name must still fall back cleanly -- this map
    // silently defaulting on a miss is correct behavior for e.g. user-created
    // characters; the bug was specific names going stale, not the fallback itself.
    expect(getIntelligenceProfile("Some User Created Character")).toBe(DEFAULT_INTELLIGENCE);
  });
});
