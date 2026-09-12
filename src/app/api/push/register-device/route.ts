/**
 * POST /api/push/register-device
 *
 * Registers (or refreshes) a native app instance's FCM token for the
 * signed-in user. Called from the Capacitor shell right after
 * PushNotifications' `registration` event fires — see
 * mobile-capacitor/src/push.ts.
 *
 * Mirrors /api/push/subscribe (Web Push) exactly: same rate limit, same
 * per-user device cap/eviction, same upsert-on-natural-key shape — just
 * swapping the Web Push `endpoint`/`keys` for FCM's `token`/`platform`.
 * No SSRF-style endpoint allowlisting is needed here (unlike
 * known-endpoints.ts for Web Push): the server never makes a request TO
 * the token itself, only hands it to firebase-admin's messaging API,
 * which resolves delivery internally.
 */
import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { ratelimit } from '@/lib/rate-limit';
import { z } from 'zod';
import { withErrorHandling } from '@/lib/api/with-error-handling';

export const dynamic = 'force-dynamic';

const MAX_DEVICES_PER_USER = 8;

const registerSchema = z.object({
  token: z.string().min(1).max(4096),
  platform: z.enum(['ios', 'android']),
  appVersion: z.string().max(50).optional(),
});

export const POST = withErrorHandling(async (req: Request) => {
  const { user } = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { success: rlOk } = await ratelimit.limit(`push-register-device:${user.id}`);
  if (!rlOk) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid device token payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { token, platform, appVersion } = parsed.data;

  // Enforce the per-user device cap BEFORE the upsert — same reasoning as
  // /api/push/subscribe: a genuinely new device past the cap evicts the
  // least-recently-seen row first so the upsert never needs a rollback.
  const { data: existing, error: listErr } = await supabaseAdmin
    .from('device_push_tokens')
    .select('id, token, last_seen_at')
    .eq('user_id', user.id)
    .order('last_seen_at', { ascending: true });

  if (listErr) {
    logger.error('push:register-device:list-failed', { userId: user.id, error: listErr.message });
    return NextResponse.json({ error: 'Failed to save device token' }, { status: 500 });
  }

  const isNewDevice = !existing?.some((row) => row.token === token);
  if (isNewDevice && (existing?.length ?? 0) >= MAX_DEVICES_PER_USER) {
    const toEvict = existing!.slice(0, existing!.length - MAX_DEVICES_PER_USER + 1);
    await supabaseAdmin
      .from('device_push_tokens')
      .delete()
      .in('id', toEvict.map((row) => row.id));
  }

  const { error } = await supabaseAdmin
    .from('device_push_tokens')
    .upsert(
      {
        user_id: user.id,
        platform,
        token,
        app_version: appVersion ?? null,
        last_seen_at: new Date().toISOString(),
        invalid_at: null, // re-registering clears any prior invalidation
      },
      { onConflict: 'token' },
    );

  if (error) {
    logger.error('push:register-device:failed', { userId: user.id, error: error.message });
    return NextResponse.json({ error: 'Failed to save device token' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}, 'push/register-device');
