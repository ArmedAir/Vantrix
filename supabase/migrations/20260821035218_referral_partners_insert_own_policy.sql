-- FIX: /api/referrals/me auto-creates a free 'user'-class referral_partners
-- row on first visit, via the RLS-scoped client (src/lib/supabase/server.ts),
-- not supabaseAdmin. referral_partners had RLS enabled with only a SELECT
-- policy ("partners read own"), so that insert was rejected by Postgres's
-- default-deny for every user, surfacing in the UI as
-- "Failed to create referral profile" (500) on every single /referrals visit
-- for any account without a pre-existing row.
--
-- Scoped tightly: a user may only insert a row for themselves, and only
-- ever as the free 'user' class in 'active' status — dev/influencer tiers
-- must still go through /api/referrals/apply (a separate, presumably
-- admin/service-role-gated path), matching the intent already documented
-- in that route's comments. This does not touch UPDATE/DELETE — this
-- table has no user-facing update/delete flow today.
create policy "partners insert own"
  on referral_partners
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and class = 'user'
    and status = 'active'
  );
