"use client";

import { useEffect, useRef, useState } from "react";

/**
 * SCROLL-STATE PATTERN (per direct request, replaces the earlier
 * direction-based hide/show): the chrome should be hidden *while the
 * person is actively scrolling*, in either direction, and drop back down
 * the moment scrolling stops — not "hide going down, show going up."
 * That direction-based version meant a long, fast downward scroll (the
 * most common case — skimming a feed) kept the bar hidden the entire
 * time even once the person had settled on something to read; this
 * version reveals it as soon as motion actually stops, regardless of
 * which way the last scroll went.
 *
 * Mechanism: every scroll event marks `hidden = true` and (re)starts an
 * `idleDelayMs` timer; each new scroll event cancels and restarts that
 * timer, so the bar only reveals once no scroll event has fired for the
 * full delay — the standard "settled" debounce, not a fixed interval.
 * Passive listener, no rAF-throttling needed here (unlike the old
 * direction-comparison version) since this only ever does two cheap
 * things per event: set a boolean, reset a timeout.
 *
 * Always revealed within `revealThreshold` of the top — arriving back at
 * the top of the page (a tap on the logo, a pull-to-refresh, a short
 * page) shouldn't require sitting still first.
 */
export function useHideOnScroll({
  revealThreshold = 32,
  idleDelayMs = 500,
}: { revealThreshold?: number; idleDelayMs?: number } = {}) {
  const [hidden, setHidden] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearIdleTimer = () => {
      if (idleTimer.current !== null) {
        clearTimeout(idleTimer.current);
        idleTimer.current = null;
      }
    };

    const onScroll = () => {
      if (window.scrollY <= revealThreshold) {
        clearIdleTimer();
        setHidden(false);
        return;
      }

      setHidden(true);
      clearIdleTimer();
      idleTimer.current = setTimeout(() => {
        setHidden(false);
        idleTimer.current = null;
      }, idleDelayMs);
    };

    // Initial paint: don't start hidden just because the page happens to
    // already be scrolled down on mount (e.g. browser scroll restoration).
    if (window.scrollY <= revealThreshold) setHidden(false);

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearIdleTimer();
    };
  }, [revealThreshold, idleDelayMs]);

  return hidden;
}
