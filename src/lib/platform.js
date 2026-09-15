import { Capacitor } from '@capacitor/core';

export const isNative = () => Capacitor.isNativePlatform();
export const isNativeIOS = () => Capacitor.getPlatform() === 'ios';
export const isNativeAndroid = () => Capacitor.getPlatform() === 'android';
export const isWeb = () => !isNative();
