INSERT INTO ads (title, image_url, link, position, active)
VALUES
  (
    'Welcome to the Vantrix Universe',
    'https://vantrix.ink/promos/vantrix-universe-welcome.png',
    'https://vantrix.ink/universe',
    'hero',
    TRUE
  ),
  (
    'Find Your Perfect Match',
    'https://vantrix.ink/promos/vantrix-dating-perfect-match.png',
    'https://vantrix.ink/dating',
    'hero',
    TRUE
  ),
  (
    'Vantrix Coin — Gift Love, Earn Her Heart',
    'https://vantrix.ink/promos/vantrix-coin-gift-love.png',
    'https://vantrix.ink/premium',
    'inline',
    TRUE
  )
ON CONFLICT (image_url) DO NOTHING;

