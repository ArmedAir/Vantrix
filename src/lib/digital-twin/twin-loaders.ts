/**
 * Consent-gated readers for twin-derived personalization. Every function here
 * FAILS OPEN to null: a missing column/table (migration not yet applied), a DB
 * error, or any doubt about consent means "no personalization" — never an
 * error in someone's chat or deck.
 *
 * Consent model (both must hold; both default OFF):
 *   • the user has an ENABLED twin (digital_twin_profiles.enabled), and
 *   • a specific opt-in exists for the surface:
 *       – chat mirroring → a character_twin_optins row for (user, character)
 *       – ranking        → digital_twin_profiles.use_for_matching = true
 * Turning the twin off, or the opt-in off, takes effect on the very next read
 * (deliberately no caching layer between consent and use).
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { extractMatchSignals, extractMirrorSummary, type TwinMatchSignals } from './twin-signals';
import { buildMirrorBlock } from './mirror-block';

/** Signals for the recommendation scorer, or null unless the user opted in. */
export async function loadTwinMatchSignals(userId: string): Promise<TwinMatchSignals | null> {
  if (!userId) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from('digital_twin_profiles')
      .select('auto_traits, enabled, use_for_matching')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data || !data.enabled || !data.use_for_matching) return null;
    return extractMatchSignals(data);
  } catch (err) {
    logger.warn('[twin] match-signal load failed — ranking without twin', { userId, error: String(err) });
    return null;
  }
}

/**
 * The system-prompt block for ONE character's chat, or null. Call once per
 * turn from each chat path; append the result as the LAST system block.
 * The common case (no opt-in row) costs a single primary-key lookup.
 */
export async function loadTwinMirrorBlock(userId: string, characterId: string): Promise<string | null> {
  if (!userId || !characterId) return null;
  try {
    const { data: optin, error: optinErr } = await supabaseAdmin
      .from('character_twin_optins')
      .select('character_id')
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .maybeSingle();
    if (optinErr || !optin) return null;

    const { data: twin, error: twinErr } = await supabaseAdmin
      .from('digital_twin_profiles')
      .select('auto_traits, auto_style_summary, enabled')
      .eq('user_id', userId)
      .maybeSingle();
    if (twinErr || !twin || !twin.enabled) return null;

    return buildMirrorBlock(extractMirrorSummary(twin));
  } catch (err) {
    logger.warn('[twin] mirror-block load failed — chatting without it', { userId, characterId, error: String(err) });
    return null;
  }
}
