"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Renders "Log In" until we know better, then swaps to "Open App" for a
 * signed-in visitor — see PublicHeader and /api/auth/session-status for
 * why this is a client-side fetch rather than a server-side auth check
 * baked into PublicHeader itself: this keeps the surrounding page
 * statically generated / ISR-cacheable, at the cost of a one-tick flash
 * of "Log In" for already-signed-in visitors on first paint. That
 * trade-off is intentional — these are low-traffic marketing/support
 * pages, not the authenticated app shell, so a correct-within-one-fetch
 * label beats forcing every one of them to render dynamically per
 * request just for this one CTA.
 */
export function AccountAwareCta() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session-status", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && body) setSignedIn(!!body.signedIn);
      })
      .catch(() => {
        // Network/parse failure — stay on the safe default (signed-out
        // CTA). Worst case a signed-in visitor sees "Log In" once; never
        // the reverse (a signed-out visitor told they're already in).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link
      href={signedIn ? "/" : "/login"}
      className="h-9 px-4 inline-flex items-center rounded-sm border border-gold-500/50 text-gold-400 text-sm font-semibold hover:border-gold-400 hover:text-gold-300 hover:bg-gold-500/5 transition-colors ease-premium duration-150"
    >
      {signedIn ? "Open App" : "Log In"}
    </Link>
  );
}
