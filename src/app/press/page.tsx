import { PublicHeader } from "@/components/public/public-header";
import { Footer } from "@/components/home/footer";
import { getContactEmail } from "@/lib/config/contact";
import { generateSEOMeta } from "@/lib/seo/meta";

export const metadata = generateSEOMeta({
  title: "Press & Media Kit | Vantrix",
  description:
    "Press resources, boilerplate, and contact information for journalists and media covering Vantrix — Silicon Valley-caliber AI engineering serving a worldwide audience.",
  path: "/press",
  keywords: ["Vantrix press", "Vantrix media kit", "AI companion press kit"],
});

export default async function PressPage() {
  const contactEmail = await getContactEmail();

  return (
    <div className="min-h-screen bg-base">
      <PublicHeader />
      <main className="max-w-2xl mx-auto px-4 md:px-8 py-16">
        <h1 className="font-display text-3xl text-text-primary">
          Press &amp; Media
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">
          Resources for journalists, bloggers, and directories covering
          Vantrix. For anything not covered here, reach us directly at{" "}
          <a
            href={`mailto:${contactEmail}`}
            className="text-gold-400 hover:text-gold-300"
          >
            {contactEmail}
          </a>
          .
        </p>

        <section className="mt-10">
          <h2 className="font-display text-lg text-text-primary">
            Boilerplate
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">
            Vantrix is a living universe of AI companions who remember you,
            always. Unlike typical AI chatbots that reset context every
            session, Vantrix characters carry persistent, cross-session
            memory, evolve based on the history of their relationship with
            each user, and exist inside a world that keeps advancing whether
            or not a conversation is active. Built to Silicon Valley-caliber
            engineering standards and serving a worldwide user base, Vantrix
            is founded by Covenant Alphonsus and based in New York, USA.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-lg text-text-primary">
            One-line description
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">
            &ldquo;A living universe of AI companions who remember you,
            always.&rdquo;
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-lg text-text-primary">
            Quick facts
          </h2>
          <ul className="mt-2 space-y-1.5 text-[15px] leading-relaxed text-text-secondary list-disc pl-5">
            <li>Founder: Covenant Alphonsus</li>
            <li>Headquarters: New York, USA</li>
            <li>Category: AI companion platform</li>
            <li>
              Differentiator: persistent, cross-session memory and an
              evolving world — not a chatbot that resets each session
            </li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-lg text-text-primary">
            What makes Vantrix different
          </h2>
          <ul className="mt-2 space-y-1.5 text-[15px] leading-relaxed text-text-secondary list-disc pl-5">
            <li>Persistent, cross-session memory — not a per-session context window</li>
            <li>Characters whose personality and state evolve with interaction history</li>
            <li>A living world/story layer that continues independent of any one chat</li>
            <li>Users can create and customize their own characters, not just pick from a fixed roster</li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-lg text-text-primary">
            Brand assets
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">
            Logo files and screenshots are available on request — email{" "}
            <a
              href={`mailto:${contactEmail}`}
              className="text-gold-400 hover:text-gold-300"
            >
              {contactEmail}
            </a>{" "}
            and we&apos;ll send a media kit.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-lg text-text-primary">Contact</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">
            Press inquiries:{" "}
            <a
              href={`mailto:${contactEmail}`}
              className="text-gold-400 hover:text-gold-300"
            >
              {contactEmail}
            </a>
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
