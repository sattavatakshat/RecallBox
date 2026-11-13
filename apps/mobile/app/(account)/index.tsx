import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { MemorySummary } from '../../src/api';
import { errorMessage, useMemories } from '../../src/memories';
import { Button, Notice, TextAction, Type, tokens, usePalette } from '../../src/ui';

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
        <View style={{flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between'}}>
          <Type>RECALLBOX</Type><View style={{flexDirection: 'row', flexWrap: 'wrap'}}>
          <TextAction label="Search" onPress={() => router.push('/(account)/search')}/>
          <TextAction label="Account" onPress={() => router.push('/(account)/account')}/>
        </View>
        </View>
        <Type title>{store.archived ? 'Your archive.' : 'Your library.'}</Type>
        <Type muted>{store.archived ? 'Notes you’ve put aside, still here when you need them.' : 'A little space for what you want to remember.'}</Type>
        <Button label="Save something" onPress={() => router.push('/(account)/save')}/>
        <TextAction label={store.archived ? 'Return to inbox' : 'Open archive'} disabled={store.loading}
          onPress={() => void store.refresh(!store.archived).catch(() => undefined)}/>
        {(store.error || error) && <Notice>{store.error || error}</Notice>}
        {!!store.notice && <Notice>{store.notice}</Notice>}
      </View>}
      ListEmptyComponent={store.loading ? <ActivityIndicator accessibilityLabel="Loading notes" color={p.ink}/> :
        <View style={{paddingVertical: 32, gap: 12}}><Type title>{store.archived ? 'Nothing tucked away.' : 'Your first saved thought.'}</Type>
          <Type muted>{store.archived ? 'Archived notes will appear here.' : 'Save a useful link or write a thought. It will stay in your private library.'}</Type>
          {!!store.error && <Button label="Try again" onPress={() => void store.refresh().catch(() => undefined)}/>}</View>}
      renderItem={({item}) => <View style={{borderBottomWidth: 1, borderColor: p.line, paddingVertical: 16, gap: 10}}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.title || (item.kind === 'link' ? 'Saved link' : 'Untitled note')}`}
          style={{minHeight: 64, gap: 10}} onPress={() => router.push({pathname: '/(account)/memory/[id]', params: {id: item.id}})}>
          <Type>{item.starred ? '★  ' : ''}{item.title || (item.kind === 'link' ? 'Saved link' : 'Untitled note')}</Type>
          <Type muted>{item.preview}</Type>
          <Type muted>{item.kind === 'link' ? 'SAVED LINK' : 'NOTE'}</Type>
          <Type muted>{new Date(item.created_at).toLocaleDateString()}</Type>
        </Pressable>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 20}}>
          <TextAction label={item.starred ? 'Unstar' : 'Star'} disabled={Boolean(working)} onPress={() => void toggle(item, 'starred')}/>
          <TextAction label={item.archived ? 'Move to inbox' : 'Archive'} disabled={Boolean(working)} onPress={() => void toggle(item, 'archived')}/>
        </View>
      </View>}
      ListFooterComponent={store.hasMore ? <Button label="Load earlier notes" busy={store.loading}
        onPress={() => void store.more().catch(() => undefined)}/> : <View style={{height: 16}}/>}
    />
  </SafeAreaView>;
}
