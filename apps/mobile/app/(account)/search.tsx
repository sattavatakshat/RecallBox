import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { memoriesApi, MemorySummary } from '../../src/api';
import { useSession } from '../../src/session';
import { Button, Input, Notice, Screen, TextAction, Type } from '../../src/ui';

export default function Search() {
  const {authorized} = useSession();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<MemorySummary[]>([]);
  const [status, setStatus] = useState('Search your saved titles and content.');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current += 1; }, []);
  async function search() {
    const current = ++sequence.current;
    setBusy(true); setItems([]); setStatus('Searching your library…');
    try {
      const result = await authorized(token => memoriesApi.search(token, q.trim()));
      if (current !== sequence.current) return;
      setItems(result.items);
      setStatus(result.items.length ? `${result.items.length} results · includes archived memories` : 'No matches. Try a different word.');
    } catch { if (current === sequence.current) setStatus('Search could not load. Check your connection and try again.'); }
    finally { if (current === sequence.current) setBusy(false); }
  }
  return <Screen><TextAction label="Back to library" onPress={() => router.back()}/>
    <Type title>Find it again.</Type>
    <Input label="Search memories" value={q} onChangeText={setQ} maxLength={200} returnKeyType="search" onSubmitEditing={() => {if(q.trim()) void search();}}/>
    <Button label="Search your library" busy={busy} disabled={!q.trim()} onPress={() => void search()}/>
    <Notice>{status}</Notice>
    {items.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push({pathname: '/(account)/memory/[id]', params: {id: item.id}})}>
      <View style={{gap: 10, paddingVertical: 16}}><Type>{item.starred ? '★ ' : ''}{item.title || 'Untitled memory'}</Type><Type muted>{item.preview}</Type></View>
    </Pressable>)}
  </Screen>;
}
