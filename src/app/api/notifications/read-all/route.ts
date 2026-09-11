/**
 * POST /api/notifications/read-all — mark every unread notification read
 * for the authenticated user, via the mark_all_notifications_read() RPC
 * (single round trip instead of fetch-then-update-N).
 */
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth/get-authed-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { withErrorHandling } from "@/lib/api/with-error-handling";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async () => {
  const { user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin.rpc("mark_all_notifications_read", {
    p_user_id: user.id,
  });

  if (error) {
    logger.error("notifications:mark-all-read-error", { userId: user.id, error: error.message });
    return NextResponse.json({ error: "Failed to mark all read" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: data ?? 0 });
}, "notifications/read-all");
