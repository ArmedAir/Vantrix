/**
 * POST /api/push/unregister-device
 *
 * Removes a native app instance's FCM token — called on explicit
 * sign-out or notification opt-out in the Capacitor shell. Mirrors
 * /api/push/unsubscribe (Web Push): best-effort, scoped to the caller's
 * own token so one user can never invalidate another's device.
 */
import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { withErrorHandling } from '@/lib/api/with-error-handling';

export const dynamic = 'force-dynamic';

const unregisterSchema = z.object({
  token: z.string().min(1).max(4096),
});

export const POST = withErrorHandling(async (req: Request) => {
  const { user } = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = unregisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('device_push_tokens')
    .delete()
    .eq('user_id', user.id)
    .eq('token', parsed.data.token);

  if (error) {
    logger.error('push:unregister-device:failed', { userId: user.id, error: error.message });
    return NextResponse.json({ error: 'Failed to remove device token' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}, 'push/unregister-device');
