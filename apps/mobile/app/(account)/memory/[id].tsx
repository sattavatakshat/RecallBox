import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { ApiError, Memory, memoriesApi } from '../../../src/api';
import { apiURL } from '../../../src/config';
import { useSession } from '../../../src/session';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { errorMessage, useMemories } from '../../../src/memories';
import { Button, Input, Notice, Screen, TextAction, Type } from '../../../src/ui';

export default function MemoryDetail() {
  const {id, saved} = useLocalSearchParams<{id: string; saved?: string}>();
  const store = useMemories();
  const {authorized} = useSession();
  const [base, setBase] = useState<Memory | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [collection, setCollection] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(saved === '1' ? 'Saved to RecallBox.' : '');
  const [conflict, setConflict] = useState<Memory | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const opening = useRef(false);
  const dirty = Boolean(base && (title !== base.title || content !== base.content || collection !== base.collection));
  const release = usePreventRemove(dirty, ({repeat}) => {
    if (busy) { Alert.alert('Saving changes', 'Wait for the request to finish.'); return; }
    Alert.alert('Leave your draft?', 'Your unsaved edits will be discarded.', [
      {text: 'Keep editing', style: 'cancel'},
      {text: 'Discard edits', style: 'destructive', onPress: () => { release(); repeat(); }},
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
      setBase(note); setTitle(note.title); setContent(note.content); setCollection(note.collection); setUnavailable(false);
    } catch (cause) { failed(cause); }
    finally { opening.current = false; setBusy(false); }
  }
  useFocusEffect(useCallback(() => { if (!base) void load(); }, [id, base, store.get]));
  useEffect(() => {
    if (!base || !['queued','processing'].includes(base.processing_state) || dirty) return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [base?.processing_state, dirty, id]);
  async function original() {
    if(!base || busy) return;
    setBusy(true); setError('');
    let file: File | null = null;
    let mime = 'application/octet-stream';
    try {
      await authorized(async token => {
        // Fetch with the same authorization and account-generation guard as notes.
        const response = await fetch(`${apiURL()}/v1/memories/${base.id}/asset`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
        if(!response.ok) throw new ApiError(response.status,'asset_unavailable');
        mime = response.headers.get('content-type')?.split(';')[0] || mime;
        const extension = ({'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg','image/webp':'webp'} as Record<string,string>)[mime] || 'bin';
        file = new File(Paths.cache, `recallbox-${base.id}.${extension}`);
        if (file.exists) file.delete();
        file.create();
        file.write(new Uint8Array(await response.arrayBuffer()));
      });
      if(file) await Sharing.shareAsync((file as File).uri, {mimeType:mime});
    } catch(cause) {failed(cause);}
    finally {if(file && (file as File).exists) (file as File).delete();setBusy(false);}
  }
  async function retryProcessing() {
    setBusy(true);setError('');
    try {await authorized(token => memoriesApi.retry(token,id)); await load();}
    catch(cause) {failed(cause);}
    finally {setBusy(false);}
  }
  async function compare() {
    setBusy(true); setError('');
    try { setConflict(await store.get(id)); }
    catch (cause) { failed(cause); }
    finally { setBusy(false); }
  }
  async function update(fields: {title?: string; content?: string; starred?: boolean; archived?: boolean; collection?: string}) {
    if (!base || busy) return;
    setBusy(true); setError('');
    try {
      const note = await store.edit(id, {expected_version: base.version, ...fields});
      setBase(note); setConflict(null);
      if ('content' in fields || !dirty) { setTitle(note.title); setContent(note.content); setCollection(note.collection); }
      setNotice('Saved to RecallBox.');
    } catch (cause) { failed(cause); }
    finally { setBusy(false); }
  }
  function confirmDelete() {
    if (!base || busy) return;
    Alert.alert('Delete this note?', 'It will leave your inbox and disappear from your other devices after sync.', [
      {text: 'Keep note', style: 'cancel'},
      {text: 'Delete note', style: 'destructive', onPress: () => void (async () => {
        setBusy(true); setError('');
        try { await store.remove(id, base.version); release(); router.replace('/(account)'); }
        catch (cause) { failed(cause); }
        finally { setBusy(false); }
      })()},
    ]);
  }
  const remote = store.items.find(note => note.id === id);
  return <Screen>
    <TextAction label="Back to inbox" onPress={() => router.replace('/(account)')}/>
    <Type>{base?.kind?.toUpperCase() || 'YOUR MEMORY'}</Type><Type title>{base ? (base.title || 'A little thought.') : 'Opening your memory…'}</Type>
    {!!notice && <Notice>{notice}</Notice>}{!!error && <Notice>{error}</Notice>}
    {!base && !busy && !unavailable && <Button label="Try again" onPress={() => void load()}/>}
    {base && <>
      <Type muted>Saved {new Date(base.created_at).toLocaleDateString()} · Version {base.version}</Type>
      <Notice>{base.processing_state.replace('_',' ')}{base.processing_error ? ` · ${base.processing_error}` : ''}</Notice>
      {!!base.labels.length && <Type muted>{base.labels.join(' · ')}</Type>}
      {!!base.source_url && <TextAction label="Open original source" onPress={() => void Linking.openURL(base.source_url!)}/>}
      {['image','pdf'].includes(base.kind) && <Button label="Open or share saved original" busy={busy} onPress={() => void original()}/>}
      {['failed','metadata_only'].includes(base.processing_state) && <TextAction label="Retry processing" disabled={busy} onPress={() => void retryProcessing()}/>}
      {!!base.extracted_text && <View style={{gap: 12}}><Type>Saved source content</Type><Type muted>{base.extracted_text.slice(0,6000)}</Type>{base.extracted_text.length>6000 && <Notice>Showing the first 6,000 characters. The captured text is retained for search.</Notice>}</View>}
      {remote && remote.version > base.version && <>
        <Notice>This note has changed on another device. Your draft is unchanged.</Notice>
        <TextAction label="Compare with latest" disabled={busy} onPress={() => void compare()}/>
      </>}
      {unavailable && <Notice>This note is no longer available. Your draft stays here until you leave this screen.</Notice>}
      <Input label="Title" value={title} onChangeText={setTitle} maxLength={240} editable={!busy}/>
      <Input label="Collection" value={collection} onChangeText={setCollection} maxLength={80} editable={!busy} placeholder="e.g. Travel, Reading, Ideas"/>
      <Input label="Note" value={content} onChangeText={setContent} maxLength={100000} multiline
        textAlignVertical="top" style={{minHeight: 240}} editable={!busy}/>
      {conflict && <View style={{gap: 16}}>
        <Type>Latest saved version ({conflict.version})</Type><Type>{conflict.title || 'Untitled note'}</Type><Type muted>{conflict.content}</Type>
        <Notice>Your draft remains above. Review and merge these changes before saving.</Notice>
        <Button label="Keep my draft and use this version as its base" disabled={busy} onPress={() => {
          setBase(conflict); setConflict(null); setError(''); setNotice('Draft kept. Merge any changes above, then save.');
        }}/>
        <TextAction label="Replace my draft with the latest note" disabled={busy} onPress={() => Alert.alert('Replace your draft?', 'Your current unsaved edits will be discarded.', [
          {text: 'Keep draft', style: 'cancel'}, {text: 'Use latest', onPress: () => {
          setBase(conflict); setTitle(conflict.title); setContent(conflict.content); setCollection(conflict.collection); setConflict(null); setError('');
          }},
        ])}/>
      </View>}
      <Button label="Save changes" busy={busy} disabled={!dirty || !content.trim() || unavailable || Boolean(conflict)}
        onPress={() => void update({title, content, collection})}/>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 20}}>
        <TextAction label={base.starred ? 'Unstar note' : 'Star note'} disabled={busy || unavailable || Boolean(conflict)} onPress={() => void update({starred: !base.starred})}/>
        <TextAction label={base.archived ? 'Move to inbox' : 'Archive note'} disabled={busy || unavailable || Boolean(conflict)} onPress={() => void update({archived: !base.archived})}/>
        <TextAction label="Delete note" disabled={busy || unavailable} onPress={confirmDelete}/>
      </View>
    </>}
  </Screen>;
}
