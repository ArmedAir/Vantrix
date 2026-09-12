delete from character_posts
where image_url is null
   or trim(image_url) = ''
   or image_url ilike '%placeholder%';
