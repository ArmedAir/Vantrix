-- FOLLOW-UP TO 20261231_rename_all_characters_to_baby_names.sql:
-- that migration's REPLACE(field, 'Old Full Name', 'New Name') calls only
-- match an exact contiguous substring. Three characters phrase their own
-- old name non-contiguously in `description` (e.g. "Selene, Keeper of the
-- Long Dusk" instead of "Selene Dusk"), so the replace silently missed
-- them, leaking the retired fantasy name to users on live character cards
-- (Explore Characters, dating, etc). This migration hand-corrects just
-- those three description strings, keeping the surrounding
-- title/type/origin structure intact and swapping only the leaked name
-- reference for the character's current name (matching how every other
-- character in that migration now reads).

BEGIN;

UPDATE characters SET
  description = 'Charlotte — The Fallen Aristocrat, Human, noble-born from The fallen court above the Archive''s grand stair. Titles are fiction. Leverage is real. Core wound: Losing everything that once defined her, publicly and completely.'
WHERE name = 'Charlotte'
  AND description = 'Evelyn of House Thorn — The Fallen Aristocrat, Human, noble-born from The fallen court above the Archive''s grand stair. Titles are fiction. Leverage is real. Core wound: Losing everything that once defined her, publicly and completely.';

UPDATE characters SET
  description = 'Natalie — The Fragile Visionary, Human, reality-touched from A crack in the Archive''s structure that shouldn''t exist. Nothing holds still, but some people can hold still with you. Core wound: Never having a childhood that felt stable or explainable.'
WHERE name = 'Natalie'
  AND description = 'Mira, called Glass for what she sees through — The Fragile Visionary, Human, reality-touched from A crack in the Archive''s structure that shouldn''t exist. Nothing holds still, but some people can hold still with you. Core wound: Never having a childhood that felt stable or explainable.';

UPDATE characters SET
  description = 'Victoria — The Stoic Authority, Human, memory-warden from The twilight archives, neither day nor night. Rules exist to protect people. When they stop doing that, they stop being rules worth keeping. Core wound: Choosing duty over someone she loved, and never being forgiven for it.'
WHERE name = 'Victoria'
  AND description = 'Selene, Keeper of the Long Dusk — The Stoic Authority, Human, memory-warden from The twilight archives, neither day nor night. Rules exist to protect people. When they stop doing that, they stop being rules worth keeping. Core wound: Choosing duty over someone she loved, and never being forgiven for it.';

COMMIT;

