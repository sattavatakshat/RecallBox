import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, View} from 'react-native';
import {router, useFocusEffect} from 'expo-router';
import {memoriesApi, MemorySummary} from '../../src/api';
import {useSession} from '../../src/session';
import {Button, FilterChip, Input, Notice, Screen, TextAction, Type, usePalette} from '../../src/ui';

type KindFilter = 'all' | 'links' | 'notes' | 'photos' | 'pdfs';
function usable(item: MemorySummary) {
  return item.kind === 'note' || item.processing_state === 'ready' ||
    item.processing_state === 'metadata_only';
}
function displayTitle(item: MemorySummary) {
  return item.title?.trim() || (item.kind === 'note' ? 'Untitled note' :
    item.kind === 'pdf' ? 'Saved PDF' : item.kind === 'image' ? 'Saved photo' : 'Saved link');
}
function sourceName(item: MemorySummary) {
  if (item.kind === 'note') return 'Your note';
  const match = /^https?:\/\/([^/?#]+)/i.exec(item.source_url || '');
  return match?.[1]?.replace(/^www\./, '') ||
    (item.kind === 'pdf' ? 'PDF' : item.kind === 'image' ? 'Photo' : 'Link');
}
function matchesKind(item: MemorySummary, kind: KindFilter) {
  if (kind === 'all') return true;
  if (kind === 'links') return item.kind === 'link' || item.kind === 'url';
  if (kind === 'notes') return item.kind === 'note';
  if (kind === 'photos') return item.kind === 'image';
  return item.kind === 'pdf';
}
function mergeResults(primary: MemorySummary[], related: MemorySummary[]) {
  const ids = new Set(primary.map(item => item.id));
  return [...primary, ...related.filter(item => !ids.has(item.id))];
}
function SearchRow({item, open}: {item: MemorySummary; open: () => void}) {
  const p = usePalette();
  const tag = item.kind === 'note' ? '≡' : item.kind === 'pdf' ? '▤'
    : item.kind === 'image' ? '▧' : '↗';
  return <Pressable accessibilityRole="button"
    accessibilityLabel={`Open ${displayTitle(item)}`} onPress={open}
    style={({pressed}) => ({flexDirection:'row',alignItems:'center',gap:12,
      minHeight:82,paddingVertical:12,borderBottomWidth:1,borderBottomColor:p.line,
      opacity:pressed ? 0.72 : 1})}>
    <View importantForAccessibility="no-hide-descendants" style={{
      width:54,height:54,borderRadius:12,backgroundColor:p.surfaceMuted,
      alignItems:'center',justifyContent:'center'}}>
      <Type style={{fontSize:24,color:p.accent}}>{tag}</Type>
    </View>
    <View style={{flex:1,gap:4}}>
      <Type variant="label" numberOfLines={2}>{displayTitle(item)}</Type>
      {!!item.preview?.trim() && <Type muted variant="caption" numberOfLines={2}>
        {item.preview.trim()}
      </Type>}
      <Type muted variant="caption" numberOfLines={1}>{sourceName(item)}</Type>
    </View>
  </Pressable>;
}

export default function Search() {
  const {authorized} = useSession();
  const auth = useRef(authorized); auth.current = authorized;
  const [q, setQ] = useState('');
  const [items, setItems] = useState<MemorySummary[]>([]);
  const [status, setStatus] = useState('Search everything you saved.');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [collection, setCollection] = useState('');
  const [starred, setStarred] = useState(false);
  const [kind, setKind] = useState<KindFilter>('all');
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
    setBusy(true);setError(false);setStatus('Looking through your library…');
    let primary: MemorySummary[] = [];
    let primaryFailed = false;
    try {
      const result = await authorized(token =>
        memoriesApi.search(token, query, 'keyword', collection || undefined, starred));
      if (current !== sequence.current) return;
      primary = result.items.filter(usable);
      setItems(primary);
      setStatus(primary.length ? `${primary.length} saved ${primary.length === 1 ? 'thing' : 'things'} found`
        : 'Checking for related memories…');
    } catch {
      primaryFailed = true;
    }
    // Only broaden when the first pass misses likely results; semantic lookup
    // can cost more CPU and is not needed for every keystroke.
    if (query.length >= 4 && primary.length < 6) {
      try {
        const semantic = await authorized(token =>
          memoriesApi.search(token, query, 'semantic', collection || undefined, starred));
        if (current !== sequence.current) return;
        const combined = mergeResults(primary, semantic.items.filter(usable));
        setItems(combined);
        setStatus(combined.length ? `${combined.length} saved ${combined.length === 1 ? 'thing' : 'things'} found`
          : 'Nothing matched. Try another phrase or remove a filter.');
        primaryFailed = false;
      } catch {
        // A missing semantic index must never hide keyword matches.
        if (!primaryFailed) setStatus(primary.length
          ? `${primary.length} saved ${primary.length === 1 ? 'thing' : 'things'} found`
          : 'No matches found. Try another word.');
      }
    } else if (!primaryFailed && !primary.length) {
      setStatus('Nothing matched. Try another word or remove a filter.');
    }
    if (current === sequence.current) {
      if (primaryFailed) {
        setError(true);
        setStatus('Search could not load. Check your connection and retry.');
      }
      setBusy(false);
    }
  }

  useEffect(() => {
    const current = ++sequence.current;
    if (!q.trim() && !collection && !starred) {
      setItems([]);setBusy(false);setError(false);setStatus('Search everything you saved.');
      return;
    }
    const timer = setTimeout(() => void search(current), 350);
    return () => {clearTimeout(timer);sequence.current += 1;};
  }, [q, collection, starred]);

  const filtered = items.filter(item => matchesKind(item, kind));
  return <Screen compact>
    <Type variant="eyebrow" muted>YOUR SAVED WORLD</Type>
    <Type title>Find it again.</Type>
    <Type muted>Remember a place, an idea or an article? Search the things you kept.</Type>
    <Input label="Search your library" value={q} onChangeText={setQ} maxLength={200}
      autoFocus autoCorrect={false} returnKeyType="search"
      onSubmitEditing={() => void search()} placeholder="Try a name, place or phrase"/>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
      <FilterChip label={starred ? '★ Starred' : '☆ Starred'} selected={starred}
        onPress={() => setStarred(current => !current)}/>
      {!!collection && <FilterChip label={collection} selected
        onPress={() => setCollection('')}/>}
    </View>
    {!!collections.length && <View style={{gap:4}}>
      <Type muted variant="caption">Collections</Type>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        {collections.slice(0,5).map(entry =>
          <FilterChip key={entry.collection} label={entry.collection}
            selected={collection === entry.collection}
            onPress={() => setCollection(current => current === entry.collection ? '' : entry.collection)}/>)}
      </View>
    </View>}
    {items.length > 0 && <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>
      {([['all','All'],['links','Links'],['notes','Notes'],['photos','Photos'],['pdfs','PDFs']] as const)
        .map(([value,label]) => <FilterChip key={value} label={label} selected={kind===value}
          onPress={() => setKind(value)}/>)}
    </View>}
    <Notice kind={error?'error':'info'}>{status}</Notice>
    {filtered.length ? filtered.map(item => <SearchRow key={item.id} item={item}
      open={() => router.push({pathname:'/(account)/memory/[id]',params:{id:item.id}})}/>)
      : !busy && !!items.length && <Type muted>No matches in this type. Select All to see more.</Type>}
    {error && <Button variant="secondary" label="Retry search" busy={busy}
      onPress={() => void search()}/>}
    {!q.trim() && !collection && !starred && <Type muted variant="caption">
      Search looks through your saved titles, notes and available source text. New captures may take time to appear.
    </Type>}
  </Screen>;
}
