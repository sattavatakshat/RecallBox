import React, { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router, usePreventRemove } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { ApiError } from '../../src/api';
import { errorMessage, useMemories } from '../../src/memories';
import { Button, Input, Notice, Screen, TextAction, Type } from '../../src/ui';

export default function NewLink() {
  const {create} = useMemories();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const attempt = useRef<{key: string; title: string; url: string} | null>(null);
  const release = usePreventRemove(Boolean(title || url) && !leaving, ({repeat}) => {
    if (busy) {
      Alert.alert('Save in progress', 'Wait for the save to finish before leaving.');
      return;
    }
    Alert.alert('Leave this link?', locked
      ? 'The save may have succeeded. Retry here with the same key, or check your library.'
      : 'This link has not been saved. Leaving discards your draft.', [
      {text: 'Keep editing', style: 'cancel'},
      {text: 'Leave', style: 'destructive', onPress: () => { setLeaving(true); release(); repeat(); }},
    ]);
  });

  async function save() {
    if (busy || !url.trim()) return;
    setBusy(true); setError('');
    if (!attempt.current) {
      attempt.current = {key: Crypto.randomUUID(), title, url: url.trim()};
    }
    setLocked(true);
    try {
      const result = await create({
        kind: 'link', title: attempt.current.title, content: attempt.current.url,
      }, attempt.current.key);
      setLeaving(true);
      release();
      router.replace({pathname: '/(account)/memory/[id]', params: {id: result.id, saved: '1'}});
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 422
        ? 'Use a complete http:// or https:// link, without spaces or sign-in credentials.'
        : errorMessage(cause));
      // Keep the original request/key after network ambiguity to prevent double saves.
      if (cause instanceof ApiError && [400, 401, 413, 422].includes(cause.status)) {
        attempt.current = null;
        setLocked(false);
      }
    } finally { setBusy(false); }
  }

  return <Screen>
    <TextAction label="Back to save" onPress={() => router.back()}/>
    <Type>ONE LINK TO KEEP</Type>
    <Type title>Save a link.</Type>
    <Type muted>Keep the original address, then find it again whenever you need it.</Type>
    <Input label="Link" value={url} onChangeText={setUrl} keyboardType="url"
      autoCapitalize="none" autoCorrect={false} maxLength={4096}
      editable={!locked && !busy} placeholder="https://example.com/article"/>
    <Input label="Title (optional)" value={title} onChangeText={setTitle}
      maxLength={240} editable={!locked && !busy} placeholder="What’s worth remembering?"/>
    {!!error && <Notice>{error}</Notice>}
    {locked && !busy && <Notice>Save not confirmed. Retrying uses the original address and save key.</Notice>}
    <Button label={locked ? 'Retry this save' : 'Save link'} busy={busy}
      disabled={!url.trim()} onPress={() => void save()}/>
  </Screen>;
}
