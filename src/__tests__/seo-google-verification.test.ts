import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * GOOGLE-VERIFICATION-CONSISTENCY FIX (src/lib/seo/meta.ts): before this
 * fix, generateSEOMeta() returned `verification: { google:
 * env.GOOGLE_SITE_VERIFICATION }` with no fallback. Since Next.js's
 * metadata merge REPLACES a parent layout's nested object fields (like
 * `verification`) with a child route's rather than deep-merging them, an
 * unset env var meant every real page's own metadata export silently blanked
 * out layout.tsx's hardcoded verification token -- including "/" itself,
 * which is exactly the page Google's HTML-tag verification check fetches.
 * These tests guard that generateSEOMeta() always resolves to a real,
 * non-empty token regardless of whether the env var is set, and that
 * layout.tsx imports the same constant rather than a second hardcoded copy.
 */

const REAL_TOKEN = "dZC8yjP4DGNU1fjD589zwm_-jDQINFXfrZMrUyrbR9o";

describe("GOOGLE_SITE_VERIFICATION / generateSEOMeta — env var unset", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/env", () => ({ env: { GOOGLE_SITE_VERIFICATION: undefined, NEXT_PUBLIC_APP_URL: "https://vantrix.ink" } }));
  });

  it("GOOGLE_SITE_VERIFICATION falls back to the real token, not undefined", async () => {
    const { GOOGLE_SITE_VERIFICATION } = await import("../lib/seo/meta");
    expect(GOOGLE_SITE_VERIFICATION).toBe(REAL_TOKEN);
  });

  it("generateSEOMeta() never returns an empty/undefined verification.google", async () => {
    const { generateSEOMeta } = await import("../lib/seo/meta");
    const meta = generateSEOMeta({ title: "Home", description: "d", path: "/" });
    expect(meta.verification?.google).toBe(REAL_TOKEN);
  });
});

describe("GOOGLE_SITE_VERIFICATION / generateSEOMeta — env var set", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/env", () => ({ env: { GOOGLE_SITE_VERIFICATION: "a-real-configured-token", NEXT_PUBLIC_APP_URL: "https://vantrix.ink" } }));
  });

  it("prefers the real configured env var over the hardcoded fallback", async () => {
    const { GOOGLE_SITE_VERIFICATION, generateSEOMeta } = await import("../lib/seo/meta");
    expect(GOOGLE_SITE_VERIFICATION).toBe("a-real-configured-token");
    expect(generateSEOMeta({ title: "Home", description: "d", path: "/" }).verification?.google).toBe("a-real-configured-token");
  });
});

describe("layout.tsx — single source of truth", () => {
  it("imports GOOGLE_SITE_VERIFICATION from lib/seo/meta instead of hardcoding a second copy of the token", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const layout = readFileSync(join(__dirname, "..", "app", "layout.tsx"), "utf8");
    expect(layout).toMatch(/import\s*\{\s*GOOGLE_SITE_VERIFICATION\s*\}\s*from\s*["']@\/lib\/seo\/meta["']/);
    // The real token string should appear exactly once across the codebase now (in meta.ts), not duplicated here.
    expect(layout).not.toContain(REAL_TOKEN);
  });
});
