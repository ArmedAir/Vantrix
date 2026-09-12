"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2, Send, MessageCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PreviewMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * CHARACTER-CHAT-PREVIEW FIX (see api/admin/characters/[id]/chat-preview/
 * route.ts's own docstring): lets staff actually talk to a pending
 * character — not just read its name/photo/description — before
 * approving or rejecting it. Collapsed by default so the moderation
 * card doesn't grow by default for reviewers who don't need it; nothing
 * here is persisted, a page refresh drops the transcript, matching the
 * route's own stateless/unbilled contract.
 */
export function CharacterChatPreview({ characterId, characterName }: { characterId: string; characterName: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<PreviewMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, sending]);

  async function send() {
    const content = input.trim();
    if (!content || sending) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/characters/${characterId}/chat-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Preview chat failed");
      setMessages((prev) => [...prev, { role: "assistant", content: body.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border border-border-hairline rounded-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-text-primary hover:bg-white/[0.04] transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
          Test chat with {characterName}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-text-tertiary transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border-hairline p-3 space-y-3">
          <div
            ref={scrollRef}
            className="max-h-64 overflow-y-auto space-y-2 pr-1"
          >
            {messages.length === 0 && (
              <p className="text-xs text-text-tertiary py-4 text-center">
                Nothing here yet — say hi to see how {characterName} responds. Ephemeral: nothing is saved.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] rounded-sm px-3 py-1.5 text-sm whitespace-pre-wrap",
                  m.role === "user"
                    ? "ml-auto bg-gold-500/[0.12] text-text-primary"
                    : "bg-white/[0.04] text-text-secondary"
                )}
              >
                {m.content}
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
                <Loader2 className="h-3 w-3 animate-spin" /> {characterName} is typing…
              </div>
            )}
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Send a test message…"
              maxLength={2000}
              className="flex-1 h-9 px-3 rounded-sm bg-base border border-border-hairline text-sm text-text-primary placeholder:text-text-tertiary focus:border-gold-500/60 outline-none"
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || !input.trim()}
              aria-label="Send"
              className="h-9 w-9 shrink-0 flex items-center justify-center rounded-sm bg-gold-500 text-[#160F02] disabled:opacity-40 transition-opacity"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
