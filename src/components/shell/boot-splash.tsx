"use client";

import { useEffect } from "react";
import type { CSSProperties } from "react";

/**
 * Launch animation shown while the installed app opens. Mounted once in
 * the root layout; everything visual lives in src/app/boot-splash.css and
 * the "should it play at all?" decision lives in public/boot-init.js (it
 * has to run before first paint, which a React effect can't). See that
 * file's header for when this plays and why.
 *
 * This component only does two jobs:
 *   1. Render the markup. It's server-rendered into the initial HTML, so
 *      the splash is already painting on the very first frame — before any
 *      JS has downloaded — which is what lets it continue straight on from
 *      the OS-drawn launch screen.
 *   2. Decide when to take it down (below).
 *
 * WHEN IT LEAVES — all three must be true:
 *   - the app has hydrated (this effect running is that signal),
 *   - the window `load` event has fired and fonts are ready, and
 *   - the animation has had MIN_MS from the moment boot-init.js ran, so
 *     it always finishes its choreography instead of being cut mid-beat.
 * Time the page already spent loading counts toward MIN_MS, so a slow
 * launch never gets extra artificial delay on top; a fast one still gets
 * the full moment. MAX_MS is a hard cap so a stalled request can never
 * trap someone behind the animation.
 */

const BOOT_ATTR = "data-boot";
const MIN_MS = 2300;
const MIN_MS_REDUCED_MOTION = 700;
const MAX_MS = 8000;
// Must be >= the longest exit transition in boot-splash.css (900ms swell).
const EXIT_MS = 950;

const WORD = "Vantrix".split("");

// Gold dust. Hand-placed rather than random so server and client HTML
// match exactly (no hydration mismatch) and the spread never clumps.
const MOTES: ReadonlyArray<{ x: string; s: string; d: string; t: string; dx: string }> = [
  { x: "9%", s: "2px", d: "9.5s", t: "0.2s", dx: "14px" },
  { x: "21%", s: "3px", d: "11s", t: "2.4s", dx: "-10px" },
  { x: "33%", s: "2px", d: "8.5s", t: "1.1s", dx: "18px" },
  { x: "46%", s: "2px", d: "12s", t: "3.6s", dx: "-16px" },
  { x: "58%", s: "3px", d: "10s", t: "0.8s", dx: "12px" },
  { x: "69%", s: "2px", d: "9s", t: "2.9s", dx: "-14px" },
  { x: "80%", s: "3px", d: "11.5s", t: "1.7s", dx: "10px" },
  { x: "91%", s: "2px", d: "8.8s", t: "4.1s", dx: "-12px" },
];

export function BootSplash() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.getAttribute(BOOT_ATTR) !== "play") return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const minMs = reduceMotion ? MIN_MS_REDUCED_MOTION : MIN_MS;
    const t0 = (window as unknown as { __vxBootT0?: number }).__vxBootT0 ?? 0;

    let cancelled = false;
    const timers: number[] = [];

    const leave = () => {
      if (cancelled) return;
      root.setAttribute(BOOT_ATTR, "out");
      timers.push(
        window.setTimeout(() => {
          root.removeAttribute(BOOT_ATTR);
        }, EXIT_MS),
      );
    };

    const loaded = new Promise<void>((resolve) => {
      if (document.readyState === "complete") resolve();
      else window.addEventListener("load", () => resolve(), { once: true });
    });
    const fontsReady: Promise<unknown> = document.fonts?.ready ?? Promise.resolve();
    const hardCap = new Promise<void>((resolve) => {
      timers.push(window.setTimeout(resolve, MAX_MS));
    });

    Promise.race([Promise.all([loaded, fontsReady]), hardCap]).then(() => {
      if (cancelled) return;
      const remaining = Math.max(0, minMs - (performance.now() - t0));
      timers.push(window.setTimeout(leave, remaining));
    });

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  return (
    <div className="vx-boot" role="status" aria-live="polite">
      <span className="sr-only">Opening Vantrix</span>
      <div className="vx-boot__stage" aria-hidden="true">
        {MOTES.map((m, i) => (
          <span
            key={i}
            className="vx-boot__mote"
            style={{ "--x": m.x, "--s": m.s, "--d": m.d, "--t": m.t, "--dx": m.dx } as CSSProperties}
          />
        ))}
        <div className="vx-boot__aura" />
        <div className="vx-boot__heart-wrap">
          <div className="vx-boot__heart" />
          <div className="vx-boot__sheen" />
        </div>
        <div className="vx-boot__type">
          <div className="vx-boot__word">
            {WORD.map((ch, i) => (
              <span key={i} className="vx-boot__letter" style={{ "--i": i } as CSSProperties}>
                {ch}
              </span>
            ))}
          </div>
          <p className="vx-boot__tagline">Companions who remember you</p>
          <div className="vx-boot__rule" />
        </div>
      </div>
    </div>
  );
}
