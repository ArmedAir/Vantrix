-- Supports streak-risk.ts's getStreakRiskCandidates() query:
--   WHERE current_streak > 0 AND last_checkin >= :yesterday AND last_checkin < :today
-- user_streaks had no index beyond the implicit unique index on user_id,
-- so this was a full sequential scan once daily across every row in the
-- table. Partial index (WHERE current_streak > 0) keeps it small — rows
-- with a dead/zero streak never match the query and don't need to be
-- indexed.
CREATE INDEX IF NOT EXISTS idx_user_streaks_last_checkin_active
  ON user_streaks (last_checkin)
  WHERE current_streak > 0;
