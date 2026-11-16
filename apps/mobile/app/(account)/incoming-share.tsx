import {useEffect, useRef, useState} from 'react';
import {Alert} from 'react-native';
import {requireOptionalNativeModule} from 'expo';
import {router} from 'expo-router';
import {memoriesApi} from '../../src/api';
import {useSession} from '../../src/session';
import {Button, Notice, Screen, TextAction, Type} from '../../src/ui';

type Share = {key: string; url: string};
type ShareState = 'loading' | 'saving' | 'saved' | 'failed';
type NativeShare = {
  peekShare: () => Promise<string | null>;
  acknowledgeShare: (key: string) => Promise<boolean>;
  finishShare: () => Promise<boolean>;
};
const native = requireOptionalNativeModule<NativeShare>('RecallBoxCallback');

export default function IncomingShare() {
  const {authorized} = useSession();
  const [item, setItem] = useState<Share | null>(null);
  const [state, setState] = useState<ShareState>('loading');
  const [error, setError] = useState('');
  const locked = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function close() {
    const returnedToSource = await native?.finishShare().catch(() => false);
    if (!returnedToSource) router.replace('/(account)');
  }
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const raw = await native?.peekShare();
        if (!raw) throw new Error('No pending share found.');
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object') throw new Error('Invalid share payload.');
        const candidate = value as Partial<Share>;
        if (typeof candidate.key !== 'string' || typeof candidate.url !== 'string'
          || !/^https?:\/\/[^\s]+$/i.test(candidate.url)) throw new Error('Invalid shared URL.');
        if (active) setItem({key: candidate.key, url: candidate.url});
      } catch {
        if (active) { setError('Shared link unavailable. You can return to RecallBox.'); setState('failed'); }
      }
    })();
    return () => { active = false; if (timeout.current) clearTimeout(timeout.current); };
  }, []);

  useEffect(() => { if (item) void save(); }, [item?.key]);
  async function save() {
    if (!item || locked.current) return;
    locked.current = true; setState('saving'); setError('');
    try {
      await authorized(access => memoriesApi.capture(access, item.url, item.key));
      // Never show Saved until the server confirmed durable storage.
      if (!(await native?.acknowledgeShare(item.key))) {
        setError('Save confirmed, but the pending share could not be cleared. Check your Library before retrying.');
        setState('failed');
        return;
      }
      setState('saved');
      timeout.current = setTimeout(() => { void close(); }, 900);
    } catch {
      setError('Save not confirmed. Retry safely reuses the same request key.');
      setState('failed');
    } finally { locked.current = false; }
  }
  function discard() {
    if (!item) { void close(); return; }
    Alert.alert('Discard shared link?', 'This link has not been saved. Discard it from this device?', [
      {text: 'Keep link', style: 'cancel'},
      {text: 'Discard', style: 'destructive', onPress: () => { void (async () => {
        if (await native?.acknowledgeShare(item.key)) await close();
        else setError('Could not remove the pending share. Please retry.');
      })(); }},
    ]);
  }
  return <Screen compact>
    <Type variant="section">{state === 'saved' ? 'Saved to RecallBox' : 'Saving shared link'}</Type>
    {state === 'saved' ? <Type>✓ Saved securely. Returning to your app…</Type>
      : <Type muted>Keep it now. Organize it later.</Type>}
    {item && state !== 'saved' && <Type numberOfLines={3}>{item.url}</Type>}
    {!!error && <Notice kind="error">{error}</Notice>}
    {state === 'saving' && <Notice>Saving your shared link…</Notice>}
    {state === 'failed' && <Button label="Retry saving" disabled={!item} onPress={() => void save()}/>}
    {state !== 'saved' && <TextAction label={item ? 'Discard shared link' : 'Back to RecallBox'} onPress={discard}/>}
  </Screen>;
}
