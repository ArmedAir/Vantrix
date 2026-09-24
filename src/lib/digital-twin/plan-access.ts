/**
 * Non-throwing form of the Digital Twin plan gate (same rule the twin's own
 * routes enforce: requirePlan(userId, 'premium', 'Digital Twin'), which lets
 * admins through). Used to decide whether twin-derived personalization
 * controls should be offered — enabling stays hard-gated in the routes, and
 * disabling is never gated (a lapsed user can always switch things OFF).
 */
import { requirePlan } from '@/lib/auth/plan';
import { PlanGateError } from '@/lib/errors';

export async function hasTwinPlanAccess(userId: string): Promise<boolean> {
  try {
    await requirePlan(userId, 'premium', 'Digital Twin');
    return true;
  } catch (err) {
    if (err instanceof PlanGateError) return false;
    throw err;
  }
}
