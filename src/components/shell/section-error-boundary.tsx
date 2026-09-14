"use client";

import { Component, Fragment, type ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * GAP-FIX (client-side error-handling audit, 2026-09-11): the only React
 * error boundary anywhere in the codebase was Character3DErrorBoundary
 * (immersive/character-3d-error-boundary.tsx), and it's a narrow,
 * single-purpose one — catch a bad 3D model, fall back to a 2D image.
 * There was nothing generic to reach for, so nothing wrapped Chat,
 * Roleplay, or the Dating deck: three surfaces that stream live AI
 * responses and render whatever shape they come back in. A render-time
 * throw in any of them (a malformed streaming chunk, an unexpected null
 * in a message/beat, a bad choice payload) had no boundary to stop at,
 * so it propagated all the way up to (app)/error.tsx — the *entire*
 * route (header, composer, everything) replaced by "This page couldn't
 * load," identical to a full page crash, for a failure that was really
 * scoped to one message or one card.
 *
 * SectionErrorBoundary is the generic version of the same
 * catch-and-degrade philosophy: stop the crash at the section that
 * actually failed, show a small inline retry affordance instead of
 * losing the rest of the page (header/composer/nav stay mounted), and
 * report to Sentry explicitly — React error boundaries do NOT
 * auto-report to Sentry's client SDK the way an unhandled promise
 * rejection or a route-level error.tsx throw does (see
 * instrumentation-client.ts / instrumentation.ts, both of which only
 * cover their own respective cases), so componentDidCatch has to call
 * captureException itself or these failures are invisible in Sentry.
 *
 * RESET-BY-REMOUNT: "Try again" can't just clear `failed` and re-render
 * the same children — for a hook-heavy component (useChatStream,
 * useDatingDeck, useRoleplayTurn) whatever state caused the throw is
 * still sitting in that component's hooks, so it would likely throw
 * again immediately. Bumping `remountKey` and putting it on the
 * children via `key` (see the call sites) forces React to tear down and
 * recreate the whole subtree — same fresh-mount behavior as a real page
 * reload, without actually reloading the page.
 * RESET-BY-REMOUNT: "Try again" can't just clear `failed` and re-render
 * the same children — for a hook-heavy component (useChatStream,
 * useDatingDeck, useRoleplayTurn) whatever state caused the throw is
 * still sitting in that component's hooks, so it would likely throw
 * again immediately. Bumping an internal `remountKey` on retry and
 * keying the children wrapper on it forces React to unmount and
 * recreate the whole subtree — same fresh-mount behavior as a real page
 * reload, without actually reloading the page. This is handled
 * internally so call sites don't need any extra wiring.
 */
export class SectionErrorBoundary extends Component<
  {
    children: ReactNode;
    /** Shown in the fallback card, e.g. "chat", "this scene", "the deck". */
    label: string;
    /** Log/Sentry tag — mirrors the logger.error(label, ...) convention
     * used server-side, so this shows up the same way in dashboards. */
    context: string;
    onRetry?: () => void;
  },
  { failed: boolean; remountKey: number }
> {
  state = { failed: false, remountKey: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console -- intentional: mirrors
    // Character3DErrorBoundary's own console.error, so a failure here is
    // visible in the browser console during development even before the
    // sampled Sentry event is looked at.
    console.error(`[SectionErrorBoundary:${this.props.context}]`, error);
    Sentry.captureException(error, { tags: { boundary: this.props.context } });
  }

  handleRetry = () => {
    this.setState((s) => ({ failed: false, remountKey: s.remountKey + 1 }));
    this.props.onRetry?.();
  };

  render() {
    if (!this.state.failed) {
      // Keying on remountKey means a retry unmounts/remounts the entire
      // subtree (see RESET-BY-REMOUNT above) even though `children` is
      // the same element reference every render.
      return <Fragment key={this.state.remountKey}>{this.props.children}</Fragment>;
    }

    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertCircle className="h-8 w-8 text-text-tertiary" />
        <p className="text-text-primary">
          {this.props.label} hit a snag.
        </p>
        <p className="max-w-sm text-sm text-text-secondary">
          Something went wrong loading this part of the page — the rest of
          the app is fine.
        </p>
        <Button variant="secondary" size="sm" onClick={this.handleRetry}>
          Try again
        </Button>
      </div>
    );
  }
}
