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

async function readErr(res: Response, fallback: string): Promise<never> {
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error ?? fallback);
}

export async function searchUsers(params: {
  q?: string;
  tier?: string;
  disabledOnly?: boolean;
  page?: number;
}): Promise<{ users: AdminUserSummary[]; hasMore: boolean }> {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.tier) sp.set('tier', params.tier);
  if (params.disabledOnly) sp.set('disabled', 'true');
  if (params.page) sp.set('page', String(params.page));

  const res = await fetch(`/api/admin/users?${sp.toString()}`);
  if (!res.ok) return readErr(res, 'Failed to load users');
  return res.json();
}

export async function fetchUserDetail(
  id: string,
): Promise<{ user: AdminUserDetail; tokenLedger: TokenLedgerEntry[] }> {
  const res = await fetch(`/api/admin/users/${id}`);
  if (!res.ok) return readErr(res, 'Failed to load user');
  return res.json();
}

export async function setUserDisabled(id: string, disabled: boolean): Promise<AdminUserSummary> {
  const res = await fetch(`/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_disabled: disabled }),
  });
  if (!res.ok) return readErr(res, 'Failed to update account');
  const data = await res.json();
  return data.user;
}

export async function setUserRole(
  id: string,
  role: 'user' | 'moderator' | 'admin',
): Promise<AdminUserSummary> {
  const res = await fetch(`/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) return readErr(res, 'Failed to change role');
  const data = await res.json();
  return data.user;
}

export async function adjustUserTokens(
  id: string,
  amount: number,
  note?: string,
): Promise<{ balance: number }> {
  const res = await fetch(`/api/admin/users/${id}/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, note }),
  });
  if (!res.ok) return readErr(res, 'Failed to adjust tokens');
  return res.json();
}
