import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ApiError, Collection, collectionsApi } from '../../src/api';
import { useSession } from '../../src/session';
import { Button, Input, Notice, Screen, TextAction, Type, usePalette } from '../../src/ui';

export default function Collections() {
  const {authorized} = useSession();
  const auth = useRef(authorized); auth.current = authorized;
  const p = usePalette();
  const [items, setItems] = useState<Collection[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const page = await auth.current(access => collectionsApi.list(access));
      setItems(page.items); setHasMore(page.has_more);
    } catch {
      setError('Could not load your collections. Check your connection and retry.');
    } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  async function create() {
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await auth.current(access => collectionsApi.create(access, value));
      // Creation is confirmed by the POST response. A follow-up list refresh
      // can fail independently; do not report a successful save as uncertain.
      setName('');
      setItems(previous => [result, ...previous.filter(item => item.id !== result.id)]);
      router.push({pathname: '/(account)/collection/[id]', params: {id: result.id}});
    } catch (cause) {
      setError(cause instanceof ApiError && cause.code === 'collection_name_exists'
        ? 'A collection with that name already exists. Choose another name.'
        : 'Collection save was not confirmed. Refresh your collections before retrying.');
    } finally { setBusy(false); }
  }

  return <Screen>
    <TextAction label="Back to library" onPress={() => router.replace('/(account)')}/>
    <Type>RECALLBOX / COLLECTIONS</Type>
    <Type title>Your collections.</Type>
    <Type muted>Group saved things your way. A memory can belong to more than one collection.</Type>
    <Input label="New collection name" value={name} onChangeText={setName}
      maxLength={80} placeholder="Places to visit, Java notes…" autoCapitalize="sentences"/>
    <Button label="Create collection" busy={busy} disabled={!name.trim()} onPress={() => void create()}/>
    {!!notice && <Notice>{notice}</Notice>}
    {!!error && <Notice>{error}</Notice>}
    <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
      <Type>YOUR GROUPS</Type>
      <TextAction label="Refresh" disabled={loading || busy} onPress={() => void refresh()}/>
    </View>
    {loading && <ActivityIndicator accessibilityLabel="Loading collections" color={p.ink}/>}
    {!loading && items.length === 0 && <Notice>No collections yet. Create one to organize a few favorites.</Notice>}
    {items.map(item => <Pressable key={item.id} accessibilityRole="button"
      accessibilityLabel={`Open collection ${item.name}`}
      onPress={() => router.push({pathname: '/(account)/collection/[id]', params: {id: item.id}})}
      style={({pressed}) => ({borderBottomWidth: 1, borderBottomColor: p.line,
        paddingVertical: 16, gap: 8, opacity: pressed ? 0.65 : 1})}>
      <Type>{item.name}</Type>
      <Type muted>{item.item_count ?? 0} saved {item.item_count === 1 ? 'thing' : 'things'}</Type>
    </Pressable>)}
    {hasMore && <Notice>Showing the newest 100 collections. Remove an unused group to make room for another.</Notice>}
  </Screen>;
}
