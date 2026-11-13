import React, { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { MemorySummary, memoriesApi } from '../../src/api';
import { errorMessage } from '../../src/memories';
import { useSession } from '../../src/session';
import { Button, Input, Notice, Screen, TextAction, Type, usePalette } from '../../src/ui';

export default function SearchLibrary() {
  const {authorized} = useSession();
  const p = usePalette();
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [results, setResults] = useState<MemorySummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function search() {
    const value = query.trim();
    if (!value || busy) return;
    setBusy(true); setError('');
    try {
      const page = await authorized(token => memoriesApi.search(token, value));
      setResults(page.items); setHasMore(page.has_more); setSearched(value);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  return <Screen>
    <TextAction label="Back to library" onPress={() => router.replace('/(account)')}/>
    <Type>YOUR LIBRARY / SEARCH</Type>
    <Type title>Find something you saved.</Type>
    <Type muted>Find words in your saved titles, notes, and links. Semantic search is not available yet.</Type>
    <Input label="Search your library" value={query} onChangeText={setQuery}
      returnKeyType="search" onSubmitEditing={() => void search()}
      maxLength={160} placeholder="Goa, Java, a restaurant…"
      autoCapitalize="none" autoCorrect={false}/>
    <Button label="Find saved things" busy={busy} disabled={!query.trim()}
      onPress={() => void search()}/>
    {!!error && <Notice>{error}</Notice>}
    {busy && <ActivityIndicator color={p.ink} accessibilityLabel="Searching saved things"/>}
    {!!searched && <Type muted>{results.length
      ? `Matches for “${searched}”`
      : `No saved items found for “${searched}”.`}</Type>}
    <View style={{gap: 2}}>
      {results.map(item => <Pressable key={item.id}
        accessibilityRole="button" accessibilityLabel={`Open ${item.title || (item.kind === 'link' ? 'saved link' : 'saved note')}`}
        onPress={() => router.push({pathname: '/(account)/memory/[id]', params: {id: item.id}})}
        style={({pressed}) => ({borderBottomWidth: 1, borderBottomColor: p.line, paddingVertical: 18,
          opacity: pressed ? 0.65 : 1, gap: 6})}>
        <Type>{item.title || (item.kind === 'link' ? 'Saved link' : 'Untitled note')}</Type>
        <Type muted>{item.preview}</Type>
        <Type muted>{item.kind === 'link' ? 'LINK' : 'NOTE'} · {new Date(item.created_at).toLocaleDateString()}</Type>
      </Pressable>)}
    </View>
    {hasMore && <Notice>Showing the 50 most recent matches. Try a more specific word to narrow the results.</Notice>}
  </Screen>;
}
