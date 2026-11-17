import {useCallback, useRef, useState, type ComponentRef} from 'react';
import {AccessibilityInfo, Alert, findNodeHandle, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {router, useFocusEffect, useLocalSearchParams, usePreventRemove} from 'expo-router';
import {ApiError, CollectionDetail, MemorySummary, collectionsApi} from '../../../src/api';
import {useSession} from '../../../src/session';
import {MemoryCard} from '../../../src/memory-card';
import {Button, Divider, Icon, IconButton, Input, LoadingIndicator, Notice, SheetSurface, TextAction, Type, tokens, usePalette} from '../../../src/ui';

/** Match the server's membership order after merges, including concurrent additions. */
function mergeItems(older: MemorySummary[], newer: MemorySummary[]) {
  const items = new Map(older.map(item => [item.id, item]));
  for (const item of newer) items.set(item.id, item);
  return [...items.values()].sort((a, b) => a.collection_added_at && b.collection_added_at
    ? b.collection_added_at.localeCompare(a.collection_added_at) || b.id.localeCompare(a.id) : 0);
}

export default function CollectionScreen() {
  const {account} = useSession();
  const {id} = useLocalSearchParams<{id: string}>();
  return <CollectionWorkspace key={`${account?.id}:${id}`} id={id}/>;
}
function CollectionWorkspace({id}: {id: string}) {
  const {authorized} = useSession();
  const auth = useRef(authorized); auth.current = authorized;
  const p = usePalette(), insets = useSafeAreaInsets();
  const [data, setData] = useState<CollectionDetail | null>(null);
  const current = useRef(data); current.current = data;
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const lock = useRef(false), fetching = useRef(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [missing, setMissing] = useState(false);
  const [surface, setSurface] = useState<'menu' | 'rename' | 'item' | null>(null);
  const [target, setTarget] = useState<MemorySummary | null>(null);
  const [draft, setDraft] = useState(''), [conflict, setConflict] = useState(false);
  const trigger = useRef<ComponentRef<typeof Pressable>>(null);
  const itemTriggers = useRef(new Map<string, ComponentRef<typeof Pressable>>());
  const sheetTitle = useRef<ComponentRef<typeof View>>(null);
  const restoreItem = useRef<string | null>(null);
  const release = usePreventRemove(busy, () => {setError('Please wait for the collection change to finish.');});
  function back() {if (router.canGoBack()) router.back(); else router.replace('/(account)/collections');}
  function close() {
    if (lock.current) return;
    setSurface(null);
    requestAnimationFrame(() => {const node = findNodeHandle((restoreItem.current ? itemTriggers.current.get(restoreItem.current) : null) ?? trigger.current); if (node) AccessibilityInfo.setAccessibilityFocus(node);});
  }
  const refresh = useCallback(async (more = false) => {
    if (fetching.current || lock.current) return;
    fetching.current = true; setLoading(true); setError('');
    const previous = current.current;
    try {
      const page = await auth.current(token => collectionsApi.get(token, id, more ? previous?.next_cursor ?? undefined : undefined));
      if (more && previous) {
        setData({...page, items: mergeItems(previous.items, page.items)});
      } else if (previous) {
        // Reconcile retained pages in bounded batches; retain the loaded boundary and list instance.
        const retained: MemorySummary[] = [];
        const firstIds = new Set(page.items.map(item => item.id));
        const older = previous.items.filter(item => !firstIds.has(item.id));
        for (let offset = 0; offset < older.length; offset += 100) {
          const status = await auth.current(token => collectionsApi.status(token, id, older.slice(offset, offset + 100).map(item => item.id)));
          retained.push(...status.items);
        }
        const byId = new Map(retained.map(item => [item.id, item]));
        const previousIds = new Set(previous.items.map(item => item.id));
        const overlaps = page.items.some(item => previousIds.has(item.id));
        // If a full new page appeared ahead of retained rows, traverse its boundary
        // first so additions between the two loaded ranges cannot be skipped.
        const next = !overlaps && page.has_more ? page.next_cursor : previous.has_more ? previous.next_cursor : null;
        setData({...page, items: mergeItems(previous.items.filter(item => byId.has(item.id)).map(item => byId.get(item.id)!), page.items),
          next_cursor: next, has_more: Boolean(next) || Boolean(page.has_more && !page.next_cursor)});
      } else setData(page);
      setMissing(false);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'collection_not_found') {setData(null); setMissing(true);}
      else if (more && cause instanceof ApiError && ['cursor_expired', 'invalid_cursor'].includes(cause.code)) {
        try {
          const first = await auth.current(token => collectionsApi.get(token, id));
          setData(first); setNotice('The page expired. The newest items are loaded; load more to continue.');
        } catch {setError('Could not restart pagination. Check your connection and refresh.');}
      } else setError('Could not refresh this collection. Previously confirmed items may be outdated. Check your connection and retry.');
    } finally {fetching.current = false; setLoading(false);}
  }, [id]);
  useFocusEffect(useCallback(() => {void refresh();}, [refresh]));

  async function rename() {
    if (!data || lock.current || conflict || !draft.trim()) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const updated = await auth.current(token => collectionsApi.rename(token, id, draft.trim(), data.version));
      setData(value => value ? {...value, ...updated} : value); setSurface(null); setNotice('Collection renamed.');
    } catch (cause) {
      setConflict(!(cause instanceof ApiError && cause.code === 'collection_name_exists'));
      setError(cause instanceof ApiError && cause.code === 'collection_name_exists' ? 'Another collection has that name.' :
        'Rename was not confirmed, or this collection changed elsewhere. Your draft is kept. Review the latest name before saving again.');
    } finally {lock.current = false; setBusy(false);}
  }
  async function reviewLatest() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const latest = await auth.current(token => collectionsApi.get(token, id));
      setData(value => value ? {...value, name: latest.name, version: latest.version, item_count: latest.item_count} : latest);
      setNotice(`Current name: “${latest.name}”. Your draft is kept. Save to apply it.`); setError(''); setConflict(false);
    } catch {setError('Could not load the current collection. Your draft is kept. Retry reviewing the latest name.');}
    finally {lock.current = false; setBusy(false);}
  }
  function deleteCollection() {
    if (!data || lock.current) return;
    setSurface(null);
    Alert.alert('Delete this collection?', 'Your saved memories will remain in your Library.', [
      {text: 'Cancel', style: 'cancel'}, {text: 'Delete collection', style: 'destructive', onPress: () => void (async () => {
        if (lock.current) return;
        lock.current = true; setBusy(true); setError('');
        try {
          await auth.current(token => collectionsApi.remove(token, id, data.version));
          release(); router.dismissTo('/(account)/collections');
        } catch (cause) {
          if (cause instanceof ApiError && cause.code === 'collection_version_conflict') {
            setError('This collection changed elsewhere. Refresh, review it, then choose Delete again.');
          } else {
            try {await auth.current(token => collectionsApi.get(token, id)); setError('Deletion was not confirmed. The collection still exists. Retry when connected.');}
            catch (check) {
              if (check instanceof ApiError && check.code === 'collection_not_found') {release(); router.dismissTo('/(account)/collections');}
              else setError('Deletion could not be confirmed. Refresh before trying again.');
            }
          }
        } finally {lock.current = false; setBusy(false);}
      })()},
    ]);
  }
  function removeItem() {
    if (!target || lock.current) return;
    const memoryId = target.id; setSurface(null);
    Alert.alert('Remove from this collection?', 'Your saved memory will remain in your Library.', [
      {text: 'Cancel', style: 'cancel'}, {text: 'Remove from collection', style: 'destructive', onPress: () => void (async () => {
        if (lock.current) return;
        lock.current = true; setBusy(true); setError('');
        let confirmed = false;
        try {
          const before = await auth.current(token => collectionsApi.status(token, id, [memoryId]));
          if (before.items.length) await auth.current(token => collectionsApi.removeItem(token, id, memoryId));
          confirmed = true;
        }
        catch {
          try {const status = await auth.current(token => collectionsApi.status(token, id, [memoryId])); confirmed = status.items.length === 0;}
          catch { /* Keep confirmed data until reconciliation is available. */ }
        }
        if (confirmed) {
          setData(value => value ? {...value, items: value.items.filter(item => item.id !== memoryId),
            item_count: typeof value.item_count === 'number' ? Math.max(0, value.item_count - 1) : undefined} : value);
          setNotice('Removed from this collection. Your memory remains in Library.');
        } else setError('Removal was not confirmed. The item is kept here. Refresh to check membership before retrying.');
        lock.current = false; setBusy(false); if (confirmed) void refresh();
      })()},
    ]);
  }
  const empty = data?.item_count === 0;
  return <SafeAreaView style={{flex: 1, backgroundColor: p.background}}>
    <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: tokens.space.medium, maxWidth: tokens.width, width: '100%', alignSelf: 'center'}}>
      <TextAction icon="back" label="Collections" onPress={back}/><View style={{flex: 1}}/>
      {data && <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel="Collection actions" accessibilityState={{expanded: surface === 'menu', disabled: busy || loading}}
        disabled={busy || loading} onPress={() => {restoreItem.current = null; setSurface('menu');}} style={{minWidth: tokens.touch, minHeight: tokens.touch, alignItems: 'center', justifyContent: 'center'}}><Icon name="more"/></Pressable>}
    </View>
    <FlatList data={data?.items ?? []} keyExtractor={item => item.id} initialNumToRender={12} maintainVisibleContentPosition={{minIndexForVisible: 0}}
      contentContainerStyle={{padding: tokens.geometry.screenPadding, paddingBottom: insets.bottom + tokens.space.large,
        maxWidth: tokens.width, width: '100%', alignSelf: 'center', flexGrow: 1}}
      refreshing={loading && Boolean(data)} onRefresh={() => void refresh()}
      ItemSeparatorComponent={() => <Divider inset={tokens.geometry.thumbnail + tokens.space.medium}/>}
      ListHeaderComponent={<View style={{gap: tokens.space.medium, marginBottom: tokens.space.medium}}>
        {data && <>
          <Type variant="display">{data.name}</Type>
          {typeof data.item_count === 'number' ? <Type muted accessibilityLiveRegion="polite">{data.item_count} saved {data.item_count === 1 ? 'item' : 'items'}</Type> : <Notice>Item count unavailable. Refresh to retrieve the total.</Notice>}
          <Button label="Add saved items" variant={empty ? 'primary' : 'secondary'} disabled={busy || loading}
            leading={<Icon name="save" color={empty ? p.onAccent : p.accent}/>}
            labelStyle={{color: empty ? p.onAccent : p.accent}}
            style={{marginTop: tokens.space.small, backgroundColor: empty ? p.accent : 'transparent', borderColor: p.accent, borderRadius: tokens.radii.large}}
            onPress={() => router.push({pathname: '/(account)/add-to-collection', params: {collectionId: id}})}/>
        </>}
        {!data && loading && <LoadingIndicator label="Opening collection"/>}
        {missing && <><Type variant="section">Collection not found.</Type><Type muted>It may have been deleted or is unavailable for this account.</Type><Button label="Back to Collections" onPress={() => router.replace('/(account)/collections')}/></>}
        {!!error && <><Notice kind="error">{error}</Notice><Button label="Retry refresh" variant="secondary" disabled={busy || loading} onPress={() => void refresh()}/></>}
        {!!notice && <Notice kind="success">{notice}</Notice>}
        {empty && <View style={{gap: tokens.space.small, paddingVertical: tokens.space.large}}><Type variant="section">Nothing here yet.</Type><Type muted>Add saved items to keep related things together.</Type></View>}
      </View>}
      renderItem={({item}) => <MemoryCard memory={item} onOpen={() => router.push({pathname: '/(account)/memory/[id]', params: {id: item.id}})}
        trailing={<IconButton icon="more" label={`Actions for ${item.title || 'saved memory'}`} disabled={busy || loading}
          buttonRef={node => {if (node) itemTriggers.current.set(item.id, node); else itemTriggers.current.delete(item.id);}}
          onPress={() => {restoreItem.current = item.id; setTarget(item); setSurface('item');}}/>}/>}
      ListFooterComponent={data?.has_more ? <View style={{paddingVertical: tokens.space.medium}}>
        <Button label="Load more saved items" variant="secondary" busy={loading} disabled={busy || !data.next_cursor}
          onPress={() => void refresh(true)}/>
        {!data.next_cursor && <Notice>Older items require the updated collection API.</Notice>}
      </View> : undefined}/>
    <Modal visible={surface !== null} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={close}
      onShow={() => {if (surface !== 'rename') {const node = findNodeHandle(sheetTitle.current); if (node) AccessibilityInfo.setAccessibilityFocus(node);}}}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1, justifyContent: 'flex-end', backgroundColor: p.scrim, paddingTop: insets.top + tokens.space.small}}>
        <Pressable accessible={false} onPress={close} style={{position: 'absolute', top: 0, bottom: 0, left: 0, right: 0}}/>
        <SheetSurface style={{flexShrink: 1}}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: tokens.space.large, paddingBottom: insets.bottom + tokens.space.large, gap: tokens.space.medium}}>
          <View ref={sheetTitle} accessible accessibilityRole="header"><Type variant="sheetHeading">{surface === 'rename' ? 'Rename collection' : surface === 'item' ? 'Saved item' : 'Collection actions'}</Type></View>
          {surface === 'menu' && <><TextAction label="Rename collection" onPress={() => {setDraft(data?.name ?? ''); setConflict(false); setError(''); setNotice(''); setSurface('rename');}}/><TextAction label="Delete collection" onPress={deleteCollection}/></>}
          {surface === 'item' && <TextAction label="Remove from this collection" onPress={removeItem}/>}
          {surface === 'rename' && <>
            <Input label="Collection name" autoFocus maxLength={80} value={draft} onChangeText={setDraft} editable={!busy}/>
            {!!error && <Notice kind="error">{error}</Notice>}{!!notice && <Notice>{notice}</Notice>}
            {conflict && <Button label="Review latest name" variant="secondary" busy={busy} onPress={() => void reviewLatest()}/>}
            <Button label="Save name" busy={busy} disabled={!draft.trim() || conflict} onPress={() => void rename()}/>
          </>}
          <TextAction label="Cancel" disabled={busy} onPress={close}/>
        </ScrollView></SheetSurface>
      </KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}
