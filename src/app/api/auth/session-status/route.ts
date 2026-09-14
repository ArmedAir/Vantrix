/**
 * GET /api/auth/session-status
 *
 * Minimal "am I signed in?" check for client components that need to
 * reflect auth state on pages that must stay statically generated /
 * ISR-cached (about, terms, privacy, careers, press, blog, discover —
 * see PublicHeader). Those pages can't call getAuthedUser()/headers()
 * directly in a Server Component: doing so opts the whole route out of
 * static rendering (Next treats any headers()/cookies() read as a
 * dynamic-rendering signal), silently breaking `revalidate` / build-time
 * generation for every page that shares the component. This endpoint
 * moves that one dynamic read behind a tiny client-side fetch instead,
 * so the page shell itself stays static and only this one boolean is
 * ever request-fresh.
 *
 * Deliberately returns the absolute minimum (a boolean) — no profile
 * data, no tokens, no tier — this is a UI-affordance check ("show Log In
 * vs Open App"), not an auth boundary. Nothing behind it should ever
 * trust this response for authorization; every actual protected route
 * still does its own getAuthedUser()/getShellSession() check.
 */
import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { withErrorHandling } from '@/lib/api/with-error-handling';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  const { user } = await getAuthedUser();
  return NextResponse.json(
    { signedIn: !!user },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}, 'auth/session-status');
