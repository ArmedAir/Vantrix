import { describe, it, expect } from "vitest";
import { emptyDraft } from "../types";
import { isMeaningfulDraft, parseSavedDraft, serializeDraft, draftStorageKey } from "../draft-storage";

describe("isMeaningfulDraft", () => {
  it("is false for a completely untouched draft", () => {
    expect(isMeaningfulDraft(emptyDraft())).toBe(false);
  });

  it("is true once any substantive field has real content", () => {
    expect(isMeaningfulDraft({ ...emptyDraft(), name: "Mira" })).toBe(true);
    expect(isMeaningfulDraft({ ...emptyDraft(), description: "hi" })).toBe(true);
    expect(isMeaningfulDraft({ ...emptyDraft(), personality: "hi" })).toBe(true);
    expect(isMeaningfulDraft({ ...emptyDraft(), archetype: "hi" })).toBe(true);
    expect(isMeaningfulDraft({ ...emptyDraft(), backstory: "hi" })).toBe(true);
    expect(isMeaningfulDraft({ ...emptyDraft(), scenario: "hi" })).toBe(true);
    expect(isMeaningfulDraft({ ...emptyDraft(), imageUrl: "https://cdn.vantrix.ink/x.jpg" })).toBe(true);
    expect(
      isMeaningfulDraft({
        ...emptyDraft(),
        memories: [{ key: "1", headline: "h", content: "c", category: "general", importance: 50 }],
      }),
    ).toBe(true);
  });

  it("ignores whitespace-only content", () => {
    expect(isMeaningfulDraft({ ...emptyDraft(), name: "   ", description: "  \n " })).toBe(false);
  });

  it("is not tripped by the untouched defaults (gender, age, category)", () => {
    // emptyDraft() ships with gender:'female', age:24, category:'romance' —
    // none of those should count as "meaningful" on their own.
    expect(isMeaningfulDraft(emptyDraft())).toBe(false);
  });
});

describe("serializeDraft / parseSavedDraft round-trip", () => {
  it("round-trips a meaningful draft exactly", () => {
    const draft = { ...emptyDraft(), name: "Mira", description: "A long enough description." };
    const raw = serializeDraft(draft, "personality", 2);
    const parsed = parseSavedDraft(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.draft.name).toBe("Mira");
    expect(parsed?.activeStage).toBe("personality");
    expect(parsed?.furthestIndex).toBe(2);
    expect(typeof parsed?.savedAt).toBe("string");
  });

  it("rejects a draft with no meaningful content, even if well-formed", () => {
    const raw = serializeDraft(emptyDraft(), "concept", 0);
    expect(parseSavedDraft(raw)).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(parseSavedDraft(null)).toBeNull();
    expect(parseSavedDraft("")).toBeNull();
    expect(parseSavedDraft("not json")).toBeNull();
    expect(parseSavedDraft("42")).toBeNull();
    expect(parseSavedDraft("[]")).toBeNull();
  });

  it("rejects a snapshot from a different storage version", () => {
    const draft = { ...emptyDraft(), name: "Mira" };
    const raw = JSON.stringify({ version: 999, savedAt: new Date().toISOString(), activeStage: "concept", furthestIndex: 0, draft });
    expect(parseSavedDraft(raw)).toBeNull();
  });

  it("falls back to the concept stage for an unrecognized activeStage", () => {
    const draft = { ...emptyDraft(), name: "Mira" };
    const raw = JSON.stringify({ version: 1, savedAt: new Date().toISOString(), activeStage: "not-a-real-stage", furthestIndex: 3, draft });
    const parsed = parseSavedDraft(raw);
    expect(parsed?.activeStage).toBe("concept");
  });

  it("clamps a missing or invalid furthestIndex to 0", () => {
    const draft = { ...emptyDraft(), name: "Mira" };
    const raw = JSON.stringify({ version: 1, savedAt: new Date().toISOString(), activeStage: "voice", draft });
    const parsed = parseSavedDraft(raw);
    expect(parsed?.furthestIndex).toBe(0);
  });

  it("merges onto emptyDraft() defaults so a stale/partial draft shape never crashes", () => {
    // Simulates a draft saved by an older build missing a field that
    // CharacterDraft has since gained.
    const raw = JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      activeStage: "concept",
      furthestIndex: 0,
      draft: { name: "Mira" }, // everything else absent
    });
    const parsed = parseSavedDraft(raw);
    expect(parsed?.draft.name).toBe("Mira");
    expect(parsed?.draft.memories).toEqual([]); // default from emptyDraft()
    expect(parsed?.draft.voice).toEqual(emptyDraft().voice);
  });
});

describe("draftStorageKey", () => {
  it("scopes the storage key per user id", () => {
    expect(draftStorageKey("user-a")).not.toBe(draftStorageKey("user-b"));
    expect(draftStorageKey("user-a")).toContain("user-a");
  });
});
