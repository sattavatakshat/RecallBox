import {LoadingIndicator, Type, Icon, FilterChip, Divider, SectionHeader, EmptyState, Notice, tokens} from '../../src/ui';
import {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, FlatList, Pressable, ScrollView, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router, useFocusEffect} from 'expo-router';
import {MemorySummary} from '../../src/api';
import {errorMessage, useMemories} from '../../src/memories';
import {EmptyLibrary} from '../../src/empty-library';
import {isUsableMemory, isUnfinishedMemory, libraryMode} from '../../src/library-state';
import {MemoryCard} from '../../src/memory-card';
import {useShareInbox} from '../../src/share-inbox';
import {useSession} from '../../src/session';
import {useBrandTheme, useBrandTypography} from '../../src/brand';
import {AppHeader} from '../../src/navigation-ui';

import {LibraryIcon} from '../../src/library-icons';

export default function Inbox() {
  const store = useMemories();
  const {account} = useSession();
  const shareInbox = useShareInbox(account?.id, store.sync);
  const p = useBrandTheme();
  const {fontFamily} = useBrandTypography();
  const [working, setWorking] = useState<string | null>(null);
  const starLock = useRef(false);
  const [error, setError] = useState('');
  const list = useRef<FlatList<MemorySummary>>(null);
  useEffect(() => {list.current?.scrollToOffset({offset: 0, animated: false});}, [store.captureRevision]);
  const usable = store.items.filter(isUsableMemory);
  const unavailable = store.items.filter(isUnfinishedMemory);
  const mode = libraryMode(store);
  const selectedFilter = store.archived ? 'archive' : store.starredOnly ? 'starred' : store.topic ? `topic:${store.topic}` : 'all';
  const filters = [{key: 'all', label: 'All'}, {key: 'starred', label: 'Starred'},
    ...store.topics.map(topic => ({key: `topic:${topic}`, label: topic}))];
  // Keep a selected topic visible if its final item was reclassified elsewhere.
  if (store.topic && !store.topics.includes(store.topic)) filters.push({key: `topic:${store.topic}`, label: store.topic});
  const retry = () => void store.refresh().catch(() => undefined);
  const deviceAttention = shareInbox.items.filter(item => item.blocked || Boolean(item.error));
  const needsAttention = unavailable.length > 0 || deviceAttention.length > 0 || Boolean(shareInbox.error);

  function selectFilter(key: string) {
    list.current?.scrollToOffset({offset: 0, animated: false});
    setError('');
    void store.refresh(key === 'archive', key === 'starred', key.startsWith('topic:') ? key.slice(6) : null).catch(() => undefined);
  }
  function sort() {
    Alert.alert('Sort saved memories', undefined, [
      {text: 'Newest', onPress: () => changeOrder('newest')},
      {text: 'Oldest', onPress: () => changeOrder('oldest')},
      {text: 'Cancel', style: 'cancel'},
    ]);
  }
  function changeOrder(order: 'newest' | 'oldest') {
    if (order === store.order) return;
    list.current?.scrollToOffset({offset: 0, animated: false});
    void store.refresh(undefined, undefined, undefined, order).catch(() => undefined);
  }
  useFocusEffect(useCallback(() => {void store.sync();}, [store.sync]));
  useEffect(() => {
    if (store.initialized && !store.loading && !store.error && !usable.length && store.hasMore) {
      void store.more().catch(() => undefined);
    }
  }, [store.initialized, store.loading, store.error, usable.length, store.hasMore, store.more]);
  async function toggle(note: MemorySummary) {
    if (starLock.current) return;
    starLock.current = true; setWorking(note.id); setError('');
    try {await store.edit(note.id, {expected_version: note.version, starred: !note.starred});}
    catch (cause) {setError(errorMessage(cause)); void store.sync();}
    finally {starLock.current = false; setWorking(null);}
  }
  // Unavailable originals need recovery, not the first-save illustration.
  if (mode !== 'populated' && mode !== 'filtered' && mode !== 'pending') return <EmptyLibrary
    mode={mode} captures={[]} error={store.error} notice={store.notice}
    deviceShares={deviceAttention.length} deviceError={shareInbox.error}
    refreshing={store.loading} onRefresh={retry} onSave={() => router.push('/(account)/save')}
    onCaptured={() => router.push('/(account)/incoming-share')}/>;

  return <SafeAreaView edges={['top', 'left', 'right']} style={{flex: 1, backgroundColor: p.background}}>

    <FlatList ref={list} data={usable} keyExtractor={item => item.id}
      contentContainerStyle={{paddingHorizontal: tokens.space.large, paddingTop: tokens.space.regular, paddingBottom: tokens.geometry.listBottomClearance,
        maxWidth: tokens.width, width: '100%', alignSelf: 'center', flexGrow: 1}}
      refreshing={store.loading} onRefresh={retry}
      onEndReachedThreshold={0.4} onEndReached={() => {
        if (store.hasMore && !store.loading && !store.error) void store.more().catch(() => undefined);
      }}
      initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7}
      ItemSeparatorComponent={() => <Divider inset={tokens.geometry.thumbnail + tokens.space.medium}/> }
      ListHeaderComponent={<View>
        <AppHeader name={account?.display_name} onAccount={() => router.push('/(account)/account')}/>
        <Type accessibilityRole="header" style={{fontFamily, color: p.primaryText, ...tokens.type.display, marginTop: tokens.space.regular, marginBottom: tokens.space.regular}}>{store.archived ? 'Your archive.' : 'Your library.'}</Type>
        <Pressable accessibilityRole="button" accessibilityLabel="Search anything you've saved"
          onPress={() => router.navigate('/(account)/search')}
          style={({pressed}) => ({minHeight: tokens.touch, borderWidth: 1, borderColor: p.line, borderRadius: tokens.radii.button,
            backgroundColor: p.surface, paddingHorizontal: tokens.space.medium, paddingVertical: tokens.space.compact,
            flexDirection: 'row', alignItems: 'center', gap: tokens.space.compact, opacity: pressed ? 0.7 : 1})}>
          <LibraryIcon kind="search" color={p.primaryText}/>
          <Type style={{flex: 1, ...tokens.type.secondary,  color: p.secondaryText}}>Search anything you've saved…</Type>
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{gap: tokens.space.small, paddingVertical: tokens.space.medium, alignItems: 'center'}}>
          {filters.map(filter => <FilterChip key={filter.key} label={filter.label}
            selected={selectedFilter === filter.key} disabled={store.loading} onPress={() => selectFilter(filter.key)}/>)}
        </ScrollView>
        <SectionHeader title="Recently saved" action={<Pressable accessibilityRole="button"
          accessibilityLabel={`Sort: ${store.order === 'newest' ? 'Newest' : 'Oldest'}`}
          disabled={store.loading} onPress={sort} style={{minHeight: tokens.touch, justifyContent: 'center', paddingHorizontal: tokens.space.tiny}}>
          <View style={{flexDirection:'row',alignItems:'center',gap:tokens.space.small}}>
            <Type variant="secondary">{store.order === 'newest' ? 'Newest' : 'Oldest'}</Type><Icon name="down"/>
          </View>
        </Pressable>}/>
        {(store.error || error) ? <View style={{gap: tokens.space.tiny, paddingVertical: tokens.space.small}}>
          <Type accessibilityRole="alert" style={{color: p.error, }}>{store.error || error}</Type>
          <Pressable accessibilityRole="button" onPress={retry} style={{minHeight: tokens.touch, justifyContent: 'center'}}>
            <Type style={{color: p.primaryText, fontWeight: '600'}}>Try again</Type>
          </Pressable>
        </View> : null}
        {!!store.notice && <Notice kind="success">{store.notice}</Notice>}
        {needsAttention && <View style={{borderWidth: 1, borderColor: p.line, borderRadius: tokens.radii.tile, padding: tokens.space.compact, marginVertical: tokens.space.small, gap: tokens.space.tiny}}>
          <Type style={{color: p.primaryText, fontWeight: '600'}}>Needs attention</Type>
          {(deviceAttention.length > 0 || Boolean(shareInbox.error)) && <Pressable accessibilityRole="button"
            onPress={() => router.push('/(account)/incoming-share')} style={{minHeight: tokens.touch, justifyContent: 'center'}}>
            <Type style={{color: p.secondaryText}}>Review device shares and retry</Type>
          </Pressable>}
          {unavailable.map(item => <Pressable key={item.id} accessibilityRole="button"
            onPress={() => router.push({pathname: '/(account)/memory/[id]', params: {id: item.id}})}
            style={{minHeight: tokens.touch, justifyContent: 'center'}}>
            <Type style={{color: p.secondaryText}}>{item.title || 'Saved original unavailable'}</Type>
          </Pressable>)}
        </View>}
      </View>}
      renderItem={({item}) => <MemoryCard memory={item} busy={Boolean(working)}
        onOpen={() => router.push({pathname: '/(account)/memory/[id]', params: {id: item.id}})}
        onStar={() => void toggle(item)}/>}
      ListEmptyComponent={!store.loading && !store.error ? <EmptyState
        title={mode === 'pending' ? 'Your originals need attention.' : 'Nothing saved here yet.'}
        description={mode === 'pending' ? 'Review Needs attention above.' : 'Try All to see your other saved memories.'}
        retryLabel="Show all memories" onRetry={() => selectFilter('all')}/> : undefined}
      ListFooterComponent={store.loading ? <LoadingIndicator accessibilityLabel="Loading memories" color={p.brand}/> :
        store.hasMore ? <Pressable accessibilityRole="button" onPress={() => void store.more().catch(() => undefined)}
          style={{minHeight: tokens.touch, justifyContent: 'center', alignItems: 'center'}}>
          <Type style={{color: p.primaryText}}>Load more memories</Type>
        </Pressable> : undefined}/>
  </SafeAreaView>;
}
