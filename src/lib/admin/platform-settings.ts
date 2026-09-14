import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

/**
 * Shared home for the general admin Settings hub's platform_settings
 * singleton row. Read from middleware.ts (maintenance mode) and the
 * signup route (new_signups_enabled) as well as the admin settings API
 * route — centralized here so all three stay in sync on shape and on the
 * cache TTL, same in-memory-cache pattern as
 * lib/moderation/index.ts's loadPromptConfig().
 */
export interface PlatformSettings {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  newSignupsEnabled: boolean;
  matureContentEnabled: boolean;
}

const DEFAULTS: PlatformSettings = {
  maintenanceMode: false,
  maintenanceMessage: 'Vantrix is undergoing scheduled maintenance. Please check back shortly.',
  newSignupsEnabled: true,
  matureContentEnabled: true,
};

const CACHE_TTL_MS = 30_000;
let cached: PlatformSettings | null = null;
let cachedAt = 0;

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;

  const { data, error } = await supabaseAdmin
    .from('platform_settings')
    .select('maintenance_mode, maintenance_message, new_signups_enabled, mature_content_enabled')
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    // Fail closed toward "the app behaves normally" (not toward
    // maintenance/signups-off), same reasoning as loadPromptConfig: a DB
    // hiccup reading an optional row shouldn't take the site down.
    if (error) logger.warn('platform-settings: failed to load, using defaults', { error: String(error) });
    cached = DEFAULTS;
    cachedAt = now;
    return cached;
  }

  cached = {
    maintenanceMode: data.maintenance_mode ?? DEFAULTS.maintenanceMode,
    maintenanceMessage: data.maintenance_message ?? DEFAULTS.maintenanceMessage,
    newSignupsEnabled: data.new_signups_enabled ?? DEFAULTS.newSignupsEnabled,
    matureContentEnabled: data.mature_content_enabled ?? DEFAULTS.matureContentEnabled,
  };
  cachedAt = now;
  return cached;
}

/** Call after any write to platform_settings so the change is picked up
 *  immediately instead of waiting out the TTL. */
export function invalidatePlatformSettingsCache(): void {
  cached = null;
  cachedAt = 0;
}
