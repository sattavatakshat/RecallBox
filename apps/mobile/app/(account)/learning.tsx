import React, {useCallback, useRef, useState} from 'react';
import {Alert, Linking, View} from 'react-native';
import {router, useFocusEffect} from 'expo-router';
import {ApiError, LearningItem, LearningStatus, learningApi} from '../../src/api';
import {useSession} from '../../src/session';
import {Button, Notice, Screen, TextAction, Type, usePalette} from '../../src/ui';

/** RB-17: source-linked learning, real persisted progress and server reorder. */
export default function LearningQueue() {
  const {authorized} = useSession();
  const auth = useRef(authorized); auth.current = authorized;
  const p = usePalette();
  const [items, setItems] = useState<LearningItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string|null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);setError('');
    try {
      const result = await auth.current(access => learningApi.list(access));
      setItems(result.items);setHasMore(result.has_more);
    } catch {
      setError('Your learning queue could not load. Reconnect and try again.');
    } finally {setLoading(false);}
  }, []);
  useFocusEffect(useCallback(() => {void refresh();}, [refresh]));

  async function change(item:LearningItem, patch:{status?:LearningStatus;move?:'up'|'down'}) {
    if (working || loading) return;
    setWorking(item.id);setError('');setNotice('');
    try {
      const updated = await auth.current(access => learningApi.edit(access,item.id,{
        expected_version:item.version, ...patch,
      }));
      setItems(old => old.map(row => row.id===item.id ? updated : row));
      const page = await auth.current(access=>learningApi.list(access));
      setItems(page.items);setHasMore(page.has_more);
      setNotice(patch.move ? 'Learning order updated.' :
        updated.status==='completed' ? 'Marked completed.' : 'Progress saved.');
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status===409
        ? 'Your queue changed elsewhere. Refresh before editing this item.'
        : 'Change could not be confirmed. Your source remains saved.');
    } finally {setWorking(null);}
  }

  async function open(item:LearningItem) {
    if (item.source_url) {
      try { await Linking.openURL(item.source_url); }
      catch {setError('Could not open the original link.');}
    } else {
      router.push({pathname:'/(account)/memory/[id]',
        params:{id:item.source_memory_id}});
    }
  }
  function remove(item:LearningItem) {
    Alert.alert('Remove from learning queue?',
      'Your original saved tutorial will remain in the Library.',[
        {text:'Keep',style:'cancel'},
        {text:'Remove from queue',style:'destructive',onPress:()=>void (async()=>{
          setWorking(item.id);setError('');
          try {
            await auth.current(access=>learningApi.remove(access,item.id,item.version));
            setItems(rows=>rows.filter(row=>row.id!==item.id));
            setNotice('Removed from queue. The original source was kept.');
          } catch {setError('Removal could not be confirmed. Refresh and try again.');}
          finally {setWorking(null);}
        })()},
      ]);
  }

  return <Screen compact>
    <TextAction label="← Back" onPress={()=>router.back()}/>
    <Type title>Learn next.</Type>
    <Type muted>Keep the useful tutorials together.</Type>
    {!!error&&<Notice kind="error">{error}</Notice>}
    {!!notice&&<Notice kind="success">{notice}</Notice>}
    {loading&&<Notice>Loading your saved tutorials…</Notice>}
    <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
      <Type variant="section">Your progress</Type>
      <TextAction label="Refresh" disabled={loading||!!working} onPress={()=>void refresh()}/>
    </View>
    {!loading&&items.length===0&&<View style={{backgroundColor:p.surface,
      borderRadius:16,padding:18,gap:8}}>
      <Type variant="section">Nothing in your learning queue yet.</Type>
      <Type muted>Open a saved tutorial with verified readable content, then select
        Add to learning queue from its suggested actions.</Type>
      <Button label="Return to Library" variant="secondary"
        onPress={()=>router.replace('/(account)')}/>
    </View>}
    {items.map((item,index)=><View key={item.id}
      style={{backgroundColor:p.surface,padding:16,borderRadius:16,
        borderWidth:1,borderColor:p.line,gap:10}}>
      <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
        <View style={{height:48,width:48,borderRadius:12,
          backgroundColor:p.surfaceMuted,alignItems:'center',justifyContent:'center'}}>
          <Type style={{fontSize:24,color:p.accent}}>⌘</Type>
        </View>
        <View style={{flex:1,gap:4}}>
          <Type variant="label" numberOfLines={2}>{item.source_title||'Saved learning source'}</Type>
          <Type muted variant="caption">{item.status==='not_started'?'Not started':
            item.status==='in_progress'?'In progress':'Completed'}</Type>
        </View>
      </View>
      <TextAction label="Open saved tutorial" disabled={!!working} onPress={()=>void open(item)}/>
      {item.status!=='in_progress'&&<Button label={item.status==='completed'?'Read again':'Start reading'}
        variant="secondary" busy={working===item.id} disabled={!!working}
        onPress={()=>void change(item,{status:'in_progress'})}/>}
      {item.status!=='completed'&&<Button label="Mark completed"
        busy={working===item.id} disabled={!!working}
        onPress={()=>void change(item,{status:'completed'})}/>}
      <View style={{flexDirection:'row',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
        <TextAction label="Move up" disabled={index===0||!!working}
          onPress={()=>void change(item,{move:'up'})}/>
        <TextAction label="Move down" disabled={index===items.length-1||!!working}
          onPress={()=>void change(item,{move:'down'})}/>
        <TextAction label="Remove" disabled={!!working} onPress={()=>remove(item)}/>
      </View>
      <Type muted variant="caption">Original source retained · Progress saved to your account</Type>
    </View>)}
    {hasMore&&<Notice>Showing the first 100 queued tutorials. Older entries remain saved.</Notice>}
  </Screen>;
}
