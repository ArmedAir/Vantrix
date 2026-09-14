/**
 * GET /api/auth/x/callback
 *
 * Callback URI registered in the X Developer Portal:
 * https://vantrix.ink/api/auth/x/callback
 *
 * Completes the OAuth2 + PKCE exchange started by /api/auth/x/login,
 * fetches the visitor's X profile, maps it onto a Supabase auth user
 * (creating one on first sign-in), and mints a real Supabase session —
 * server-side, via cookies, the same way /auth/callback/route.ts already
 * does for the email/password PKCE flow (see that file's header for why
 * this codebase deliberately avoids relying on client-side
 * detectSessionInUrl for anything auth-critical).
 *
 * Session minting has no PKCE code of its own to exchange (there was no
 * client-side signInWithOtp() call that stashed a code_verifier for
 * this), so it uses the documented admin-generateLink -> verifyOtp
 * bridge instead: supabaseAdmin.auth.admin.generateLink({type:
 * 'magiclink'}) returns a hashed_token that a normal (non-admin) client
 * can redeem directly via supabase.auth.verifyOtp() — no second redirect
 * hop through Supabase's own /verify endpoint, no hash-fragment tokens
 * to detect client-side, just one more server-side call that sets
 * session cookies exactly like exchangeCodeForSession() does. Requires
 * Email OTP / magic link to be enabled in the Supabase project's Auth
 * settings (it is, by default).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient }              from '@/lib/supabase/server';
import { supabaseAdmin }             from '@/lib/supabase/admin';
import { ensureProfileWithReferralAttribution } from '@/lib/profile/ensure-profile';
import { logger }                    from '@/lib/logger';
import {
  getXSignInCredentials,
  exchangeCodeForToken,
  fetchXUser,
  syntheticXEmail,
} from '@/lib/auth/x-sign-in';

export const dynamic = 'force-dynamic';

const STATE_COOKIES = ['x_oauth_state', 'x_oauth_verifier', 'x_oauth_next'] as const;

function redirectWithError(origin: string, code: string): NextResponse {
  const res = NextResponse.redirect(`${origin}/login?error=${code}`);
  for (const name of STATE_COOKIES) res.cookies.delete(name);
  return res;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error'); // X sets this on user-denied consent, etc.

  const cookieState = req.cookies.get('x_oauth_state')?.value ?? null;
  const codeVerifier = req.cookies.get('x_oauth_verifier')?.value ?? null;
  const next = req.cookies.get('x_oauth_next')?.value ?? '/';

  if (oauthError) {
    logger.info('auth.x.callback.denied', { error: oauthError });
    return redirectWithError(origin, 'x_sign_in_cancelled');
  }

  if (!code || !state || !cookieState || !codeVerifier) {
    logger.warn('auth.x.callback.missing_params', { hasCode: !!code, hasState: !!state, hasCookieState: !!cookieState });
    return redirectWithError(origin, 'x_sign_in_failed');
  }

  // Anti-CSRF: the state returned by X must match the one we minted and
  // cookied in /api/auth/x/login. Constant-time comparison isn't needed
  // here (state isn't a secret the way codeVerifier is — X echoes it back
  // in a public redirect URL regardless), a plain equality check is what
  // this value is for.
  if (state !== cookieState) {
    logger.warn('auth.x.callback.state_mismatch');
    return redirectWithError(origin, 'x_sign_in_state_mismatch');
  }

  const creds = getXSignInCredentials();
  if (!creds) {
    logger.warn('auth.x.callback.not_configured');
    return redirectWithError(origin, 'x_sign_in_unavailable');
  }

  try {
    const token = await exchangeCodeForToken(creds, code, codeVerifier);
    const xUser = await fetchXUser(token.accessToken);

    const { data: existingIdentity } = await supabaseAdmin
      .from('x_oauth_identities')
      .select('user_id')
      .eq('x_user_id', xUser.id)
      .maybeSingle();

    let authUserId: string;
    let email: string;

    if (existingIdentity) {
      // Returning visitor — same account every time, keyed off X's own
      // (stable, non-reusable) numeric user id rather than username,
      // which X account holders can change.
      authUserId = existingIdentity.user_id;
      const { data: authUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(authUserId);
      if (getUserError || !authUser?.user?.email) {
        logger.error('auth.x.callback.identity_user_missing', { authUserId, error: getUserError?.message });
        return redirectWithError(origin, 'x_sign_in_failed');
      }
      email = authUser.user.email;

      await supabaseAdmin
        .from('x_oauth_identities')
        .update({
          x_username: xUser.username,
          x_name: xUser.name,
          x_avatar_url: xUser.profileImageUrl,
          last_login_at: new Date().toISOString(),
        })
        .eq('x_user_id', xUser.id);
    } else {
      // First sign-in with this X account — create a new auth user.
      // Synthetic email only: this flow never collects (or needs) a real
      // one. email_confirm: true since X's own OAuth consent already
      // establishes the visitor controls that X account, same trust
      // level a confirmed-email signup gets.
      email = syntheticXEmail(xUser.id);
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          oauth_provider: 'x',
          x_username: xUser.username,
          x_name: xUser.name,
        },
      });

      if (createError || !created?.user) {
        logger.error('auth.x.callback.create_user_failed', { error: createError?.message, xUserId: xUser.id });
        return redirectWithError(origin, 'x_sign_in_failed');
      }
      authUserId = created.user.id;

      const profile = await ensureProfileWithReferralAttribution(created.user, req);
      // Seed the avatar from X on first sign-in only — never overwrites a
      // returning user's own customization (existingIdentity branch above
      // never touches profiles at all).
      if (profile && !profile.avatar_url && xUser.profileImageUrl) {
        await supabaseAdmin.from('profiles').update({ avatar_url: xUser.profileImageUrl }).eq('id', authUserId);
      }

      const { error: insertIdentityError } = await supabaseAdmin.from('x_oauth_identities').insert({
        user_id: authUserId,
        x_user_id: xUser.id,
        x_username: xUser.username,
        x_name: xUser.name,
        x_avatar_url: xUser.profileImageUrl,
      });
      if (insertIdentityError) {
        // Not fatal to this sign-in (the auth user + profile already
        // exist and the session below will still succeed) — but the NEXT
        // sign-in with this X account won't find the mapping and will
        // create a second account. Logged loudly since that's a real
        // data problem, not a transient one.
        logger.error('auth.x.callback.identity_insert_failed', { error: insertIdentityError.message, authUserId, xUserId: xUser.id });
      }

      logger.info('auth.x.callback.new_account', { authUserId, xUserId: xUser.id });
    }

    // Mint the session. See this file's header for why generateLink +
    // verifyOtp instead of a second redirect through Supabase's /verify.
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    const hashedToken = linkData?.properties?.hashed_token;
    if (linkError || !hashedToken) {
      logger.error('auth.x.callback.generate_link_failed', { error: linkError?.message, authUserId });
      return redirectWithError(origin, 'x_sign_in_failed');
    }

    const supabase = await createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: hashedToken, type: 'magiclink' });
    if (verifyError) {
      logger.error('auth.x.callback.verify_otp_failed', { error: verifyError.message, authUserId });
      return redirectWithError(origin, 'x_sign_in_failed');
    }

    const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
    const res = NextResponse.redirect(`${origin}${safeNext}`);
    for (const name of STATE_COOKIES) res.cookies.delete(name);
    return res;
  } catch (err) {
    logger.error('auth.x.callback.unexpected_error', { error: String(err) });
    return redirectWithError(origin, 'x_sign_in_failed');
  }
}
