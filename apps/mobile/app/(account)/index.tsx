import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, FlatList, Pressable, ScrollView, Text, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import {router, useFocusEffect} from 'expo-router';
import {MemorySummary} from '../../src/api';
import {errorMessage, useMemories} from '../../src/memories';
import {EmptyLibrary} from '../../src/empty-library';
import {isUsableMemory, isUnfinishedMemory, libraryMode} from '../../src/library-state';
import {MemoryCard} from '../../src/memory-card';
import {useShareInbox} from '../../src/share-inbox';
import {useSession} from '../../src/session';
import {BrandLockup, useBrandTheme, useBrandTypography} from '../../src/brand';
import {LibraryIcon} from '../../src/library-icons';

export default function Inbox() {
  const store = useMemories();
  const {account} = useSession();
  const shareInbox = useShareInbox(account?.id, store.sync);
  const p = useBrandTheme();
  const {fontFamily} = useBrandTypography();
  const dark = useColorScheme() === 'dark';
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
  const initials = account?.display_name?.trim().split(/\s+/).slice(0, 2)
    .map(part => Array.from(part)[0]).join('').toLocaleUpperCase() || 'R';
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
    <StatusBar style={dark ? 'light' : 'dark'}/>
    <FlatList ref={list} data={usable} keyExtractor={item => item.id}
      contentContainerStyle={{paddingHorizontal: 24, paddingTop: 20, paddingBottom: 100,
        maxWidth: 520, width: '100%', alignSelf: 'center', flexGrow: 1}}
      refreshing={store.loading} onRefresh={retry}
      onEndReachedThreshold={0.4} onEndReached={() => {
        if (store.hasMore && !store.loading && !store.error) void store.more().catch(() => undefined);
      }}
      initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7}
      ItemSeparatorComponent={() => <View style={{height: 1, marginLeft: 76, backgroundColor: p.line}}/>}
      ListHeaderComponent={<View>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12}}>
          <BrandLockup logoSize={40} wordmarkSize={22}/>
          <Pressable accessibilityRole="button" accessibilityLabel="Account and settings"
            onPress={() => router.push('/(account)/account')}
            style={({pressed}) => ({width: 46, height: 46, borderRadius: 23, backgroundColor: p.avatar,
              alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1})}>
            <Text maxFontSizeMultiplier={1.5} style={{fontSize: 21, fontWeight: '600', color: p.onAvatar}}>{initials}</Text>
          </Pressable>
        </View>
        <Text accessibilityRole="header" style={{fontFamily, color: p.primaryText, fontSize: 42,
          letterSpacing: -0.8, marginTop: 20, marginBottom: 20}}>{store.archived ? 'Your archive.' : 'Your library.'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Search anything you've saved"
          onPress={() => router.navigate('/(account)/search')}
          style={({pressed}) => ({minHeight: 52, borderWidth: 1, borderColor: p.line, borderRadius: 18,
            backgroundColor: p.surface, paddingHorizontal: 16, paddingVertical: 12,
            flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1})}>
          <LibraryIcon kind="search" color={p.primaryText}/>
          <Text style={{flex: 1, fontSize: 15, lineHeight: 22, color: p.secondaryText}}>Search anything you've saved…</Text>
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{gap: 7, paddingVertical: 16, alignItems: 'center'}}>
          {filters.map(filter => {
            const selected = selectedFilter === filter.key;
            return <Pressable key={filter.key} accessibilityRole="button" accessibilityLabel={`Filter: ${filter.label}`}
              accessibilityState={{selected}} disabled={store.loading} onPress={() => selectFilter(filter.key)}
              style={{minHeight: 44, borderRadius: 26, paddingHorizontal: 16, justifyContent: 'center',
                borderWidth: 1, borderColor: selected ? p.button : p.line, backgroundColor: selected ? p.button : 'transparent'}}>
              <Text style={{fontSize: 14, lineHeight: 20, fontWeight: '600', color: selected ? p.onButton : p.primaryText}}>{filter.label}</Text>
            </Pressable>;
          })}
        </ScrollView>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2}}>
          <Text accessibilityRole="header" style={{flex: 1, color: p.primaryText, fontWeight: '700', fontSize: 18, lineHeight: 25}}>Recently saved</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Sort: ${store.order === 'newest' ? 'Newest' : 'Oldest'}`}
            disabled={store.loading} onPress={sort} style={{minHeight: 48, justifyContent: 'center', paddingHorizontal: 4}}>
            <Text style={{color: p.primaryText, fontSize: 14}}>{store.order === 'newest' ? 'Newest' : 'Oldest'}  ⌄</Text>
          </Pressable>
        </View>
        {(store.error || error) ? <View style={{gap: 4, paddingVertical: 8}}>
          <Text accessibilityRole="alert" style={{color: p.error, lineHeight: 21}}>{store.error || error}</Text>
          <Pressable accessibilityRole="button" onPress={retry} style={{minHeight: 48, justifyContent: 'center'}}>
            <Text style={{color: p.primaryText, fontWeight: '600'}}>Try again</Text>
          </Pressable>
        </View> : null}
        {!!store.notice && <Text accessibilityLiveRegion="polite" style={{color: p.secondaryText, lineHeight: 21, paddingVertical: 8}}>{store.notice}</Text>}
        {needsAttention && <View style={{borderWidth: 1, borderColor: p.line, borderRadius: 14, padding: 12, marginVertical: 8, gap: 6}}>
          <Text style={{color: p.primaryText, fontWeight: '600'}}>Needs attention</Text>
          {(deviceAttention.length > 0 || Boolean(shareInbox.error)) && <Pressable accessibilityRole="button"
            onPress={() => router.push('/(account)/incoming-share')} style={{minHeight: 48, justifyContent: 'center'}}>
            <Text style={{color: p.secondaryText}}>Review device shares and retry ›</Text>
          </Pressable>}
          {unavailable.map(item => <Pressable key={item.id} accessibilityRole="button"
            onPress={() => router.push({pathname: '/(account)/memory/[id]', params: {id: item.id}})}
            style={{minHeight: 48, justifyContent: 'center'}}>
            <Text style={{color: p.secondaryText}}>{item.title || 'Saved original unavailable'} ›</Text>
          </Pressable>)}
        </View>}
      </View>}
      renderItem={({item}) => <MemoryCard memory={item} busy={Boolean(working)}
        onOpen={() => router.push({pathname: '/(account)/memory/[id]', params: {id: item.id}})}
        onStar={() => void toggle(item)}/>}
      ListEmptyComponent={!store.loading && !store.error ? <View style={{gap: 12, paddingVertical: 32}}>
        <Text style={{color: p.primaryText, fontSize: 21, fontWeight: '600'}}>
          {mode === 'pending' ? 'Your originals need attention.' : 'Nothing saved here yet.'}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => selectFilter('all')} style={{minHeight: 48, justifyContent: 'center'}}>
          <Text style={{color: p.primaryText, fontWeight: '600'}}>Show all memories</Text>
        </Pressable>
      </View> : undefined}
      ListFooterComponent={store.loading ? <ActivityIndicator accessibilityLabel="Loading memories" color={p.brand}/> :
        store.hasMore ? <Pressable accessibilityRole="button" onPress={() => void store.more().catch(() => undefined)}
          style={{minHeight: 48, justifyContent: 'center', alignItems: 'center'}}>
          <Text style={{color: p.primaryText}}>Load more memories</Text>
        </Pressable> : undefined}/>
  </SafeAreaView>;
}
