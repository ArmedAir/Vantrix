-- ─────────────────────────────────────────────────────────────────────────────
-- NOTIFICATION-404-FIX: backfill stale cta_url values left behind by the
-- /dating/match/ route bug.
--
-- dating/swipe/route.ts, dating/date/[id]/complete/route.ts, and
-- dating/gifts/route.ts (see each file's own ROUTE-FIX comment) used to emit
-- dating_match / milestone_unlocked notifications with
-- `cta_url: '/dating/' || matchId` — but the actual page has always lived at
-- /dating/match/[id] (src/app/(app)/dating/match/[id]/page.tsx). There is no
-- /dating/[id] route at all, so tapping one of these notifications hit
-- Next's global not-found page every time.
--
-- All three call sites were fixed to emit the correct '/dating/match/'+id
-- link going forward, but that only affects notifications created AFTER the
-- fix shipped — every row already sitting in a user's inbox from before then
-- still has the broken URL baked into cta_url, and will keep 404ing forever
-- unless the stored data itself is corrected. This migration is that
-- correction, mirroring the same "fix the already-seeded rows, not just the
-- code that seeds them" pattern used for the `ads` table in
-- 20260941_fix_ad_image_urls.sql / 20260909_optimize_hero_ad_creatives_to_webp.sql.
--
-- Scoped tightly to the exact broken shape (a bare UUID directly under
-- /dating/) so this can never touch /dating, /dating/deck, /dating/matches,
-- or an already-correct /dating/match/<uuid> row.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE notifications
SET cta_url = '/dating/match/' || substring(cta_url from 9)
WHERE type IN ('dating_match', 'milestone_unlocked')
  AND cta_url ~ '^/dating/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

-- TOKEN-PURCHASE-CTA-FIX: the Stripe and Paystack webhook handlers emitted
-- `token_purchase` notifications with ctaUrl '/premium' (the pricing page)
-- instead of '/profile/tokens' (the balance/history page) — the Paddle
-- webhook's identical notification always had this right. Not a 404 (both
-- pages exist), but a purchase-confirmation notification landing on
-- "buy a plan" instead of "here's your new balance" is a real
-- point-the-user-at-the-wrong-page bug, so it gets the same backfill
-- treatment as the dating links above rather than only fixing it going
-- forward.
UPDATE notifications
SET cta_url = '/profile/tokens'
WHERE type = 'token_purchase'
  AND cta_url = '/premium';
