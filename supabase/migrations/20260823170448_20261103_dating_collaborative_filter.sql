CREATE INDEX IF NOT EXISTS idx_dating_swipes_character_liked
  ON dating_swipes (character_id, user_id)
  WHERE direction IN ('like', 'super_like');

CREATE OR REPLACE FUNCTION collaborative_filter_scores(
  p_user_id UUID,
  p_neighbor_limit INT DEFAULT 200,
  p_result_limit INT DEFAULT 500
)
RETURNS TABLE(character_id UUID, score NUMERIC)
LANGUAGE sql
STABLE
AS $$
  WITH my_likes AS (
    SELECT ds.character_id
    FROM dating_swipes ds
    WHERE ds.user_id = p_user_id AND ds.direction IN ('like', 'super_like')
  ),
  neighbors AS (
    SELECT ds.user_id AS neighbor_id, COUNT(*)::numeric AS overlap
    FROM dating_swipes ds
    JOIN my_likes ml ON ml.character_id = ds.character_id
    WHERE ds.direction IN ('like', 'super_like')
      AND ds.user_id <> p_user_id
    GROUP BY ds.user_id
    ORDER BY overlap DESC
    LIMIT p_neighbor_limit
  ),
  neighbor_votes AS (
    SELECT ds.character_id, SUM(n.overlap) AS weighted_votes
    FROM dating_swipes ds
    JOIN neighbors n ON n.neighbor_id = ds.user_id
    WHERE ds.direction IN ('like', 'super_like')
      AND ds.character_id NOT IN (SELECT character_id FROM my_likes)
    GROUP BY ds.character_id
  )
  SELECT character_id, weighted_votes AS score
  FROM neighbor_votes
  ORDER BY score DESC
  LIMIT p_result_limit;
$$;

COMMENT ON FUNCTION collaborative_filter_scores IS
  'Item-based collaborative filtering for dating/discover recommendations: '
  'characters liked by users whose taste overlaps with the caller''s. '
  'Returns empty for users with no likes yet (cold start) — callers should '
  'treat a missing character_id as score 0, not an error. '
  'See src/lib/recommendations/engine.ts getCollaborativeScores().';
