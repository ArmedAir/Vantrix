"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/shell/logo";

/**
 * Full-screen brand splash shown for a beat on every fresh page load,
 * mounted once in the root layout (see layout.tsx). Covers the native
 * Capacitor splash handoff and the app's own initial paint/hydration
 * with one continuous, intentional moment instead of: native splash ->
 * blank flash -> content pop-in.
 *
 * Reuses the existing <Logo withWordmark/> brand mark as-is rather than
 * introducing new motion language — same idle glow-pulse halo and
 * shimmering gold wordmark used in the header/sidebar (see logo.tsx),
 * just at splash scale, on its own full-bleed backdrop, with the
 * wordmark alone ("Vantrix" — no tagline) as requested. Theme-agnostic
 * for the same reason logo.tsx is: colors come from the live gold-scale
 * CSS vars keyed off data-theme, nothing hardcoded here.
 *
 * MIN_VISIBLE_MS/FADE_MS are a deliberate "hold, then dismiss" pair, not
 * an artificial delay: keeping the mark on screen for a fixed short
 * beat (roughly matching capacitor.config.ts's SplashScreen
 * launchShowDuration, so the native->web handoff doesn't feel like two
 * separate loads) reads as an intentional brand moment; letting it
 * disappear the instant hydration finishes would read as a flicker,
 * which is the opposite of "premium." Dismissal is on a timer rather
 * than tied to data-readiness on purpose — this is a perceived-
 * performance/branding layer sitting in front of Server Component
 * content that streams in independently underneath it, not a real
 * loading gate, so it never blocks or waits on anything.
 */
const MIN_VISIBLE_MS = 900;
const FADE_MS = 450;

export function AppSplashScreen() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const dismiss = setTimeout(() => setFading(true), MIN_VISIBLE_MS);
    return () => clearTimeout(dismiss);
  }, []);

  useEffect(() => {
    if (!fading) return;
    setVisible(false);
    const unmount = setTimeout(() => setMounted(false), FADE_MS);
    return () => clearTimeout(unmount);
  }, [fading]);

  if (!mounted) return null;

  return (
    <div
      role="status"
      aria-label="Loading Vantrix"
      aria-hidden={!visible}
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-base transition-opacity motion-reduce:transition-none ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <Logo size={72} withWordmark wordmarkClassName="text-4xl font-semibold" />
    </div>
  );
}
