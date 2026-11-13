import React, { useCallback, useRef, useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { ApiError, Memory } from '../../../src/api';
import { errorMessage, useMemories } from '../../../src/memories';
import { Button, Input, Notice, Screen, TextAction, Type } from '../../../src/ui';

export default function MemoryDetail() {
  const {id, saved} = useLocalSearchParams<{id: string; saved?: string}>();
  const store = useMemories();
  const [base, setBase] = useState<Memory | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(saved === '1' ? 'Saved to RecallBox.' : '');
  const [conflict, setConflict] = useState<Memory | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const opening = useRef(false);
  const dirty = Boolean(base && (title !== base.title || content !== base.content));
  const release = usePreventRemove(dirty && !leaving, ({repeat}) => {
    if (busy) { Alert.alert('Saving changes', 'Wait for the request to finish.'); return; }
    Alert.alert('Leave your draft?', 'Your unsaved edits will be discarded.', [
      {text: 'Keep editing', style: 'cancel'},
      {text: 'Discard edits', style: 'destructive', onPress: () => { setLeaving(true); release(); repeat(); }},
    ]);
  });
  function failed(cause: unknown) {
    setError(errorMessage(cause));
    if (cause instanceof ApiError && cause.code === 'version_conflict' && cause.current) setConflict(cause.current);
    if (cause instanceof ApiError && (cause.status === 404 || cause.status === 410)) setUnavailable(true);
  }
  async function load() {
    if (!id || opening.current) return;
    opening.current = true; setBusy(true); setError('');
    try {
      const note = await store.get(id);
      setBase(note); setTitle(note.title); setContent(note.content); setUnavailable(false);
    } catch (cause) { failed(cause); }
    finally { opening.current = false; setBusy(false); }
  }
  useFocusEffect(useCallback(() => { if (!base) void load(); }, [id, base, store.get]));
  async function compare() {
    setBusy(true); setError('');
    try { setConflict(await store.get(id)); }
    catch (cause) { failed(cause); }
    finally { setBusy(false); }
  }
  async function update(fields: {title?: string; content?: string; starred?: boolean; archived?: boolean}) {
    if (!base || busy) return;
    setBusy(true); setError('');
    try {
      const note = await store.edit(id, {expected_version: base.version, ...fields});
      setBase(note); setConflict(null);
      if ('content' in fields || !dirty) { setTitle(note.title); setContent(note.content); }
      setNotice('Saved to RecallBox.');
    } catch (cause) { failed(cause); }
    finally { setBusy(false); }
  }
  function confirmDelete() {
    if (!base || busy) return;
    Alert.alert(base.kind === 'link' ? 'Delete this link?' : 'Delete this note?', 'It will leave your library and disappear from your other devices after sync.', [
      {text: 'Keep note', style: 'cancel'},
      {text: 'Delete note', style: 'destructive', onPress: () => void (async () => {
        setBusy(true); setError('');
        try { await store.remove(id, base.version); setLeaving(true); release(); router.replace('/(account)'); }
        catch (cause) { failed(cause); }
        finally { setBusy(false); }
      })()},
    ]);
  }
  async function openOriginal() {
    if (!base || base.kind !== 'link' || !/^https?:\/\/\S+$/i.test(base.content)) {
      setError('This saved address cannot be opened.');
      return;
    }
    try {
      await Linking.openURL(base.content);
    } catch {
      setError('Could not open the original link on this device.');
    }
  }
  const remote = store.items.find(note => note.id === id);
  return <Screen>
    <TextAction label="Back to inbox" onPress={() => router.replace('/(account)')}/>
    <Type>{base?.kind === 'link' ? 'SAVED LINK' : 'YOUR NOTE'}</Type><Type title>{base ? (base.title || (base.kind === 'link' ? 'Saved link.' : 'A little thought.')) : 'Opening your memory…'}</Type>
    {!!notice && <Notice>{notice}</Notice>}{!!error && <Notice>{error}</Notice>}
    {!base && !busy && !unavailable && <Button label="Try again" onPress={() => void load()}/>}
    {base && <>
      <Type muted>Saved {new Date(base.created_at).toLocaleDateString()} · Version {base.version}</Type>
      {remote && remote.version > base.version && <>
        <Notice>This note has changed on another device. Your draft is unchanged.</Notice>
        <TextAction label="Compare with latest" disabled={busy} onPress={() => void compare()}/>
      </>}
      {unavailable && <Notice>This note is no longer available. Your draft stays here until you leave this screen.</Notice>}
      <Input label="Title" value={title} onChangeText={setTitle} maxLength={240} editable={!busy}/>
      <Input label={base.kind === 'link' ? 'Original URL' : 'Note'} value={content} onChangeText={setContent}
        autoCapitalize={base.kind === 'link' ? 'none' : 'sentences'} autoCorrect={base.kind !== 'link'}
        maxLength={base.kind === 'link' ? 4096 : 100000} multiline={base.kind !== 'link'}
        textAlignVertical="top" style={{minHeight: base.kind === 'link' ? 56 : 240}} editable={!busy}/>
      {conflict && <View style={{gap: 16}}>
        <Type>Latest saved version ({conflict.version})</Type><Type>{conflict.title || 'Untitled note'}</Type><Type muted>{conflict.content}</Type>
        <Notice>Your draft remains above. Review and merge these changes before saving.</Notice>
        <Button label="Keep my draft and use this version as its base" disabled={busy} onPress={() => {
          setBase(conflict); setConflict(null); setError(''); setNotice('Draft kept. Merge any changes above, then save.');
        }}/>
        <TextAction label="Replace my draft with the latest note" disabled={busy} onPress={() => Alert.alert('Replace your draft?', 'Your current unsaved edits will be discarded.', [
          {text: 'Keep draft', style: 'cancel'}, {text: 'Use latest', onPress: () => {
            setBase(conflict); setTitle(conflict.title); setContent(conflict.content); setConflict(null); setError('');
          }},
        ])}/>
      </View>}
      {base.kind === 'link' && <Button label="Open original link" disabled={busy || unavailable}
        onPress={() => void openOriginal()}/>}
      <Button label="Save changes" busy={busy} disabled={!dirty || !content.trim() || unavailable || Boolean(conflict)}
        onPress={() => void update({title, content})}/>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 20}}>
        <TextAction label={base.starred ? 'Unstar note' : 'Star note'} disabled={busy || unavailable || Boolean(conflict)} onPress={() => void update({starred: !base.starred})}/>
        <TextAction label={base.archived ? 'Move to inbox' : 'Archive note'} disabled={busy || unavailable || Boolean(conflict)} onPress={() => void update({archived: !base.archived})}/>
        <TextAction label={base.kind === 'link' ? 'Delete saved link' : 'Delete note'} disabled={busy || unavailable} onPress={confirmDelete}/>
      </View>
    </>}
  </Screen>;
}
