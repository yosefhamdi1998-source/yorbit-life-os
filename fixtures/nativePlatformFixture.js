import * as platform from '../src/lib/platform';
const preview = () => new URLSearchParams(window.location.search).get('scenario')?.startsWith('native-');
export const isNativeIOS = () => preview() || platform.isNativeIOS();
export const isNative = () => preview() || platform.isNative();
export const isNativeAndroid = () => !preview() && platform.isNativeAndroid();
export const isWeb = () => !isNative();
