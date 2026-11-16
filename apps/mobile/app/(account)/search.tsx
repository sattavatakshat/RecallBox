import React, {useState} from 'react';
import {View} from 'react-native';
import {router, useLocalSearchParams} from 'expo-router';
import {useMemories} from '../../src/memories';
import {Button, Input, Screen, TextAction, Type} from '../../src/ui';

/**
 * RB-07: Search is an intentional destination, separate from results.
 * Suggestions are derived only from the signed-in user's usable saves;
 * the empty screen never pretends that sample memories belong to the user.
 */
export default function Search() {
  const params = useLocalSearchParams<{q?: string}>();
  const [query, setQuery] = useState(typeof params.q === 'string' ? params.q : '');
  const store = useMemories();
  const suggestions = store.items.filter(item =>
    item.title.trim() && (item.kind === 'note' ||
      item.processing_state === 'ready' || item.processing_state === 'metadata_only'))
    .slice(0,4);

  function submit(value = query) {
    const q = value.trim();
    if (!q) return;
    router.push({pathname:'/(account)/results',params:{q}});
  }

  return <Screen compact>
    <TextAction label="← Library" onPress={() => router.replace('/(account)')}/>
    <Type title>Find it again.</Type>
    <Input label="Search your saved things" value={query} onChangeText={setQuery}
      autoFocus autoCapitalize="none" autoCorrect={false} maxLength={200}
      returnKeyType="search" onSubmitEditing={() => submit()}
      placeholder="That Goa guide, Java tutorial…"/>
    <Button label="Search library" disabled={!query.trim()} onPress={() => submit()}/>
    <View style={{gap:8,marginTop:16}}>
      <Type variant="section">{suggestions.length ? 'From your Library' : 'Search what you saved'}</Type>
      {suggestions.length ? suggestions.map(item =>
        <View key={item.id} style={{gap:4}}>
          <TextAction label={item.title} onPress={() => submit(item.title)}/>
        </View>) :
        <Type muted>Search by title, source, idea or phrase. Results come only from your own saved material.</Type>}
    </View>
    <Type muted variant="caption">Some saved links contain only a title or preview. Search cannot invent inaccessible details.</Type>
  </Screen>;
}
