import React, {useCallback, useState} from 'react';
import {ActivityIndicator, Linking, Pressable, ScrollView, View} from 'react-native';
import {router, useFocusEffect} from 'expo-router';
import {MemorySummary, memoriesApi} from '../../src/api';
import {useSession} from '../../src/session';
import {errorMessage} from '../../src/memories';
import {Button, Notice, Screen, TextAction, Type, usePalette} from '../../src/ui';

type Capture = MemorySummary;
const unfinished = (item: Capture) => ['queued', 'processing', 'failed'].includes(item.processing_state);

export default function RecentlyCaptured() {
  const {authorized} = useSession();
  const palette = usePalette();
  const [items, setItems] = useState<Capture[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async (next?: string) => {
    setLoading(true); setError('');
    try {
      const page = await authorized(access => memoriesApi.list(access, false, next));
      setItems(previous => next ? [...previous.filter(p => !page.items.some(n => n.id === p.id)), ...page.items] : page.items);
      setCursor(page.next_cursor);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setLoading(false); }
  }, [authorized]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  async function retry(item: Capture) {
    if (working) return;
    setWorking(item.id); setError('');
    try {
      await authorized(access => memoriesApi.retry(access, item.id));
      await load();
    } catch (cause) {setError(errorMessage(cause));}
    finally {setWorking(null);}
  }
  const waiting = items.filter(item => unfinished(item) && item.processing_state !== 'failed');
  const failed = items.filter(item => item.processing_state === 'failed');
  function entry(item: Capture) {
    const isFailed = item.processing_state === 'failed';
    return <View key={item.id} style={{flexDirection:'row', gap:12, padding:14,
      backgroundColor:palette.surface, borderColor:palette.line, borderWidth:1, borderRadius:14}}>
      <View style={{width:46,height:46,borderRadius:10,backgroundColor:palette.surfaceMuted,
        justifyContent:'center',alignItems:'center'}}>
        <Type style={{fontSize:21}}>{isFailed ? '!' : '◷'}</Type>
      </View>
      <View style={{flex:1,gap:5}}>
        <Type variant="label">{item.title || item.source_url || 'Untitled capture'}</Type>
        <Type muted variant="caption">{isFailed ? 'Needs attention' :
          item.processing_state === 'queued' ? 'Waiting to process' : 'Processing details'} · {new Date(item.created_at).toLocaleDateString()}</Type>
        {isFailed && <Type muted variant="caption">The source was saved, but processing failed.</Type>}
        {isFailed && <TextAction label="Retry processing" disabled={Boolean(working)}
          onPress={() => void retry(item)}/>}
        {!!item.source_url && <TextAction label="Open original" onPress={() => {
          void Linking.openURL(item.source_url!).catch(() => setError('Could not open the original link.'));
        }}/>}
      </View>
    </View>;
  }
  return <Screen>
    <ScrollView contentContainerStyle={{gap:16,paddingBottom:28}}>
      <TextAction label="Back to Library" onPress={() => router.back()}/>
      <Type variant="eyebrow" muted>CAPTURE RECOVERY</Type>
      <Type title>Recently captured.</Type>
      <Type muted>Saved items waiting for final processing live here, not in your Library.</Type>
      {!!error && <Notice kind="error">{error}</Notice>}
      <Type variant="section">Waiting</Type>
      {waiting.length ? waiting.map(entry) : <Type muted>No server captures waiting in this page.</Type>}
      <Type variant="section">Needs attention</Type>
      {failed.length ? failed.map(entry) : <Type muted>No failed server captures in this page.</Type>}
      <Type variant="section">On this device</Type>
      <Notice>Offline captures are not stored in a durable local outbox yet. Do not assume an unsent item was saved. Retry from the original source when connected.</Notice>
      {loading && <ActivityIndicator accessibilityLabel="Loading captures" color={palette.ink}/>}
      {!!cursor && !loading && <Button label="Load more captures" variant="secondary" onPress={() => void load(cursor)}/>}
      {!loading && !cursor && !waiting.length && !failed.length && !error &&
        <Type muted>Nothing needs recovery right now.</Type>}
      <Pressable accessibilityRole="button" onPress={() => void load()}
        style={{minHeight:48,justifyContent:'center'}}>
        <Type muted>Refresh capture status</Type>
      </Pressable>
    </ScrollView>
  </Screen>;
}
