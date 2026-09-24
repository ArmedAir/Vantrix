#!/usr/bin/env node
/**
 * pagespeed-check.mjs
 *
 * Calls the public PageSpeed Insights (Lighthouse-as-a-service) API for
 * BASE_URL and prints the category scores + Core Web Vitals. Referenced by
 * `npm run pagespeed:check`.
 *
 * Why this exists as a script rather than "just open pagespeed.web.dev":
 * this repo's own sandbox/CI environment can't reach the live site directly
 * (no network path to it), but GitHub Actions runners can -- see
 * .github/workflows/pagespeed-check.yml, which runs this on a schedule and
 * commits the result to .seo-reports/pagespeed-latest.json (mirrors
 * seo-crawler.mjs's own pattern, same reasoning: a committed file is
 * readable with a plain git pull from anywhere, an Actions artifact isn't).
 *
 * The PSI API is public and doesn't require a key for light/occasional use,
 * but IS aggressively rate-limited without one (roughly a handful of
 * requests per day before 429s). If PAGESPEED_API_KEY is set, it's passed
 * through and lifts that limit substantially -- get one free at
 * https://developers.google.com/speed/docs/insights/v5/get-started.
 *
 * Usage:
 *   npm run pagespeed:check                              # mobile, https://vantrix.ink
 *   STRATEGY=desktop npm run pagespeed:check
 *   BASE_URL=https://www.vantrix.ink npm run pagespeed:check
 *   PAGESPEED_API_KEY=xxx npm run pagespeed:check
 */

import { writeFileSync } from 'node:fs';

const BASE_URL   = (process.env.BASE_URL || 'https://vantrix.ink').replace(/\/$/, '');
const STRATEGY   = process.env.STRATEGY === 'desktop' ? 'desktop' : 'mobile';
const API_KEY    = process.env.PAGESPEED_API_KEY || '';
const TIMEOUT_MS = 60_000; // PSI runs a real Lighthouse pass server-side; this is routinely 20-40s

// Same red/orange/green thresholds Lighthouse itself uses, so this script's
// own printed labels match what a person would see in the PSI UI.
const THRESHOLDS = {
  lcp:  { good: 2500, needsImprovement: 4000 },   // ms
  cls:  { good: 0.1,  needsImprovement: 0.25 },
  tbt:  { good: 200,  needsImprovement: 600 },    // ms
  fcp:  { good: 1800, needsImprovement: 3000 },   // ms
  si:   { good: 3400, needsImprovement: 5800 },   // ms (Speed Index)
};

function rate(value, { good, needsImprovement }) {
  if (value <= good) return 'GOOD';
  if (value <= needsImprovement) return 'NEEDS IMPROVEMENT';
  return 'POOR';
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function runPageSpeed(url, strategy) {
  const apiUrl = new URL('https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed');
  apiUrl.searchParams.set('url', url);
  apiUrl.searchParams.set('strategy', strategy);
  ['performance', 'accessibility', 'best-practices', 'seo'].forEach((c) => apiUrl.searchParams.append('category', c));
  if (API_KEY) apiUrl.searchParams.set('key', API_KEY);

  const res = await fetchWithTimeout(apiUrl.toString());
  const body = await res.json();
  if (!res.ok) {
    const msg = body?.error?.message || `HTTP ${res.status}`;
    throw new Error(`PageSpeed Insights API error: ${msg}`);
  }
  return body;
}

function extractSummary(psiResult) {
  const lr = psiResult.lighthouseResult;
  const categories = lr.categories;
  const audits = lr.audits;

  const scores = {};
  for (const [key, cat] of Object.entries(categories)) {
    scores[key] = cat.score == null ? null : Math.round(cat.score * 100);
  }

  const metric = (id) => audits[id]?.numericValue ?? null;

  return {
    scores,
    coreWebVitals: {
      lcpMs: metric('largest-contentful-paint'),
      clsScore: metric('cumulative-layout-shift'),
      tbtMs: metric('total-blocking-time'),
      fcpMs: metric('first-contentful-paint'),
      speedIndexMs: metric('speed-index'),
    },
    fetchedUrl: lr.finalDisplayedUrl || lr.requestedUrl,
    lighthouseVersion: lr.lighthouseVersion,
    fetchTime: lr.fetchTime,
  };
}

function printReport(summary, url, strategy) {
  const { scores, coreWebVitals } = summary;

  console.log(`\nPageSpeed Insights: ${url} (${strategy})`);
  console.log(`Resolved to: ${summary.fetchedUrl}`);
  console.log(`Lighthouse ${summary.lighthouseVersion}, fetched ${summary.fetchTime}\n`);

  console.log('Category scores (0-100):');
  for (const [key, val] of Object.entries(scores)) {
    console.log(`  ${key.padEnd(16)} ${val ?? 'n/a'}`);
  }

  console.log('\nCore Web Vitals:');
  const lcpS = coreWebVitals.lcpMs != null ? (coreWebVitals.lcpMs / 1000).toFixed(1) : 'n/a';
  const fcpS = coreWebVitals.fcpMs != null ? (coreWebVitals.fcpMs / 1000).toFixed(1) : 'n/a';
  const siS  = coreWebVitals.speedIndexMs != null ? (coreWebVitals.speedIndexMs / 1000).toFixed(1) : 'n/a';
  console.log(`  LCP (Largest Contentful Paint)  ${lcpS}s  [${coreWebVitals.lcpMs != null ? rate(coreWebVitals.lcpMs, THRESHOLDS.lcp) : 'n/a'}]`);
  console.log(`  CLS (Cumulative Layout Shift)   ${coreWebVitals.clsScore ?? 'n/a'}  [${coreWebVitals.clsScore != null ? rate(coreWebVitals.clsScore, THRESHOLDS.cls) : 'n/a'}]`);
  console.log(`  TBT (Total Blocking Time)       ${coreWebVitals.tbtMs ?? 'n/a'}ms  [${coreWebVitals.tbtMs != null ? rate(coreWebVitals.tbtMs, THRESHOLDS.tbt) : 'n/a'}]`);
  console.log(`  FCP (First Contentful Paint)    ${fcpS}s  [${coreWebVitals.fcpMs != null ? rate(coreWebVitals.fcpMs, THRESHOLDS.fcp) : 'n/a'}]`);
  console.log(`  Speed Index                     ${siS}s  [${coreWebVitals.speedIndexMs != null ? rate(coreWebVitals.speedIndexMs, THRESHOLDS.si) : 'n/a'}]`);
  console.log('');
}

async function main() {
  console.log(`Running PageSpeed Insights for ${BASE_URL}/ (${STRATEGY}) ...`);
  let psiResult;
  try {
    psiResult = await runPageSpeed(`${BASE_URL}/`, STRATEGY);
  } catch (err) {
    console.error(`FATAL: ${err.message}`);
    process.exit(1);
  }

  const summary = extractSummary(psiResult);
  printReport(summary, BASE_URL, STRATEGY);

  writeFileSync(
    'pagespeed-report.json',
    JSON.stringify({ baseUrl: BASE_URL, strategy: STRATEGY, checkedAt: new Date().toISOString(), ...summary }, null, 2)
  );
  console.log('Full report written to pagespeed-report.json');
}

main();
