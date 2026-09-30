import type { CapacitorConfig } from '@capacitor/cli';

// The native shell loads the deployed web app (https://vantrix.ink) in a
// WebView. Everything that makes it a *native* app — push registration, deep
// links, share sheet — lives in the web app itself under src/lib/native/ and
// only activates when window.Capacitor is present (see NativeBridge in
// src/components/shell/native-bridge.tsx). It used to live in
// mobile-capacitor/src/*.ts, which the WebView never loaded: in remote-URL
// mode nothing in this folder's TypeScript ships to the device.
//
// See NATIVE_APP.md for the full native plan, store
// requirements, and what is still open.
const config: CapacitorConfig = {
  appId: 'app.vantrix.mobile',
  appName: 'Vantrix',
  webDir: 'www', // holds only the offline fallback page; server.url is what loads
  backgroundColor: '#0A0A0A', // WebView/window colour before first paint — no white flash
  // Lets the server recognise native-shell traffic (SSR-time decisions such as
  // hiding web-only checkout or the PWA install prompt) without relying on
  // client JS. boot-init.js separately detects window.Capacitor client-side.
  appendUserAgent: 'VantrixNative/1.0',
  server: {
    url: 'https://vantrix.ink',
    cleartext: false,
    androidScheme: 'https',
    // Shown when vantrix.ink can't be reached (airplane mode, DNS, outage).
    // Without this the user gets a blank #0A0A0A screen with no way forward.
    // Path is relative to webDir. On Android this page cannot call plugins.
    errorPath: 'offline.html',
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    // ONE OPENING ONLY: the animated launch splash lives in the web app
    // (BootSplash, plays automatically inside the native shell because
    // boot-init.js detects window.Capacitor). The native layer must
    // therefore show NOTHING visible: no icon, background identical to the
    // web splash base (#0A0A0A), and no minimum duration. See
    // android/app/src/main/res/values/styles.xml for the Android 12+ half.
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#0A0A0A',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    // Capacitor 8 edge-to-edge (Android 15+/targetSdk 35+ enforces it).
    // 'css' pads/insets the WebView and also injects --safe-area-inset-*.
    // DARK = light icons on our dark background.
    SystemBars: {
      insetsHandling: 'css',
      style: 'DARK',
    },
  },
};

export default config;
