import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * AI-CHATBOT-ACCESS FIX (src/app/robots.ts): llms.txt/route.ts's own doc
 * comment says it's "kept in sync" with robots.ts's public-surface list —
 * these tests guard the two concrete claims that fix makes, the same
 * lightweight text-matching style as arch-raas-surfacing.test.ts uses for
 * this same file.
 */
function read(...parts: string[]): string {
  return readFileSync(join(__dirname, "..", ...parts), "utf8");
}

describe("robots.ts — AI chatbot access", () => {
  const robots = read("app", "robots.ts");

  it("llms.txt and llms-full.txt are explicitly allowed, not left to a robots.txt tie-break", () => {
    expect(robots).toMatch(/"\/llms\.txt"/);
    expect(robots).toMatch(/"\/llms-full\.txt"/);
  });

  it("major AI-chatbot user agents (not just '*') are granted their own explicit rule", () => {
    for (const ua of ["GPTBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "PerplexityBot", "Google-Extended"]) {
      expect(robots).toContain(`"${ua}"`);
    }
  });

  it("every named AI-chatbot rule shares the exact same allow/disallow lists as '*' (no bot gets more or less than the wildcard)", () => {
    expect(robots).toMatch(/userAgent,\s*\n\s*allow: PUBLIC_ALLOW,\s*\n\s*disallow: PUBLIC_DISALLOW,/);
    expect(robots).toMatch(/userAgent: "\*",\s*\n\s*allow: PUBLIC_ALLOW,\s*\n\s*disallow: PUBLIC_DISALLOW,/);
  });
});

describe("llms.txt — reachability claim stays true", () => {
  it("documents that it's now in robots.ts's explicit allow list, not just implicitly reachable", () => {
    const llms = read("app", "llms.txt", "route.ts");
    expect(llms).toMatch(/robots\.ts.*allow list|allow list.*robots\.ts/s);
  });
});
