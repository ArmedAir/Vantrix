"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RotateCcw } from "lucide-react";

/**
 * SERVER-SIDE FIX (2026-09-12): the old client-fetch dashboard kept its
 * own `error` state and a "Try again" button that just re-ran the same
 * client fetch. Now that the dashboard data is resolved server-side in
 * page.tsx (see getCreatorAnalyticsDashboard()), there is no client-side
 * fetch left to retry — "try again" means "ask the server to re-render
 * this page," which is exactly what router.refresh() does: it re-runs
 * the server component tree for the current route without a full
 * client-side navigation or losing scroll position, then swaps in
 * whatever it resolves to this time (fresh data on success, the same
 * error boundary again on failure).
 */
export function RetryAnalyticsButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-gold-400 hover:text-gold-300 transition-colors ease-premium disabled:opacity-50"
    >
      <RotateCcw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} strokeWidth={1.75} />
      {isPending ? "Retrying…" : "Try again"}
    </button>
  );
}
