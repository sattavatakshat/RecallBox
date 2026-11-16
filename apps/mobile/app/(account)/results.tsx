import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, View} from 'react-native';
import {router, useLocalSearchParams} from 'expo-router';
import {MemorySummary, memoriesApi} from '../../src/api';
import {useMemories} from '../../src/memories';
import {useSession} from '../../src/session';
import {MemoryCard} from '../../src/memory-card';
import {Button, FilterChip, Notice, Screen, TextAction, Type, usePalette} from '../../src/ui';

type Kind = 'all' | 'link' | 'note' | 'image' | 'pdf';
const usable = (item: MemorySummary) =>
  item.kind === 'note' || item.processing_state === 'ready' ||
  item.processing_state === 'metadata_only';
const matches = (item: MemorySummary, kind: Kind) =>
  kind === 'all' || (kind === 'link' ? item.kind === 'link' || item.kind === 'url'
    : item.kind === kind);

/** RB-08: real result list, original search retained, no fabricated snippets. */
export default function Results() {
  const params = useLocalSearchParams<{q?: string}>();
  const q = typeof params.q === 'string' ? params.q.trim().slice(0,200) : '';
  const {authorized} = useSession();
  const auth = useRef(authorized);auth.current = authorized;
  const store = useMemories();
  const p = usePalette();
  const [items, setItems] = useState<MemorySummary[]>([]);
  const [kind, setKind] = useState<Kind>('all');
  const [starred, setStarred] = useState(false);
  const [recent, setRecent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState<string|null>(null);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    if (!q) {
      setItems([]);setError('Enter a search phrase to find your memories.');
      setSearched(true);return;
    }
    setBusy(true);setError('');setSearched(false);setItems([]);
    void (async () => {
      try {
        const result = await auth.current(token => memoriesApi.search(token,q,'keyword',undefined,starred));
        if (generation.current !== current) return;
        const keyword = result.items.filter(usable);
        setItems(keyword);
        // Only request local semantic results if keyword search found little.
        // Missing index never removes authentic keyword matches.
        if (keyword.length < 6 && q.length >= 4) {
          try {
            const related = await auth.current(token => memoriesApi.search(token,q,'semantic',undefined,starred));
            if (generation.current !== current) return;
            const ids = new Set(keyword.map(item => item.id));
            setItems([...keyword,...related.items.filter(item => usable(item) && !ids.has(item.id))]);
          } catch {
            // Keyword results still work when local embeddings aren't available.
          }
        }
      } catch {
        if (generation.current === current) setError('Search could not load. Check your connection and retry.');
      } finally {
        if (generation.current === current) {setBusy(false);setSearched(true);}
      }
    })();
    return () => {generation.current += 1;};
  },[q,starred]);

  async function toggleStar(item: MemorySummary) {
    if (working) return;
    setWorking(item.id);setError('');
    try {
      const updated = await store.edit(item.id,{expected_version:item.version,starred:!item.starred});
      setItems(current => current.map(row => row.id === item.id
        ? {...row,starred:updated.starred,version:updated.version}:row));
    } catch {
      setError('Could not change the star. Refresh this search and try again.');
    } finally {setWorking(null);}
  }

  const filtered = items.filter(item => matches(item,kind));
  const shown = recent ? [...filtered].sort((a,b) =>
    Date.parse(b.created_at)-Date.parse(a.created_at)) : filtered;

  return <Screen compact>
    <TextAction label="← Edit search" onPress={() => router.replace({
      pathname:'/(account)/search',params:{q}})}/>
    <Type variant="eyebrow" muted>SEARCH RESULTS</Type>
    <Type title>{q ? '“'+q+'”' : 'Your saved things'}</Type>
    <Type muted>{busy ? 'Looking through your Library…'
      : `${shown.length} ${shown.length === 1 ? 'result' : 'results'} from accessible saved content`}</Type>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
      {([['all','All'],['link','Links'],['note','Notes'],['image','Photos'],['pdf','PDFs']] as const)
        .map(([value,label]) => <FilterChip key={value} label={label}
          selected={kind===value} onPress={() => setKind(value)}/>)}
    </View>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
      <FilterChip label="Starred" selected={starred} onPress={() => setStarred(v => !v)}/>
      <FilterChip label="Most recent" selected={recent} onPress={() => setRecent(v => !v)}/>
    </View>
    {busy && <ActivityIndicator color={p.accent} accessibilityLabel="Searching your memories"/>}
    {!!error && <Notice kind="error">{error}</Notice>}
    {!busy && searched && !error && shown.length===0 && <View style={{gap:12,marginTop:8}}>
      <Type variant="section">Nothing found here.</Type>
      <Type muted>Try another phrase, a different type, or remove Starred. RecallBox never makes up missing source text.</Type>
      <Button variant="secondary" label="Edit search" onPress={() => router.replace({
        pathname:'/(account)/search',params:{q}})}/>
      {kind !== 'all' && <TextAction label="Show all types" onPress={() => setKind('all')}/>}
    </View>}
    {shown.map(item => <MemoryCard key={item.id} memory={item}
      busy={working===item.id}
      onOpen={() => router.push({pathname:'/(account)/memory/[id]',params:{id:item.id}})}
      onStar={() => void toggleStar(item)}/>)}
    <Type muted variant="caption">Results are drawn from your own saved titles, notes and available source text. Restricted links may have limited previews.</Type>
    {error && <Button variant="secondary" label="Edit search and try again" onPress={() => router.replace({
      pathname:'/(account)/search',params:{q}})}/>}
  </Screen>;
}
