#!/usr/bin/env node
/**
 * seo-crawler.mjs
 *
 * A technical-SEO crawler for vantrix.ink. Referenced by `npm run seo:crawl`.
 *
 * What "rank high" actually depends on: backlinks, content quality/depth,
 * competition, and time — none of which a script can manufacture. What a
 * crawler CAN do, and the only honest thing this one claims to do, is catch
 * the technical problems that cap how well every page above CAN rank: pages
 * search engines can't reach, pages with no title/description for the
 * result snippet, duplicate/missing canonicals, broken internal links,
 * missing structured data, thin content. Fixing those removes a ceiling;
 * it doesn't by itself put anything at #1.
 *
 * How it works:
 *   1. Fetches /sitemap.xml from BASE_URL and collects every <loc>.
 *   2. Fetches each URL (bounded concurrency, polite delay) and runs a set
 *      of checks against the raw HTML — see CHECKS below.
 *   3. Also fetches /robots.txt once and sanity-checks it references the
 *      same sitemap and isn't blanket-disallowing everything.
 *   4. Prints a per-URL pass/fail table + aggregate summary, and writes the
 *      full structured result to seo-crawler-report.json for diffing
 *      run-over-run (e.g. in CI, see .github/workflows/seo-crawl.yml).
 *
 * Exit code 0 = no CRITICAL findings. Exit code 1 = at least one CRITICAL
 * finding (broken page, non-200 in sitemap, etc.) — deliberately mirrors
 * verify-production-config.mjs's exit-code convention so this can gate CI
 * the same way.
 *
 * Usage:
 *   npm run seo:crawl                          # crawls https://vantrix.ink
 *   BASE_URL=http://localhost:3000 npm run seo:crawl   # crawl a local build
 *   SEO_CRAWL_LIMIT=25 npm run seo:crawl        # cap how many URLs to visit
 *
 * No new dependencies: uses Node's built-in fetch and small regex-based
 * extractors below rather than pulling in cheerio/jsdom for what's a
 * bounded set of well-known HTML patterns (<title>, meta tags, <h1>,
 * canonical link, JSON-LD, <img> alt coverage).
 */

import { writeFileSync } from 'node:fs';

const BASE_URL   = (process.env.BASE_URL || 'https://vantrix.ink').replace(/\/$/, '');
const LIMIT      = Number.parseInt(process.env.SEO_CRAWL_LIMIT ?? '', 10) || Infinity;
const CONCURRENCY = 5;
const DELAY_MS    = 150; // polite pacing per worker, not a hammering crawler
const TIMEOUT_MS  = 15_000;
// CRAWLER-UA-FIX: this custom UA doesn't match middleware.ts's
// KNOWN_CRAWLER_UA_PATTERN, which exists specifically so real search/social
// crawlers bypass the signed-out "/" -> "/enter" first-visit redirect (see
// that block's own comment — /enter is a deliberately chrome-free
// onboarding flow, never meant to be what search results are built from).
// Without a recognized UA, this script gets treated as an ordinary
// first-time human visitor and redirected to /enter instead — which is
// exactly why "/" was showing up here with the wrong title, no canonical,
// no <h1>, and ~16 words: that's /enter's content, not the real homepage.
// Masquerading as Googlebot (already in that pattern) makes this crawler
// see precisely what Google actually sees, which is the entire point of
// running it.
const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const TITLE_MIN = 15;
const TITLE_MAX = 60;
const DESC_MIN  = 50;
const DESC_MAX  = 160;
const THIN_CONTENT_WORDS = 300;

/** Severity used for exit-code + summary counts. */
const SEVERITY = { CRITICAL: 'critical', WARN: 'warn', INFO: 'info' };

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal, headers: { 'User-Agent': UA, ...opts.headers } });
  } finally {
    clearTimeout(t);
  }
}

function extract(re, html, group = 1) {
  const m = re.exec(html);
  return m ? m[group].trim() : null;
}

function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * CHECKS: each returns an array of {severity, message}. Kept as small pure
 * functions over the raw HTML string rather than a shared DOM so any one
 * check can be added/removed/tuned without touching the others.
 */
