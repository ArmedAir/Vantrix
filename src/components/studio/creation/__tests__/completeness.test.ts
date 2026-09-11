import { describe, it, expect } from "vitest";
import { emptyDraft } from "../types";
import { stageComplete, overallCompleteness, canPublish, fundReadiness } from "../completeness";

describe("canPublish", () => {
  it("is false for an untouched draft", () => {
    expect(canPublish(emptyDraft())).toBe(false);
  });

  it("requires name, a description of at least 10 chars, and a portrait", () => {
    const draft = { ...emptyDraft(), name: "Mira", description: "short" };
    expect(canPublish(draft)).toBe(false); // description too short, no image

    const withLongDesc = { ...draft, description: "A long enough description." };
    expect(canPublish(withLongDesc)).toBe(false); // still no image

    const ready = { ...withLongDesc, imageUrl: "https://cdn.vantrix.ink/x.jpg" };
    expect(canPublish(ready)).toBe(true);
  });

  it("does not require personality, backstory, voice, or memories", () => {
    // canPublish is the hard minimum the API accepts — depth is advisory
    // only, via fundReadiness() below, never blocking here.
    const bareMinimum = {
      ...emptyDraft(),
      name: "Mira",
      description: "A long enough description.",
      imageUrl: "https://cdn.vantrix.ink/x.jpg",
    };
    expect(canPublish(bareMinimum)).toBe(true);
  });
});

describe("stageComplete / overallCompleteness", () => {
  it("marks every fillable stage incomplete on an empty draft", () => {
    const draft = emptyDraft();
    expect(stageComplete(draft, "concept")).toBe(false);
    expect(stageComplete(draft, "identity")).toBe(false);
    expect(stageComplete(draft, "personality")).toBe(false);
    expect(stageComplete(draft, "psychology")).toBe(false);
    expect(stageComplete(draft, "voice")).toBe(false);
    expect(stageComplete(draft, "appearance")).toBe(false);
    expect(stageComplete(draft, "memory")).toBe(false);
    expect(overallCompleteness(draft)).toBe(0);
  });

  it("preview never counts as its own completed stage", () => {
    const draft = { ...emptyDraft(), name: "Mira", description: "A long enough description." };
    expect(stageComplete(draft, "preview")).toBe(false);
  });

  it("personality stage is satisfied by either personality text or an archetype", () => {
    expect(stageComplete({ ...emptyDraft(), archetype: "The Rival" }, "personality")).toBe(true);
    expect(stageComplete({ ...emptyDraft(), personality: "Guarded but curious" }, "personality")).toBe(true);
  });

  it("increases proportionally as fillable stages are completed", () => {
    const draft = {
      ...emptyDraft(),
      description: "A long enough description.",
      name: "Mira",
      personality: "Guarded but curious",
      backstory: "Grew up on a cargo freighter.",
      speech_style: "Short, dry, understated",
      imageUrl: "https://cdn.vantrix.ink/x.jpg",
      memories: [{ key: "1", headline: "First flight", content: "...", category: "general", importance: 50 }],
    };
    // All 7 fillable stages satisfied.
    expect(overallCompleteness(draft)).toBe(100);
  });
});

describe("fundReadiness", () => {
  it("meets none of the checks on an empty draft", () => {
    const readiness = fundReadiness(emptyDraft());
    expect(readiness.metCount).toBe(0);
    expect(readiness.score).toBe(0);
    expect(readiness.checks.every((c) => !c.met)).toBe(true);
  });

  it("counts personality OR archetype as a single satisfied check, not two", () => {
    const withBoth = { ...emptyDraft(), personality: "Guarded", archetype: "The Rival" };
    const readiness = fundReadiness(withBoth);
    const personalityCheck = readiness.checks.find((c) => c.key === "personality");
    expect(personalityCheck?.met).toBe(true);
    // total possible checks unaffected by having both fields filled
    expect(readiness.total).toBe(readiness.checks.length);
  });

  it("requires the portrait to be identity-locked, not merely present", () => {
    const unlocked = { ...emptyDraft(), imageUrl: "https://cdn.vantrix.ink/x.jpg", identity_locked: false };
    const locked = { ...unlocked, identity_locked: true };
    expect(fundReadiness(unlocked).checks.find((c) => c.key === "portrait_locked")?.met).toBe(false);
    expect(fundReadiness(locked).checks.find((c) => c.key === "portrait_locked")?.met).toBe(true);
  });

  it("is never used to gate canPublish — the two are fully independent", () => {
    const richButUnpublishable = {
      ...emptyDraft(),
      personality: "Guarded but curious",
      backstory: "Grew up on a cargo freighter.",
      speech_style: "Short, dry, understated",
      opening_line: "Didn't expect to see you here.",
      memories: [{ key: "1", headline: "First flight", content: "...", category: "general", importance: 50 }],
      identity_locked: true,
      // deliberately no name, no description, no imageUrl
    };
    expect(fundReadiness(richButUnpublishable).metCount).toBeGreaterThan(0);
    expect(canPublish(richButUnpublishable)).toBe(false);
  });

  it("scores as a percentage of met checks out of the total", () => {
    const draft = { ...emptyDraft(), personality: "Guarded" }; // 1 of 6 checks
    const readiness = fundReadiness(draft);
    expect(readiness.score).toBe(Math.round((1 / readiness.total) * 100));
  });
});
