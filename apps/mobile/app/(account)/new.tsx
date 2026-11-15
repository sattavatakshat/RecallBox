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
      setLeaving(true);
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
  return <Screen compact>
    <TextAction label="Back" onPress={() => router.back()}/>
    <Type variant="eyebrow" muted>QUICK NOTE</Type>
    <Type variant="section">Keep a thought.</Type>
    <Type muted>Capture it now. Give it a name later if you like.</Type>
    <Input label="Title (optional)" value={title} onChangeText={setTitle}
      maxLength={240} editable={!locked && !busy} placeholder="A name for this thought"/>
    <Input label="Your note" value={content} onChangeText={setContent}
      maxLength={100000} multiline autoFocus={!locked}
      textAlignVertical="top" style={{minHeight: 250}} editable={!locked && !busy}
      placeholder="What do you want to remember?"/>
    {!!error && <Notice kind="error">{error}</Notice>}
    {locked && !busy && <Notice>
      The save isn't confirmed. Retry uses the same request so it won't create a duplicate.
    </Notice>}
    <Button label={locked ? 'Retry this save' : 'Save note'} busy={busy}
      disabled={!content.trim()} onPress={() => void save()}/>
    <Type muted variant="caption">No category or collection needed.</Type>
  </Screen>;
}
