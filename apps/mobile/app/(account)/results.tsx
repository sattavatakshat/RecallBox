import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {FlatList, Keyboard, Modal, Pressable, ScrollView, View} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {router, useLocalSearchParams} from 'expo-router';
import {ApiError, MemorySummary, memoriesApi} from '../../src/api';
import {useMemories} from '../../src/memories';
import {useSession} from '../../src/session';
import {isUsableMemory} from '../../src/library-state';
import {searchHistory, SEARCH_QUERY_LIMIT} from '../../src/search-history';
import {MemoryCard} from '../../src/memory-card';
import {AppHeader} from '../../src/navigation-ui';
import {Button, Divider, FilterChip, Icon, IconButton, Input, type InputHandle, LoadingIndicator,
  Notice, RecoveryState, SheetSurface, TextAction, Type, tokens, usePalette} from '../../src/ui';

type Kind = 'all' | 'link' | 'note' | 'image' | 'pdf';
const types = [['all','All'],['link','Links'],['note','Notes'],['image','Photos'],['pdf','PDFs']] as const;

const SearchRow = memo(function SearchRow({item, busy, onStar}: {
  item: MemorySummary; busy: boolean; onStar: (item: MemorySummary) => void;
}) {
  return <MemoryCard memory={item} search busy={busy} onStar={() => onStar(item)}
    onOpen={() => {Keyboard.dismiss();router.push({pathname:'/(account)/memory/[id]',params:{id:item.id,fromSearch:'1'}});}}/>;
});

