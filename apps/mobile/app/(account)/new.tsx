import React, { useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { router, usePreventRemove } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { ApiError } from '../../src/api';
import { errorMessage, useMemories } from '../../src/memories';
import { Button, Input, Notice, Screen, TextAction, Type, usePalette } from '../../src/ui';

export default function NewNote() {
  const {create, finishCapture} = useMemories();
  const palette = usePalette();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef<{key: string; title: string; content: string} | null>(null);
  const [locked, setLocked] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const release = usePreventRemove(Boolean(title || content) && !leaving, ({repeat}) => {
    if (busy) { Alert.alert('Save in progress', 'Wait for the save to finish before leaving.'); return; }
    Alert.alert(locked ? 'Save not confirmed' : 'Leave this draft?', locked
      ? 'The server may have saved this note. Retry safely here, or check your inbox before creating it again.'
      : 'This draft is only on this screen. Leaving discards it.', [
      {text: 'Keep writing', style: 'cancel'},
      {text: 'Leave', style: 'destructive', onPress: () => { setLeaving(true); release(); repeat(); }},
    ]);
  });
  async function save() {
    if (busy || !content.trim()) return;
    setBusy(true); setError('');
    if (!attempt.current) attempt.current = {key: Crypto.randomUUID(), title, content};
    setLocked(true);
    try {
      const note = await create({title: attempt.current.title, content: attempt.current.content}, attempt.current.key);
      await finishCapture(note);
      setLeaving(true);
      release();
      router.dismissTo('/(account)');
    } catch (cause) {
      setError(errorMessage(cause));
      // Definitive validation/auth rejection did not create a note. Network/5xx
      // ambiguity keeps the original request+key frozen for an identical retry.
      if (cause instanceof ApiError && [400, 401, 413, 422].includes(cause.status)) {
        attempt.current = null; setLocked(false);
      }
    } finally { setBusy(false); }
  }
  return <Screen compact>
    <View style={{alignItems: 'center', marginBottom: 12}}><View style={{width: 38, height: 4, borderRadius: 8, backgroundColor: palette.line}} /></View>
    <TextAction label="Close note composer" onPress={() => router.back()}/>
    <Type variant="section">A thought worth keeping.</Type>
    <Input label="Title" value={title} onChangeText={setTitle}
      maxLength={240} editable={!locked && !busy} placeholder="Give it a name"/>
    <Input label="Your note" value={content} onChangeText={setContent}
      maxLength={100000} multiline autoFocus={!locked}
      textAlignVertical="top" style={{minHeight: 250}} editable={!locked && !busy}
      placeholder="Write anything..."/>
    {!!error && <Notice kind="error">{error}</Notice>}
    {locked && !busy && <Notice>
      The save isn't confirmed. Retry uses the same request so it won't create a duplicate.
    </Notice>}
    <Button label={locked ? 'Retry this save' : 'Save note'} busy={busy}
      disabled={!content.trim()} onPress={() => void save()}/>
    <Type muted variant="caption">Title is optional. Your note is only marked saved after confirmation.</Type>
  </Screen>;
}
