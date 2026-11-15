import React, {useRef, useState} from 'react';
import {Alert, View} from 'react-native';
import {router, usePreventRemove} from 'expo-router';
import * as Crypto from 'expo-crypto';
import {ApiError, memoriesApi} from '../../src/api';
import {useSession} from '../../src/session';
import {errorMessage} from '../../src/memories';
import {Button, Input, Notice, Screen, TextAction, Type, usePalette} from '../../src/ui';

export default function NewLink() {
  const {authorized} = useSession();
  const palette = usePalette();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const attempt = useRef<{key: string; url: string} | null>(null);

  const release = usePreventRemove(Boolean(url.trim()) && !leaving, ({repeat}) => {
    if (busy) {
      Alert.alert('Save in progress', 'Wait for the save request to finish.');
      return;
    }
    Alert.alert(locked ? 'Save not confirmed' : 'Leave this link?', locked
      ? 'This save may already have succeeded. Retry safely or check the Library first.'
      : 'This link has not been saved. Leaving discards your entry.', [
      {text: 'Keep editing', style: 'cancel'},
      {text: 'Leave', style: 'destructive', onPress: () => {
        setLeaving(true); release(); repeat();
      }},
    ]);
  });

  async function save() {
    if (busy || !url.trim()) return;
    setBusy(true); setError('');
    if (!attempt.current) attempt.current = {key: Crypto.randomUUID(), url: url.trim()};
    const request = attempt.current;
    setLocked(true);
    try {
      // The secure capture API saves the URL durably and queues honest processing.
      // The older note-style link API stored the URL without extraction.
      const saved = await authorized(access => memoriesApi.capture(access, request.url, request.key));
      setLeaving(true);
      release();
      router.replace({pathname: '/(account)/memory/[id]', params: {id: saved.id, saved: '1'}});
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 422
        ? 'Enter a complete public http:// or https:// link without spaces or credentials.'
        : errorMessage(cause));
      // An ambiguous network result reuses the identical request and key.
      if (cause instanceof ApiError && [400, 401, 413, 422].includes(cause.status)) {
        attempt.current = null;
        setLocked(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return <Screen compact>
    <View style={{alignItems: 'center', marginBottom: 12}}><View style={{width: 38, height: 4, borderRadius: 8, backgroundColor: palette.line}} /></View>
    <TextAction label="Close link composer" onPress={() => router.back()}/>
    <Type variant="section">Save a link.</Type>
    <Type muted>Paste a public link; details can be processed later.</Type>
    <Input label="Link" value={url} onChangeText={setUrl} keyboardType="url"
      autoFocus={!locked} autoCapitalize="none" autoCorrect={false}
      maxLength={4096} editable={!busy && !locked}
      placeholder="https://..."/>
    {!!error && <Notice kind="error">{error}</Notice>}
    {locked && !busy && <Notice>
      Save not confirmed. Retry keeps the same URL and save key to avoid duplicates.
    </Notice>}
    <Button label={locked ? 'Retry this save' : 'Save link'}
      busy={busy} disabled={!url.trim()} onPress={() => void save()}/>
    <Type muted variant="caption">
      No title, tags or collection required. Some sites allow only a link or public preview.
    </Type>
  </Screen>;
}
