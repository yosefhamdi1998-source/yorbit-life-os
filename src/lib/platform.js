/**
 * Platform detection utility.
 * Detects whether the app is running inside a Capacitor native iOS/Android wrapper.
 *
 * Usage:
 *   import { isNativeIOS, isNative } from '@/lib/platform';
 *   if (isNativeIOS()) { ... }
 */

export function isNative() {
  return (
    typeof window !== 'undefined' &&
    (window.Capacitor?.isNative === true || typeof window.Capacitor?.platform === 'string')
  );
}

export function isNativeIOS() {
  return (
    typeof window !== 'undefined' &&
    window.Capacitor?.platform === 'ios'
  );
}

export function isNativeAndroid() {
  return (
    typeof window !== 'undefined' &&
    window.Capacitor?.platform === 'android'
  );
}

export function isWeb() {
  return !isNative();
}