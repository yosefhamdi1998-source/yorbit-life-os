import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config for Yorbit. @capacitor/core, cli, ios, and android
 * are installed. The ios/ platform can only be generated on macOS (Xcode
 * is required) - see codemagic.yaml for the cloud build pipeline that
 * handles this without needing a local Mac. android/ can be generated
 * locally: `npm run build && npx cap add android`.
 */
const config: CapacitorConfig = {
  // Change this only now, never after either store has a live listing —
  // the app ID is permanent the moment it's submitted; a later rename
  // means shipping a brand-new app and losing every existing user.
  appId: 'app.yorbit',
  appName: 'Yorbit',
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
    // Matches the app's dark background so launch doesn't flash light
    backgroundColor: '#0F131A',
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
      backgroundColor: '#0F131A',
      showSpinner: false,
    },
    StatusBar: {
      // DARK == light text, which is what a dark UI needs
      style: 'DARK',
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