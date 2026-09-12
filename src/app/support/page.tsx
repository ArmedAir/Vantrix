import Link from "next/link";
import { PublicHeader } from "@/components/public/public-header";
import { getContactEmail, getDiscordUrl } from "@/lib/config/contact";
import { generateSEOMeta } from "@/lib/seo/meta";

export const metadata = generateSEOMeta({
  title: "Help Center | Vantrix",
  description: "Get help with your Vantrix account, billing, or a safety concern.",
  path: "/support",
});

// SUPPORT-QA-FIX: FAQPage rich results were fully retired by Google as
// of May 7, 2026 (no SERP snippet benefit left for any site), so the
// lever here isn't schema markup — it's visible content. Real
// question-form Q&A gives both ordinary keyword-match SEO and AI answer
// engines (already targeted separately via llms.txt) actual quotable
// text to cite, which the old statement-style blurbs didn't provide.
const TOPICS = [
  {
    title: "How do I sign in or reset my password?",
    body: "Use the \"Forgot password\" link on the login page to get a reset email. If you're having trouble verifying your age, contact us at the email below and we'll help directly.",
  },
  {
    title: "How do I cancel my subscription or ask about a charge?",
    body: "Manage or cancel your plan anytime in Premium settings. For questions about a specific charge or a refund, email us with your account email and the approximate date of the charge.",
    href: "/premium",
    linkLabel: "Go to Premium",
  },
  {
    title: "How do I report a character or a safety concern?",
    body: "Email us with details of the character, conversation, or user behavior involved. Safety and policy reports go to a dedicated review queue and are prioritized over general support email.",
  },
];

export default async function SupportPage() {
  const [contactEmail, discordUrl] = await Promise.all([
    getContactEmail(),
    getDiscordUrl(),
  ]);

  return (
    <div className="min-h-screen bg-base">
      <PublicHeader />
      <main className="max-w-2xl mx-auto px-4 md:px-8 py-16">
        <h1 className="font-display text-3xl text-text-primary">Help Center</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-text-secondary">
          Email us at{" "}
          <a
            href={`mailto:${contactEmail}`}
            className="text-gold-400 hover:text-gold-300"
          >
            {contactEmail}
          </a>{" "}
          and we&apos;ll get back to you within 1–2 business days. Include
          your account email and, if it&apos;s a billing question, the
          approximate date of the charge.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">
          Prefer chatting live? Join our{" "}
          <a
            href={discordUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold-400 hover:text-gold-300"
          >
            Discord community
          </a>{" "}
          — the fastest way to reach the team and other users for
          non-account-specific questions. For anything involving your
          account, billing, or a safety report, use email so we can verify
          your identity.
        </p>

        <div className="mt-10 space-y-6">
          {TOPICS.map((t) => (
            <div key={t.title} className="border-t border-border-hairline pt-5">
              <h2 className="font-display text-base text-text-primary">
                {t.title}
              </h2>
              <p className="mt-1.5 text-sm text-text-secondary leading-relaxed">
                {t.body}
              </p>
              {t.href && (
                <Link
                  href={t.href}
                  className="mt-2 inline-block text-sm text-gold-400 hover:text-gold-300"
                >
                  {t.linkLabel} 
                </Link>
              )}
            </div>
          ))}
        </div>

        <p className="mt-10 text-xs text-text-secondary/80 leading-relaxed">
          See also our{" "}
          <Link href="/terms" className="text-gold-400 hover:text-gold-300">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-gold-400 hover:text-gold-300">
            Privacy Policy
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
