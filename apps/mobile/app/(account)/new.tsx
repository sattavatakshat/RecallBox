import React, { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router, usePreventRemove } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { ApiError } from '../../src/api';
import { errorMessage, useMemories } from '../../src/memories';
import { Button, Input, Notice, Screen, TextAction, Type } from '../../src/ui';

export default function NewNote() {
  const {create} = useMemories();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef<{key: string; title: string; content: string} | null>(null);
  const [locked, setLocked] = useState(false);
  const release = usePreventRemove(Boolean(title || content), ({repeat}) => {
    if (busy) { Alert.alert('Save in progress', 'Wait for the save to finish before leaving.'); return; }
    Alert.alert(locked ? 'Save not confirmed' : 'Leave this draft?', locked
      ? 'The server may have saved this note. Retry safely here, or check your inbox before creating it again.'
      : 'This draft is only on this screen. Leaving discards it.', [
      {text: 'Keep writing', style: 'cancel'},
      {text: 'Leave', style: 'destructive', onPress: () => { release(); repeat(); }},
    ]);
  });
  async function save() {
    if (busy || !content.trim()) return;
    setBusy(true); setError('');
    if (!attempt.current) attempt.current = {key: Crypto.randomUUID(), title, content};
    setLocked(true);
    try {
      const note = await create({title: attempt.current.title, content: attempt.current.content}, attempt.current.key);
      release();
      router.replace({pathname: '/(account)/memory/[id]', params: {id: note.id, saved: '1'}});
    } catch (cause) {
      setError(errorMessage(cause));
      // Definitive validation/auth rejection did not create a note. Network/5xx
      // ambiguity keeps the original request+key frozen for an identical retry.
      if (cause instanceof ApiError && [400, 401, 413, 422].includes(cause.status)) {
        attempt.current = null; setLocked(false);
      }
    } finally { setBusy(false); }
  }
  return <Screen>
    <TextAction label="Back to inbox" onPress={() => router.back()}/>
    <Type>ONE THING TO KEEP</Type><Type title>A new note.</Type>
    <Input label="Title" value={title} onChangeText={setTitle} maxLength={240} editable={!locked && !busy} placeholder="Give it a name (optional)"/>
    <Input label="Note" value={content} onChangeText={setContent} maxLength={100000} multiline
      textAlignVertical="top" style={{minHeight: 240}} editable={!locked && !busy} placeholder="What would you like to remember?"/>
    {!!error && <Notice>{error}</Notice>}
    {locked && !busy && <Notice>The save is not confirmed. Retry sends the same draft with the same save key.</Notice>}
    <Button label={locked ? 'Retry this save' : 'Save to RecallBox'} busy={busy} disabled={!content.trim()} onPress={() => void save()}/>
  </Screen>;
}
