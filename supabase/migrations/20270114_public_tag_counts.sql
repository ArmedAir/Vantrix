-- ─────────────────────────────────────────────────────────────────────────────
-- public_tag_counts() — src/lib/seo/public-tag.ts
--
-- Backs the /tags/[tag] SEO landing pages. characters.tags is a free-text
-- TEXT[] column (creator-entered at character-creation time, no fixed
-- taxonomy table) — this RPC unnests it across every character that
-- passes the same five-clause "public" filter used everywhere else this
-- codebase exposes character data to anonymous/crawler traffic (active,
-- is_public, is_live, moderation_status = 'approved', is_nsfw = false —
-- see public-character.ts's own header for why that filter is enforced
-- explicitly rather than left to RLS), groups by the lowercased tag text
-- so "Tsundere" and "tsundere" collapse into one count/page, and returns
-- only tags that clear min_count — a tag used by one or two characters
-- isn't worth an indexable URL and would just read as thin content.
--
-- SECURITY DEFINER + explicit filter re-application here (not just a
-- view over an already-filtered table) so this function is safe to call
-- from the anon/service-role client the same way getPublicCharacterIds()
-- is: it can never leak an NSFW-only or unapproved character's tag into
-- a public count, even if called directly.
--
-- Groups by lower(tag) (not raw tag) so "Tsundere" and "tsundere" from
-- two different characters collapse into one row/page instead of
-- splitting count and search rank across two near-duplicate URLs.
-- `tag` returned is the lowercased canonical form used for the page's
-- slug; a display label is derived client-side (title-cased) rather
-- than trying to preserve one character's original casing as "the"
-- label for a tag potentially shared by many characters.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public_tag_counts(
  min_count INT DEFAULT 3,
  max_tags  INT DEFAULT 500
)
RETURNS TABLE (tag TEXT, count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(btrim(t.tag)) AS tag, COUNT(*)::BIGINT AS count
  FROM characters c
  CROSS JOIN LATERAL unnest(c.tags) AS t(tag)
  WHERE c.active = TRUE
    AND c.is_public = TRUE
    AND c.is_live = TRUE
    AND c.moderation_status = 'approved'
    AND c.is_nsfw = FALSE
    AND t.tag IS NOT NULL
    AND btrim(t.tag) <> ''
  GROUP BY lower(btrim(t.tag))
  HAVING COUNT(*) >= min_count
  ORDER BY count DESC, tag ASC
  LIMIT max_tags;
$$;

-- Composite index so the CROSS JOIN LATERAL unnest above scans only
-- public rows instead of the full characters table before filtering.
CREATE INDEX IF NOT EXISTS idx_characters_public_tags
  ON characters (active, is_public, is_live, moderation_status, is_nsfw)
  WHERE active = TRUE AND is_public = TRUE AND is_live = TRUE
    AND moderation_status = 'approved' AND is_nsfw = FALSE;

GRANT EXECUTE ON FUNCTION public_tag_counts(INT, INT) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- public_characters_by_tag() — src/lib/seo/public-tag.ts
--
-- Companion to public_tag_counts() above: fetches the actual character
-- rows for a given tag page. Matching happens the same way counting
-- does — lower(unnest(tags)) = p_tag — so this function can never
-- disagree with public_tag_counts() about which characters belong to a
-- tag the way a client-side `.contains("tags", [original_label])`
-- lookup would (that approach breaks the moment a character's tag
-- casing differs from whichever character's casing happened to get
-- stored as "the" label). Same five-clause public filter and
-- SECURITY DEFINER rationale as public_tag_counts().
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public_characters_by_tag(
  p_tag      TEXT,
  p_limit    INT DEFAULT 60
)
RETURNS SETOF characters
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.*
  FROM characters c
  WHERE c.active = TRUE
    AND c.is_public = TRUE
    AND c.is_live = TRUE
    AND c.moderation_status = 'approved'
    AND c.is_nsfw = FALSE
    AND EXISTS (
      SELECT 1 FROM unnest(c.tags) AS t(tag)
      WHERE lower(btrim(t.tag)) = lower(btrim(p_tag))
    )
  ORDER BY c.like_count DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public_characters_by_tag(TEXT, INT) TO anon, authenticated, service_role;
