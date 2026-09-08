/**
 * GET /api/memories/priority?characterId=...&keyword=...&limit=...
 *
 * User-facing endpoint backing the "memories" UI page — returns the
 * filtered, keyword-tagged priority_memories rows for the authenticated
 * user and a given character (RLS also enforces user_id = auth.uid(), this
 * check is belt-and-suspenders / gives a clean 400 instead of an empty
 * RLS-filtered result when characterId is missing).
 *
 * This route itself is still read-only. User-driven writes (edit
 * headline/content, toggle pin, delete) live in the sibling
 * PATCH/DELETE /api/memories/priority/[id] route — see that file's doc
 * comment. Automatic promotion writes still go exclusively through
 * src/lib/ai/priority-memory.ts's promote*() functions via supabaseAdmin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient }              from '@/lib/supabase/server';
import { getPriorityMemories }       from '@/lib/ai/priority-memory';
import { logger }                    from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const characterId = searchParams.get('characterId');
    if (!characterId) {
      return NextResponse.json({ error: 'characterId is required' }, { status: 400 });
    }

    const keyword = searchParams.get('keyword') ?? undefined;
    const limitParam = Number(searchParams.get('limit') ?? '20');
    const limit = Number.isFinite(limitParam) ? Math.min(50, Math.max(1, limitParam)) : 20;

    const memories = await getPriorityMemories(user.id, characterId, { limit, keyword });

    return NextResponse.json({ memories });
  } catch (err) {
    logger.error('memories/priority:failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to load memories' }, { status: 500 });
  }
}
