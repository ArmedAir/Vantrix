/**
 * GET   /api/admin/social/settings — current auto-publish toggle, daily
 *       post cap, how many have posted today, and whether X credentials
 *       are configured at all. Powers the settings panel on
 *       /admin/social — this is the "(or the /admin/social toggle, once
 *       built)" route lib/config/x-social.ts's own header comment
 *       already promised.
 * PATCH /api/admin/social/settings — update the toggle and/or the cap.
 *       Either field alone is a valid request (e.g. flipping just the
 *       toggle without touching the cap).
 *
 * Same access split as the parent /api/admin/social route: GET only
 * requires admin; PATCH is a real behavior change to the publishing
 * pipeline (same "who's allowed to touch this at all" reasoning as
 * social.publish gating publish/reject/connection-test elsewhere in
 * this feature), so it requires social.publish too.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { requireAdmin } from '@/lib/auth/admin';
import { requirePermission } from '@/lib/auth/permissions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { toErrorBody, errorLogFields, AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { recordAdminAction } from '@/lib/admin/audit';
import { getSocialSettings } from '@/lib/frontend/admin-social';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z
  .object({
    autoPublishEnabled: z.boolean().optional(),
    // 500 is a generous ceiling — the seeded default is 10 and X's own
    // rate limits would throttle long before this is ever reachable; it
    // exists to reject a fat-fingered value (e.g. an extra zero) rather
    // than to model a real intended maximum.
    dailyPostCap: z.number().int().min(0).max(500).optional(),
  })
  .refine((v) => v.autoPublishEnabled !== undefined || v.dailyPostCap !== undefined, {
    message: 'At least one of autoPublishEnabled or dailyPostCap is required',
  });

export async function GET() {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);

    const settings = await getSocialSettings();
    return NextResponse.json(settings);
  } catch (err) {
    logger.error('Admin social settings GET error', errorLogFields(err));
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);
    await requirePermission(user.id, 'social.publish');

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { autoPublishEnabled, dailyPostCap } = parsed.data;

    const now = new Date().toISOString();
    const rows: { key: string; value: string; description: string; updated_at: string }[] = [];
    if (autoPublishEnabled !== undefined) {
      rows.push({
        key: 'x_auto_publish_enabled',
        value: String(autoPublishEnabled),
        description:
          'When true, the X publisher cron posts eligible queued rows unattended. Off by default — admin must opt in.',
        updated_at: now,
      });
    }
    if (dailyPostCap !== undefined) {
      rows.push({
        key: 'x_daily_post_cap',
        value: String(dailyPostCap),
        description: 'Max posts the X publisher cron will send per UTC day, across all characters combined.',
        updated_at: now,
      });
    }

    const { error } = await supabaseAdmin.from('app_config').upsert(rows, { onConflict: 'key' });
    if (error) throw error;

    await recordAdminAction({
      adminId: user.id,
      action: 'social.settings_updated',
      // Same targetType/targetId shape this feature already uses for a
      // non-row action — see the parent route's connection-test action
      // ('social_post' / 'connection-test'); AdminAuditTargetType has no
      // dedicated "config" variant, and adding one for a single settings
      // row isn't worth widening that union.
      targetType: 'social_post',
      targetId: 'settings',
      metadata: { autoPublishEnabled, dailyPostCap },
    });

    logger.info('Admin: social settings updated', { autoPublishEnabled, dailyPostCap, by: user.id });

    const settings = await getSocialSettings();
    return NextResponse.json(settings);
  } catch (err) {
    logger.error('Admin social settings PATCH error', errorLogFields(err));
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}
