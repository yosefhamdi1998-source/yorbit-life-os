import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config for MoneyGlow. @capacitor/core, cli, ios, and android
 * are installed. The ios/ platform can only be generated on macOS (Xcode
 * is required) - see codemagic.yaml for the cloud build pipeline that
 * handles this without needing a local Mac. android/ can be generated
 * locally: `npm run build && npx cap add android`.
 */
const config: CapacitorConfig = {
  appId: 'app.moneyglow',
  appName: 'MoneyGlow',
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