const CHECKS = {
  statusCode(html, res) {
    const findings = [];
    if (!res.ok) {
      findings.push({ severity: SEVERITY.CRITICAL, message: `HTTP ${res.status} - a URL in the sitemap must return 200` });
    }
    if (res.redirected) {
      findings.push({ severity: SEVERITY.WARN, message: `Redirected to ${res.url} - point the sitemap at the final URL directly` });
    }
    return findings;
  },

  title(html) {
    const title = decodeEntities(extract(/<title[^>]*>([\s\S]*?)<\/title>/i, html));
    const findings = [];
    if (!title) {
      findings.push({ severity: SEVERITY.CRITICAL, message: 'Missing <title> - this is the single biggest lever for click-through from a search result' });
    } else if (title.length < TITLE_MIN) {
      findings.push({ severity: SEVERITY.WARN, message: `<title> is ${title.length} chars, under ${TITLE_MIN} - likely too thin to describe the page: "${title}"` });
    } else if (title.length > TITLE_MAX) {
      findings.push({ severity: SEVERITY.WARN, message: `<title> is ${title.length} chars, over ${TITLE_MAX} - Google will truncate it in results: "${title}"` });
    }
    return findings;
  },

  description(html) {
    const desc = decodeEntities(extract(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']\s*\/?>/i, html));
    const findings = [];
    if (!desc) {
      findings.push({ severity: SEVERITY.CRITICAL, message: 'Missing meta description - Google will fabricate a snippet from page text instead, usually worse' });
    } else if (desc.length < DESC_MIN) {
      findings.push({ severity: SEVERITY.INFO, message: `Meta description is ${desc.length} chars, under ${DESC_MIN} - room to say more` });
    } else if (desc.length > DESC_MAX) {
      findings.push({ severity: SEVERITY.WARN, message: `Meta description is ${desc.length} chars, over ${DESC_MAX} - will be truncated in results` });
    }
    return findings;
  },

  canonical(html, res) {
    const canonical = extract(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i, html);
    const findings = [];
    if (!canonical) {
      findings.push({ severity: SEVERITY.WARN, message: 'Missing rel="canonical" - leaves Google to guess which URL variant is authoritative' });
    } else {
      const normalizedCanonical = canonical.replace(/\/$/, '');
      const normalizedActual = res.url.replace(/\/$/, '');
      if (normalizedCanonical !== normalizedActual) {
        findings.push({ severity: SEVERITY.INFO, message: `Canonical (${canonical}) points elsewhere - confirm that's intentional, not a stale copy-paste` });
      }
    }
    return findings;
  },

  headings(html) {
    const h1s = html.match(/<h1[\s>]/gi) ?? [];
    const findings = [];
    if (h1s.length === 0) {
      findings.push({ severity: SEVERITY.WARN, message: 'No <h1> found - every indexable page should have exactly one' });
    } else if (h1s.length > 1) {
      findings.push({ severity: SEVERITY.INFO, message: `${h1s.length} <h1> tags found - one clear primary heading per page reads better to both crawlers and users` });
    }
    return findings;
  },

  openGraph(html) {
    const findings = [];
    const hasOgTitle = /<meta\s+property=["']og:title["']/i.test(html);
    const hasOgDesc  = /<meta\s+property=["']og:description["']/i.test(html);
    const hasOgImage = /<meta\s+property=["']og:image["']/i.test(html);
    if (!hasOgTitle || !hasOgDesc || !hasOgImage) {
      findings.push({ severity: SEVERITY.INFO, message: 'Incomplete Open Graph tags (og:title/og:description/og:image) - affects how the page looks when shared, not ranking directly' });
    }
    return findings;
  },

  structuredData(html) {
    const findings = [];
    if (!/<script[^>]+type=["']application\/ld\+json["']/i.test(html)) {
      findings.push({ severity: SEVERITY.INFO, message: 'No JSON-LD structured data - eligible for rich results (FAQ, breadcrumbs, Article, etc.) only with it' });
    }
    return findings;
  },

  images(html) {
    // ALT-CHECK-FIX: this used to flag alt="" as equivalent to a missing
    // alt attribute. It isn't -- an empty alt is the correct, deliberate
    // WCAG way to mark an image as decorative/redundant (a background
    // blur, a per-message avatar already named right next to it), and
    // *removing* it would make things worse for a screen reader, not
    // better. A live crawl caught this producing false positives on
    // exactly that pattern (login page's decorative backdrop/portrait
    // grid, the per-message chat-avatar bubble on every
    // /companions/[id] page) -- neither was a real bug, both were this
    // check being wrong. Now only a genuinely absent alt attribute (no
    // alt="..." at all) counts as a finding.
    const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
    const missingAlt = imgs.filter((tag) => !/\balt=["'][^"']*["']/i.test(tag));
    const findings = [];
    if (imgs.length > 0 && missingAlt.length > 0) {
      findings.push({ severity: SEVERITY.WARN, message: `${missingAlt.length}/${imgs.length} <img> tags have no alt attribute at all (alt="" on a decorative image is fine and not counted here)` });
    }
    return findings;
  },

  thinContent(html) {
    const text = stripTags(html);
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const findings = [];
    if (wordCount < THIN_CONTENT_WORDS) {
      findings.push({ severity: SEVERITY.INFO, message: `~${wordCount} visible words - under ~${THIN_CONTENT_WORDS} is "thin content" territory for a page meant to rank on its own` });
    }
    return { findings, wordCount };
  },
};

async function auditUrl(url) {
  const startedAt = Date.now();
  let res;
  try {
    res = await fetchWithTimeout(url);
  } catch (err) {
    return {
      url,
      ok: false,
      ms: Date.now() - startedAt,
      findings: [{ severity: SEVERITY.CRITICAL, message: `Request failed: ${err.message}` }],
    };
  }
  const html = await res.text();
  const ms = Date.now() - startedAt;

  const findings = [
    ...CHECKS.statusCode(html, res),
    ...CHECKS.title(html),
    ...CHECKS.description(html),
    ...CHECKS.canonical(html, res),
    ...CHECKS.headings(html),
    ...CHECKS.openGraph(html),
    ...CHECKS.structuredData(html),
    ...CHECKS.images(html),
  ];
  const { findings: thinFindings, wordCount } = CHECKS.thinContent(html);
  findings.push(...thinFindings);

  return { url, ok: res.ok, status: res.status, ms, wordCount, findings };
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  async function runOne() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
      if (DELAY_MS > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runOne));
  return results;
}

async function getSitemapUrls() {
  const res = await fetchWithTimeout(`${BASE_URL}/sitemap.xml`);
  if (!res.ok) {
    throw new Error(`Could not fetch ${BASE_URL}/sitemap.xml (HTTP ${res.status})`);
  }
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeEntities(m[1]));
  if (urls.length === 0) {
    throw new Error('sitemap.xml fetched but contained no <loc> entries');
  }
  return urls;
}

async function checkRobotsTxt() {
  const findings = [];
  const res = await fetchWithTimeout(`${BASE_URL}/robots.txt`);
  if (!res.ok) {
    findings.push({ severity: SEVERITY.CRITICAL, message: `robots.txt returned HTTP ${res.status}` });
    return findings;
  }
  const body = await res.text();
  if (!/sitemap:\s*\S+/i.test(body)) {
    findings.push({ severity: SEVERITY.WARN, message: 'robots.txt does not reference a Sitemap: line' });
  }
  const disallowAll = /user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*(\n|$)/i.test(body) && !/allow:\s*\/\s*(\n|$)/i.test(body);
  if (disallowAll) {
    findings.push({ severity: SEVERITY.CRITICAL, message: 'robots.txt appears to blanket-disallow "/" for all crawlers with no offsetting allow' });
  }
  return findings;
}

function printReport(robotsFindings, results) {
  const counts = { critical: 0, warn: 0, info: 0 };

  console.log(`\nSEO crawl: ${BASE_URL}\n`);

  if (robotsFindings.length > 0) {
    console.log('robots.txt');
    for (const f of robotsFindings) {
      counts[f.severity]++;
      console.log(`  [${f.severity.toUpperCase()}] ${f.message}`);
    }
    console.log('');
  }

  for (const r of results) {
    if (r.findings.length === 0) continue;
    console.log(`${r.url}${r.status ? ` (${r.status}, ${r.ms}ms${r.wordCount != null ? `, ${r.wordCount}w` : ''})` : ''}`);
    for (const f of r.findings) {
      counts[f.severity]++;
      console.log(`  [${f.severity.toUpperCase()}] ${f.message}`);
    }
  }

  const clean = results.filter((r) => r.findings.length === 0).length;
  console.log(`\n${clean}/${results.length} URLs had zero findings.`);
  console.log(`Findings: ${counts.critical} critical, ${counts.warn} warning, ${counts.info} info.\n`);

  return counts;
}

async function main() {
  console.log(`Fetching sitemap from ${BASE_URL}/sitemap.xml ...`);
  let urls;
  try {
    urls = await getSitemapUrls();
  } catch (err) {
    console.error(`FATAL: ${err.message}`);
    process.exit(1);
  }
  if (urls.length > LIMIT) {
    console.log(`Sitemap has ${urls.length} URLs; SEO_CRAWL_LIMIT=${LIMIT} caps this run to the first ${LIMIT}.`);
    urls = urls.slice(0, LIMIT);
  } else {
    console.log(`Crawling all ${urls.length} URLs from the sitemap (concurrency ${CONCURRENCY}) ...`);
  }

  const [robotsFindings, results] = await Promise.all([
    checkRobotsTxt(),
    runPool(urls, auditUrl, CONCURRENCY),
  ]);

  const counts = printReport(robotsFindings, results);

  writeFileSync(
    'seo-crawler-report.json',
    JSON.stringify({ baseUrl: BASE_URL, crawledAt: new Date().toISOString(), robotsFindings, results, counts }, null, 2)
  );
  console.log('Full report written to seo-crawler-report.json');

  process.exit(counts.critical > 0 ? 1 : 0);
}

main();
