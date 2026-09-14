/**
 * GET   /api/admin/platform-settings — read general platform-wide toggles
 *       (maintenance mode, new-signup gate, global mature-content gate)
 * PATCH /api/admin/platform-settings — update them
 *
 * Backs the new /admin/settings hub. Gated the same way as
 * /api/admin/moderation-settings: requireAdmin() plus the granular
 * platform.settings_manage permission (so a full admin always has it, and
 * a moderator only has it with an explicit grant).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { requirePermission } from '@/lib/auth/permissions';
import { requireAdmin } from '@/lib/auth/admin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { toErrorBody, AppError } from '@/lib/errors';
import { recordAdminAction } from '@/lib/admin/audit';
import { invalidatePlatformSettingsCache } from '@/lib/admin/platform-settings';
import type { Database } from '@/types/supabase';
import { z } from 'zod';

type PlatformSettingsUpdate = Database['public']['Tables']['platform_settings']['Update'];

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);

    const { data, error } = await supabaseAdmin
      .from('platform_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      settings: data ?? {
        maintenance_mode: false,
        maintenance_message: 'Vantrix is undergoing scheduled maintenance. Please check back shortly.',
        new_signups_enabled: true,
        mature_content_enabled: true,
      },
    });
  } catch (err) {
    const body = toErrorBody(err);
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(body, { status });
  }
}

const patchSchema = z.object({
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(500).optional(),
  newSignupsEnabled: z.boolean().optional(),
  matureContentEnabled: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);
    await requirePermission(user.id, 'platform.settings_manage');

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from('platform_settings')
      .select('id')
      .limit(1)
      .maybeSingle();

    const update: PlatformSettingsUpdate = {
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.maintenanceMode !== undefined) update.maintenance_mode = parsed.data.maintenanceMode;
    if (parsed.data.maintenanceMessage !== undefined) update.maintenance_message = parsed.data.maintenanceMessage;
    if (parsed.data.newSignupsEnabled !== undefined) update.new_signups_enabled = parsed.data.newSignupsEnabled;
    if (parsed.data.matureContentEnabled !== undefined) update.mature_content_enabled = parsed.data.matureContentEnabled;

    if (existing) {
      const { error } = await supabaseAdmin
        .from('platform_settings')
        .update(update)
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from('platform_settings')
        .insert({
          maintenance_mode: parsed.data.maintenanceMode ?? false,
          maintenance_message: parsed.data.maintenanceMessage ?? 'Vantrix is undergoing scheduled maintenance. Please check back shortly.',
          new_signups_enabled: parsed.data.newSignupsEnabled ?? true,
          mature_content_enabled: parsed.data.matureContentEnabled ?? true,
          updated_by: user.id,
        });
      if (error) throw error;
    }

    invalidatePlatformSettingsCache();

    await recordAdminAction({
      adminId: user.id,
      action: 'platform_settings.updated',
      targetType: 'platform_settings',
      targetId: existing?.id ?? 'singleton',
      targetLabel: 'General platform settings',
      metadata: parsed.data,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const body = toErrorBody(err);
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(body, { status });
  }
}
