"use client";

import { useEffect, useState } from "react";
import { Cookie } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getStoredConsent, setStoredConsent, type ConsentPreferences } from "@/lib/consent/cookie-consent";

export function CookieConsentBanner() {
  // null = still checking (avoids a flash of the banner for a returning
  // visitor who already decided); false = decided, nothing to show;
  // true = no decision on file yet, show it.
  const [visible, setVisible] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    setVisible(getStoredConsent() === null);
  }, []);

  function decide(prefs: Omit<ConsentPreferences, "essential">) {
    setStoredConsent(prefs);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className={cn(
        "fixed inset-x-0 md:inset-x-auto md:right-4 md:left-auto md:max-w-sm",
        "bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-4",
        "z-50 px-3 md:px-0 animate-fade-in"
      )}
      role="dialog"
      aria-live="polite"
      aria-label="Cookie preferences"
    >
      <Card interactive={false} className="p-4 shadow-card">
        <div className="flex items-start gap-3">
          <Cookie className="h-4 w-4 text-gold-400 mt-0.5 shrink-0" strokeWidth={1.75} />
          <div className="min-w-0">
            <p className="text-sm text-text-primary">
              We use essential cookies to run Vantrix, and optional cookies for analytics and marketing.
            </p>
            {!expanded && (
              <button
                onClick={() => setExpanded(true)}
                className="text-xs text-text-tertiary hover:text-gold-400 transition-colors ease-premium duration-150 mt-1"
              >
                Manage preferences
              </button>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-3 space-y-2 border-t border-border-hairline pt-3">
            <label className="flex items-center justify-between text-xs text-text-secondary">
              Essential — always on
              <input type="checkbox" checked disabled className="accent-gold-500" />
            </label>
            <label className="flex items-center justify-between text-xs text-text-secondary">
              Analytics
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                className="accent-gold-500"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-text-secondary">
              Marketing
              <input
                type="checkbox"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
                className="accent-gold-500"
              />
            </label>
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          {expanded ? (
            <Button size="sm" variant="primary" className="flex-1" onClick={() => decide({ analytics, marketing })}>
              Save preferences
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" className="flex-1" onClick={() => decide({ analytics: false, marketing: false })}>
                Reject non-essential
              </Button>
              <Button size="sm" variant="primary" className="flex-1" onClick={() => decide({ analytics: true, marketing: true })}>
                Accept all
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
