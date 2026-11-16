import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { MemorySummary } from '../../src/api';
import { errorMessage, useMemories } from '../../src/memories';
import { Button, Notice, RecoveryState, Type, tokens, usePalette } from '../../src/ui';
import { EmptyLibrary } from '../../src/empty-library';
import {isUsableMemory, isUnfinishedMemory, libraryMode} from '../../src/library-state';
import { MemoryCard } from '../../src/memory-card';

export default function Inbox() {
  const store = useMemories();
  const p = usePalette();
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [topic, setTopic] = useState<string | null>(null);
  // Only a finalized, usable memory belongs in the Library. An honestly
  // link-only result (metadata_only) is usable; queued/failed ones remain
  // discoverable through Recently Captured instead.
  const usable = store.items.filter(isUsableMemory);
  const unfinished = store.items.filter(isUnfinishedMemory);
  const unfinishedCount = unfinished.length;
  const mode = libraryMode(store);
  const topicOf = (item: MemorySummary) =>
    item.topic_override === 'Uncategorized' ? null :
      (item.topic_override ?? item.suggested_topic ?? null);
  const topics = Array.from(new Set(usable.map(topicOf).filter((value): value is string => Boolean(value))))
    .slice(0, 5);
  const visible = topic ? usable.filter(item => topicOf(item) === topic) : usable;
  const filters = ['All', 'Starred', ...topics, 'Archived'];
  const selectedFilter = store.archived ? 'Archived' : store.starredOnly ? 'Starred' : topic ?? 'All';
  function selectFilter(label: string) {
    if (label === 'All') { setTopic(null); void store.refresh(false, false).catch(() => undefined); }
    else if (label === 'Starred') { setTopic(null); void store.refresh(false, true).catch(() => undefined); }
    else if (label === 'Archived') { setTopic(null); void store.refresh(true, false).catch(() => undefined); }
    else { setTopic(label); void store.refresh(false, false).catch(() => undefined); }
  }
  useFocusEffect(useCallback(() => { void store.sync(); }, [store.sync]));
  useEffect(() => {
    // Look beyond a full first page of queued/failed captures before declaring
    // an account empty. Stop as soon as a usable memory is found.
    if (!store.archived && !store.starredOnly && store.initialized &&
        !store.loading && !store.error && !usable.length && store.hasMore) {
      void store.more().catch(() => undefined);
    }
  }, [store.archived, store.starredOnly, store.initialized, store.loading,
    store.error, usable.length, store.hasMore, store.more]);
  async function toggle(note: MemorySummary, field: 'starred' | 'archived') {
    if (working) return;
    setWorking(note.id); setError('');
    try { await store.edit(note.id, {expected_version: note.version, [field]: !note[field]}); }
    catch (cause) { setError(errorMessage(cause)); void store.sync(); }
    finally { setWorking(null); }
  }
  if (mode !== 'populated' && mode !== 'filtered') return <EmptyLibrary
    mode={mode} captures={unfinished} error={store.error} notice={store.notice}
    refreshing={store.loading} onRefresh={() => void store.refresh().catch(() => undefined)}
    onSave={() => router.push('/(account)/save')}
    onCaptured={() => router.push('/(account)/captured')}/>;

  return <SafeAreaView edges={['top', 'left', 'right']} style={{flex: 1, backgroundColor: p.paper}}>
    <FlatList data={visible} keyExtractor={note => note.id}
      contentContainerStyle={{padding: tokens.space.large, gap: 12, maxWidth: tokens.width, width: '100%', alignSelf: 'center', flexGrow: 1}}
      refreshing={store.loading} onRefresh={() => void store.refresh().catch(() => undefined)}
      ListHeaderComponent={<View style={{gap: 0}}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 9}}>
            <View accessible={false} style={{width: 29, height: 29, borderRadius: 8, backgroundColor: '#284D3B',
              alignItems: 'center', justifyContent: 'center'}}>
              <View style={{width: 14, height: 18, borderWidth: 1.8, borderColor: '#FFFFFF',
                borderTopLeftRadius: 2, borderTopRightRadius: 2, borderBottomWidth: 0}}/>
              <View style={{position: 'absolute', bottom: 5, width: 10, height: 10,
                borderTopWidth: 1.8, borderLeftWidth: 1.8, borderColor: '#FFFFFF',
                transform: [{rotate: '45deg'}]}}/>
            </View>
            <Type variant="label" style={{fontSize: 16, fontWeight: '700', letterSpacing: -0.5}}>recallbox</Type>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Account and settings"
            onPress={() => router.push('/(account)/account')}
            style={({pressed}) => ({width: 44, height: 44, borderRadius: 22,
              backgroundColor: pressed ? p.line : p.surfaceMuted, alignItems: 'center', justifyContent: 'center'})}>
            <View style={{width: 10, height: 10, borderRadius: 5, borderWidth: 1.8, borderColor: p.ink, marginBottom: 2}}/>
            <View style={{width: 19, height: 9, borderTopLeftRadius: 11, borderTopRightRadius: 11,
              borderWidth: 1.8, borderBottomWidth: 0, borderColor: p.ink}}/>
          </Pressable>
        </View>
        <View style={{height: 18}}/>
        <Type title>{store.archived ? 'Your archive.' : 'Your library.'}</Type>
        <View style={{height: 10}}/>
        <Type muted style={{fontSize: 14, lineHeight: 22}}>{store.archived ? 'Notes and links you’ve put aside, still here when you need them.' : usable.length > 0 ? 'The things worth remembering.' : 'Everything you wanted to remember, in one place.'}</Type>
        <View style={{height: 22}}/>
        <Pressable accessibilityRole="button" accessibilityLabel="Find something you saved"
          onPress={() => router.push('/(account)/search')}
          style={({pressed}) => ({minHeight: 56, paddingHorizontal: 18, paddingVertical: 16,
            borderRadius: tokens.radius, borderWidth: 1, borderColor: p.line,
            backgroundColor: p.surface, justifyContent: 'center', opacity: pressed ? 0.65 : 1})}>
          <Type muted style={{fontSize: 13}}>⌕  {usable.length > 0 ? 'Find that thing you saved...' : 'Find something you saved...'}</Type>
        </Pressable>
        {(usable.length > 0 || store.starredOnly || store.archived) && <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{gap: 8, alignItems: 'center', paddingVertical: 16}}>
            {filters.map(label => {
              const selected = selectedFilter === label;
              return <Pressable key={label} accessibilityRole="button" accessibilityLabel={`Filter: ${label}`}
                accessibilityState={{selected}} disabled={store.loading} onPress={() => selectFilter(label)}
                style={{minHeight: 40, borderRadius: 30, borderWidth: 1, borderColor: selected ? p.accent : p.line,
                  backgroundColor: selected ? p.accent : 'transparent', paddingHorizontal: 14,
                  alignItems: 'center', justifyContent: 'center'}}>
                <Text style={{fontSize: 12, fontWeight: '600', color: selected ? p.onAccent : p.muted}}>{label}</Text>
              </Pressable>;
            })}
          </ScrollView>
          <Type style={{fontSize: 14, fontWeight: '700', marginTop: 14, marginBottom: 10}}>
            {store.archived ? 'Archived' : store.starredOnly ? 'Starred' : topic || 'Recently saved'}
          </Type>
        </>}
        {(store.error || error) && <Notice kind="error">{store.error || error}</Notice>}
        {!!store.notice && <Notice>{store.notice}</Notice>}
      </View>}
      ListEmptyComponent={store.loading
        ? <ActivityIndicator accessibilityLabel="Loading your memories" color={p.ink}/>
        : store.error
          ? <RecoveryState title="Your library couldn't load."
              description="Check your connection and try again. Your existing saves have not been deleted."
              onRetry={() => void store.refresh().catch(() => undefined)}/>
          : topic
            ? <View style={{paddingVertical: tokens.space.section, gap: tokens.space.medium}}>
                <Type variant="section">Nothing saved under {topic}.</Type>
                <Type muted>Topics are suggested only when supported by a source.</Type>
                <Button variant="secondary" label="Show all memories" onPress={() => setTopic(null)}/>
              </View>
          : store.starredOnly || store.archived
            ? <View style={{paddingVertical: tokens.space.section, gap: tokens.space.medium}}>
                <Type variant="section">{store.starredOnly ? 'No starred memories yet.' : 'Nothing tucked away.'}</Type>
                <Type muted>{store.starredOnly
                  ? 'Star a memory to keep it close. Your other saves are still in the Library.'
                  : 'Archived memories will show up here without leaving your account.'}</Type>
                <Button label="Back to all memories" variant="secondary"
                  onPress={() => void store.refresh(false, false).catch(() => undefined)}/>
              </View>
            : undefined}

      renderItem={({item}) => <MemoryCard
        memory={item} busy={Boolean(working)}
        onOpen={() => router.push({pathname: '/(account)/memory/[id]', params: {id: item.id}})}
        onStar={() => void toggle(item, 'starred')}/>}
      ListFooterComponent={<View style={{paddingTop: 12, paddingBottom: 16}}>
        {usable.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Recently captured"
          onPress={() => router.push('/(account)/captured')}
          style={{minHeight: 49, borderRadius: 13, borderWidth: 1, borderColor: p.line,
            backgroundColor: p.surface, paddingHorizontal: 12, flexDirection: 'row',
            alignItems: 'center', justifyContent: 'space-between'}}>
          <Type style={{fontSize: 12, fontWeight: '700'}}>Recently captured</Type>
          <Type muted variant="caption">{unfinishedCount} items  ›</Type>
        </Pressable>}
        {store.hasMore && <Button label="Load earlier notes" busy={store.loading}
        onPress={() => void store.more().catch(() => undefined)}/>}
      </View>}
    />
  </SafeAreaView>;
}
