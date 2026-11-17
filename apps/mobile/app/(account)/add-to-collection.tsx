import {useCallback, useEffect, useRef, useState} from 'react';
import {FlatList, KeyboardAvoidingView, Platform, Pressable, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router, useFocusEffect, useLocalSearchParams, usePreventRemove} from 'expo-router';
import {ApiError, Collection, MemorySummary, collectionsApi} from '../../src/api';
import {useSession} from '../../src/session';
import {isUsableMemory} from '../../src/library-state';
import {MemoryCard} from '../../src/memory-card';
import {Button, Divider, Icon, Input, LoadingIndicator, Notice, TextAction, Type, tokens, usePalette} from '../../src/ui';

type Candidate = MemorySummary & {already_added: boolean};
export default function AddToCollection() {
  const {account} = useSession();
  const {memoryId, collectionId} = useLocalSearchParams<{memoryId?: string; collectionId?: string}>();
  return <Picker key={`${account?.id}:${collectionId}:${memoryId}`} memoryId={memoryId} collectionId={collectionId}/>;
}
function Picker({memoryId, collectionId}: {memoryId?: string; collectionId?: string}) {
  const {authorized} = useSession();
  const auth = useRef(authorized); auth.current = authorized;
  const p = usePalette();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [items, setItems] = useState<Candidate[]>([]), [name, setName] = useState('');
  const [query, setQuery] = useState(''), [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [members, setMembers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const lock = useRef(false), generation = useRef(0), fetching = useRef(false);
  const release = usePreventRemove(busy, () => {setError('Please wait while the selected additions are confirmed.');});
  useEffect(() => {const timer = setTimeout(() => setSearch(query.trim()), 300); return () => clearTimeout(timer);}, [query]);
  const load = useCallback(async (next?: string) => {
    if (lock.current || (next && fetching.current)) return;
    const epoch = ++generation.current;
    fetching.current = true; setLoading(true); setError('');
    if (!next) {setItems([]); setCursor(null);}
    try {
      if (collectionId) {
        const page = await auth.current(token => collectionsApi.candidates(token, collectionId, search, next));
        if (generation.current !== epoch) return;
        setName(page.name); setCursor(page.next_cursor);
        setItems(old => next ? [...old, ...page.items.filter(item => !old.some(existing => existing.id === item.id))] : page.items);
        setMembers(old => {const updated = new Set(old); for (const item of page.items) {if (item.already_added) updated.add(item.id); else updated.delete(item.id);} return updated;});
        setSelected(old => new Set([...old].filter(id => !page.items.some(item => item.id === id && item.already_added))));
      } else {
        const page = await auth.current(token => collectionsApi.list(token));
        if (generation.current === epoch) setCollections(page.items);
      }
    } catch (cause) {
      if (generation.current === epoch) {
        if (cause instanceof ApiError && ['cursor_expired', 'invalid_cursor'].includes(cause.code)) {
          setCursor(null); setError('This page expired. Retry loading to restart the search. Your selections are kept.');
        } else setError('Could not load saved items. Check your connection and retry.');
      }
    } finally {if (generation.current === epoch) {fetching.current = false; setLoading(false);}}
  }, [collectionId, search]);
  useFocusEffect(useCallback(() => {void load(); return () => {generation.current += 1; fetching.current = false;};}, [load]));
  function toggle(item: Candidate) {
    if (lock.current || members.has(item.id) || !isUsableMemory(item)) return;
    setSelected(old => {const next = new Set(old); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next;});
  }
  async function status(ids: string[], group: string) {
    const found = new Set<string>();
    for (let offset = 0; offset < ids.length; offset += 100) {
      const result = await auth.current(token => collectionsApi.status(token, group, ids.slice(offset, offset + 100)));
      for (const item of result.items) found.add(item.id);
    }
    return found;
  }
  async function confirm(group: string, ids: string[], returnOnSuccess: boolean) {
    if (lock.current || !ids.length) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    const confirmed = new Set<string>();
    let unresolved = false;
    try {
      // Every retry checks actual membership before replaying uncertain operations.
      for (const id of await status(ids, group)) confirmed.add(id);
      const uncertain: string[] = [];
      for (const id of ids) {
        if (confirmed.has(id)) continue;
        try {await auth.current(token => collectionsApi.add(token, group, id)); confirmed.add(id);}
        catch {uncertain.push(id);}
      }
      if (uncertain.length) {
        try {for (const id of await status(uncertain, group)) confirmed.add(id);}
        catch {unresolved = true;}
      }
      const remaining = ids.filter(id => !confirmed.has(id));
      setMembers(old => new Set([...old, ...confirmed]));
      setSelected(old => new Set([...old].filter(id => !confirmed.has(id))));
      if (!remaining.length) {
        if (returnOnSuccess) {release(); router.back();}
        else setNotice('Added to the collection. Your original remains in Library.');
      } else {
        setNotice(`${confirmed.size} ${confirmed.size === 1 ? 'item' : 'items'} confirmed in the collection. ${remaining.length} ${remaining.length === 1 ? 'item could' : 'items could'} not be confirmed.`);
        setError(unresolved ? 'Some outcomes are unknown. Retry checks actual membership before sending further additions.' : 'Failed selections are kept. Retry to add the remaining items.');
      }
    } catch {setError('Could not check membership. No additions were sent. Your selections are kept; retry when connected.');}
    finally {lock.current = false; setBusy(false);}
  }
  const visible = items.filter(isUsableMemory), selectedCount = selected.size;
  function back() {if (lock.current) return; if (router.canGoBack()) router.back(); else router.replace('/(account)/collections');}
  return <SafeAreaView style={{flex: 1, backgroundColor: p.background}}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
    <View style={{paddingHorizontal: tokens.space.large, gap: tokens.space.small, maxWidth: tokens.width, width: '100%', alignSelf: 'center'}}>
      <TextAction icon="back" label={collectionId ? 'Cancel' : 'Back to memory'} disabled={busy} onPress={back}/>
      <Type variant="heading">{collectionId ? 'Add saved items' : 'Add to collection'}</Type>
      <Type muted>{collectionId ? `Choose saved memories for ${name || 'this collection'}.` : 'Your original memory stays in Library.'}</Type>
      {collectionId && <Input label="Search saved memories" placeholder="Search your Library" value={query} onChangeText={setQuery} maxLength={200} editable={!busy} leading={<Icon name="search"/>}/>}
      {!!notice && <Notice>{notice}</Notice>}
      {!!error && <><Notice kind="error">{error}</Notice><TextAction label="Retry loading" disabled={busy || loading} onPress={() => void load()}/></>}
    </View>
    {collectionId ? <FlatList data={visible} keyExtractor={item => item.id} initialNumToRender={12} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{padding: tokens.space.large, maxWidth: tokens.width, width: '100%', alignSelf: 'center', flexGrow: 1}}
      ItemSeparatorComponent={() => <Divider inset={tokens.geometry.thumbnail + tokens.space.medium}/>}
      renderItem={({item}) => {
        const added = members.has(item.id), checked = selected.has(item.id);
        return <MemoryCard memory={item} onOpen={() => toggle(item)} selection={{checked: added || checked, disabled: busy || added,
          label: `${item.title || 'Saved memory'}${added ? ', already in this collection' : ''}`}} trailing={<Pressable accessibilityRole="checkbox"
          accessibilityLabel={`${item.title || 'Saved memory'}${added ? ', already in this collection' : ''}`}
          accessibilityState={{checked: added || checked, disabled: busy || added}} disabled={busy || added}
          onPress={() => toggle(item)} style={{minWidth: tokens.touch, minHeight: tokens.touch, alignItems: 'center', justifyContent: 'center'}}>
          <Icon name={added || checked ? 'checked' : 'square'} color={added ? p.mutedText : p.accent}/>
          {added && <Type variant="caption" muted>Added</Type>}
        </Pressable>}/>;
      }}
      ListEmptyComponent={!loading && !error ? <Notice>{search ? 'No matching saved items.' : 'No eligible saved items yet.'}</Notice> : undefined}
      ListFooterComponent={<View style={{gap: tokens.space.medium}}>
        {loading && <LoadingIndicator label="Loading saved memories"/>}
        {!!cursor && <Button label="Load more memories" variant="secondary" busy={loading} disabled={busy || query.trim() !== search} onPress={() => void load(cursor)}/>}
      </View>}/>
      : <FlatList data={collections} keyExtractor={item => item.id} contentContainerStyle={{padding: tokens.space.large, gap: tokens.space.medium}}
        renderItem={({item}) => <Button label={`Add to ${item.name}`} variant="secondary" disabled={!memoryId || busy || loading}
          onPress={() => void confirm(item.id, [memoryId!], false)}/>}
        ListEmptyComponent={!loading && !error ? <Notice>No collections yet. Create a collection, then return to this memory.</Notice> : undefined}
        ListFooterComponent={<>{loading && <LoadingIndicator/>}<TextAction label="Create or manage collections" disabled={busy} onPress={() => router.push('/(account)/collections')}/></>}/>}
    {collectionId && <View style={{padding: tokens.space.medium, gap: tokens.space.small, borderTopWidth: tokens.geometry.divider, borderColor: p.line, maxWidth: tokens.width, width: '100%', alignSelf: 'center'}}>
      <Type variant="label" accessibilityLiveRegion="polite">{selectedCount} selected</Type>
      <Button label={`Add ${selectedCount} ${selectedCount === 1 ? 'item' : 'items'}`} busy={busy} disabled={!selectedCount || loading || query.trim() !== search}
        onPress={() => void confirm(collectionId, [...selected], true)}/>
    </View>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
