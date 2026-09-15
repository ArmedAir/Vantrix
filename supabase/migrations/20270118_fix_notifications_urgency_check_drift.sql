-- Fixes drift between the live `notifications_urgency_check` constraint
-- and what every part of the app actually sends.
--
-- Root cause: the live constraint only allowed ('low','normal','high') —
-- 'medium' was missing, despite:
--   - 20240101_production.sql (this table's own original migration file)
--     defining the constraint as ('low','normal','medium','high') the
--     whole time
--   - the app's NotificationUrgency type (lib/notifications/types.ts)
--     being 'low' | 'medium' | 'high'
--   - 7+ call sites across the app using urgency: 'medium' as a real,
--     intentional value (dating milestone/gift notifications, MFA
--     security alerts, cron referral-payouts, streak-risk warnings,
--     the surprise-engine's milestone_unlocked mapping, ...)
--
-- However this constraint actually got out of sync with its own
-- migration file is unclear (a manual ALTER against production that was
-- never captured as its own migration, most likely — the same class of
-- drift as vercel.json vs config/cron-jobs.mjs elsewhere in this repo).
-- Whatever the cause, every one of those call sites has been silently
-- failing to write its notification row in production — this widens the
-- live constraint back to match what the rest of the codebase has
-- always assumed, rather than ripping 'medium' out of 7+ call sites and
-- losing a real, distinct urgency tier the notification UI relies on.
alter table notifications drop constraint notifications_urgency_check;
alter table notifications add constraint notifications_urgency_check
  check (urgency in ('low','normal','medium','high'));
