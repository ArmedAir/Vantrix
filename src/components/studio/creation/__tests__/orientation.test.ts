import { describe, it, expect } from "vitest";
import { emptyDraft, orientationOptions, ORIENTATIONS_FOR_GENDER, type Gender } from "../types";

describe("orientationOptions", () => {
  it("always leads with 'Not set' mapping to the empty string", () => {
    for (const gender of ["female", "male", "anime", "other"] as Gender[]) {
      expect(orientationOptions(gender)[0]).toEqual({ value: "", label: "Not set" });
    }
  });

  it("offers straight/lesbian/bi for female, never gay", () => {
    const values = orientationOptions("female").map((o) => o.value);
    expect(values).toEqual(["", "straight", "lesbian", "bi"]);
  });

  it("offers straight/gay/bi for male, never lesbian", () => {
    const values = orientationOptions("male").map((o) => o.value);
    expect(values).toEqual(["", "straight", "gay", "bi"]);
  });

  it("leaves anime and other fully open", () => {
    expect(orientationOptions("anime").map((o) => o.value)).toEqual(["", "straight", "gay", "lesbian", "bi"]);
    expect(orientationOptions("other").map((o) => o.value)).toEqual(["", "straight", "gay", "lesbian", "bi"]);
  });

  it("every option has a human-readable, non-empty label", () => {
    for (const gender of ["female", "male", "anime", "other"] as Gender[]) {
      for (const opt of orientationOptions(gender)) {
        expect(opt.label.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("ORIENTATIONS_FOR_GENDER — gender-switch reset logic (as used by IdentityStage)", () => {
  function stillFits(gender: Gender, orientation: string): boolean {
    return orientation === "" || ORIENTATIONS_FOR_GENDER[gender].includes(orientation as never);
  }

  it("a lesbian orientation stops fitting once gender switches to male", () => {
    expect(stillFits("female", "lesbian")).toBe(true);
    expect(stillFits("male", "lesbian")).toBe(false);
  });

  it("a gay orientation stops fitting once gender switches to female", () => {
    expect(stillFits("male", "gay")).toBe(true);
    expect(stillFits("female", "gay")).toBe(false);
  });

  it("bi, straight, and unset always fit, across every gender", () => {
    for (const gender of ["female", "male", "anime", "other"] as Gender[]) {
      expect(stillFits(gender, "bi")).toBe(true);
      expect(stillFits(gender, "straight")).toBe(true);
      expect(stillFits(gender, "")).toBe(true);
    }
  });
});

describe("emptyDraft", () => {
  it("starts with orientation unset, not defaulted to straight", () => {
    // NULL/"" means "unclassified", not an assumption of straight — see
    // migration 20270128_character_orientation.sql.
    expect(emptyDraft().orientation).toBe("");
  });
});
