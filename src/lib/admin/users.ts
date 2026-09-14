/**
 * src/lib/admin/users.ts — data access for the /admin/users surface.
 *
 * GAP THIS CLOSES: three admin permissions (`users.disable`,
 * `users.tokens_adjust`, `users.bulk_actions`) and four audit-log action
 * types (`user.disable`, `user.enable`, `user.tokens_adjusted`,
 * `user.role_changed`) have existed since the permissions/audit system was
 * built (see src/lib/auth/permissions.ts, src/lib/admin/audit.ts) and are
 * grantable today from /admin/permissions — but until this file and its
 * routes, nothing in the app ever called `requirePermission(..., 'users.*')`
 * or wrote a `user.*` audit row. There was no way to search for a user, see
 * their token/subscription state, disable an account, or adjust a balance
 * short of a direct Supabase table edit. `profiles.is_disabled` /
 * `disabled_at` have existed in the schema since 20240101_production.sql and
 * were never once written to by any code path.
 *
 * Kept as a plain data-access module (mirrors analytics.ts, investor.ts,
 * platform-settings.ts in this directory) so the route handlers under
 * /api/admin/users stay thin — auth/permission checks + validation only.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { NotFoundError, ValidationError } from '@/lib/errors';

export interface AdminUserSummary {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  tier: string;
  tokens: number;
  is_admin: boolean;
  is_disabled: boolean;
  created_at: string;
  last_active_at: string | null;
}

export interface AdminUserDetail extends AdminUserSummary {
  email: string | null;
  disabled_at: string | null;
  subscription_id: string | null;
  subscription_end: string | null;
  swipe_points: number;
  daily_messages_used: number;
  daily_messages_limit: number;
  age_verification_status: string;
  region: string | null;
  country: string | null;
  suspended: boolean;
}

export interface TokenLedgerEntry {
  id: string;
  amount: number;
  balance_after: number;
  reason: string;
  reference_id: string | null;
  created_at: string;
}

const SUMMARY_COLUMNS =
  'id, username, display_name, avatar_url, role, tier, tokens, is_admin, is_disabled, created_at, last_active_at';

/**
 * Resolves a free-text query to a set of candidate user ids before the
 * main list query runs. Three shapes are supported:
 *   - a UUID                → exact id match
 *   - contains "@"           → email lookup via the GoTrue admin API
 *                              (profiles has no email column; see
 *                              api/admin/bootstrap/route.ts for the same
 *                              listUsers()-paging pattern this borrows)
 *   - anything else          → treated as a username fragment, left to the
 *                              caller's ILIKE filter (no id pre-resolution
 *                              needed)
 * Returns `undefined` when the query should just be applied as a username
 * ILIKE filter directly, or an array of ids (possibly empty) when it was
 * resolved to something more specific.
 */
async function resolveQueryToIds(query: string): Promise<string[] | undefined> {
  const trimmed = query.trim();
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(trimmed)) return [trimmed];

  if (trimmed.includes('@')) {
    const normalized = trimmed.toLowerCase();
    // Bounded page walk (mirrors bootstrap/route.ts) — an admin search box
    // is low-frequency enough that a handful of extra Auth API calls is a
    // fine trade for not needing a raw user id.
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const match = data.users.find((u) => u.email?.toLowerCase() === normalized);
      if (match) return [match.id];
      if (data.users.length < 200) break;
    }
    return []; // no auth user with that email — search should return no rows, not fall through to username matching
  }

  return undefined;
}

export interface ListUsersInput {
  query?: string;
  tier?: string;
  disabledOnly?: boolean;
  page?: number;
  limit?: number;
}

