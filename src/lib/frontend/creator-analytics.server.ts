import "server-only";
import { getAuthedUser } from "@/lib/auth/get-authed-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCreatorDashboard, type CreatorDashboard } from "@/lib/commerce/character-fund";

/**
 * SERVER-SIDE ANALYTICS FIX (2026-09-12): the Creators Analytics dashboard
 * (/analytics — see that page.tsx and creator-earnings-dashboard.tsx) used
 * to be entirely client-driven: the page rendered a "use client" component
 * that ran a useEffect on mount, called fetch("/api/creator/dashboard") —
 * a network round trip to this same server, from the browser, for data
 * the server already has at render time — then held loading/error state
 * in useState while it waited. Per direct request, that whole path is
 * gone. This function is the single server-side source of truth: it runs
 * the exact same auth + "most recently computed period" lookup +
 * getCreatorDashboard() composition the old /api/creator/dashboard route
 * body did (that route itself is untouched below, since nothing else
 * currently depends on removing it — see its own file), but is called
 * directly from the analytics page.tsx server component. No fetch, no
 * client loading/error state, no network hop: the dashboard's data is
 * already resolved by the time the page's HTML is produced.
 *
 * Returns null when there's no authenticated user — the page decides what
 * to render for that case, this module has no view concerns.
 */
export async function getCreatorAnalyticsDashboard(): Promise<CreatorDashboard | null> {
  const { user } = await getAuthedUser();
  if (!user) return null;

  // All character_value_scores rows written by a given cron run share the
  // same period_start — find the most recent one rather than recomputing
  // "now" here, so the dashboard always reflects an actually-settled
  // period, not a partial in-flight one. Identical query to the API
  // route's own lookup.
  const { data: latest } = await supabaseAdmin
    .from("character_value_scores")
    .select("period_start")
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) {
    return {
      periodStart: null,
      periodEnd: null,
      totalEarnedTokens: 0,
      totalEarnedTrendPct: null,
      pendingTokens: 0,
      paidTokens: 0,
      characters: [],
      note: "No Creator Fund period has been computed yet.",
    };
  }

  const periodStart = new Date(latest.period_start);
  const periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const priorPeriodStart = new Date(periodStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  return getCreatorDashboard(user.id, periodStart, periodEnd, priorPeriodStart);
}
