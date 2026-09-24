import { describe, it, expect } from "vitest";
import { LANDING_FAQS } from "@/lib/seo/landing-faqs";
import { generateFAQSchema } from "@/lib/seo/structured";

/**
 * LANDING_FAQS (src/lib/seo/landing-faqs.ts) is deliberately a "mirror,
 * don't invent" block — see its own header comment: every answer restates a
 * claim already made in generateSoftwareApplicationSchema(), discover/
 * page.tsx's FAQ, landing-page.tsx's other sections, or the real privacy
 * policy. These tests guard that property so a future edit can't quietly
 * drift one of those answers away from the claim it's supposed to mirror.
 */
describe("LANDING_FAQS", () => {
  it("every entry has a real question and a non-empty answer", () => {
    expect(LANDING_FAQS.length).toBeGreaterThanOrEqual(3);
    for (const faq of LANDING_FAQS) {
      expect(faq.question.trim().endsWith("?")).toBe(true);
      expect(faq.answer.trim().length).toBeGreaterThan(0);
    }
  });

  it("the free-tier answer matches the SoftwareApplication schema's offer (free, no card required)", () => {
    const free = LANDING_FAQS.find((f) => /free to use/i.test(f.question));
    expect(free?.answer).toMatch(/free/i);
    expect(free?.answer).toMatch(/no card required/i);
  });

  it("the privacy answer quotes the real privacy policy claim, not a new one", () => {
    const privacy = LANDING_FAQS.find((f) => /private/i.test(f.question));
    // Same sentence as src/app/privacy/page.tsx's actual stated policy.
    expect(privacy?.answer).toMatch(/do not sell your personal information/i);
  });

  it("generates valid FAQPage schema with one Question per FAQ, in order", () => {
    const schema = generateFAQSchema(LANDING_FAQS);
    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.mainEntity).toHaveLength(LANDING_FAQS.length);
    schema.mainEntity.forEach((entry, i) => {
      expect(entry.name).toBe(LANDING_FAQS[i].question);
      expect(entry.acceptedAnswer.text).toBe(LANDING_FAQS[i].answer);
    });
  });
});
