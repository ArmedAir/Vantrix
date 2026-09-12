-- Fixes 6 characters whose image_url pointed at files that don't exist on disk.
-- Verified against public/images/characters/ contents and current DB state.

-- 1-3: image_url referenced a "-v2" filename that was never actually uploaded;
-- the non-v2 file is the real portrait on disk.
UPDATE characters SET image_url = '/images/characters/ivan-korrath.jpg'
WHERE name = 'Ivan Korrath' AND image_url = '/images/characters/ivan-korrath-v2.jpg';

UPDATE characters SET image_url = '/images/characters/orion-black.jpg'
WHERE name = 'Orion Black' AND image_url = '/images/characters/orion-black-v2.jpg';

UPDATE characters SET image_url = '/images/characters/solaris-venn.jpg'
WHERE name = 'Solaris Venn' AND image_url = '/images/characters/solaris-venn-v2.jpg';

-- 4-6: stuck on the generic placeholder even though a real portrait exists on disk.
UPDATE characters SET image_url = '/images/characters/dr-elias-voss-gallery-1.jpg'
WHERE name = 'Dr. Elias Voss' AND image_url = '/images/character-placeholder.png';

UPDATE characters SET image_url = '/images/characters/evelyn-thorn-gallery-1.jpg'
WHERE name = 'Evelyn Thorn' AND image_url = '/images/character-placeholder.png';

UPDATE characters SET image_url = '/images/characters/kael-ember-gallery-1.jpg'
WHERE name = 'Kael Ember' AND image_url = '/images/character-placeholder.png';

