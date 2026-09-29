import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor shell around the deployed web app (https://vantrix.ink). The web
// app IS the UI; this shell adds what a browser tab can't: a real launcher
// icon, native push (FCM), verified app links, back-button handling, an
// invisible native splash, and a branded offline screen.
const config: CapacitorConfig = {
  appId: 'app.vantrix.mobile',
  appName: 'Vantrix',
  webDir: 'www', // offline.html lives here; server.url is what normally loads
  backgroundColor: '#0A0A0A', // no white flash while the WebView spins up
  server: {
    url: 'https://vantrix.ink',
    cleartext: false,
    androidScheme: 'https',
    // If vantrix.ink can't be reached (airplane mode, server down) show the
    // bundled branded page with a Retry button instead of Chrome's error page.
    errorPath: 'offline.html',
    // Only the app's own origin stays in-app; everything else (Stripe/Paddle
    // checkout, external links) opens in the system browser. Verified App
    // Links bring the user back into the app afterwards.
    allowNavigation: ['vantrix.ink', '*.vantrix.ink'],
  },
  android: {
    backgroundColor: '#0A0A0A',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
    // Lets the server tell app traffic apart in logs/analytics.
    appendUserAgent: 'VantrixApp/1.0',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    // ONE OPENING ONLY: the animated launch splash lives in the web app
    // (BootSplash plays automatically inside the shell because boot-init.js
    // detects window.Capacitor). The native layer shows NOTHING visible.
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#0A0A0A',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    Keyboard: { resize: 'native', resizeOnFullScreen: true },
    StatusBar: { style: 'DARK', backgroundColor: '#0A0A0A', overlaysWebView: false },
  },
};

export default config;
