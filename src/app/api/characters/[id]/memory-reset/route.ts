/**
 * DELETE /api/characters/:id/memory-reset
 *
 * User-facing "forget this conversation" action for the new memory-tiers
 * subsystem (src/lib/memory-tiers/) — clears all three tiers
 * (short/medium/long-term) for the authenticated user's relationship with
 * one character, then re-marks the pair dirty-clean by construction (there's
 * nothing left to digest).
 *
 * WIRING NOTE: clearShortTerm/clearMediumTerm/clearLongTerm have existed in
 * their respective tier modules since the subsystem was built, each with a
 * "user-facing 'forget this session'" / "GDPR / user-facing reset" doc
 * comment — but nothing in the app ever called them. This route is that
 * call site. Distinct from the account-wide GDPR erasure in
 * api/user/delete/route.ts (deleteAllForUser + Redis key patterns there
 * cover every character for a user being deleted entirely); this is the
 * narrower, opt-in "just this one companion" reset a user can trigger while
 * keeping their account.
 *
 * Does NOT touch memory_graph, user_facts, or character_seed_memories —
 * those are separate subsystems (see memory-tiers/README.md's "why
 * separate" section) with their own reset paths if/when needed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { clearShortTerm } from '@/lib/memory-tiers/short-term-memory';
import { clearMediumTerm } from '@/lib/memory-tiers/medium-term-memory';
import { clearLongTerm } from '@/lib/memory-tiers/long-term-memory';
import { logger } from '@/lib/logger';
import { toErrorBody, errorLogFields } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: characterId } = await params;
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

    await Promise.all([
      clearShortTerm(user.id, characterId),
      clearMediumTerm(user.id, characterId),
      clearLongTerm(user.id, characterId),
    ]);

    logger.info('memory-tiers:user-reset', { userId: user.id, characterId });
    return NextResponse.json({ ok: true, reset: true });
  } catch (err) {
    logger.error('memory-tiers:user-reset-failed', errorLogFields(err));
    return NextResponse.json(toErrorBody(err), { status: 500 });
  }
}
