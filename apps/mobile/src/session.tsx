import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Account, api, ApiError, Exchange, Tokens } from './api';
const KEY = 'recallbox.refresh.v1';
const options = {keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
type Session = { account: Account | null; loading: boolean; message: string; signIn: (data: Exchange) => Promise<void>; logout: () => Promise<void>; retry: () => Promise<void>; authorized: <T>(operation: (access: string) => Promise<T>) => Promise<T> };
const Context = createContext<Session | null>(null);
export const useSession = () => { const value = useContext(Context); if (!value) throw new Error('Session missing'); return value; };
export async function deviceId() {
  let id = await SecureStore.getItemAsync('recallbox.device.v1');
  if (!id) { id = Crypto.randomUUID(); await SecureStore.setItemAsync('recallbox.device.v1', id, options); }
  return id;
}
export function SessionProvider({children}: React.PropsWithChildren) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const current = useRef<{access: string; expires: number} | null>(null);
  const generation = useRef(0);
  const refreshing = useRef<Promise<string> | null>(null);
  async function clear() {
    generation.current += 1;
    current.current = null; setAccount(null);
    await SecureStore.deleteItemAsync(KEY);
  }
  async function save(tokens: Tokens) {
    // Persist the replacement BEFORE exposing its access token to the UI.
    await SecureStore.setItemAsync(KEY, tokens.refresh_token, options);
    current.current = {access: tokens.access_token, expires: Date.now() + tokens.expires_in * 1000};
    return tokens.access_token;
  }
  function refresh(): Promise<string> {
    if (refreshing.current) return refreshing.current;
    const epoch = generation.current;
    refreshing.current = (async () => {
      const token = await SecureStore.getItemAsync(KEY);
      if (!token) throw new ApiError(401, 'authentication_required');
      // Remove consumed credential before sending. An ambiguous network failure
      // requires sign-in; replaying a potentially consumed token revokes its family.
      if (generation.current !== epoch) throw new ApiError(401, 'session_changed');
      await SecureStore.deleteItemAsync(KEY);
      try {
        const tokens = await api.refresh(token);
        if (generation.current !== epoch) throw new ApiError(401, 'session_changed');
        const accessToken = await save(tokens);
        if (generation.current !== epoch) {
          current.current = null; await SecureStore.deleteItemAsync(KEY);
          throw new ApiError(401, 'session_changed');
        }
        return accessToken;
      } catch (error) { if (generation.current === epoch) await clear(); throw error; }
    })().finally(() => { refreshing.current = null; });
    return refreshing.current;
  }
  async function access() {
    if (current.current && current.current.expires > Date.now() + 30000) return current.current.access;
    return refresh();
  }
  async function authorized<T,>(operation: (token: string) => Promise<T>): Promise<T> {
    const epoch = generation.current;
    try {
      const token = await access();
      if (generation.current !== epoch) throw new ApiError(401, 'session_changed');
      const result = await operation(token);
      if (generation.current !== epoch) throw new ApiError(401, 'session_changed');
      return result;
    } catch (error) {
      if (generation.current === epoch && error instanceof ApiError && error.status === 401) {
        await clear(); setMessage('Your session has ended. Sign in again.');
      }
      throw error;
    }
  }
  async function restore() {
    const epoch = generation.current;
    setLoading(true);
    try {
      if (refreshing.current) await refreshing.current;
      if (!current.current && !(await SecureStore.getItemAsync(KEY))) {
        if (generation.current === epoch) setAccount(null);
        return;
      }
      const restored = await api.me(await access());
      if (generation.current === epoch) {setAccount(restored); setMessage('');}
    } catch (error) {
      if (generation.current !== epoch) return;
      if (error instanceof ApiError && error.status === 401) {
        await clear(); setMessage('Your session has ended. Sign in again.');
      } else { setMessage('We could not restore your account. Check your connection and try again.'); }
    } finally { if (generation.current === epoch || !current.current) setLoading(false); }
  }
  useEffect(() => { void restore(); const subscription = AppState.addEventListener('change', state => { if (state === 'active') void restore(); }); return () => subscription.remove(); }, []);
  useEffect(() => {
    if (!account) return;
    const timer = setInterval(() => { if (AppState.currentState === 'active') void restore(); }, 9 * 60 * 1000);
    return () => clearInterval(timer);
  }, [account?.id]);
  async function signIn(data: Exchange) {
    // Let an older rotation finish before installing another account's token.
    if (refreshing.current) await refreshing.current.catch(() => undefined);
    generation.current += 1;
    const token = await save(await api.exchange(data));
    try { setAccount(await api.me(token)); setMessage(''); setLoading(false); }
    catch (error) { await clear(); throw error; }
  }
  async function logout() {
    // Keep credential if server revocation fails; allow a deliberate retry.
    await api.logout(await access()); await clear(); setMessage('Signed out on this device.');
  }
  return <Context.Provider value={{account, loading, message, signIn, logout, retry: restore, authorized}}>{children}</Context.Provider>;
}
