import type { CapacitorConfig } from '@capacitor/cli';

// Alternate mobile path (Phase B) alongside the Tauri mobile build in
// ../desktop. Capacitor wraps the same deployed PWA (vantrix.ink) but uses
// the standard Cordova/Capacitor plugin ecosystem instead of Rust/Tauri —
// pick this route if you'd rather stay in the JS/TS toolchain end-to-end
// (e.g. easier Firebase Cloud Messaging push setup, bigger plugin catalog).
const config: CapacitorConfig = {
  appId: 'app.vantrix.mobile',
  appName: 'Vantrix',
  webDir: 'www', // offline placeholder only; server.url below is what actually loads
  server: {
    url: 'https://vantrix.ink',
    cleartext: false,
    androidScheme: 'https',
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
  },
};

export default config;
