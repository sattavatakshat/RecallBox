import React, {useCallback, useRef, useState} from 'react';
import {Alert, View} from 'react-native';
import {router, useFocusEffect} from 'expo-router';
import {ApiError, Reminder, remindersApi} from '../../src/api';
import {useSession} from '../../src/session';
import {Button, Notice, Screen, TextAction, Type, usePalette} from '../../src/ui';

function dueText(row:Reminder){
  try {return new Date(row.due_at).toLocaleString(undefined,{
    dateStyle:'medium',timeStyle:'short',timeZone:row.time_zone,
  });}
  catch {return new Date(row.due_at).toLocaleString();}
}
export default function Reminders(){
  const {authorized}=useSession();
  const auth=useRef(authorized);auth.current=authorized;
  const p=usePalette();
  const [items,setItems]=useState<Reminder[]>([]);
  const [loading,setLoading]=useState(true);
  const [hasMore,setHasMore]=useState(false);
  const [working,setWorking]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const refresh=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const result=await auth.current(access=>remindersApi.list(access));
      setItems(result.items);setHasMore(result.has_more);
    }catch{setError('Could not retrieve reminders. Check your connection and retry.');}
    finally{setLoading(false);}
  },[]);
  useFocusEffect(useCallback(()=>{void refresh();},[refresh]));

  async function complete(item:Reminder){
    if(working)return;
    setWorking(item.id);setError('');setNotice('');
    try{
      const saved=await auth.current(access=>remindersApi.complete(access,item.id,item.version));
      setItems(old=>old.map(row=>row.id===saved.id?saved:row));
      setNotice('Reminder marked completed.');
    }catch(cause){
      setError(cause instanceof ApiError&&cause.status===409
        ? 'Reminder changed elsewhere. Refresh to get the newest version.'
        : 'Update was not confirmed. The reminder remains available.');
    }finally{setWorking(null);}
  }
  function remove(item:Reminder){
    Alert.alert('Remove reminder?', 'Your original saved memory will not be deleted.',[
      {text:'Keep reminder',style:'cancel'},
      {text:'Remove',style:'destructive',onPress:()=>void (async()=>{
        setWorking(item.id);setError('');
        try{
          await auth.current(access=>remindersApi.remove(access,item.id,item.version));
          setItems(old=>old.filter(row=>row.id!==item.id));
          setNotice('Reminder removed. Your original memory is untouched.');
        }catch{setError('Removal was not confirmed. Refresh and try again.');}
        finally{setWorking(null);}
      })()},
    ]);
  }

  return <Screen compact>
    <TextAction label="← Your RecallBox" onPress={()=>router.replace('/(account)/account')}/>
    <Type title>Your reminders.</Type>
    <Type muted>Your saved memories to revisit at the time you choose.</Type>
    <Notice>These are real reminders stored in your account. RecallBox is not sending Android notification alerts in this beta.</Notice>
    {!!error&&<Notice kind="error">{error}</Notice>}
    {!!notice&&<Notice kind="success">{notice}</Notice>}
    {loading&&<Notice>Loading reminders…</Notice>}
    {!loading&&items.length===0&&<View style={{padding:18,borderRadius:16,
      backgroundColor:p.surface,gap:8}}>
      <Type variant="section">No reminders yet.</Type>
      <Type muted>Open a saved memory and choose Set a reminder to add one here.</Type>
      <Button label="Browse Library" variant="secondary" onPress={()=>router.replace('/(account)')}/>
    </View>}
    <Type variant="section">Upcoming and due</Type>
    {items.filter(item=>item.status==='scheduled').map(item=><View key={item.id}
      style={{backgroundColor:p.surface,borderRadius:16,borderWidth:1,
        borderColor:p.line,padding:16,gap:8}}>
      <Type variant="label" numberOfLines={2}>{item.source_title||'Previously saved memory'}</Type>
      <Type muted variant="caption">{dueText(item)} · {item.time_zone}</Type>
      {new Date(item.due_at).getTime()<=Date.now()&&
        <Notice kind="success">Due now. Open your saved memory when ready.</Notice>}
      <TextAction label="Open saved memory" onPress={()=>router.push({
        pathname:'/(account)/memory/[id]',params:{id:item.source_memory_id}})}/>
      <Button label="Mark completed" variant="secondary" disabled={!!working}
        busy={working===item.id} onPress={()=>void complete(item)}/>
      <TextAction label="Remove reminder" disabled={!!working} onPress={()=>remove(item)}/>
    </View>)}
    {items.some(item=>item.status==='completed')&&<>
      <Type variant="section">Completed</Type>
      {items.filter(item=>item.status==='completed').map(item=><View key={item.id}
        style={{backgroundColor:p.surface,borderRadius:16,padding:14,gap:6}}>
        <Type variant="label">{item.source_title||'Saved memory'}</Type>
        <Type muted variant="caption">Completed · {dueText(item)}</Type>
        <TextAction label="Open memory" onPress={()=>router.push({
          pathname:'/(account)/memory/[id]',params:{id:item.source_memory_id}})}/>
        <TextAction label="Remove reminder" disabled={!!working} onPress={()=>remove(item)}/>
      </View>)}
    </>}
    {hasMore&&<Notice>Showing the first 100 reminders; older entries remain saved.</Notice>}
    <Button label="Refresh reminders" variant="secondary" disabled={loading||!!working}
      onPress={()=>void refresh()}/>
  </Screen>;
}
