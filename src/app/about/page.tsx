import Link from "next/link";
import { PublicHeader } from "@/components/public/public-header";
import { getContactEmail, getDiscordUrl } from "@/lib/config/contact";
import { generateSEOMeta } from "@/lib/seo/meta";

export const metadata = generateSEOMeta({
  title: "About | Vantrix",
  description:
    "Vantrix builds AI companions with persistent memory — Silicon Valley-caliber AI engineering, serving a worldwide audience. Founded by Covenant Alphonsus and based in New York, USA.",
  path: "/about",
});

export default async function AboutPage() {
  const [contactEmail, discordUrl] = await Promise.all([
    getContactEmail(),
    getDiscordUrl(),
  ]);

  return (
    <div className="min-h-screen bg-base">
      <PublicHeader />
      <main className="max-w-2xl mx-auto px-4 md:px-8 py-16">
        <h1 className="font-display text-3xl text-text-primary">About Vantrix</h1>
        <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-text-secondary">
          <p>
            Vantrix builds AI companions that remember you — conversations,
            preferences, the small details that make a relationship feel
            real. Our characters carry memory, emotion, and personality
            forward from one chat to the next instead of starting over every
            session.
          </p>
          <p>
            Every character on Vantrix is an AI system, not a person. We
            design them to be genuinely engaging and emotionally responsive,
            and we&apos;re upfront that what you&apos;re talking to is
            software.
          </p>
          <p>
            We hold our engineering to Silicon Valley-caliber standards —
            the same bar for model quality, memory architecture, and product
            craft you&apos;d expect from top-tier AI labs — while serving a
            worldwide audience of users, in every timezone, every day.
          </p>
          <p>
            Vantrix is founded by Covenant Alphonsus and based in New York,
            USA. We&apos;re building this because we think persistent,
            emotionally intelligent AI companionship is a real product
            category — not a novelty. If you want to reach us, see{" "}
            <Link href="/support" className="text-gold-400 hover:text-gold-300">
              Support
            </Link>{" "}
            or email{" "}
            <a
              href={`mailto:${contactEmail}`}
              className="text-gold-400 hover:text-gold-300"
            >
              {contactEmail}
            </a>
            . You can also find us on{" "}
            <a
              href={discordUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold-400 hover:text-gold-300"
            >
              Discord
            </a>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
