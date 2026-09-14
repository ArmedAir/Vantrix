"use client";

import { Download, Share, X, PlusSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInstallPrompt } from "@/lib/pwa/use-install-prompt";

/**
 * "Install Vantrix" banner. Sits above CookieConsentBanner's slot so the
 * two never stack on top of each other for a first-time visitor — this
 * one only ever appears once `beforeinstallprompt`/iOS UA detection
 * resolves (a beat after mount), by which point the cookie banner (if
 * shown) has already claimed the bottom-right; this renders bottom-left
 * on desktop to avoid overlap, and stacks above the nav bar on mobile
 * same as the cookie banner does.
 */
export function InstallPrompt() {
  const { kind, visible, dismiss, promptInstall } = useInstallPrompt();

  if (!kind || !visible) return null;

  return (
    <div
      className={cn(
        "fixed inset-x-0 md:inset-x-auto md:left-4 md:right-auto md:max-w-sm",
        "bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-4",
        "z-50 px-3 md:px-0 animate-fade-in"
      )}
      role="dialog"
      aria-live="polite"
      aria-label="Install Vantrix"
    >
      <Card interactive={false} className="p-4 shadow-card">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-gold-500/10 flex items-center justify-center shrink-0">
            <Download className="h-4 w-4 text-gold-400" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-text-primary font-medium">Install Vantrix</p>
            {kind === "native" ? (
              <p className="text-xs text-text-tertiary mt-0.5">
                Add it to your home screen for faster access and notifications.
              </p>
            ) : (
              <p className="text-xs text-text-tertiary mt-0.5 flex flex-wrap items-center gap-1">
                Tap <Share className="h-3 w-3 inline text-gold-400" strokeWidth={2} /> then
                <span className="inline-flex items-center gap-0.5 text-text-secondary">
                  &ldquo;Add to Home Screen&rdquo; <PlusSquare className="h-3 w-3 text-gold-400" strokeWidth={2} />
                </span>
              </p>
            )}
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-text-tertiary hover:text-text-primary transition-colors ease-premium duration-150 shrink-0"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        {kind === "native" && (
          <div className="mt-3 flex justify-end gap-2 border-t border-border-hairline pt-3">
            <Button variant="ghost" size="sm" onClick={dismiss}>
              Not now
            </Button>
            <Button variant="primary" size="sm" onClick={promptInstall}>
              Install
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
