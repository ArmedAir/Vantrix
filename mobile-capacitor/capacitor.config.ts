import type { CapacitorConfig } from '@capacitor/cli';

// Alternate mobile path (Phase B) alongside the Tauri mobile build in
// ../desktop. Capacitor wraps the same deployed PWA (vantrix.app) but uses
// the standard Cordova/Capacitor plugin ecosystem instead of Rust/Tauri —
// pick this route if you'd rather stay in the JS/TS toolchain end-to-end
// (e.g. easier Firebase Cloud Messaging push setup, bigger plugin catalog).
const config: CapacitorConfig = {
  appId: 'app.vantrix.mobile',
  appName: 'Vantrix',
  webDir: 'public', // placeholder; server.url below overrides at runtime
  server: {
    url: 'https://vantrix.app',
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#0a0a0f',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;
