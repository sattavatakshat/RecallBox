import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ApiError, Collection, collectionsApi } from '../../src/api';
import { useSession } from '../../src/session';
import { Button, Notice, Screen, TextAction, Type, usePalette } from '../../src/ui';

export default function AddToCollection() {
  const {memoryId} = useLocalSearchParams<{memoryId: string}>();
  const {authorized} = useSession();
  const auth = useRef(authorized); auth.current = authorized;
  const p = usePalette();
  const [items, setItems] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const page = await auth.current(access => collectionsApi.list(access));
      setItems(page.items);
    } catch {
      setError('Could not load collections. Check your connection and try again.');
    } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  async function add(collectionId: string, name: string) {
    if (!memoryId || working) return;
    setWorking(collectionId); setError(''); setNotice('');
    try {
      await auth.current(access => collectionsApi.add(access, collectionId, memoryId));
      setNotice(`Added to “${name}”. Your memory stays in your library.`);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.code === 'memory_not_found'
        ? 'This memory is no longer available.'
        : 'Could not add this memory. Refresh and try again.');
    } finally { setWorking(null); }
  }

  return <Screen>
    <TextAction label="Back to memory" onPress={() => router.back()}/>
    <Type>RECALLBOX / ORGANIZE</Type>
    <Type title>Add to collection.</Type>
    <Type muted>Choose where this saved thing belongs. You can add it to more than one collection.</Type>
    {!!notice && <Notice>{notice}</Notice>}
    {!!error && <Notice>{error}</Notice>}
    {loading && <ActivityIndicator color={p.ink} accessibilityLabel="Loading collections"/>}
    {!loading && !error && !items.length && <Notice>No collections yet. Create one first, then return to this memory.</Notice>}
    {!!error && items.length > 0 && <Notice>Showing previously loaded collections. Refresh before relying on this list.</Notice>}
    <View style={{gap: 10}}>
      {items.map(item => <Button key={item.id} label={`Add to ${item.name}`}
        variant="secondary" busy={working === item.id} disabled={Boolean(working)}
        onPress={() => void add(item.id, item.name)}/>)}
    </View>
    <TextAction label="Create or manage collections"
      onPress={() => router.push('/(account)/collections')}/>
  </Screen>;
}