export async function listUsers(
  input: ListUsersInput,
): Promise<{ users: AdminUserSummary[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const page = Math.max(input.page ?? 1, 1);
  const from = (page - 1) * limit;

  let query = supabaseAdmin
    .from('profiles')
    .select(SUMMARY_COLUMNS)
    .order('created_at', { ascending: false })
    .range(from, from + limit); // fetch one extra row to know hasMore

  if (input.tier) query = query.eq('tier', input.tier);
  if (input.disabledOnly) query = query.eq('is_disabled', true);

  if (input.query?.trim()) {
    const ids = await resolveQueryToIds(input.query.trim());
    if (ids !== undefined) {
      if (ids.length === 0) return { users: [], hasMore: false };
      query = query.in('id', ids);
    } else {
      query = query.ilike('username', `%${input.query.trim()}%`);
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  return { users: rows.slice(0, limit) as AdminUserSummary[], hasMore };
}

export async function getUserDetail(userId: string): Promise<AdminUserDetail> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(
      `${SUMMARY_COLUMNS}, disabled_at, subscription_id, subscription_end, swipe_points,
       daily_messages_used, daily_messages_limit, region, country`,
    )
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError('User');

  const [{ data: authUser }, { isUserSuspended }, { data: ageVerification }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(userId).catch(() => ({ data: { user: null } })),
    import('@/lib/ai/anomaly-detector'),
    // profiles.age_verified was removed (see 20260709_remove_denormalized_age_verified.sql)
    // in favor of reading age_verifications directly, same as middleware/settings/characters routes.
    supabaseAdmin
      .from('age_verifications')
      .select('status')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  const suspended = await isUserSuspended(userId).catch(() => false);

  return {
    ...(data as Omit<AdminUserDetail, 'email' | 'suspended' | 'age_verification_status'>),
    email: authUser?.user?.email ?? null,
    suspended,
    age_verification_status: ageVerification?.status ?? 'unverified',
  };
}

export async function listTokenLedger(userId: string, limit = 25): Promise<TokenLedgerEntry[]> {
  const { data, error } = await supabaseAdmin
    .from('token_ledger')
    .select('id, amount, balance_after, reason, reference_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;
  return data ?? [];
}

export async function setUserDisabled(userId: string, disabled: boolean): Promise<AdminUserSummary> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ is_disabled: disabled, disabled_at: disabled ? new Date().toISOString() : null })
    .eq('id', userId)
    .select(SUMMARY_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError('User');
  return data as AdminUserSummary;
}

export async function setUserRole(
  userId: string,
  role: 'user' | 'moderator' | 'admin',
): Promise<AdminUserSummary> {
  // is_admin is a separate boolean that RLS/requireAdmin both OR against
  // `role` (see requireAdmin's own comment) — keep them in lockstep here so
  // this route can never produce the "role says admin but is_admin is
  // false" split that requireAdmin's fix was written around.
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ role, is_admin: role === 'admin' })
    .eq('id', userId)
    .select(SUMMARY_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError('User');
  return data as AdminUserSummary;
}

export interface AdjustTokensResult {
  balance: number;
}

/**
 * Credits or debits a user's token balance through the existing
 * add_tokens()/deduct_tokens() RPCs (see 20261212_token_ledger.sql) rather
 * than a raw UPDATE — this is what makes the adjustment show up in
 * token_ledger with reason='admin_adjustment' and reference_id pointing at
 * the acting admin, instead of being an untraceable balance change.
 */
export async function adjustUserTokens(
  userId: string,
  amount: number,
  adminId: string,
  note?: string,
): Promise<AdjustTokensResult> {
  if (amount === 0) throw new ValidationError('amount must be non-zero');

  const reason = 'admin_adjustment';
  const referenceId = note ? `admin:${adminId}:${note.slice(0, 100)}` : `admin:${adminId}`;

  if (amount > 0) {
    const { error } = await supabaseAdmin.rpc('add_tokens', {
      p_user_id: userId,
      p_amount: amount,
      p_reason: reason,
      p_reference_id: referenceId,
    });
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin.rpc('deduct_tokens', {
      p_user_id: userId,
      p_amount: Math.abs(amount),
      p_reason: reason,
      p_reference_id: referenceId,
    });
    if (error) {
      if (error.message?.includes('insufficient_tokens')) {
        throw new ValidationError('User does not have enough tokens for this deduction');
      }
      throw error;
    }
  }

  const { data, error: readErr } = await supabaseAdmin
    .from('profiles')
    .select('tokens')
    .eq('id', userId)
    .single();
  if (readErr) throw readErr;
  return { balance: data.tokens };
}
