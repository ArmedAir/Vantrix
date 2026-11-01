"use client";

import { useEffect } from "react";

/**
 * MOBILE-SEND-FIX (root cause): every full-bleed screen (chat-window.tsx,
 * roleplay-stage.tsx) sizes itself off `100dvh` and relies on the
 * `interactive-widget=resizes-content` viewport meta (see app/layout.tsx)
 * to make `dvh` actually shrink when the on-screen keyboard opens. That
 * meta value is Chromium-only — Safari/iOS (still the majority of "phone"
 * traffic) ignores it and keeps reporting the *layout* viewport for `dvh`,
 * unchanged, with the keyboard drawn on top instead. The composer's
 * `sticky bottom-0` then sticks to the bottom of that un-shrunk box, which
 * sits underneath the keyboard — visible, but its real hit-testable
 * position is off-screen, so taps on Send land on nothing. This is why it
 * only ever showed up "on phone": Chromium desktop and Chromium Android
 * both honored the meta and never reproduced it.
 *
 * Fix: don't trust any CSS unit to track the keyboard. `window.
 * visualViewport` (Safari 13+, every evergreen mobile browser) reports the
 * *actual* visible height directly and fires `resize` the moment the
 * keyboard opens/closes, so this writes that number into a `--vvh` custom
 * property on <html> that every full-bleed screen's height calc now reads
 * instead of `dvh`. Falls back to `window.innerHeight` for the handful of
 * browsers with no visualViewport API at all, so nothing regresses there.
 *
 * PERF: three things kept this from being "just add a resize listener":
 *   1. `resize` alone drives --vvh. visualViewport fires `scroll` on every
 *      pinch-zoom pan / pixel of momentum scroll — it tracks the
 *      viewport's *offset*, not its height, so height never needed it
 *      (an earlier version had a scroll listener for height: pure
 *      overhead). NOTE: a `scroll` listener was LATER re-added for a
 *      different variable, --vvt (offsetTop) — see IOS-OFFSET-FIX below.
 *      That's offset, not height, so this note still holds for --vvh.
 *   2. rAF-coalesced. iOS animates the keyboard in/out over several
 *      frames, firing `resize` repeatedly during that animation — each
 *      handled synchronously would mean a `style.setProperty` (a forced
 *      style recalc on every full-bleed screen reading the var) per
 *      event. Collapsing bursts to one write per animation frame is the
 *      standard fix for a hot resize/scroll handler.
 *   3. Writes are skipped unless the height actually changed by a whole
 *      pixel — visualViewport can report the same height across
 *      consecutive events (e.g. a scroll-triggered `resize` with no real
 *      size change), and an identical write still forces the same style
 *      recalc as a real one.
 *
 * HARDENING (native WebView + bfcache): the above covers ordinary
 * keyboard show/hide in a live tab. Two cases sit outside it, and both
 * matter here because Vantrix ships as a wrapped WebView (desktop/
 * src-tauri) in addition to the mobile browser tab:
 *   1. Zero/garbage readings. Right after a native WebView resumes from
 *      the background (or on a cold first layout pass), it can report
 *      `visualViewport.height` / `innerHeight` as 0 — or another
 *      obviously-wrong value — for a frame or two before real layout
 *      settles. That number was previously written straight into
 *      `--vvh` like any other, which collapses every `h-[var(--vvh)]`
 *      screen to nothing until the *next* real resize happens to fire.
 *      `readHeight()` below rejects non-finite/`<= 0` readings outright
 *      and leaves the last good value in place instead.
 *   2. No `resize` event at all. Restoring a page from bfcache
 *      (`pageshow` with `event.persisted`) and a backgrounded WebView
 *      regaining visibility are both cases where the browser/WebView is
 *      not obligated to fire `resize` even though the real viewport
 *      (keyboard state, in particular) may no longer match what's
 *      cached in `--vvh` from before the freeze. `forceRemeasure()`
 *      handles both: it re-reads immediately, bypassing the
 *      unchanged-height dedupe (a same-looking value right after one of
 *      these events isn't trustworthy the way it is mid-session), then
 *      re-checks a frame later and once more after a short delay, since
 *      the corrected value can itself lag a frame or two behind the
 *      visibility/pageshow event on slower devices.
 *
 * IOS-OFFSET-FIX (`--vvt`): sizing a full-bleed screen to the visual
 * viewport's HEIGHT is only half of staying on-screen — its POSITION has
 * to follow too. When the keyboard opens, iOS Safari does two things:
 * it shrinks the visual viewport (what `--vvh` tracks) AND, to keep the
 * focused input visible, scrolls the visual viewport down within the
 * layout viewport, so `visualViewport.offsetTop` becomes non-zero. A
 * `position: fixed; top: 0; height: var(--vvh)` box is anchored to the
 * LAYOUT viewport's top, which doesn't move — so its top `offsetTop`
 * pixels end up scrolled out of view above the visible area, with a
 * blank gap left over below it. That's exactly the "black screen with
 * only the keyboard showing" / "latest message hidden behind the
 * composer" symptom on iPhone while Android (whose Chromium honors
 * `interactive-widget=resizes-content` and never offsets the visual
 * viewport at all) was unaffected. `--vvt` mirrors `offsetTop` so the
 * immersive wrapper (app-chrome.tsx) can pin its top edge to the
 * visible area (`top-[var(--vvt)]`) instead of the layout viewport's.
 *
 * This DOES need the `scroll` listener the PERF note above removed:
 * that note was right that height only needs `resize`, but offsetTop
 * only ever changes through visualViewport `scroll` events (iOS fires
 * one when it shifts the viewport to reveal an input). The original
 * concern — scroll firing constantly during pinch-pan/momentum — is
 * still handled by the same two guards: rAF coalescing, and skipping
 * the write unless the whole-pixel offset actually changed.
 */
