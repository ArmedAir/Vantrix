/**
 * src/lib/push/send-native-push.ts
 *
 * Native mobile push (FCM) — the counterpart to send-push.ts's Web Push
 * sender, for the Capacitor-wrapped iOS/Android shells (mobile-capacitor/).
 * Same trigger sites (emitNotification()) call this in parallel with
 * sendPushToUser(); a user with both a browser subscription and the
 * native app installed gets both, deduped naturally since each channel
 * only fans out to the devices actually registered on it.
 *
 * Uses firebase-admin's messaging API rather than raw APNs HTTP/2 + a
 * hand-rolled provider JWT — one protocol for both platforms as long as
 * the iOS build is also registered with Firebase (GoogleService-Info.plist
 * + an APNs auth key uploaded to the Firebase console; see NATIVE_APP.md).
 * FCM relays to APNs under the hood for iOS tokens automatically.
 *
 * The `data` payload always carries `url` (the same relative ctaUrl every
 * other channel gets) so the native tap handler
 * (mobile-capacitor/src/push.ts's `pushNotificationActionPerformed`
 * listener) can navigate the webview to the right screen without any
 * native routing layer — same "the whole app is a webview" model the
 * Tauri/Capacitor deep-link handlers already use for cold-start links.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { env } from '@/env';

// Lazy import — firebase-admin does non-trivial module-load work
// (protobuf/grpc setup) that every request importing this module
// shouldn't pay for on deploys that haven't configured native push at all.
type FirebaseMessaging = typeof import('firebase-admin/messaging');
let messagingModule: FirebaseMessaging | null = null;
let firebaseConfigured: boolean | null = null; // null = not yet attempted

async function ensureFirebaseConfigured(): Promise<boolean> {
  if (firebaseConfigured !== null) return firebaseConfigured;

  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    firebaseConfigured = false;
    return false;
  }

  try {
    const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON.trim();
    // Accept either raw JSON (starts with '{') or base64-encoded JSON —
    // base64 is friendlier for pasting a multi-line key into most secret
    // managers/.env files without escaping newlines inside the PEM block.
    const json = raw.startsWith('{')
      ? raw
      : Buffer.from(raw, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(json) as Record<string, unknown>;

    const { initializeApp, getApps, cert } = await import('firebase-admin/app');
    if (getApps().length === 0) {
      initializeApp({ credential: cert(serviceAccount as never) });
    }
    messagingModule = await import('firebase-admin/messaging');
    firebaseConfigured = true;
  } catch (err) {
    logger.error('push:native:firebase-init-failed', { error: String(err) });
    firebaseConfigured = false;
  }

  return firebaseConfigured;
}

export interface NativePushPayload {
  title: string;
  body: string;
  /** Path (not full URL) to open/focus on tap, e.g. "/chat/abc123". */
  url?: string;
  /** Dedup/collapse key — matches send-push.ts's `tag`, mapped to
   *  Android's notification channel/collapse behavior. */
  tag?: string;
  data?: Record<string, unknown>;
}

interface SendResult {
  sent: number;
  failed: number;
  invalidated: number;
}

const MAX_TITLE_LEN = 100;
const MAX_BODY_LEN = 180;

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

type TokenRow = { id: string; user_id: string; platform: 'ios' | 'android'; token: string };

/** FCM data-message values must all be strings — flatten arbitrary
 *  metadata down to string form the same way ctaUrl/type already are. */
function stringifyData(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return out;
}

/** Builds one FCM message for one token. Notification block drives the OS
 *  tray entry; data block is what the tap handler reads to route the
 *  ctaUrl — kept on both so a backgrounded/killed app still shows a
 *  system notification (data-only messages don't render UI on their own
 *  when the app isn't running). */
function buildMessage(token: string, payload: NativePushPayload) {
  const data = stringifyData({ url: payload.url ?? '/', ...(payload.data ?? {}) });
  return {
    token,
    notification: {
      title: truncate(payload.title, MAX_TITLE_LEN),
      body: truncate(payload.body, MAX_BODY_LEN),
    },
    data,
    android: {
      // Same collapse semantics as Web Push's `tag`: a new push with the
      // same key replaces the old one in the tray instead of stacking.
      collapseKey: payload.tag,
      notification: { tag: payload.tag },
    },
    apns: {
      payload: {
        aps: {
          // Web Push's `tag` maps to APNs' thread-id for tray grouping —
          // closest native equivalent, not a true replace-in-place.
          'thread-id': payload.tag,
        },
      },
    },
  };
}

/** True for FCM's permanent-failure error codes — token was uninstalled,
 *  the app was uninstalled, or the token belongs to a different Firebase
 *  project than the one we're sending from. Anything else (quota,
 *  transient network) is left alone so the next send retries it, mirroring
 *  send-push.ts's 404/410 vs. everything-else split for Web Push. */
function isPermanentFailure(errorCode: string | undefined): boolean {
  return (
    errorCode === 'messaging/registration-token-not-registered' ||
    errorCode === 'messaging/invalid-registration-token' ||
    errorCode === 'messaging/invalid-argument'
  );
}

async function dispatchOne(
  row: TokenRow,
  payload: NativePushPayload,
  messaging: ReturnType<FirebaseMessaging['getMessaging']>,
  result: SendResult,
): Promise<void> {
  try {
    await messaging.send(buildMessage(row.token, payload));
    result.sent += 1;
    void supabaseAdmin
      .from('device_push_tokens')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', row.id);
  } catch (err) {
    result.failed += 1;
    const errorCode = (err as { errorInfo?: { code?: string } })?.errorInfo?.code;
    if (isPermanentFailure(errorCode)) {
      result.invalidated += 1;
      void supabaseAdmin
        .from('device_push_tokens')
        .update({ invalid_at: new Date().toISOString() })
        .eq('id', row.id);
    } else {
      logger.warn('push:native:send:failed', { userId: row.user_id, errorCode, error: String(err) });
    }
  }
}

/** Send a native push to every active (non-invalidated) device token for
 *  a user, across all of their devices. Safe to call even if native push
 *  isn't configured (no-ops) or the user has zero registered devices. */
export async function sendNativePushToUser(userId: string, payload: NativePushPayload): Promise<SendResult> {
  const result: SendResult = { sent: 0, failed: 0, invalidated: 0 };

  if (!(await ensureFirebaseConfigured()) || !messagingModule) return result;
  const messaging = messagingModule.getMessaging();

  const { data: rows, error } = await supabaseAdmin
    .from('device_push_tokens')
    .select('id, user_id, platform, token')
    .eq('user_id', userId)
    .is('invalid_at', null);

  if (error) {
    logger.error('push:native:list-failed', { userId, error: error.message });
    return result;
  }
  if (!rows || rows.length === 0) return result;

  // FCM's own per-request concurrency/quota handling is generous enough
  // (and each send() is a single lightweight HTTPS call, not local
  // encryption work like Web Push) that this doesn't need send-push.ts's
  // bounded-concurrency pool — Promise.all is fine at this volume
  // (per-user device count, not a cron-scale fan-out).
  await Promise.all(rows.map((row) => dispatchOne(row as TokenRow, payload, messaging, result)));

  return result;
}
