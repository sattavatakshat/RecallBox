import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { Exchange } from './api';
import { oidc } from './config';
import { deviceId } from './device';

const KEY = 'recallbox.pkce.v1';
type Pending = {state: string; verifier: string; nonce: string; created: number};
let completing: Promise<void> | null = null;

export function callbackParams(url: string) {
  if (!url.startsWith(oidc.redirectUri+'?')) return null;
  const query = new URL(url).searchParams;
  if (query.getAll('state').length!==1 || query.getAll('code').length>1) return null;
  return {state:query.get('state') || undefined,code:query.get('code') || undefined,error:query.get('error') || undefined};
}

export async function rememberAuth(state: string, verifier: string, nonce: string) {
  await SecureStore.setItemAsync(KEY, JSON.stringify({state, verifier, nonce, created: Date.now()}),
    {keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
}

export function completeAuth(params: {state?: string; code?: string; error?: string}, signIn: (data: Exchange) => Promise<void>) {
  // Browser completion and the router deep link can arrive together.
  if (completing) return completing;
  completing = (async () => {
    const stored = await SecureStore.getItemAsync(KEY);
    if (!stored) throw new Error('This sign-in has expired. Start again.');
    const pending: Pending = JSON.parse(stored);
    if (params.error || !params.code || !params.state || params.state !== pending.state ||
        Date.now() - pending.created > 10 * 60 * 1000 || Date.now() < pending.created) {
      throw new Error('This sign-in could not be verified. Start again.');
    }
    // Consume before exchanging: an ambiguous result must never replay a code.
    await SecureStore.deleteItemAsync(KEY);
    await signIn({provider: oidc.provider, code: params.code, code_verifier: pending.verifier,
      nonce: pending.nonce, client_device_id: await deviceId(), platform: Platform.OS as 'ios' | 'android'});
  })().finally(() => { completing = null; });
  return completing;
}
