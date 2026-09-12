import Link from "next/link";
import { getContactEmail, getDiscordUrl } from "@/lib/config/contact";

type FooterLink = { label: string; href: string; external?: boolean };

/**
 * Footer — full rebuild (2026-09-09), not an edit of the prior version.
 *
 * Visual structure follows a reference companion-app footer (link-column
 * grid, social icon row, payment-method badges, logo+tagline block, legal
 * line) but every single piece of content below is real: real in-app
 * routes, the same dynamic getContactEmail()/getDiscordUrl() helpers the
 * rest of the shell already uses (sidebar.tsx, mobile-drawer.tsx), and
 * the same Twitter/Telegram handles the prior footer already had. No
 * invented company legal-entity name, registration number, or street
 * address — that block does not exist anywhere in this codebase to draw
 * from (there is no formal registered-entity page), so putting a
 * fabricated one here would be false information on a real production
 * site's legal/support surface, not a cosmetic placeholder. The one real
 * location claim already established elsewhere in this app ("Made in
 * New York, USA") is used instead of a fake registered address.
 *
 * DISCOVER column: BROWSE_CATEGORIES' three real gender-filtered
 * /characters routes (see mobile-drawer.tsx's own const of the same
 * name) — the reference's "AI Girlfriend / AI Anime / AI Boyfriend"
 * column, using this app's actual filter values instead of borrowed
 * copy.
 *
 * NO-TRAILING-SPACE: the legal line below is the last rendered element,
 * with a fixed small bottom padding (pb-6) and nothing after it — no
 * extra wrapper, spacer, or trailing margin past that, so the footer
 * ends flush rather than leaving dead space before the mobile bottom
 * nav bar or the true end of the page on desktop.
 */
const DISCOVER_LINKS: FooterLink[] = [
  { label: "Create Character", href: "/studio" },
  { label: "Browse Companions", href: "/characters" },
  { label: "My Companions", href: "/profile" },
];

const CATEGORY_LINKS: FooterLink[] = [
  { label: "Women", href: "/characters?gender=female" },
  { label: "Anime", href: "/characters?gender=anime" },
  { label: "Men", href: "/characters?gender=male" },
];

const LEGAL_LINKS: FooterLink[] = [
  { label: "Terms and Policies", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Help Center", href: "/support" },
];

const COMPANY_LINKS: FooterLink[] = [
  { label: "About", href: "/about" },
  { label: "We're hiring", href: "/careers" },
  { label: "Blog", href: "/blog" },
];

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <div className="text-text-primary text-sm font-semibold mb-3">{title}</div>
      <ul className="space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="text-text-secondary text-sm hover:text-gold-400 transition-colors ease-premium"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function Footer() {
  const [contactEmail, discordUrl] = await Promise.all([getContactEmail(), getDiscordUrl()]);
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-border-hairline">
      {/* PREMIUM-FRAME: a hairline gold gradient sitting on the existing
          border, rather than a plain flat line, using the same
          --gold-500 token every other gold accent in this app draws
          from — echoes the card/rail shadow-gold-glow treatment used
          elsewhere (see mobile-drawer.tsx's Upgrade CTA) without adding
          a new color or a heavier visual element. */}
      <div
        className="absolute inset-x-0 top-0 h-px opacity-60"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgb(var(--gold-500)) 50%, transparent)",
        }}
        aria-hidden
      />
      {/* Mobile: condensed single line — every link here already lives
          one tap away in the sidebar drawer (mobile-drawer.tsx), so a
          full column grid on mobile would only duplicate nav at the
          cost of scroll on the page meant to convert fastest. Matches
          the prior footer's own resolved MOBILE-FOOTER-FIX reasoning. */}
      <div className="md:hidden px-4 py-4 text-center text-text-tertiary text-xs">
        © {year} Vantrix Ai
      </div>

      <div className="hidden md:block max-w-7xl mx-auto px-8 pt-10">
        <div className="grid grid-cols-5 gap-8">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-xs bg-gold-fill flex items-center justify-center font-display font-bold text-[#160F02] text-sm">
                V
              </span>
              <span className="font-display text-lg tracking-tight text-text-primary">
                Vantrix
              </span>
            </div>
            <p className="text-text-secondary text-sm mt-3 max-w-[220px]">
              AI companions who remember, grow, and live in a world of their own.
            </p>
            <div className="flex items-center gap-3 mt-4">
              <a
                href={discordUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Discord"
                className="h-8 w-8 rounded-full border border-border-hairline flex items-center justify-center text-text-secondary hover:text-gold-400 hover:border-gold-500/40 hover:shadow-gold-glow transition-[color,border-color,box-shadow] ease-premium"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
                  <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.073.073 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.076.076 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.028Z" />
                </svg>
              </a>
              <a
                href="https://twitter.com/vantrixai"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Twitter / X"
                className="h-8 w-8 rounded-full border border-border-hairline flex items-center justify-center text-text-secondary hover:text-gold-400 hover:border-gold-500/40 hover:shadow-gold-glow transition-[color,border-color,box-shadow] ease-premium"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231ZM17.083 19.77h1.833L7.084 4.126H5.117Z" />
                </svg>
              </a>
              <a
                href="https://t.me/vantrixai"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Telegram"
                className="h-8 w-8 rounded-full border border-border-hairline flex items-center justify-center text-text-secondary hover:text-gold-400 hover:border-gold-500/40 hover:shadow-gold-glow transition-[color,border-color,box-shadow] ease-premium"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
                  <path d="M21.945 4.213 18.62 20.31c-.25 1.11-.906 1.383-1.836.86l-5.07-3.738-2.446 2.353c-.27.27-.497.497-1.02.497l.364-5.176 9.42-8.51c.41-.365-.089-.568-.635-.203L6.29 12.99l-5.04-1.577c-1.096-.343-1.116-1.096.228-1.62L20.6 3.088c.913-.343 1.712.204 1.345 1.125Z" />
                </svg>
              </a>
            </div>
          </div>

          <FooterColumn title="Discover" links={DISCOVER_LINKS} />
          <FooterColumn title="Categories" links={CATEGORY_LINKS} />
          <FooterColumn title="Legal & Support" links={LEGAL_LINKS} />
          <FooterColumn title="Company" links={COMPANY_LINKS} />
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-10 pt-8 border-t border-border-hairline">
          <span className="h-7 px-3 rounded-xs bg-white/[0.03] border border-border-hairline flex items-center text-[11px] font-bold tracking-wide text-text-secondary">
            VISA
          </span>
          <span className="h-7 px-3 rounded-xs bg-white/[0.03] border border-border-hairline flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-text-secondary">
            <span className="flex items-center" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-danger inline-block" />
              <span className="h-2.5 w-2.5 rounded-full bg-gold-500 inline-block -ml-1 mix-blend-screen" />
            </span>
            Mastercard
          </span>
          <a
            href={`mailto:${contactEmail}`}
            className="ml-auto text-text-tertiary text-xs hover:text-text-secondary transition-colors ease-premium"
          >
            {contactEmail}
          </a>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-6 pb-6 text-text-tertiary text-xs">
          <span>© {year} Vantrix Ai. All rights reserved. Made in New York, USA.</span>
          <a href="/sitemap.xml" className="hover:text-text-secondary transition-colors ease-premium">
            Sitemap
          </a>
        </div>
      </div>
    </footer>
  );
}
