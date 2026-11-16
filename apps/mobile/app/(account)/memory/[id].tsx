import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, ImageURISource, Linking, Modal, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { ApiError, Memory, memoriesApi } from '../../../src/api';
import { apiURL } from '../../../src/config';
import { useSession } from '../../../src/session';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { errorMessage, useMemories } from '../../../src/memories';
import { Button, Input, Notice, Screen, TextAction, Type, usePalette } from '../../../src/ui';

export default function MemoryDetail() {
  const {id, saved} = useLocalSearchParams<{id: string; saved?: string}>();
  const store = useMemories();
  const p = usePalette();
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
  const [imageSource,setImageSource] = useState<ImageURISource | null>(null);
  const [imageError,setImageError] = useState(false);
  const [viewingImage, setViewingImage] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showSourceDetails, setShowSourceDetails] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const opening = useRef(false);
  const dirty = Boolean(base && (title !== base.title || content !== base.content || collection !== base.collection));
  const release = usePreventRemove(dirty && !leaving, ({repeat}) => {
    if (busy) { Alert.alert('Saving changes', 'Wait for the request to finish.'); return; }
    Alert.alert('Leave your draft?', 'Your unsaved edits will be discarded.', [
      {text: 'Keep editing', style: 'cancel'},
      {text: 'Discard edits', style: 'destructive', onPress: () => { setLeaving(true); release(); repeat(); }},
    ]);
  });
  function failed(cause: unknown) {
    setError(base?.kind === 'link' && cause instanceof ApiError && cause.status === 422
      ? 'Use a complete http:// or https:// link without spaces or sign-in credentials.'
      : errorMessage(cause));
    if (cause instanceof ApiError && cause.code === 'version_conflict' && cause.current) setConflict(cause.current);
    if (cause instanceof ApiError && (cause.status === 404 || cause.status === 410)) setUnavailable(true);
  }
  async function load(background = false) {
    if (!id || opening.current) return;
    opening.current = true;
    if (!background) {setBusy(true); setError('');}
    try {
      const note = await store.get(id);
      setBase(note); setTitle(note.title); setContent(note.content); setCollection(note.collection); setUnavailable(false);
    } catch (cause) { if (!background) failed(cause); }
    finally { opening.current = false; if (!background) setBusy(false); }
  }
  useFocusEffect(useCallback(() => { if (!base) void load(); }, [id, base, store.get]));
  useEffect(() => {
    let active=true;
    setImageSource(null);setImageError(false);setViewingImage(false);
    if(base?.kind==='image' && ['ready','metadata_only'].includes(base.processing_state)) {
      void authorized(async token => ({uri:`${apiURL()}/v1/memories/${base.id}/asset`,headers:{Authorization:`Bearer ${token}`},cache:'reload' as const}))
        .then(source => {if(active) setImageSource(source);}).catch(() => {if(active) setImageError(true);});
    }
    return () => {active=false;};
  }, [base?.id,base?.kind,base?.processing_state]);
  useEffect(() => {
    if (!base || !['queued','processing'].includes(base.processing_state) || dirty || editing) return;
    // Quiet polling must not disable a reader's controls or flash a loader.
    const timer = setInterval(() => void load(true), 4000);
    return () => clearInterval(timer);
  }, [base?.processing_state, dirty, editing, id]);
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
      if ('title' in fields || 'content' in fields || 'collection' in fields) setEditing(false);
      setNotice('Saved to RecallBox.');
    } catch (cause) { failed(cause); }
    finally { setBusy(false); }
  }
  function confirmDelete() {
    if (!base || busy) return;
    Alert.alert('Delete this memory?', 'It will leave your library and disappear from your other devices after sync.', [
      {text: 'Keep memory', style: 'cancel'},
      {text: 'Delete memory', style: 'destructive', onPress: () => void (async () => {
        setBusy(true); setError('');
        try { await store.remove(id, base.version); setLeaving(true); release(); router.replace('/(account)'); }
        catch (cause) { failed(cause); }
        finally { setBusy(false); }
      })()},
    ]);
  }
  async function openOriginal() {
    if (!base || (base.kind !== 'link' && base.kind !== 'url') || !/^https?:\/\/\S+$/i.test(base.content)) {
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
  const hasSource = Boolean(base && (base.source_url || ((base.kind === 'link' || base.kind === 'url') && base.content)));
  const isPending = base?.processing_state === 'queued' || base?.processing_state === 'processing';
  const hasReadableContent = Boolean(base && (base.extracted_text.trim() || (base.kind === 'note' && base.content.trim())));
  const origin = base?.source_url
    ? base.source_url.replace(/^https?:\/\//i,'').split('/')[0]
    : base?.kind === 'note' ? 'Your note'
      : base?.kind === 'pdf' ? 'Saved document'
      : base?.kind === 'image' ? 'Saved photo' : 'Saved source';
  const glyph = base?.kind === 'note' ? '≡' : base?.kind === 'pdf' ? '▤'
    : base?.kind === 'image' ? '▧' : '↗';
  return <Screen compact>
    <TextAction label="← Library" onPress={() => router.replace('/(account)')}/>
    {base && <View importantForAccessibility="no-hide-descendants" style={{
      height:156,borderRadius:22,backgroundColor:p.surfaceMuted,
      alignItems:'center',justifyContent:'center'}}>
      <Type style={{fontSize:54,color:p.accent}}>{glyph}</Type>
    </View>}
    <Type muted variant="caption">{origin}{base
      ? ' · Saved '+new Date(base.created_at).toLocaleDateString(undefined,
        {day:'numeric',month:'short',year:'numeric'})
      : ''}</Type>
    <Type title>{base
      ? (base.title || (base.kind === 'note' ? 'A little thought.' : 'Something worth keeping.'))
      : unavailable ? 'Memory unavailable.' : 'Opening your memory…'}</Type>
    {!!notice && <Notice kind="success">{notice}</Notice>}
    {!!error && <Notice kind="error">{error}</Notice>}
    {!base && !busy && !unavailable && <Button label="Try again" onPress={() => void load()}/>}
    {base && <>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        <View style={{borderRadius:20,paddingVertical:7,paddingHorizontal:13,
          backgroundColor:p.surfaceMuted}}>
          <Type variant="caption">{base.kind === 'url' || base.kind === 'link'
            ? 'Link' : base.kind === 'pdf' ? 'PDF' : base.kind === 'image'
              ? 'Photo' : 'Note'}</Type>
        </View>
        {base.processing_state === 'metadata_only' &&
          <View style={{borderRadius:20,paddingVertical:7,paddingHorizontal:13,
            backgroundColor:p.surfaceMuted}}><Type variant="caption">Link or preview only</Type></View>}
      </View>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        <TextAction label={base.starred ? '★ Starred' : '☆ Star'}
          disabled={busy || unavailable || Boolean(conflict)}
          onPress={() => void update({starred: !base.starred})}/>
        <TextAction label="Add to collection" disabled={busy || unavailable || Boolean(conflict)}
          onPress={() => router.push({pathname:'/(account)/add-to-collection',params:{memoryId:id}})}/>
        <TextAction label={editing ? 'Editing' : 'Edit'} disabled={busy || unavailable || editing}
          onPress={() => setEditing(true)}/>
        <TextAction label={showMoreActions ? 'Fewer options' : 'More'}
          onPress={() => setShowMoreActions(value => !value)}/>
      </View>
      <View style={{padding:18,borderRadius:18,backgroundColor:p.surfaceMuted,gap:9}}>
        <Type variant="section">What we have</Type>
        <Type muted variant="caption">{base.kind === 'note'
          ? 'Your original note is preserved.'
          : base.processing_state === 'metadata_only'
            ? 'Only the original source and its available preview were saved.'
            : base.processing_state === 'ready'
              ? 'Text was extracted from the accessible source.'
              : 'The source is saved, but extraction is not complete.'}</Type>
        <Type variant="label">{base.kind === 'note' ? 'Your original writing'
          : base.processing_state === 'metadata_only' ? 'Limited source coverage'
          : base.processing_state === 'ready' ? 'Available source text'
          : 'Source details pending'}</Type>
      </View>
      {isPending && <Notice>
        Your source was saved. It's still being processed and is available in Recently Captured.
      </Notice>}
      {base.processing_state === 'failed' && <Notice kind="error">
        We kept your source, but couldn't finish processing it. Retry below.
      </Notice>}
      {base.kind === 'image' && imageSource && !imageError && <>
        <Pressable accessibilityRole="button" accessibilityLabel="View saved photo full screen"
          onPress={() => setViewingImage(true)} style={({pressed}) => ({
            opacity:pressed ? 0.78 : 1,borderRadius:18,overflow:'hidden',
          })}>
          <Image accessibilityLabel="Saved photo preview" source={imageSource}
            resizeMode="contain" style={{width:'100%',height:280,borderRadius:18}}
            onError={() => setImageError(true)}/>
        </Pressable>
        <TextAction label="View photo full screen" onPress={() => setViewingImage(true)}/>
      </>}
      {imageError && <Notice>Preview unavailable. You can still open the saved original.</Notice>}
      <Modal visible={viewingImage && !!imageSource && !imageError} transparent
        animationType="fade" onRequestClose={() => setViewingImage(false)}>
        <View style={{flex:1,backgroundColor:'#101512',justifyContent:'center',
          paddingHorizontal:12,paddingTop:36,paddingBottom:24}}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close full-screen photo"
            onPress={() => setViewingImage(false)} style={{alignSelf:'flex-end',padding:16,
              minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'}}>
            <Text style={{color:'#FFFFFF',fontSize:26}}>×</Text>
          </Pressable>
          {!!imageSource && <Image accessibilityLabel="Full-screen saved photo"
            source={imageSource} resizeMode="contain" style={{width:'100%',flex:1}}
            onError={() => {setImageError(true);setViewingImage(false);}}/>}
        </View>
      </Modal>
      {base.kind === 'pdf' && <Notice>
        This PDF is saved privately. Open it in a compatible app to read or share the original.
      </Notice>}
      {base.kind === 'note' && !editing && <Type style={{lineHeight:27}}>
        {base.content || 'No note text yet.'}
      </Type>}
      {base.kind !== 'note' && !!base.extracted_text?.trim() && <View style={{gap:12}}>
        <Type variant="section">From this source</Type>
        <Type style={{lineHeight:26}}>{base.extracted_text.slice(0,6000)}</Type>
        {base.extracted_text.length > 6000 &&
          <Notice>Showing an excerpt. The full available text remains searchable.</Notice>}
      </View>}
      {base.kind !== 'note' && !hasReadableContent && !isPending && <Notice>
        {base.processing_state === 'metadata_only'
          ? 'This source is available as a saved link or file. More content was not accessible.'
          : 'There is no text preview available for this source.'}
      </Notice>}
      {hasSource && <Button variant="secondary" label="Open original source"
        disabled={busy || unavailable} onPress={() => {
          if (base.source_url) {
            void Linking.openURL(base.source_url).catch(() => setError('Unable to open the original source.'));
          } else void openOriginal();
        }}/>}
      {['image','pdf'].includes(base.kind) &&
        <Button label={base.kind === 'pdf' ? 'Open or share PDF' : 'Share original photo'}
          busy={busy} onPress={() => void original()}/>}
      {['failed','metadata_only'].includes(base.processing_state) &&
        <TextAction label="Retry getting details" disabled={busy}
          onPress={() => void retryProcessing()}/>}
      {remote && remote.version > base.version && <>
        <Notice>This memory changed on another device. Your draft remains here.</Notice>
        <TextAction label="Compare with latest" disabled={busy} onPress={() => void compare()}/>
      </>}
      <Type variant="section">Useful next steps</Type>
      <Notice>Actions that require a recipe, place or tutorial will only appear when RecallBox can verify that information. Star or organize this memory anytime.</Notice>
      {editing && <View style={{gap:16}}>
        <Type variant="section">Edit memory</Type>
        <Input label="Title" value={title} onChangeText={setTitle} maxLength={240} editable={!busy}/>
        <Input label="Collection (optional)" value={collection} onChangeText={setCollection}
          maxLength={80} editable={!busy} placeholder="Travel, Reading, Ideas"/>
        {(base.kind === 'note' || base.kind === 'link' || base.kind === 'url') &&
          <Input label={base.kind === 'note' ? 'Note' : 'Original URL'} value={content}
            onChangeText={setContent} maxLength={base.kind === 'note' ? 100000 : 4096}
            autoCapitalize={base.kind === 'note' ? 'sentences' : 'none'}
            autoCorrect={base.kind === 'note'} multiline
            textAlignVertical="top" style={{minHeight:base.kind === 'note' ? 220 : 70}} editable={!busy}/>}
        {conflict && <View style={{gap:12}}>
          <Type variant="section">A newer version exists</Type>
          <Type muted>{conflict.title || 'Untitled memory'}</Type>
          <Notice>Your draft remains above. Review before saving.</Notice>
          <Button variant="secondary" label="Use newer version as my base" disabled={busy}
            onPress={() => {setBase(conflict);setConflict(null);setError('');}}/>
          <TextAction label="Discard draft and load latest" disabled={busy} onPress={() =>
            Alert.alert('Discard your draft?', 'Your unsaved changes will be lost.', [
              {text:'Keep draft',style:'cancel'},
              {text:'Use latest',onPress:()=>{setBase(conflict);setTitle(conflict.title);
                setContent(conflict.content);setCollection(conflict.collection);setConflict(null);setError('');}},
            ])}/>
        </View>}
        <Button label="Save changes" busy={busy}
          disabled={!dirty || unavailable || Boolean(conflict) ||
            ((base.kind === 'note' || base.kind === 'link' || base.kind === 'url') && !content.trim())}
          onPress={() => void update(base.kind === 'note' || base.kind === 'link' || base.kind === 'url'
            ? {title, content, collection} : {title, collection})}/>
        <TextAction label="Cancel editing" disabled={busy} onPress={() => {
          if (dirty) {
            Alert.alert('Discard changes?', 'Your unsaved edits will be lost.',[
              {text:'Keep editing',style:'cancel'},
              {text:'Discard',style:'destructive',onPress:()=>{
                setTitle(base.title);setContent(base.content);setCollection(base.collection);setEditing(false);}},
            ]);
          } else setEditing(false);
        }}/>
      </View>}
      {unavailable && <Notice>This memory is unavailable. Your draft has not been discarded.</Notice>}
      <TextAction label={showSourceDetails ? 'Hide source details' : 'Source details'}
        onPress={() => setShowSourceDetails(current => !current)}/>
      {showSourceDetails && <View style={{gap:8}}>
        <Type muted variant="caption">Type: {base.kind}</Type>
        <Type muted variant="caption">Processing: {base.processing_state.replace('_',' ')}</Type>
        <Type muted variant="caption">Version: {base.version}</Type>
        {!!base.processing_error && <Notice kind="error">{base.processing_error}</Notice>}
      </View>}
      {showMoreActions && <View style={{gap:8,paddingTop:8}}>
        <Type variant="section">More options</Type>
        <TextAction label={base.archived ? 'Restore from archive' : 'Archive memory'}
          disabled={busy || unavailable || Boolean(conflict) || dirty}
          onPress={() => void update({archived: !base.archived})}/>
        <TextAction label="Delete memory" disabled={busy || unavailable || dirty}
          onPress={confirmDelete}/>
      </View>}
    </>}
  </Screen>;
}
