-- ─────────────────────────────────────────────────────────────────────────────
-- Location-scoped Story Mode — the last four uncovered locations
--
-- 20261124_roleplay_world_faction_scenarios.sql and 20261210_expanded_
-- romance_scenarios.sql together gave location-scoped scenes to
-- the-undercroft, cloudspire, and the-archive (and faction-scoped scenes to
-- all five factions), but four of world_locations' seven rows — the-capital,
-- iron-reach, obsidian-tower, the-ruins — were never given a scene of their
-- own. Anyone visiting those location pages in the World hub saw an empty
-- "Scenarios Here" section (world-scenarios-section.tsx renders nothing when
-- the location_slug match returns zero rows).
--
-- This closes that gap: one new scene per remaining location, same shape and
-- voice as the existing location/faction set, continuing sort_order 33→37.
-- cover_image_url intentionally left NULL — no dedicated photography exists
-- for these four yet (see 2026090402_seed_scenario_images_remaining.sql for
-- the pattern that fills it in once art is produced); scenario-picker.tsx
-- and world-scenarios-section.tsx both already degrade cleanly to a
-- placeholder cover when cover_image_url is NULL, so this ships fine without
-- blocking on art.
--
-- Idempotent — ON CONFLICT (slug) DO NOTHING.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO roleplay_scenarios
  (slug, title, tagline, genre, tags, premise, setting, tone, opening_narration,
   chapter_count, min_tier, sort_order, location_slug, faction_slug)
VALUES
  (
    'capital-steps-after-the-vote',
    'The Capital Steps, After the Vote',
    'The chamber emptied an hour ago. You two haven''t.',
    'political romance',
    ARRAY['the-capital', 'power', 'higher-stakes'],
    'The vote didn''t go the way either of you publicly hoped, and the press pool cleared out the second there was nothing left to photograph. Officially you''re on opposite sides of this. Unofficially, neither of you has moved from these steps, and the conversation you''re about to have has nothing to do with the vote at all.',
    'The Capital''s front steps, streetlights on, the building emptying out behind you',
    'guarded at first, dry-witted, warming despite itself',
    '*They* sit two steps below you, tie already loosened, watching the last aides filter out toward the parking structure. "You voted against me on purpose, didn''t you," *they* say, not quite a question, tipping their head back to look up at you instead of turning around. "Good. I''d have been disappointed if you hadn''t. Sit down — the cameras are gone, and I''m tired of talking to you like we''re strangers."',
    4, 'free', 34, 'the-capital', NULL
  ),
  (
    'iron-reach-night-shift',
    'Iron Reach, Night Shift',
    'The floor''s quiet only twice a day. This is the good one.',
    'working-class romance',
    ARRAY['iron-reach', 'quiet-hours', 'grounded'],
    'The day shift clocked out an hour ago and the night crew hasn''t fully settled in yet — the one stretch of quiet the floor gets, machines still ticking as they cool. You''ve both taken to spending it in the same corner, and tonight neither of you is pretending it''s a coincidence anymore.',
    'A factory floor between shifts, machines cooling, one work light left on',
    'unhurried, plainspoken, quietly affectionate',
    '*They* hop up onto the same crate you always lean against, sleeves still pushed up, a thermos held out toward you before you''ve even asked. "Figured you''d be here," *they* say, like it''s nothing, like this hasn''t become the best twenty minutes of either of your days. "Drink up. You''ve got that look like you''re about to say something and talk yourself out of it again."',
    3, 'free', 35, 'iron-reach', NULL
  ),
  (
    'obsidian-tower-the-long-way-up',
    'Obsidian Tower, The Long Way Up',
    'Nobody agrees what this place was. Tonight, neither of you cares.',
    'mystery romance',
    ARRAY['obsidian-tower', 'ancient', 'atmospheric'],
    'The stairwell inside Obsidian Tower is older than any record of the city, and the official tour stops three floors below where you two have wandered off to. Whatever this building used to be, it wasn''t built for two people to lose track of time in it together — and yet.',
    'A worn stone stairwell inside Obsidian Tower, torchlight, the city far below through a gap in the stone',
    'hushed, curious, charged with something neither of you has named',
    '*They* stop climbing two steps above you, one hand flat against stone that predates every name this city has ever had for itself. "Nobody actually knows what this place was for," *they* say, voice dropped low the way this stairwell seems to demand. "Temple, tomb, something else — take your pick. I like not knowing. Means we get to decide what it means, climbing it together." *They* look back down at you, torchlight catching. "Coming, or are you going to make me climb the rest of this alone?"',
    4, 'premium', 36, 'obsidian-tower', NULL
  ),
  (
    'the-ruins-what-the-map-doesnt-show',
    'The Ruins, What the Map Doesn''t Show',
    'Most people who go in past dark don''t come back with a story this good.',
    'adventure romance',
    ARRAY['the-ruins', 'danger', 'higher-stakes'],
    'You weren''t supposed to still be out here after the light went. The expedition''s official maps stop well short of where you two ended up, chasing something neither of you can fully explain now, and the dark past the treeline is the kind that makes you grab for each other before you even notice you''ve done it.',
    'Deep in the Ruins, firelight against broken stone, an unmapped dark past its edge',
    'tense, adrenaline-bright, unexpectedly intimate under the danger',
    '*They* pull you back a step from the treeline without letting go of your wrist after, eyes still scanning the dark like it might scan them back. "Whatever that was, it''s gone now," *they* say, breathing hard, and then, quieter, almost surprised at themself: "You grabbed my hand before I grabbed yours. Just so you know I noticed." *They* finally look at you instead of the dark. "We should get back to the fire. Slowly. Together."',
    4, 'premium', 37, 'the-ruins', NULL
  )
ON CONFLICT (slug) DO NOTHING;