/** The mounted virtualized list retains its offset while Detail covers this route. */
export default function Results() {
  const params = useLocalSearchParams<{q?: string}>();
  const q = typeof params.q === 'string' ? params.q.trim().slice(0,SEARCH_QUERY_LIMIT) : '';
  const {authorized, account} = useSession();
  const auth = useRef(authorized);auth.current = authorized;
  const store = useMemories();
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const input = useRef<InputHandle>(null);
  const list = useRef<FlatList<MemorySummary>>(null);
  const [draft, setDraft] = useState(q);
  const [items, setItems] = useState<MemorySummary[]>([]);
  const [kind, setKind] = useState<Kind>('all');
  const [starred, setStarred] = useState(false);
  const [order, setOrder] = useState<'best' | 'newest'>('best');
  const [sheet, setSheet] = useState<'filters' | 'sort' | null>(null);
  const [draftStarred, setDraftStarred] = useState(false);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState<string|null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [limited, setLimited] = useState(false);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const starLock = useRef(false);
  const submission = useRef(0);

  useEffect(() => {setDraft(q);}, [q]);
  useEffect(() => () => {submission.current += 1;}, []);
  useEffect(() => {
    const current = ++generation.current;
    if (!q) {setItems([]);setError('Enter a search phrase to find your memories.');return;}
    setBusy(true);setError('');
    list.current?.scrollToOffset({offset: 0, animated: false});
    void (async () => {
      try {
        const result = await auth.current(token => memoriesApi.search(token,q,'keyword',undefined,starred,kind,order));
        if (generation.current !== current) return;
        const keyword = result.items.filter(isUsableMemory);
        setItems(keyword);setLimited(result.limited ?? keyword.length >= 50);
        if (keyword.length < 6 && q.length >= 4) {
          try {
            const related = await auth.current(token => memoriesApi.search(token,q,'semantic',undefined,starred,kind,order));
            if (generation.current !== current) return;
            const ids = new Set(keyword.map(item => item.id));
            const unique = related.items.filter(item => {
              if (!isUsableMemory(item) || ids.has(item.id)) return false;
              ids.add(item.id);return true;
            });
            setItems([...keyword,...unique]);
            setLimited(Boolean((result.limited ?? keyword.length >= 50) || (related.limited ?? related.items.length >= 20)));
          } catch { /* Optional embeddings never remove successful keyword matches. */ }
        }
      } catch {
        if (generation.current === current) setError('Search could not load. Check your connection and retry.');
      } finally {if (generation.current === current) setBusy(false);}
    })();
    return () => {generation.current += 1;};
  }, [q,starred,kind,order,retry,account?.id]);

  function submit() {
    const next = draft.trim().slice(0, SEARCH_QUERY_LIMIT);
    if (!next || !account) return;
    const attempt = ++submission.current;
    setDraft(next);setNotice('');Keyboard.dismiss();
    void searchHistory.remember(account.id,next).catch(() => {
      if (attempt === submission.current) setNotice('Search history could not be saved on this device.');
    });
    if (next === q) setRetry(value => value + 1);
    else router.setParams({q:next});
  }

  const toggleStar = useCallback(async (item: MemorySummary) => {
    if (starLock.current) return;
    starLock.current = true;setWorking(item.id);setNotice('');
    try {
      const updated = await store.edit(item.id,{expected_version:item.version,starred:!item.starred});
      setItems(current => current.map(row => row.id === item.id
        ? {...row,starred:updated.starred,version:updated.version}:row));
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'version_conflict' && cause.current) {
        const latest = cause.current;
        setItems(current => current.map(row => row.id === latest.id
          ? {...row,...latest,preview:latest.content.slice(0,200),match_evidence:null}:row));
        setNotice('This memory changed elsewhere. Its latest version is shown; tap Star again to apply your change.');
      } else setNotice('Could not change the star. Your saved memory is unchanged. Try again.');
    } finally {starLock.current=false;setWorking(null);}
  }, [store.edit]);

  const shown = useMemo(() => {
    const rows = items.flatMap(item => {
      const latest = store.peek(item.id);
      if (latest === null) return [];
      const row = latest && latest.version > item.version ? {...latest,match_evidence:null} : item;
      return isUsableMemory(row) && (!starred || row.starred) ? [row] : [];
    });
    return order === 'newest' ? rows.sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)) : rows;
  }, [items,store.items,store.peek,starred,order]);
  const filtered = kind !== 'all' || starred;
  const clearFilters = () => {setKind('all');setStarred(false);};

  return <SafeAreaView edges={['top','left','right']} style={{flex:1,backgroundColor:p.background}}>
    <View style={{flex:1,width:'100%',maxWidth:tokens.width,alignSelf:'center'}}>
      <View style={{paddingHorizontal:tokens.geometry.screenPadding,paddingTop:tokens.space.medium,gap:tokens.space.medium}}>
        <AppHeader name={account?.display_name} onAccount={() => router.push('/(account)/account')}/>
        <Input label="Search saved memories" hideLabel rounded inputRef={input} value={draft} onChangeText={setDraft}
          leading={<Icon name="search"/>} trailing={<IconButton icon="close" label="Clear query" onPress={() => {
            setDraft('');input.current?.focus();
          }}/>}
          autoCapitalize="none" autoCorrect={false} maxLength={SEARCH_QUERY_LIMIT} returnKeyType="search"
          submitBehavior="submit" onSubmitEditing={submit} placeholder="Search anything you've saved…"/>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:tokens.space.small}}>
          <Type variant="secondary" style={{flex:1}} accessibilityLiveRegion="polite">
            {busy ? 'Searching…' : error ? 'Search unavailable' : `${shown.length} ${shown.length === 1 ? 'result' : 'results'} shown`}
          </Type>
          <TextAction label={order === 'best' ? 'Best match' : 'Newest'} icon="down" onPress={() => {Keyboard.dismiss();setSheet('sort');}}/>
        </View>
        <View style={{flexDirection:'row',alignItems:'center',gap:tokens.space.small}}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            style={{flex:1}} contentContainerStyle={{gap:tokens.space.small,paddingVertical:tokens.space.tiny}}>
            {types.map(([value,label]) => <FilterChip key={value} label={label} selected={kind===value} onPress={() => setKind(value)}/>)}
          </ScrollView>
          <IconButton icon="filter" label={starred ? 'Filters, starred only active' : 'More search filters'} selected={starred}
            color={starred ? p.selectedText : p.primaryText} onPress={() => {Keyboard.dismiss();setDraftStarred(starred);setSheet('filters');}}/>
        </View>
        {starred && <TextAction label="Starred only · Clear filters" icon="star" onPress={clearFilters}/>}
        {!!notice && <Notice kind="warning">{notice}</Notice>}
        {!!error && <View style={{gap:tokens.space.small}}><Notice kind="error">{error}</Notice>
          <Button label="Retry search" variant="secondary" onPress={() => setRetry(v => v+1)}/></View>}
        {(busy || error) && items.length > 0 && <Notice>Previous results remain visible until this search loads.</Notice>}
      </View>
      <FlatList ref={list} data={shown} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{paddingHorizontal:tokens.geometry.screenPadding,paddingTop:tokens.space.medium,
          paddingBottom:tokens.geometry.listBottomClearance}}
        initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5}
        renderItem={({item}) => <SearchRow item={item} busy={working !== null} onStar={toggleStar}/>}
        ItemSeparatorComponent={Divider}
        ListEmptyComponent={busy ? <LoadingIndicator label="Searching your memories"/> : error ? undefined :
          <RecoveryState title={filtered ? 'No results with these filters.' : 'Nothing saved matches your search.'}
            description="Try different keywords or a shorter phrase."
            onRetry={filtered ? clearFilters : () => input.current?.focus()} retryLabel={filtered ? 'Clear filters' : 'Edit query'}/>}
        ListFooterComponent={<View style={{gap:tokens.space.small,paddingTop:tokens.space.medium}}>
          {limited && <Notice>Results are limited to 50 keyword matches and up to 20 related matches. Refine your query or filters.</Notice>}
          {order === 'newest' && <Notice>Newest uses the original saved date. Related matches are sorted within the relevance-selected candidates.</Notice>}
          <TextAction icon="back" label="Back to search" onPress={() => router.dismissTo({pathname:'/(account)/search',params:{q}})}/>
        </View>}/>
    </View>
    <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
      <View style={{flex:1,justifyContent:'flex-end',backgroundColor:p.scrim}}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close search options" onPress={() => setSheet(null)} style={{flex:1}}/>
        <SheetSurface style={{maxHeight:'85%'}}>
          <ScrollView contentContainerStyle={{padding:tokens.space.large,paddingBottom:insets.bottom+tokens.space.large,gap:tokens.space.medium}}>
          <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
            <Type variant="section">{sheet === 'sort' ? 'Sort results' : 'Search filters'}</Type>
            <IconButton icon="close" label="Close search options" onPress={() => setSheet(null)}/>
          </View>
          {sheet === 'sort' ? <>
            <FilterChip label="Best match" selected={order==='best'} onPress={() => {setOrder('best');setSheet(null);}}/>
            <FilterChip label="Newest" selected={order==='newest'} onPress={() => {setOrder('newest');setSheet(null);}}/>
          </> : <>
            <FilterChip label="Starred only" selected={draftStarred} onPress={() => setDraftStarred(v => !v)}/>
            <Button label="Apply filters" onPress={() => {setStarred(draftStarred);setSheet(null);}}/>
            <Button label="Clear filters" variant="quiet" onPress={() => {clearFilters();setSheet(null);}}/>
          </>}
          </ScrollView>
        </SheetSurface>
      </View>
    </Modal>
  </SafeAreaView>;
}
