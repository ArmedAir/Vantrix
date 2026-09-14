-- Spontaneous photo support for character-initiated openers.
--
-- character-initiative.ts's proactive openers ("morning_greeting",
-- "goal_milestone", "emotional_peak") can now optionally arrive with an
-- unprompted photo generated via spontaneous-photo.ts, reusing the
-- existing visual-seed image pipeline. messages.image_url already exists
-- (2026081102_universe_visual_coverage.sql) for the conversation-thread
-- copy; character_initiatives itself never had a column to carry it for
-- the SSE/notification leg (src/app/api/notifications/route.ts), so a
-- photo attached to an initiative would only ever have shown up once the
-- user opened the thread, not in the live push/toast.

ALTER TABLE character_initiatives
  ADD COLUMN IF NOT EXISTS image_url TEXT;
