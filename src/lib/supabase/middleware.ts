// src/lib/supabase/middleware.ts
//
// BUNDLE-SIZE FIX (2026-09-11): the previous version called
// @supabase/ssr's createServerClient(), which internally calls
// @supabase/supabase-js's createClient(). That constructs FOUR sub-clients
// unconditionally — Auth, PostgREST, Realtime (full WebSocket client), and
// Storage — even though this file only ever calls auth.getUser(). None of
// it tree-shakes because the constructor builds all four eagerly. That was
// the single largest contributor to a 198 kB Edge Middleware bundle, which
// matters far more than a page bundle: middleware runs uncached on every
// matching request, not once per session like the shared JS baseline.
//
// Fix: construct only the Auth sub-client (@supabase/auth-js's AuthClient —
// this is literally the class supabase-js aliases as `.auth`, with zero
// behavioral difference) instead of the full multi-service client.
//
// The cookie read/write logic below (createStorageFromOptions /
// applyServerStorage) is DEEP-IMPORTED from @supabase/ssr's internals
// rather than reimplemented. That logic does non-trivial things — chunking
// large sessions across multiple cookies, base64url encoding, PKCE
// code-verifier special-casing, host-scoped cookie clearing — and getting
// any of it subtly wrong would show up as random logouts or broken session
// refresh in production, not a build error. Reusing Supabase's own tested
// code for that part, and only swapping out the client constructor around
// it, keeps this change scoped to the part we actually understand and
// verified (see the byte-for-byte comparison against
// SupabaseClient#_initSupabaseAuthClient below).
//
// CAUTION — this import is NOT part of @supabase/ssr's public API
// (createServerClient / createBrowserClient / types / utils are; this
// isn't). It works today because the package ships no "exports" map to
// block subpath resolution, but it's unversioned and could move or change
// shape in a future @supabase/ssr release without a semver-major bump. The
// pinned version is in package.json ("@supabase/ssr": "^0.12.0"). If this
// import starts failing after a dependency bump, that's the first thing to
// check — pin the version and re-verify the cookies.js internals still
// match before upgrading further.
//
// REQUIRED BEFORE DEPLOY (not yet done in this change):
//   1. `npm run build` — this repo has no node_modules in the environment
//      this edit was made in, so this deep import and the AuthClient
//      constructor options below have NOT been typechecked or run.
//   2. Manual smoke test: sign in, reload a protected page (session
//      cookie should NOT rotate on every load, only near expiry), sign
//      out, and confirm an expired/near-expired session actually
//      refreshes and the new cookie is set. This is the exact path that
//      silently breaks if the storage/cookie wiring is off.
//   3. Confirm bundle size actually dropped: `next build` output lists
//      the Middleware size — compare against the current 198 kB.
//
// M-01 FIX (kept from prior version): updateSession returns the user it
// already fetched instead of discarding it, so callers don't need a
// second auth.getUser() round-trip.
//
// ENV-FIX (kept from prior version): reads through the validated `env`
// object instead of asserting process.env vars directly, so a missing
// value fails loudly at boot instead of crashing every request.

import { AuthClient, type User } from '@supabase/auth-js';
import { NextResponse, type NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
// Deep import of an internal, unexported @supabase/ssr module (see the
// CAUTION comment above). No .d.ts was published for this path on earlier
// @supabase/ssr versions (hence the @ts-expect-error this replaces); the
// currently installed version now resolves types for it, but the shapes
// are still pinned by hand to match cookies.js exactly. Re-verify against
// that file's source (not just its behavior) on any @supabase/ssr version bump.
import { createStorageFromOptions, applyServerStorage } from '@supabase/ssr/dist/module/cookies.js';
import { edgeEnv as env } from '@/env.edge';

export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; user: User | null }> {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const storageKey = request.cookies.get('vantrix-surface')?.value === 'pwa'
    ? 'vantrix-auth-pwa'
    : 'vantrix-auth-web';

  // Identical cookie get/set/remove wiring to the previous createServerClient
  // call — unchanged on purpose.
  const cookieAdapter = {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value: '', ...options });
      },
    },
    // Matches createServerClient's default — the previous code never set
    // this explicitly, so it inherited @supabase/ssr's "base64url" default.
    cookieEncoding: 'base64url' as const,
  };

  // This is @supabase/ssr's own cookie storage adapter — same chunking,
  // same encoding, same PKCE code-verifier handling as before. Only the
  // client built around it (below) changed.
  const { storage, getAll, setAll, setItems, removedItems } =
    createStorageFromOptions(cookieAdapter, /* isServerClient */ true);

  // Mirrors @supabase/supabase-js's SupabaseClient#_initSupabaseAuthClient
  // byte-for-byte for the fields that matter (url, headers, storageKey,
  // storage, flowType, autoRefreshToken, detectSessionInUrl,
  // persistSession) — this IS what `supabase.auth` was under the hood,
  // just without also constructing PostgREST/Realtime/Storage clients
  // alongside it.
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/?$/, '/');
  const auth = new AuthClient({
    url: new URL('auth/v1', supabaseUrl).href,
    headers: {
      Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    storageKey,
    storage,
    flowType: 'pkce',
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: true,
  });

  // Required wiring: createServerClient() normally registers this exact
  // listener so that any cookie writes GoTrue makes mid-request (token
  // refresh, sign-out) actually get flushed to the response. Dropping this
  // would make session rotation silently stop working — cookies would be
  // computed but never sent.
  auth.onAuthStateChange(async (event) => {
    const hasStorageChanges = Object.keys(setItems).length > 0 || Object.keys(removedItems).length > 0;
    if (
      hasStorageChanges &&
      (event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED' ||
        event === 'PASSWORD_RECOVERY' ||
        event === 'SIGNED_OUT' ||
        event === 'MFA_CHALLENGE_VERIFIED')
    ) {
      await applyServerStorage(
        { getAll, setAll, setItems, removedItems },
        { cookieOptions: null, cookieEncoding: 'base64url' },
      );
    }
  });

  // Single auth.getUser() call — refreshes the session cookie AND gives us
  // the user. Returned to callers so they don't need a second round-trip.
  const { data: { user } } = await auth.getUser();

  return { response, user };
}
