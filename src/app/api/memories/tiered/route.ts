/**
 * GET /api/memories/tiered?characterId=...
 *
 * User-facing read endpoint for the memory-tiers subsystem
 * (src/lib/memory-tiers/) — surfaces the same short/medium/long-term data
 * that getTieredMemoryContext() feeds into the chat prompt, so the
 * "Forget this conversation" reset in memories-panel.tsx isn't a blind
 * action. That component's own header comment flagged this exact gap: a
 * working reset path (clearShortTerm/clearMediumTerm/clearLongTerm) has
 * existed since the subsystem was built, but nothing ever showed the user
 * what those tiers actually hold before they clear it.
 *
 * Deliberately separate from GET /api/memories/priority — that route
 * serves priority_memories, a different subsystem entirely (see
 * memory-tiers/README.md's "why separate" section). This one wraps
 * getTieredMemoryContext() rather than re-implementing its per-tier reads,
 * so the prompt and this display can never silently drift apart.
 *
 * Medium-term entries already promoted to long-term are filtered out here,
 * same as formatMediumTermForPrompt()'s `active` filter — once something
 * has graduated to "always remembered", repeating it under "building up"
 * would read as a duplicate, not new information.
 *
 * Read-only. Nothing here writes to any tier.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient }              from '@/lib/supabase/server';
import { getTieredMemoryContext }    from '@/lib/memory-tiers/memory-tier-engine';
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

    const { shortTerm, mediumTerm, longTerm } = await getTieredMemoryContext(user.id, characterId);

    return NextResponse.json({
      shortTerm: shortTerm.map(t => ({
        role: t.role,
        text: t.text,
        ts: t.ts,
      })),
      mediumTerm: mediumTerm
        .filter(e => !e.promotedToLongTerm)
        .sort((a, b) => b.importance - a.importance)
        .map(e => ({
          id: e.id,
          summary: e.summary,
          topics: e.topics,
          importance: e.importance,
          reinforcedCount: e.reinforcedCount,
          updatedAt: e.updatedAt,
        })),
      longTerm: longTerm.map(m => ({
        id: m.id,
        headline: m.headline,
        importance: m.importance,
        reinforcementCount: m.reinforcement_count,
        lastReinforcedAt: m.last_reinforced_at,
      })),
    });
  } catch (err) {
    logger.error('memories/tiered:failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to load tiered memory' }, { status: 500 });
  }
}
