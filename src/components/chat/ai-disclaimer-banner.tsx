"use client";

import { useState } from "react";
import { Info, ChevronDown, ChevronUp } from "lucide-react";

/**
 * Collapsible AI-disclosure banner shown at the top of a chat conversation.
 * Same pattern as the reference chat UI's "Digital Twin Disclaimer" strip —
 * a persistent, low-friction reminder that the character is an AI system,
 * not a real person, without blocking the conversation the way a modal
 * would. Dismissed state is per-conversation and per-browser-session
 * (sessionStorage, not localStorage) — reappears on a fresh session rather
 * than being permanently silenced, since this is a disclosure, not a tip.
 */
export function AiDisclaimerBanner({ conversationId }: { conversationId: string }) {
  const storageKey = `vantrix:ai-disclaimer-collapsed:${conversationId}`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // sessionStorage unavailable (private browsing, etc.) — banner
        // still toggles for this render, just won't persist across reloads.
      }
      return next;
    });
  };

  return (
    <div className="shrink-0 border-b border-border-hairline bg-gold-500/[0.04] px-4 py-2 text-xs text-text-secondary">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <Info className="h-3.5 w-3.5 shrink-0 text-gold-400" />
        <span className="font-medium text-text-primary">AI Companion Disclaimer</span>
        {collapsed ? (
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronUp className="ml-auto h-3.5 w-3.5 shrink-0" />
        )}
      </button>
      {!collapsed && (
        <p className="mt-1.5 leading-relaxed">
          This character is an AI system, not a real person. Responses are
          generated and may not always be accurate — nothing said here is
          professional, medical, or legal advice.
        </p>
      )}
    </div>
  );
}
