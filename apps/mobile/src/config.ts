import { Platform } from 'react-native';
const origin = process.env.EXPO_PUBLIC_API_URL ?? '';
export function apiURL() {
  const url = new URL(origin);
  const loopback = ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(__DEV__ && loopback && url.protocol === 'http:')) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Configure a secure RecallBox API address.');
  }
  return url.origin;
}
export const oidc = {
  issuer: process.env.EXPO_PUBLIC_OIDC_ISSUER ?? '',
  clientId: (Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_OIDC_IOS_CLIENT_ID : process.env.EXPO_PUBLIC_OIDC_ANDROID_CLIENT_ID) ?? '',
  provider: (Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_OIDC_IOS_PROVIDER : process.env.EXPO_PUBLIC_OIDC_ANDROID_PROVIDER) ?? '',
  redirectUri: process.env.EXPO_PUBLIC_OIDC_REDIRECT_URI ?? '',
};
export const configured = Boolean(oidc.issuer.startsWith('https://') && oidc.clientId && oidc.provider && oidc.redirectUri);
