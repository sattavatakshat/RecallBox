import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { MemorySummary } from '../../src/api';
import { errorMessage, useMemories } from '../../src/memories';
import { Button, Notice, TextAction, Type, tokens, usePalette } from '../../src/ui';
import { EmptyLibrary } from '../../src/empty-library';
import { MemoryCard } from '../../src/memory-card';

export default function Inbox() {
  const store = useMemories();
  const p = usePalette();
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => { void store.sync(); }, [store.sync]));
  async function toggle(note: MemorySummary, field: 'starred' | 'archived') {
    if (working) return;
    setWorking(note.id); setError('');
    try { await store.edit(note.id, {expected_version: note.version, [field]: !note[field]}); }
    catch (cause) { setError(errorMessage(cause)); void store.sync(); }
    finally { setWorking(null); }
  }
  return <SafeAreaView style={{flex: 1, backgroundColor: p.paper}}>
    <FlatList data={store.items} keyExtractor={note => note.id}
      contentContainerStyle={{padding: tokens.space.large, gap: 12, maxWidth: tokens.width, width: '100%', alignSelf: 'center', flexGrow: 1}}
      refreshing={store.loading} onRefresh={() => void store.refresh().catch(() => undefined)}
      ListHeaderComponent={<View style={{gap: 20}}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 9}}>
            <View style={{width: 29, height: 29, borderRadius: 8, backgroundColor: '#284D3B',
              alignItems: 'center', justifyContent: 'center'}}>
              <Text style={{color: '#FFFFFF', fontSize: 19}}>▯</Text>
            </View>
            <Type variant="label" style={{fontSize: 16, letterSpacing: -0.4}}>recallbox</Type>
          </View>
          <TextAction label="Profile" onPress={() => router.push('/(account)/account')}/>
        </View>
        <Type title>{store.archived ? 'Your archive.' : 'Your library.'}</Type>
        <Type muted style={{fontSize: 14, lineHeight: 22}}>{store.archived ? 'Notes and links you’ve put aside, still here when you need them.' : store.items.length > 0 ? 'The things worth remembering.' : 'Everything you wanted to remember, in one place.'}</Type>
        <Pressable accessibilityRole="button" accessibilityLabel="Find something you saved"
          onPress={() => router.push('/(account)/search')}
          style={({pressed}) => ({minHeight: 56, paddingHorizontal: 18, paddingVertical: 16,
            borderRadius: tokens.radius, borderWidth: 1, borderColor: p.line,
            backgroundColor: p.surface, justifyContent: 'center', opacity: pressed ? 0.65 : 1})}>
          <Type muted style={{fontSize: 13}}>⌕  {store.items.length > 0 ? 'Find that thing you saved...' : 'Find something you saved...'}</Type>
        </Pressable>
        {(store.items.length > 0 || store.starredOnly || store.archived) && <View style={{flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8}}>
          <TextAction label={store.starredOnly ? 'All saved' : 'Starred only'} disabled={store.loading}
            onPress={() => void store.refresh(store.archived, !store.starredOnly).catch(() => undefined)}/>
          <TextAction label={store.archived ? 'Return to library' : 'Open archive'} disabled={store.loading}
            onPress={() => void store.refresh(!store.archived, store.starredOnly).catch(() => undefined)}/>
        </View>}
        {store.items.length > 0 && <Type variant="section">{store.archived ? 'Archived' : store.starredOnly ? 'Starred' : 'Recently saved'}</Type>}
        {(store.error || error) && <Notice>{store.error || error}</Notice>}
        {!!store.notice && <Notice>{store.notice}</Notice>}
      </View>}
      ListEmptyComponent={store.loading
        ? <ActivityIndicator accessibilityLabel="Loading your memories" color={p.ink}/>
        : store.error
          ? <View style={{paddingVertical: tokens.space.section, gap: tokens.space.medium}}>
              <Type variant="section">Your library couldn't load.</Type>
              <Type muted>Check your connection and try again. Your existing saves haven't been deleted.</Type>
              <Button label="Try again" onPress={() => void store.refresh().catch(() => undefined)}/>
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
            : <EmptyLibrary onSave={() => router.push('/(account)/save')}/>}
      renderItem={({item}) => <MemoryCard
        memory={item} busy={Boolean(working)}
        onOpen={() => router.push({pathname: '/(account)/memory/[id]', params: {id: item.id}})}
        onStar={() => void toggle(item, 'starred')}/>}
      ListFooterComponent={store.hasMore ? <Button label="Load earlier notes" busy={store.loading}
        onPress={() => void store.more().catch(() => undefined)}/> : <View style={{height: 16}}/>}
    />
  </SafeAreaView>;
}
