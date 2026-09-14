/**
 * Shared error boundary for API route handlers.
 *
 * GAP-FIX (codebase-wide error-handling audit, 2026-09-11): 65 of 240
 * route.ts files had no try/catch at all. This app already has a solid
 * typed-error system (src/lib/errors.ts: AppError hierarchy,
 * toErrorBody() for the sanitized client response, errorLogFields() for
 * the full server-side log) — but it only helps if something actually
 * catches the throw. Routes without a try/catch skip all of it: an
 * unhandled exception falls through to Next's default handler, which
 * returns a bare 500 with no logger.error() call (so no Sentry context
 * either, despite logger.ts already forwarding sampled errors there —
 * see that file's header) and no consistent { error, code } body shape
 * for the client to branch on.
 *
 * Wrap any route handler with this instead of writing another bespoke
 * try/catch:
 *
 *   export const POST = withErrorHandling(async (req) => {
 *     const { user } = await getAuthedUser();
 *     if (!user) throw new UnauthorizedError();
 *     ...
 *     return NextResponse.json({ ok: true });
 *   }, 'dating/swipe');
 *
 * Throw the typed errors from errors.ts (UnauthorizedError,
 * ValidationError, NotFoundError, RateLimitError, etc.) to get the
 * right status code + machine-readable `code` automatically. Anything
 * else thrown (a bug, a driver-level exception, a Supabase client that
 * throws instead of returning `.error`) is treated as an
 * unexpected 500 — logged with full detail server-side via
 * errorLogFields(), returned to the client as the generic
 * "An unexpected error occurred" / INTERNAL_ERROR body from
 * toErrorBody(), same as every route that already follows this pattern
 * by hand.
 */
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { AppError, toErrorBody, errorLogFields } from '@/lib/errors';

type RouteHandler<Ctx = unknown> = (
  req: NextRequest,
  ctx: Ctx,
) => Promise<NextResponse> | NextResponse;

/**
 * @param label Short, stable identifier used in the log line
 *   (e.g. 'dating/swipe') — mirrors the `logger.error('route-name:...', ...)`
 *   convention already used throughout the codebase, so these show up the
 *   same way in existing log searches/dashboards.
 */
export function withErrorHandling<Ctx = unknown>(
  handler: RouteHandler<Ctx>,
  label: string,
): RouteHandler<Ctx> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      // AppError subclasses carry their own intended status code (401,
      // 403, 404, 429, ...); anything else is a genuinely unexpected
      // failure and stays a 500 — never guess a more specific code for
      // an error we don't recognize.
      const status = err instanceof AppError ? err.statusCode : 500;

      // Full detail (message, name, stack, or the raw object shape for
      // non-Error throws) server-side only. toErrorBody() below is what
      // the client actually receives, and it's deliberately sanitized.
      logger.error(`${label}:unhandled-error`, errorLogFields(err));

      return NextResponse.json(toErrorBody(err), { status });
    }
  };
}
