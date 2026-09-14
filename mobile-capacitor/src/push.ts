import { Capacitor } from '@capacitor/core';
import {
  PushNotifications,
  type Token,
  type PushNotificationSchema,
  type ActionPerformed,
} from '@capacitor/push-notifications';

/**
 * Native push bridge — the mobile counterpart to the web app's
 * usePushSubscription()/VAPID flow. Call initNativePush() once from the
 * native shell's bootstrap, same place initDeepLinkHandler() (see
 * deep-link.ts) is called from.
 *
 * Flow:
 *  1. Request permission, register with FCM (also relays to APNs on iOS
 *     — see NATIVE_APP.md for the Firebase/APNs-key setup this requires).
 *  2. `registration` fires with the platform token → POST it to
 *     /api/push/register-device, where send-native-push.ts's
 *     sendNativePushToUser() picks it up as just another device to fan
 *     out to, same as emitNotification() already does for Web Push.
 *  3. `pushNotificationActionPerformed` fires when the user taps a
 *     delivered notification (cold start, background, or foreground) —
 *     this is the actual "push bridge" NATIVE_APP.md refers to. The
 *     payload's `data.url` is the same relative ctaUrl every other
 *     channel (in-app inbox, Web Push, SSE toast) already carries, so
 *     routing it is identical to deep-link.ts's appUrlOpen handler:
 *     navigate the existing webview, no native routing layer.
 *
 * Deliberately mirrors deep-link.ts's structure/comment style since both
 * files solve the same problem (a tap/open event → a path to navigate to)
 * for two different entry points into the app.
 */

const isNative = Capacitor.isNativePlatform();

function extractCtaPath(notification: PushNotificationSchema): string {
  // send-native-push.ts's buildMessage() always sets data.url, defaulting
  // to "/" when a trigger site omits ctaUrl — this fallback only matters
  // for a notification sent by something other than emitNotification()
  // (e.g. manual testing via the Firebase console, which has no data
  // payload at all).
  const url = notification.data?.url;
  return typeof url === 'string' && url.length > 0 ? url : '/';
}

/** Registers this device for push and wires the tap → navigate handler.
 *  No-op outside a native shell (web builds never see this module). */
export async function initNativePush(): Promise<void> {
  if (!isNative) return;

  const permStatus = await PushNotifications.checkPermissions();
  if (permStatus.receive !== 'granted') {
    const requested = await PushNotifications.requestPermissions();
    if (requested.receive !== 'granted') return; // user declined — nothing more to do
  }

  await PushNotifications.register();

  PushNotifications.addListener('registration', (token: Token) => {
    fetch('/api/push/register-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token.value,
        platform: Capacitor.getPlatform(), // 'ios' | 'android'
      }),
      // credentials default to same-origin, which is what we want here —
      // this fetch runs inside the webview pointed at vantrix.app, so the
      // user's existing session cookie is sent automatically.
    }).catch((err) => {
      console.warn('push: register-device failed', err);
    });
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.warn('push: registration failed', err);
  });

  // Notification tap — the actual push → deep-link bridge. Fires for cold
  // start (app was killed), background (app resumes), and foreground
  // (app already open) taps alike; unlike appUrlOpen in deep-link.ts,
  // Capacitor normalizes all three into this one listener.
  PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
    const path = extractCtaPath(action.notification);
    window.location.href = path;
  });
}
