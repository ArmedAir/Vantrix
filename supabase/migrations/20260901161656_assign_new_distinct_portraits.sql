UPDATE characters
SET image_url = '/images/characters/orion-black-v2.jpg'
WHERE name = 'Orion Black'
  AND image_url IN ('/images/characters/orion-black.jpg', '/images/character-placeholder.png');

UPDATE characters
SET image_url = '/images/characters/ivan-korrath-v2.jpg'
WHERE name = 'Ivan Korrath'
  AND image_url IN ('/images/characters/ivan-korrath.jpg', '/images/character-placeholder.png');

UPDATE characters
SET image_url = '/images/characters/solaris-venn-v2.jpg'
WHERE name = 'Solaris Venn'
  AND image_url IN ('/images/characters/solaris-venn.jpg', '/images/character-placeholder.png');