export function ViewportHeightSync() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const vv = window.visualViewport;
    const root = document.documentElement;

    let rafId: number | null = null;
    let settleRafId: number | null = null;
    let settleTimeoutId: number | null = null;
    let lastHeight = -1;
    let lastTop = -1;

    function readTop(): number | null {
      const raw = vv?.offsetTop ?? 0;
      if (!Number.isFinite(raw)) return null;
      // Clamp at 0: iOS rubber-band overscroll can briefly report a
      // negative offset, and a negative `top` would drag the wrapper
      // down off the top edge of the screen.
      return Math.max(0, Math.round(raw));
    }

    function readHeight(): number | null {
      const raw = vv?.height ?? window.innerHeight;
      if (!Number.isFinite(raw) || raw <= 0) return null; // not a real reading — see HARDENING note 1 above
      return Math.round(raw);
    }

    function applyHeight(opts?: { force?: boolean }) {
      const height = readHeight();
      if (height === null) return; // bad reading — keep whatever --vvh already has
      if (!opts?.force && height === lastHeight) return;
      lastHeight = height;
      root.style.setProperty("--vvh", `${height}px`);
    }

    function applyTop(opts?: { force?: boolean }) {
      const top = readTop();
      if (top === null) return;
      if (!opts?.force && top === lastTop) return;
      lastTop = top;
      root.style.setProperty("--vvt", `${top}px`);
    }

    function scheduleApply() {
      if (rafId !== null) return; // already coalescing this frame's burst
      rafId = requestAnimationFrame(() => {
        rafId = null;
        applyHeight();
        applyTop();
      });
    }

    function clearSettleTimers() {
      if (settleRafId !== null) {
        cancelAnimationFrame(settleRafId);
        settleRafId = null;
      }
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
        settleTimeoutId = null;
      }
    }

    // See HARDENING note 2 above. Runs on its own raf/timeout handles so it never
    // fights the resize-burst coalescing above.
    function forceRemeasure() {
      clearSettleTimers();
      applyHeight({ force: true });
      applyTop({ force: true });
      settleRafId = requestAnimationFrame(() => {
        settleRafId = null;
        applyHeight({ force: true });
        applyTop({ force: true });
      });
      settleTimeoutId = window.setTimeout(() => {
        settleTimeoutId = null;
        applyHeight({ force: true });
        applyTop({ force: true });
      }, 150);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") forceRemeasure();
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) forceRemeasure();
    }

    applyHeight();
    applyTop();

    const target: VisualViewport | Window = vv ?? window;
    target.addEventListener("resize", scheduleApply);
    // See IOS-OFFSET-FIX above — offsetTop only changes via `scroll`.
    // Only attached to a real VisualViewport: on the window-fallback path
    // there's no offset to track, and window `scroll` would fire on every
    // ordinary page scroll for nothing.
    if (vv) vv.addEventListener("scroll", scheduleApply);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      target.removeEventListener("resize", scheduleApply);
      if (vv) vv.removeEventListener("scroll", scheduleApply);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      if (rafId !== null) cancelAnimationFrame(rafId);
      clearSettleTimers();
    };
  }, []);

  return null;
}
