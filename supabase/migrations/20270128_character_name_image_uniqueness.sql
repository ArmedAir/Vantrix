-- Character name/portrait uniqueness
--
-- Nothing previously stopped two characters from sharing a name or an
-- image_url — the only existing unique constraint on `characters` is
-- `characters_slug_key` (slug), which is a derived/sanitized field, not
-- a guarantee on the human-facing name or portrait itself. Verified
-- against production data before writing this: 30/30 characters, zero
-- name or image_url collisions today, so this backfills no dedup step,
-- it only closes the gap going forward. Paired with a pre-insert check
-- in POST /api/characters (checked before the token charge, so a
-- colliding request fails before the user is billed) — these indexes
-- are the actual guarantee for the rare concurrent-request race the
-- pre-check alone can't close; that route's existing refund-on-insert-
-- failure path already covers a constraint violation reaching this far.
--
-- Name: case-insensitive + trimmed (lower(trim(name))) so "Emma Carter"
-- and "emma carter " collide — a plain UNIQUE(name) would let those
-- through as "different" names.
-- Image: exact match — character portraits are unique-per-upload CDN
-- URLs (see the image_url host allowlist in that same route), so an
-- exact match means the same file was reused, not a coincidence. NULL
-- image_url values are excluded (a character with no portrait yet
-- shouldn't block another from also having none).
CREATE UNIQUE INDEX IF NOT EXISTS characters_name_unique_ci
  ON characters (lower(trim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS characters_image_url_unique
  ON characters (image_url)
  WHERE image_url IS NOT NULL;
