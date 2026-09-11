-- Per direct request: seeded characters are not monetized. Runtime chat
-- access was already unlocked for every character regardless of tier
-- (see checkCharacterTierAccess in src/lib/rate-limit/index.ts, a
-- deliberate product decision to no-op the tier gate), but 7 of the 30
-- active seeded characters still carried is_premium=true/min_tier=
-- 'premium' in the data itself. That stale flag drove a misleading gold
-- "Premium" badge (companion-card.tsx, premium-badge.tsx) and premium
-- cinematic background treatment (character-hero.tsx) on characters that
-- were never actually gated — implying monetization that doesn't exist.
-- This flips the data to match the real (unmonetized) behavior. Applied
-- directly to production via the Supabase MCP on 2026-09-11; this file
-- exists so the migration history and a fresh `supabase db reset` stay
-- in sync with what's live.
update characters
set is_premium = false,
    min_tier = 'free'
where is_premium = true;
