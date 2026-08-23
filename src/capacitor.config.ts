import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config for Yoglow iOS build.
 *
 * SETUP STEPS (run in terminal after `npm run build`):
 *   1. npm install @capacitor/core @capacitor/cli @capacitor/ios
 *   2. npx cap init "Yoglow" "app.yoglow" --web-dir=dist
 *   3. npx cap add ios
 *   4. npm run build && npx cap copy ios && npx cap sync ios
 *   5. npx cap open ios   ← opens Xcode; archive & upload from there
 */
const config: CapacitorConfig = {
  appId: 'app.yoglow',
  appName: 'Yoglow',
  webDir: 'dist',

  server: {
    androidScheme: 'https',
    // Remove this block when building for production archive:
    // url: 'https://your-live-url.base44.app',
    // cleartext: false,
  },

  ios: {
    // Allows safe-area CSS env() variables to work correctly
    contentInset: 'always',
    // Match the light-mode background
    backgroundColor: '#EAF6FF',
    // Prefer the mobile layout on iPad too
    preferredContentMode: 'mobile',
    // Required for WKWebView scroll feel
    scrollEnabled: true,
    // Limoncello-style bounce scrolling
    allowsLinkPreview: false,
  },

  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1000,
      backgroundColor: '#EAF6FF',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DEFAULT',
      backgroundColor: '#00000000',
      overlaysWebView: true,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;