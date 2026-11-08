import type { ExpoConfig } from 'expo/config';
const host = process.env.EXPO_PUBLIC_LINK_HOST;
const config: ExpoConfig = {
  name: 'RecallBox', slug: 'recallbox', version: '0.1.0', scheme: 'app.recallbox.mobile',
  orientation: 'default', userInterfaceStyle: 'automatic',
  ios: { bundleIdentifier: 'app.recallbox.mobile', supportsTablet: true,
    associatedDomains: host ? [`applinks:${host}`] : [] },
  android: { package: 'app.recallbox.mobile', intentFilters: host ? [{
    action: 'VIEW', autoVerify: true, category: ['BROWSABLE', 'DEFAULT'],
    data: [{ scheme: 'https', host, pathPrefix: '/auth/callback' }],
  }] : [] },
  plugins: ['./plugins/with-recallbox-callback', 'expo-router', 'expo-secure-store', 'expo-web-browser', 'expo-status-bar', 'expo-document-picker',
    ['expo-image-picker', {photosPermission: 'Choose images and screenshots to save to RecallBox.',cameraPermission: 'Take photos to save to RecallBox.',microphonePermission: false}]],
};
export default config;
