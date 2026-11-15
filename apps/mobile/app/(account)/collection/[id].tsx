import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ApiError, CollectionDetail, collectionsApi } from '../../../src/api';
import { useSession } from '../../../src/session';
import { Button, Input, Notice, Screen, TextAction, Type, usePalette } from '../../../src/ui';

export default function CollectionScreen() {
  const {id} = useLocalSearchParams<{id: string}>();
  const {authorized} = useSession();
  const auth = useRef(authorized); auth.current = authorized;
  const p = usePalette();
  const [data, setData] = useState<CollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError('');
    try {
      const found = await auth.current(access => collectionsApi.get(access, id));
      setData(found); setDraftName(found.name);
    } catch {
      setError('This collection could not be opened. It may have been removed.');
    } finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  async function rename() {
    if (!data || !draftName.trim() || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await auth.current(access => collectionsApi.rename(access, id, draftName.trim(), data.version));
      setData({...data, ...updated}); setRenaming(false); setNotice('Collection renamed.');
    } catch (cause) {
      setError(cause instanceof ApiError && cause.code === 'collection_name_exists'
        ? 'Another collection has that name.'
        : 'Rename was not confirmed. Refresh the collection and try again.');
    } finally { setBusy(false); }
  }

  function removeCollection() {
    if (!data || busy) return;
    Alert.alert('Remove this collection?', 'Saved notes and links will remain in your library.', [
      {text: 'Keep collection', style: 'cancel'},
      {text: 'Remove collection', style: 'destructive', onPress: () => void (async () => {
        setBusy(true); setError('');
        try {
          await auth.current(access => collectionsApi.remove(access, id, data.version));
          router.replace('/(account)/collections');
        } catch {
          setError('Removal could not be confirmed. Refresh and try again.');
        } finally { setBusy(false); }
      })()},
    ]);
  }

  function removeItem(memoryId: string, title: string) {
    Alert.alert('Remove from collection?', `“${title}” will stay in your private library.`, [
      {text: 'Keep here', style: 'cancel'},
      {text: 'Remove from collection', style: 'destructive', onPress: () => void (async () => {
        setBusy(true); setError('');
        try {
          await auth.current(access => collectionsApi.removeItem(access, id, memoryId));
          // The DELETE is confirmed independently of a later network refresh.
          // Never report a successful removal as failed because a GET failed.
          setData(current => current ? {
            ...current,
            items: current.items.filter(item => item.id !== memoryId),
          } : current);
          setNotice('Removed from this collection. The memory was kept.');
        } catch {
          setError('Could not remove that item. Try again.');
        } finally { setBusy(false); }
      })()},
    ]);
  }

  return <Screen>
    <TextAction label="Back to collections" onPress={() => router.replace('/(account)/collections')}/>
    <Type>RECALLBOX / YOUR GROUP</Type>
    <Type title>{data?.name ?? 'Your collection.'}</Type>
    <Type muted>Memories you chose to keep together. No automated folder decisions.</Type>
    {!!error && <Notice>{error}</Notice>}
    {!!notice && <Notice>{notice}</Notice>}
    {loading && <ActivityIndicator accessibilityLabel="Opening collection" color={p.ink}/>}
    {data && <>
      {renaming ? <>
        <Input label="Collection name" value={draftName} onChangeText={setDraftName}
          maxLength={80} editable={!busy}/>
        <Button label="Save collection name" busy={busy} disabled={!draftName.trim()}
          onPress={() => void rename()}/>
        <TextAction label="Cancel rename" onPress={() => {setRenaming(false); setDraftName(data.name);}}/>
      </> : <TextAction label="Rename collection" onPress={() => setRenaming(true)} disabled={busy}/>}
      <Type>RECENTLY ADDED</Type>
      {data.items.length === 0 && <Notice>Nothing here yet. Open a saved note or link, then choose Add to collection.</Notice>}
      {data.items.map(item => <View key={item.id} style={{borderBottomWidth: 1,
        borderColor: p.line, paddingVertical: 16, gap: 8}}>
        <Pressable accessibilityRole="button"
          accessibilityLabel={`Open ${item.title || 'memory'}`}
          onPress={() => router.push({pathname: '/(account)/memory/[id]', params: {id: item.id}})}>
          <Type>{item.title || (item.kind === 'link' ? 'Saved link' : 'Untitled note')}</Type>
          <Type muted>{item.preview}</Type>
        </Pressable>
        <TextAction label="Remove from collection" disabled={busy}
          onPress={() => removeItem(item.id, item.title || 'This memory')}/>
      </View>)}
      {data.has_more && <Notice>Showing the newest 100 items. Older items remain saved in this collection.</Notice>}
      <TextAction label="Remove this collection" disabled={busy} onPress={removeCollection}/>
    </>}
    {!loading && !data && <Button label="Try again" onPress={() => void refresh()}/>}
  </Screen>;
}
