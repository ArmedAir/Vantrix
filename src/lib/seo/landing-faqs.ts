/**
 * CONVERSION-SEO: FAQPage schema + matching visible copy for the homepage
 * (see components/home/landing-page.tsx's FAQ <section>). Pulled into its
 * own pure data module (no JSX/Next imports) rather than living inline in
 * that file, specifically so it can be unit tested — importing a full
 * Server Component page file into Vitest hits unrelated JSX/module-
 * resolution friction that has nothing to do with this content itself.
 *
 * Every answer restates a claim already made elsewhere in this codebase —
 * never a new one invented for this block:
 *   - free tier / no card required: same claim as generateSoftwareApplicationSchema()'s
 *     `offers` and discover/page.tsx's own FAQS.
 *   - memory/personality persisting: same positioning language as
 *     generateOrganizationSchema()/generateSoftwareApplicationSchema()'s
 *     descriptions.
 *   - Creation Studio: same pitch as landing-page.tsx's "how-it-works"
 *     section ("Build the person before you meet them.").
 *   - "a cast, not one avatar": same pitch as landing-page.tsx's "Why
 *     switch" section.
 *   - privacy: quotes src/app/privacy/page.tsx's actual stated policy
 *     ("We do not sell your personal information") rather than a new
 *     claim, and points to that page for the full policy instead of
 *     restating it.
 */
export const LANDING_FAQS: { question: string; answer: string }[] = [
 {
 question: "Is Vantrix free to use?",
 answer: "Yes. Every companion is free to start chatting with, no card required. Premium tiers unlock unlimited messages, calls, and image generation once you're ready to go deeper.",
 },
 {
 question: "What makes Vantrix different from a regular chatbot?",
 answer: "Each companion has a persistent personality, memory of your past conversations, and relationships that evolve over time — not a fresh, forgetful chat every session.",
 },
 {
 question: "Can I create my own character?",
 answer: "Yes, in the Creation Studio. Shape identity, personality, psychology, voice, appearance, and memories, then test how the character responds before you publish.",
 },
 {
 question: "Do I have to pick just one companion?",
 answer: "No. Vantrix is a cast, not a single avatar — dozens of characters with their own histories and relationships to each other, plus anything you build yourself. Outgrow one dynamic without starting over on a new app.",
 },
 {
 question: "Is my data private?",
 answer: "We do not sell your personal information. See the Privacy Policy for the full details on what's collected and how it's used.",
 },
];
