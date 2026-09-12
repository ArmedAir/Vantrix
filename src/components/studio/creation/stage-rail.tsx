"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGES, type CharacterDraft, type StageId } from "./types";
import { stageComplete } from "./completeness";

export function StageRail({
  draft,
  activeStage,
  onSelect,
  furthestIndex,
}: {
  draft: CharacterDraft;
  activeStage: StageId;
  onSelect: (stage: StageId) => void;
  /** Index of the furthest stage the creator has reached — stages beyond this are disabled, not just unchecked. */
  furthestIndex: number;
}) {
  return (
    <nav className="flex md:flex-col gap-1 overflow-x-auto no-scrollbar md:overflow-visible">
      {STAGES.map((stage, i) => {
        const done = stageComplete(draft, stage.id);
        const active = stage.id === activeStage;
        const reachable = i <= furthestIndex;
        return (
          <button
            key={stage.id}
            type="button"
            disabled={!reachable}
            onClick={() => reachable && onSelect(stage.id)}
            className={cn(
              "shrink-0 flex items-center gap-2.5 rounded-sm px-3 py-2.5 text-left text-sm font-medium transition-[color,background-color,transform] ease-premium duration-150",
              "md:w-full",
              active ? "scale-[1.02]" : "scale-100",
              active
                ? "bg-gold-500/10 text-gold-400"
                : reachable
                  ? "text-text-secondary hover:text-text-primary hover:bg-white/[0.04]"
                  : "text-text-tertiary/50 cursor-not-allowed",
            )}
          >
            <span
              className={cn(
                "relative flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border text-[11px] font-semibold tabular-nums",
                done
                  ? "bg-gold-500 border-gold-500 text-[#160F02]"
                  : active
                    ? "border-gold-500 text-gold-400"
                    : "border-border-hairline text-text-tertiary",
              )}
            >
              <AnimatePresence initial={false}>
                {done ? (
                  <motion.span
                    key="check"
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ scale: 0.3, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.3, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                  >
                    <Check className="h-3 w-3" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="num"
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ scale: 0.3, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.3, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {i + 1}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            <span className="whitespace-nowrap md:whitespace-normal">{stage.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
