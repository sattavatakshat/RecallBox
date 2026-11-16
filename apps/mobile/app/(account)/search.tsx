import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, View} from 'react-native';
import {router, useFocusEffect} from 'expo-router';
import {memoriesApi, MemorySummary} from '../../src/api';
import {useSession} from '../../src/session';
import {Button, Input, Notice, Screen, TextAction, Type} from '../../src/ui';

export default function Search() {
  const {authorized} = useSession();
  const auth = useRef(authorized); auth.current = authorized;
  const [q, setQ] = useState('');
  const [items, setItems] = useState<MemorySummary[]>([]);
  const [status, setStatus] = useState('Search everything you saved.');
  const [busy, setBusy] = useState(false);
  const [collection, setCollection] = useState('');
  const [starred, setStarred] = useState(false);
  const [collections, setCollections] = useState<{collection:string;count:number}[]>([]);
  const sequence = useRef(0);

  useFocusEffect(useCallback(() => {
    let active=true;
    void auth.current(memoriesApi.collections).then(result => {
      if(active) setCollections(result.items);
    }).catch(() => undefined);
    return () => {active=false;};
  }, []));

  async function search(requestId?: number) {
    const current = requestId ?? ++sequence.current;
    const query = q.trim();
    if (!query && !collection && !starred) {
      setItems([]); setStatus('Search everything you saved.'); setBusy(false);
      return;
    }
    setBusy(true); setStatus('Looking through your library…');
    try {
      const result = await authorized(token =>
        memoriesApi.search(token, query, 'keyword', collection || undefined, starred));
      if (current !== sequence.current) return;
      setItems(result.items);
      setStatus(result.items.length
        ? `${result.items.length} saved ${result.items.length === 1 ? 'thing' : 'things'} found`
        : 'Nothing matched. Try another word or remove a filter.');
    } catch {
      if (current === sequence.current)
        setStatus('Search could not load. Check your connection and try again.');
    } finally {
      if (current === sequence.current) setBusy(false);
    }
  }

  // Search as the user types, without showing implementation-specific modes.
  // Sequence invalidates responses from obsolete queries or filter changes.
  useEffect(() => {
    const current = ++sequence.current;
    if (!q.trim() && !collection && !starred) {
      setItems([]); setBusy(false); setStatus('Search everything you saved.');
      return;
    }
    const timer = setTimeout(() => void search(current), 350);
    return () => {clearTimeout(timer); sequence.current += 1;};
  }, [q, collection, starred]);

  return <Screen compact>
    <Type variant="eyebrow" muted>YOUR SAVED WORLD</Type>
    <Type title>Find it again.</Type>
    <Type muted>Remember a place, idea or article? Search the things you've kept.</Type>
    <Input label="Search your library" value={q} onChangeText={setQ}
      maxLength={200} autoFocus autoCorrect={false} returnKeyType="search"
      onSubmitEditing={() => void search()} placeholder="Try a name, place or keyword"/>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>
      <TextAction label={starred ? '★ Starred only' : '☆ All memories'}
        onPress={() => setStarred(current => !current)}/>
    </View>
    {!!collections.length && <View style={{gap:6}}>
      <Type variant="caption" muted>Collection</Type>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        <TextAction label={collection ? 'All collections' : '● All collections'}
          onPress={() => setCollection('')}/>
        {collections.slice(0,7).map(item =>
          <TextAction key={item.collection}
            label={`${collection === item.collection ? '● ' : ''}${item.collection}`}
            onPress={() => setCollection(item.collection)}/>)}
      </View>
    </View>}
    <Notice>{status}</Notice>
    {items.map(item => <Pressable key={item.id} accessibilityRole="button"
      accessibilityLabel={`Open ${item.title || 'saved memory'}`}
      onPress={() => router.push({pathname:'/(account)/memory/[id]',params:{id:item.id}})}
      style={({pressed}) => ({opacity:pressed ? 0.72 : 1})}>
      <View style={{gap:6,paddingVertical:16}}>
        <Type variant="label">{item.title || 'Untitled memory'}</Type>
        {!!item.preview && <Type muted variant="caption" numberOfLines={2}>{item.preview}</Type>}
        <Type muted variant="caption">{item.kind.toUpperCase()}</Type>
      </View>
    </Pressable>)}
    {!!q.trim() && <Button variant="secondary" label={busy ? 'Searching…' : 'Search again'}
      busy={busy} onPress={() => void search()}/>}
  </Screen>;
}
