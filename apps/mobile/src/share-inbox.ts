import {useCallback, useEffect, useState} from 'react';
import {AppState, Platform} from 'react-native';
import {requireOptionalNativeModule} from 'expo';
import {apiURL} from './config';

type Entry = {key: string; kind: 'url' | 'text' | 'image' | 'pdf'; title: string;
  error: string; created: number; blocked: boolean};
type NativeInbox = {
  setShareSession?: (origin: string, owner: string, access: string, expires: number) => Promise<boolean>;
  clearShareSession?: () => Promise<boolean>;
  listShares?: (owner: string) => Promise<string>;
  retryShares?: (owner: string) => Promise<boolean>;
  discardShare?: (key: string, owner: string) => Promise<boolean>;
  addListener?: (name: string, listener: () => void) => {remove: () => void};
};
const native = Platform.OS === 'android'
  ? requireOptionalNativeModule<NativeInbox>('RecallBoxCallback') : null;
let bridgeQueue: Promise<unknown> = Promise.resolve();
function serialize(operation: () => Promise<unknown>) {
  const result = bridgeQueue.then(operation);
  bridgeQueue = result.catch(() => undefined);
  return result;
}

/** Access token only. The existing JS/SecureStore flow remains the sole refresh consumer. */
export async function publishShareSession(owner: string, access: string, expires: number,
  valid: () => boolean) {
  try { await serialize(async () => {if(valid()) await native?.setShareSession?.(apiURL(),owner,access,expires);}); }
  catch { /* A failed/older share bridge must not break existing authentication. */ }
}
export async function clearShareSession(valid: () => boolean) {
  try { await serialize(async () => {if(valid()) await native?.clearShareSession?.();}); }
  catch { /* Server logout still revokes the native access token. */ }
}

/** Only encrypted native shares are included; in-app drafts are not a durable outbox. */
export function useShareInbox(owner: string | null | undefined, onChange?: () => void | Promise<void>) {
  const [items,setItems] = useState<Entry[]>([]);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const refresh = useCallback(async () => {
    if (!native?.listShares || !owner) {setItems([]);return;}
    try {
      const value: unknown = JSON.parse(await native.listShares(owner));
      if (!Array.isArray(value)) throw new Error('Invalid inbox');
      setItems(value.filter((item): item is Entry => item && typeof item === 'object' &&
        typeof item.key === 'string' && typeof item.kind === 'string' && typeof item.title === 'string'));
      setError('');
    } catch {setError('Could not read the device share inbox. Its saved content has not been discarded.');}
  },[owner]);
  useEffect(() => {
    let active = true;
    const read = () => { if(active) void refresh(); };
    read();
    const event = native?.listShares
      ? native.addListener?.('shareInboxChanged',() => {read();void onChange?.();}) : undefined;
    const app = AppState.addEventListener('change',state => {if(state === 'active') read();});
    return () => {active=false;event?.remove();app.remove();};
  },[refresh,onChange]);
  const retry = useCallback(async () => {
    if (busy || !native?.retryShares || !owner) return;
    setBusy(true);
    try {await native.retryShares(owner);await refresh();}
    catch {setError('Retry could not be scheduled. Your encrypted shares remain on this device.');}
    finally {setBusy(false);}
  },[busy,refresh,owner]);
  const discard = useCallback(async (key: string) => {
    try {
      if (!owner || !native?.discardShare || !(await native.discardShare(key,owner))) {
        setError('This share is being synced or could not be removed. Try again after it finishes.');return;
      }
      await refresh();
    } catch {setError('The device copy could not be removed. Your saved share has been retained.');}
  },[refresh,owner]);
  return {items,error,busy,refresh,retry,discard,supported:Boolean(native?.listShares)};
}
