import { describe, it, expect } from "vitest";
import { resolveOrientationFilter } from "../orientation-filter";

describe("resolveOrientationFilter", () => {
  it("returns null for missing/empty param (no filter applied)", () => {
    expect(resolveOrientationFilter(null)).toBeNull();
    expect(resolveOrientationFilter(undefined)).toBeNull();
    expect(resolveOrientationFilter("")).toBeNull();
  });

  it("expands the 'lgbtq' meta-value to gay+lesbian+bi", () => {
    expect(resolveOrientationFilter("lgbtq")).toEqual(["gay", "lesbian", "bi"]);
  });

  it("passes through each specific orientation as a single-value filter", () => {
    expect(resolveOrientationFilter("gay")).toEqual(["gay"]);
    expect(resolveOrientationFilter("lesbian")).toEqual(["lesbian"]);
    expect(resolveOrientationFilter("bi")).toEqual(["bi"]);
    expect(resolveOrientationFilter("straight")).toEqual(["straight"]);
  });

  it("returns null for an unrecognized value rather than filtering to nothing", () => {
    // Guards against a typo'd or malicious query param silently becoming
    // an always-empty-results filter instead of just being ignored.
    expect(resolveOrientationFilter("bisexual")).toBeNull();
    expect(resolveOrientationFilter("../../etc")).toBeNull();
    expect(resolveOrientationFilter("GAY")).toBeNull(); // case-sensitive by design, matches the DB CHECK constraint
  });
});
