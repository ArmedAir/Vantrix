INSERT INTO app_config (key, value, description) VALUES
  ('character_monetization_min_chat_count', '20',
   'Minimum lifetime chat_count (messages from real users) a character needs before its creator can monetize it — proves genuine demand exists, not just that the character was created.'),
  ('character_monetization_min_age_days', '3',
   'Minimum days since a character was created before it can be monetized — prevents flipping monetization on the same day a character is thrown together.')
ON CONFLICT (key) DO NOTHING;
