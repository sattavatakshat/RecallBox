import {tokens} from '../../../src/theme';
import {Icon} from '../../../src/icons';
import {useCallback, useEffect, useRef, useState} from 'react';
import {ImageViewer} from '../../../src/image-viewer';
import {AccessibilityInfo, Alert, Image, ImageURISource, Linking, Modal, Pressable, View, useWindowDimensions} from 'react-native';
import {router, useFocusEffect, useLocalSearchParams, useNavigation, usePreventRemove} from 'expo-router';
import {ApiError, Memory, memoriesApi, actionOptionsApi, ActionOption} from '../../../src/api';
import {SavedText} from '../../../src/saved-text';
import {apiURL} from '../../../src/config';
import {useSession} from '../../../src/session';
import {File, Paths} from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {errorMessage, useMemories} from '../../../src/memories';
import {Button, Divider, IconButton, Input, Notice, Screen, SheetSurface, SourcePlaceholder, TextAction, Type, usePalette} from '../../../src/ui';

export default function MemoryDetail() {
  const {id, saved} = useLocalSearchParams<{id: string; saved?: string}>();
  const navigation = useNavigation();
  // Capture the real preceding route once; subordinate screens must not change this label.
  const [backLabel] = useState(() => {
    const state = navigation.getState();
    const previous = state?.routes[(state?.index ?? 0) - 1]?.name;
    return previous === 'results' ? 'Search results' : previous === 'collection/[id]' ? 'Collection'
      : previous === 'index' || !previous ? 'Library' : 'Back';
  });
  const store = useMemories();
  const p = usePalette();
  const window = useWindowDimensions();
  const [imageAttempt, setImageAttempt] = useState(0);
  const mounted = useRef(true);
  const assetRequest = useRef<AbortController | null>(null);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;assetRequest.current?.abort();};}, []);
  const [imageRatio, setImageRatio] = useState<number | null>(null);
  const [imageLoading, setImageLoading] = useState(true);
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
  const [options, setOptions] = useState<ActionOption[]>([]);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {if (active) setReducedMotion(value);});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => {active = false;listener.remove();};
  }, []);
  const opening = useRef(false);
  const dirty = Boolean(base && (title !== base.title || content !== base.content || collection !== base.collection));
  const draftGuard = useRef(false);
  draftGuard.current = dirty || editing || busy;
  const release = usePreventRemove((dirty || busy) && !leaving, ({repeat}) => {
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
    if (cause instanceof ApiError && cause.code === 'version_conflict' && cause.current) {setConflict(cause.current);setEditing(true);}
    if (cause instanceof ApiError && (cause.status === 404 || cause.status === 410)) setUnavailable(true);
  }
  async function load(background = false) {
    if (!id || opening.current) return;
    opening.current = true;
    if (!background) {setBusy(true); setError(''); setNotice('');}
    try {
      const note = await store.get(id);
      // A request may have started before the user began editing.
      if (background && draftGuard.current) return;
      setBase(note); setTitle(note.title); setContent(note.content); setCollection(note.collection); setUnavailable(false);
    } catch (cause) { if (!background || !base) failed(cause); }
    finally { opening.current = false; setLoading(false); if (!background) setBusy(false); }
  }
  useFocusEffect(useCallback(() => { void load(true); }, [id, store.get]));
  useEffect(() => {
    let active = true;
    setOptions([]);
    if (base?.processing_state === 'ready') {
      void authorized(token => actionOptionsApi.forMemory(token, id))
        .then(result => {if (active) setOptions(result.items);}).catch(() => {});
    }
    return () => {active = false;};
  }, [id, base?.version, base?.processing_state]);
  useEffect(() => {
    let active=true;
    setImageSource(null);setImageRatio(null);setImageLoading(true);setImageError(false);setViewingImage(false);
    if(base?.kind==='image' && base.original_available !== false) {
      void authorized(async token => ({uri:`${apiURL()}/v1/memories/${base.id}/asset`,headers:{Authorization:`Bearer ${token}`},cache:'reload' as const}))
        .then(source => {if(active) setImageSource(source);}).catch(() => {if(active) setImageError(true);});
    }
    return () => {active=false;};
  }, [base?.id,base?.kind,base?.original_available,imageAttempt]);
  useEffect(() => {
    if (!base || !['queued','processing'].includes(base.processing_state) || dirty || editing) return;
    // Quiet polling must not disable a reader's controls or flash a loader.
    const timer = setInterval(() => void load(true), 4000);
    return () => clearInterval(timer);
  }, [base?.processing_state, dirty, editing, id]);
  async function original() {
    if(!base || busy) return;
    if (base.original_available === false) {setError('The saved original file is unavailable.'); return;}
    setBusy(true); setError(''); setNotice('');
    let file: File | null = null;
    let mime = 'application/octet-stream';
    let stage = 'download';
    const controller = new AbortController();
    assetRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      if (!await Sharing.isAvailableAsync()) {setError('Native file sharing is unavailable on this device.'); return;}
      await authorized(async token => {
        // Fetch with the same authorization and account-generation guard as notes.
        const response = await fetch(`${apiURL()}/v1/memories/${base.id}/asset`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
        if(!response.ok) throw new ApiError(response.status,'asset_unavailable');
        mime = response.headers.get('content-type')?.split(';')[0] || mime;
        const extension = ({'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/heic':'heic','image/avif':'avif'} as Record<string,string>)[mime] || 'bin';
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!mounted.current) return;
        stage = 'cache';
        file = new File(Paths.cache, `recallbox-${base.id}-${Date.now()}.${extension}`);
        if (file.exists) file.delete();
        file.create();
        file.write(bytes);
      });
      clearTimeout(timeout);
      stage = 'share';
      if(file && mounted.current) await Sharing.shareAsync((file as File).uri, {mimeType:mime});
    } catch(cause) {if (mounted.current) setError(cause instanceof ApiError && (cause.status === 404 || cause.status === 410)
      ? 'The saved original file is unavailable. Your memory and saved text are still here.' : stage === 'cache' ? 'Could not prepare the private file for sharing. Check available device storage and try again.'
      : stage === 'share' ? 'Could not open file sharing on this device. Please try again.' : errorMessage(cause));}
    finally {clearTimeout(timeout);assetRequest.current = null;
      try {if(file && (file as File).exists) (file as File).delete();}
      catch {if (mounted.current) setError('Sharing finished, but the temporary cached copy could not be removed.');}
      finally {if (mounted.current) setBusy(false);}}
  }
  async function retryProcessing() {
    setBusy(true);setError('');setNotice('');
    try {await authorized(token => memoriesApi.retry(token,id)); await load();}
    catch(cause) {failed(cause);}
    finally {setBusy(false);}
  }
  async function compare() {
    setBusy(true); setError(''); setNotice('');
    try { setConflict(await store.get(id));setEditing(true); }
    catch (cause) { failed(cause); }
    finally { setBusy(false); }
  }
  async function update(fields: {title?: string; content?: string; starred?: boolean; archived?: boolean; collection?: string}) {
    if (!base || busy) return;
    setBusy(true); setError(''); setNotice('');
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
        setBusy(true); setError(''); setNotice('');
        try { await store.remove(id, base.version); setLeaving(true); release(); router.dismissTo('/(account)'); }
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
  const isLink = base?.kind === 'url' || base?.kind === 'link';
  const sourceURL = base?.source_url || (isLink ? base?.content : null);
  const topic = base?.topic_override === 'Uncategorized' ? null : base?.topic_override ||
    (base?.suggested_topic_reason ? base.suggested_topic : null);
  // Metadata previews (including image dimensions) are not extracted article/OCR text.
  const readerText = base?.kind === 'note' ? base.content : base?.processing_state === 'ready' ? base.extracted_text : '';
  const previewText = base?.processing_state === 'metadata_only' && isLink ? base.extracted_text : '';
  const origin = sourceURL?.replace(/^https?:\/\//i,'').split(/[/?#]/)[0] ||
    (base?.kind === 'note' ? 'Your note' : base?.kind === 'pdf' ? 'Saved PDF' : base?.kind === 'image' ? 'Saved image' : 'Saved source');
  return <Screen>
    <TextAction icon="back" label={backLabel} disabled={busy}
      onPress={() => router.canGoBack() ? router.back() : router.replace('/(account)')}/>
    {base && <View style={{gap: tokens.space.compact}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: tokens.space.medium}}>
        <SourcePlaceholder kind={base.kind}/>
        <Type variant="secondary" style={{flex: 1}}>{origin} · {new Date(base.created_at).toDateString() === new Date().toDateString() ? 'Today' : new Date(base.created_at).toLocaleDateString(undefined,
          {day:'numeric',month:'short',year:'numeric'})}</Type>
      </View>
      <Type variant={base.kind === 'image' ? 'hero' : 'heading'}>{base.title.trim() || (base.kind === 'note' ? 'Untitled note' :
        base.kind === 'image' ? 'Saved image' : base.kind === 'pdf' ? 'Saved PDF' : 'Saved link')}</Type>
      {!!topic && base.kind !== 'image' && <View style={{alignSelf: 'flex-start', backgroundColor:p.surfaceMuted, borderRadius:tokens.radii.full, paddingHorizontal:tokens.space.compact}}><TextAction label={topic} disabled={busy || dirty}
        onPress={() => router.push({pathname:'/(account)/organize',params:{id}})}/></View>}
    </View>}
    {!base && <Type title>{unavailable ? 'Memory unavailable.' : 'Opening your memory…'}</Type>}
    {!!notice && <Notice kind="success">{notice}</Notice>}
    {!!error && <Notice kind="error">{error}</Notice>}
    {!base && !loading && !busy && !unavailable && <Button label="Try again" onPress={() => void load()}/>}
    {base && <>
      {isLink && sourceURL && <Type selectable variant="secondary">{sourceURL}</Type>}
      {hasSource && base.kind !== 'note' && <Button label="Open original" disabled={busy}
        leading={<Icon name="link" color={p.onAccent}/>}
        onPress={() => {if (base.source_url) void Linking.openURL(base.source_url)
          .catch(() => setError('Could not open the external site on this device. Your saved memory is still here.'));
          else void openOriginal();}}/>}
      {base.kind === 'note' && <Button label="Edit note" disabled={busy || editing} leading={<Icon name="note" color={p.onAccent}/>}
        onPress={() => setEditing(true)}/>}
      {base.kind === 'image' && imageSource && !imageError && <Pressable
        accessibilityRole="button" accessibilityLabel={`Expand image: ${base.title || 'Saved image'}`}
        accessibilityHint="Opens full screen. Pinch to zoom and drag to pan."
        accessibilityState={{disabled:imageLoading}} disabled={imageLoading} onPress={() => setViewingImage(true)} style={({pressed}) => ({opacity:pressed ? 0.78 : 1,
          borderRadius:tokens.radii.button, overflow:'hidden'})}>
        <Image source={imageSource} accessibilityLabel={base.title || 'Saved image'}
          resizeMode="contain" resizeMethod="resize"
          style={{width:'100%', aspectRatio:imageRatio || 1, maxHeight:window.height * 0.6}}
          onLoad={event => {const {width,height} = event.nativeEvent.source;
            if (width > 0 && height > 0) setImageRatio(width / height); setImageLoading(false);}}
          onError={() => {setImageError(true);setImageLoading(false);}}/>
        <View pointerEvents="none" style={{position:'absolute', bottom:tokens.space.small, right:tokens.space.small,
          backgroundColor:p.scrim, borderRadius:tokens.radii.medium, minWidth:tokens.touch, minHeight:tokens.touch,
          alignItems:'center',justifyContent:'center'}}><Icon name="expand" color={p.mediaForeground}/></View>
      </Pressable>}
      {base.kind === 'image' && imageLoading && !imageError && base.original_available !== false && <Notice>Loading saved image…</Notice>}
      {imageError && <View style={{gap:tokens.space.small}}>
        <Notice kind="error">The image preview could not be loaded. Check your connection or try sharing the saved original.</Notice>
        <Button variant="secondary" label="Retry preview" onPress={() => {setImageAttempt(value => value + 1);}}/>
      </View>}
      {['image','pdf'].includes(base.kind) && <Button variant={base.kind === 'image' ? 'quiet' : 'primary'}
        label={base.kind === 'pdf' ? 'Open or share PDF' : 'Share original'}
        busy={busy} disabled={base.original_available === false}
        labelStyle={base.kind === 'image' ? {color:p.accent} : undefined}
        leading={<Icon name={base.kind === 'image' ? 'share' : 'pdf'} color={base.kind === 'image' ? p.accent : p.onAccent}/>}
        onPress={() => void original()}/>}
      <View style={{flexDirection:'row',flexWrap:'wrap',gap: tokens.space.small}}>
        <Button variant="secondary" size="compact" label={base.starred ? 'Starred' : 'Star'}
          style={{flexGrow:1, paddingHorizontal:tokens.space.compact, borderRadius:tokens.radii.full, backgroundColor:'transparent'}}
          leading={<Icon name="star" filled={base.starred} color={base.starred ? p.favorite : p.primaryText}/>}
          disabled={busy || unavailable || Boolean(conflict) || dirty}
          onPress={() => void update({starred: !base.starred})}/>
        <Button variant="secondary" size="compact" label="Organize"
          style={{flexGrow:1, paddingHorizontal:tokens.space.compact, borderRadius:tokens.radii.full, backgroundColor:'transparent'}}
          leading={<Icon name="collections"/>} disabled={busy || unavailable || Boolean(conflict) || dirty}
          onPress={() => router.push({pathname:'/(account)/organize',params:{id}})}/>
        <Button variant="secondary" size="compact" label="More" leading={<Icon name="more"/>}
          style={{flexGrow:1, paddingHorizontal:tokens.space.compact, borderRadius:tokens.radii.full, backgroundColor:'transparent'}}
          disabled={busy} onPress={() => setShowMoreActions(true)}/>
      </View>
      {(base.kind !== 'image' || editing || !!readerText.trim()) && <Divider/>}
      {editing && <View style={{gap: tokens.space.medium}}>
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
        {conflict && <View style={{gap: tokens.space.compact}}>
          <Type variant="section">A newer version exists</Type>
          <Type muted>Latest title: {conflict.title || 'Untitled memory'}</Type>
          <Type selectable>Latest content: {conflict.content}</Type>
          <Type muted>Latest collection: {conflict.collection || 'None'}</Type>
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
      {isPending && base.kind !== 'image' && <Notice>
        Your original is saved in Library. Source details are still being processed.
      </Notice>}
      {base.processing_state === 'failed' && base.kind !== 'image' && <Notice kind="error">
        Source details could not be processed. The saved original remains accessible when available. Retry is available in More.
      </Notice>}
      {base.original_available === false && <View style={{gap: tokens.space.small}}>
        <Notice kind="error">The original file is unavailable on the server. Save another copy if you still have it.</Notice>
        <Button variant="secondary" label="Save another copy" onPress={() => router.push('/(account)/save')}/>
      </View>}
      {viewingImage && imageSource && !imageError && <ImageViewer source={imageSource}
        label={base.title || 'Saved image'} ratio={imageRatio || 1} reducedMotion={reducedMotion}
        onClose={() => setViewingImage(false)} onError={() => {setImageError(true);setViewingImage(false);}}/>}
      {base.kind === 'pdf' && <Notice>
        This PDF is saved privately. Open it in a compatible app to read or share the original.
      </Notice>}
      {base.kind === 'note' && !editing && !readerText.trim() && <Notice>This note has no text.</Notice>}
      {!!readerText.trim() && !(editing && base.kind === 'note') && <SavedText key={base.id} text={readerText} note={base.kind === 'note'}/>}
      {!readerText.trim() && base.processing_state === 'ready' && base.kind !== 'note' && base.kind !== 'image' && <Notice>No extracted text is available for this save.</Notice>}
      {!!previewText.trim() && <View style={{gap:tokens.space.small}}>
        <Type variant="section">Saved page preview</Type><Type selectable>{previewText}</Type>
      </View>}
      {base.kind !== 'note' && base.kind !== 'image' && !isPending && base.processing_state !== 'ready' && <Notice>
        {'Complete source text was not obtained. Any saved page preview is metadata, not a transcript or full article.'}
      </Notice>}
      {remote && remote.version > base.version && <>
        <Notice>This memory changed on another device. Your draft remains here.</Notice>
        <TextAction label="Compare with latest" disabled={busy} onPress={() => void compare()}/>
      </>}
      {!!options.length && <View style={{gap:tokens.space.small}}>
        <Type variant="section">Useful next steps</Type>
        <TextAction label={options.map(option => option.label).join(' · ')} disabled={busy || unavailable || dirty}
          onPress={() => router.push({pathname:'/(account)/next-steps',params:{memoryId:id}})}/>
      </View>}
      {unavailable && <Notice>This memory is unavailable. Your draft has not been discarded.</Notice>}
      <Modal visible={showMoreActions} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => setShowMoreActions(false)}>
        <View style={{flex:1,justifyContent:'flex-end',backgroundColor:p.scrim}}>
          <Pressable style={{flex:1}} accessibilityRole="button" accessibilityLabel="Dismiss memory actions" onPress={() => setShowMoreActions(false)}/>
          <SheetSurface style={{height:'80%'}}><Screen compact>
            <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
              <Type variant="section">Memory actions</Type><IconButton icon="close" label="Close memory actions" onPress={() => setShowMoreActions(false)}/>
            </View>
            <TextAction icon="note" label="Edit title and details" disabled={busy || unavailable || editing}
              onPress={() => {setShowMoreActions(false);setEditing(true);}}/>
            <TextAction icon="collections" label="Add to collection" disabled={busy || dirty || unavailable}
              onPress={() => {setShowMoreActions(false);router.push({pathname:'/(account)/add-to-collection',params:{memoryId:id}});}}/>
            <TextAction icon="pdf" label="Source details" disabled={busy || dirty}
              onPress={() => {setShowMoreActions(false);router.push({pathname:'/(account)/source/[id]',params:{id}});}}/>
            {['image','pdf'].includes(base.kind) && <TextAction icon="upload" label="Share original file"
              disabled={busy || base.original_available === false} onPress={() => {setShowMoreActions(false);void original();}}/>}
            {base.processing_state === 'failed' && <TextAction icon="retry" label="Retry getting details" disabled={busy || dirty}
              onPress={() => {setShowMoreActions(false);void retryProcessing();}}/>}
            <TextAction icon="clock" label="Set a reminder" disabled={busy || dirty || unavailable}
              onPress={() => {setShowMoreActions(false);router.push({pathname:'/(account)/reminder',params:{memoryId:id}});}}/>
            <TextAction label={base.archived ? 'Restore from archive' : 'Archive memory'}
              disabled={busy || unavailable || Boolean(conflict) || dirty}
              onPress={() => {setShowMoreActions(false);void update({archived: !base.archived});}}/>
            <TextAction label="Delete memory" disabled={busy || unavailable || dirty}
              onPress={() => {setShowMoreActions(false);confirmDelete();}}/>
          </Screen></SheetSurface>
        </View>
      </Modal>
    </>}
  </Screen>;
}
