-- Digital Twin — scoped deletion
--
-- data-privacy-panel.tsx only ever offered full account deletion
-- (DELETE /api/user/delete). A user who wanted to wipe just their trained
-- twin — persona, manual notes/phrases, and generated reply history —
-- without nuking their whole account had no way to do that. This is the
-- DB side of DELETE /api/digital-twin.
--
-- digital_twin_messages already had a delete-own policy
-- (2026082102_digital_twin_expansion.sql). digital_twin_profiles never did
-- — only SELECT-own and UPDATE-own (20260819b_digital_twin.sql). The new
-- route uses supabaseAdmin like every other write path in this codebase
-- (ownership is enforced in the route itself), so this policy isn't load
-- bearing for that route — it's defense-in-depth, matching the pattern
-- already used for digital_twin_messages and community_posts.
DROP POLICY IF EXISTS "users delete own digital twin" ON digital_twin_profiles;
CREATE POLICY "users delete own digital twin" ON digital_twin_profiles
  FOR DELETE USING (user_id = auth.uid());
