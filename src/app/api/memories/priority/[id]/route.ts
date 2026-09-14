/**
 * PATCH  /api/memories/priority/[id] — edit headline/content, or toggle pin
 * DELETE /api/memories/priority/[id] — remove a memory the user doesn't want kept
 *
 * Closes the gap noted on GET /api/memories/priority's original doc
 * comment ("nothing in this route ever writes"): a user could see a wrong
 * or unwanted memory in the Memories panel but had no way to fix, remove,
 * or pin one — the "hallucination drift" failure mode the product spec
 * calls out.
 *
 * Ownership is enforced here in the route rather than via RLS, matching
 * DELETE /api/community/posts/[id]'s pattern: priority_memories' only
 * write policy is `FOR ALL TO service_role` (see
 * 20260720_priority_memories.sql), so supabaseAdmin bypasses RLS entirely
 * and the explicit user_id check below is what actually protects other
 * users' rows.
 *
 * Editing headline/content sets user_edited = true, which
 * promoteMemoryNode()/promoteFact() (src/lib/ai/priority-memory.ts) check
 * before their next upsert — without that flag, a later auto-promotion of
 * the same source_id would silently revert the user's correction.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient }              from '@/lib/supabase/server';
import { supabaseAdmin }             from '@/lib/supabase/admin';
import { logger }                    from '@/lib/logger';
import type { Database }             from '@/types/supabase';

export const dynamic = 'force-dynamic';

const MAX_HEADLINE_LEN = 120;
const MAX_CONTENT_LEN  = 2000;

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function loadOwnedMemory(id: string) {
  return supabaseAdmin
    .from('priority_memories')
    .select('id, user_id')
    .eq('id', id)
    .single();
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: existing, error: fetchError } = await loadOwnedMemory(id);
    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }
    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: 'You can only edit your own memories' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const update: Database['public']['Tables']['priority_memories']['Update'] = {};

    if (typeof body.isPinned === 'boolean') {
      update.is_pinned = body.isPinned;
    }

    const editingHeadline = typeof body.headline === 'string';
    const editingContent  = typeof body.content === 'string';

    if (editingHeadline) {
      const headline = (body.headline as string).trim();
      if (!headline) {
        return NextResponse.json({ error: 'Headline cannot be empty' }, { status: 400 });
      }
      update.headline = headline.slice(0, MAX_HEADLINE_LEN);
    }
    if (editingContent) {
      const content = (body.content as string).trim();
      if (!content) {
        return NextResponse.json({ error: 'Content cannot be empty' }, { status: 400 });
      }
      update.content = content.slice(0, MAX_CONTENT_LEN);
    }
    // Freeze this row against future auto-promotion overwrites once the
    // user has actually corrected its text — see priority-memory.ts's
    // isFrozenByUser() guard. Pin-only PATCHes don't touch the memory's
    // truth, so they don't need to set this.
    if (editingHeadline || editingContent) {
      update.user_edited = true;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }
    update.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('priority_memories')
      .update(update)
      .eq('id', id)
      .select('id,source,category,headline,content,keywords,importance,created_at,is_pinned,user_edited')
      .single();

    if (error) {
      logger.error('memories/priority:patch-failed', { error: error.message, id, userId: user.id });
      return NextResponse.json({ error: 'Failed to update memory' }, { status: 500 });
    }

    return NextResponse.json({ memory: data });
  } catch (err) {
    logger.error('memories/priority:patch-failed', { error: err instanceof Error ? err.message : String(err), id });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: existing, error: fetchError } = await loadOwnedMemory(id);
    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }
    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: 'You can only delete your own memories' }, { status: 403 });
    }

    const { error } = await supabaseAdmin.from('priority_memories').delete().eq('id', id);
    if (error) {
      logger.error('memories/priority:delete-failed', { error: error.message, id, userId: user.id });
      return NextResponse.json({ error: 'Failed to delete memory' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('memories/priority:delete-failed', { error: err instanceof Error ? err.message : String(err), id });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
