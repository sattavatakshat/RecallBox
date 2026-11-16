import React, {useCallback, useRef, useState} from 'react';
import {ActivityIndicator, Linking, View} from 'react-native';
import {router, useFocusEffect} from 'expo-router';
import {ApiError, MemorySummary, memoriesApi} from '../../src/api';
import {useSession} from '../../src/session';
import {Button, Notice, Screen, TextAction, Type, usePalette} from '../../src/ui';

type Capture = MemorySummary;
const pending = (item: Capture) => item.processing_state === 'queued' ||
  item.processing_state === 'processing';
const unresolved = (item: Capture) => pending(item) || item.processing_state === 'failed';

/**
 * RB-05: a recovery view of only server-confirmed captures.
 * No pretend on-device queue and no fabricated progress percentages.
 */
export default function RecentlyCaptured() {
  const {authorized} = useSession();
  const auth=useRef(authorized); auth.current=authorized;
  const p=usePalette();
  const [items,setItems]=useState<Capture[]>([]);
  const [cursor,setCursor]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [working,setWorking]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [needsLogin,setNeedsLogin]=useState(false);
  const [notice,setNotice]=useState('');
  const hasPending=useRef(false);
  const generation=useRef(0);

  const load=useCallback(async (next?:string, quiet=false)=>{
    const current=++generation.current;
    if(!quiet){setLoading(true);setError('');}
    try {
      const page=await auth.current(access=>memoriesApi.list(access,false,next));
      if(current!==generation.current)return;
      setItems(prev=>next
        ? [...prev.filter(old=>!page.items.some(incoming=>incoming.id===old.id)),...page.items]
        : page.items);
      setCursor(page.next_cursor);
      hasPending.current=page.items.some(pending);
      setNeedsLogin(false);
    }catch(cause){
      if(current!==generation.current)return;
      if(cause instanceof ApiError&&cause.status===401){
        setNeedsLogin(true);setError('Your session needs attention. Sign in again to check captured items.');
      }else{setError('Could not refresh captures. Check your connection and try again.');}
    }finally{if(current===generation.current&&!quiet)setLoading(false);}
  },[]);

  useFocusEffect(useCallback(()=>{
    void load();
    const interval=setInterval(()=>{
      if(hasPending.current)void load(undefined,true);
    },12000);
    return ()=>{generation.current+=1;clearInterval(interval);};
  },[load]));

  async function retry(item:Capture){
    if(working)return;
    setWorking(item.id);setError('');setNotice('');
    try {
      await auth.current(access=>memoriesApi.retry(access,item.id));
      setNotice('Processing requested. Your original source remains saved.');
      await load();
    }catch(cause){
      if(cause instanceof ApiError && cause.status===401){
        setNeedsLogin(true);setError('Sign in again before retrying this capture.');
      }else setError('Retry was not confirmed. The original server-saved item remains here.');
    }finally{setWorking(null);}
  }

  const waiting=items.filter(pending);
  const failed=items.filter(item=>item.processing_state==='failed');
  const pendingCount=waiting.length+failed.length;
  function card(item:Capture){
    const broken=item.processing_state==='failed';
    const type=item.kind==='image'?'Photo':item.kind==='pdf'?'PDF':
      item.kind==='url'||item.kind==='link'?'Link':'Note';
    return <View key={item.id} style={{
      flexDirection:'row',gap:12,padding:14,borderRadius:16,
      backgroundColor:p.surface,borderWidth:1,borderColor:p.line,
    }}>
      <View style={{width:48,height:48,borderRadius:12,
        backgroundColor:p.surfaceMuted,alignItems:'center',justifyContent:'center'}}>
        <Type style={{fontSize:20}}>{broken?'!':'◷'}</Type>
      </View>
      <View style={{flex:1,gap:5}}>
        <Type variant="label" numberOfLines={2}>
          {item.title||item.source_url||`Saved ${type.toLowerCase()}`}
        </Type>
        <Type muted variant="caption">{type} · {new Date(item.created_at).toLocaleDateString()}</Type>
        <Type muted variant="caption">
          {broken?'Needs attention — processing did not finish':
            item.processing_state==='queued'?'Waiting for processing':'Checking source details'}
        </Type>
        {broken&&<TextAction label={working===item.id?'Retrying…':'Retry processing'}
          disabled={Boolean(working)||loading} onPress={()=>void retry(item)}/>}
        {!!item.source_url&&<TextAction label="Open original source"
          onPress={()=>void Linking.openURL(item.source_url!).catch(()=>
            setError('Unable to open the original source on this device.'))}/>}
        <TextAction label="View saved record" onPress={()=>router.push({
          pathname:'/(account)/memory/[id]',params:{id:item.id},
        })}/>
      </View>
    </View>;
  }

  return <Screen compact>
    <TextAction label="← Library" onPress={()=>router.replace('/(account)')}/>
    <Type variant="eyebrow" muted>CAPTURE RECOVERY</Type>
    <Type title>Recently captured.</Type>
    <Type muted>Only captures confirmed by RecallBox are shown here while their details are unfinished.</Type>
    {!!error&&<Notice kind="error">{error}</Notice>}
    {!!notice&&<Notice kind="success">{notice}</Notice>}
    {needsLogin&&<Button variant="secondary" label="Sign in again"
      onPress={()=>router.replace('/sign-in')}/>}
    <View style={{gap:12}}>
      <Type variant="section">Waiting {waiting.length>0?`· ${waiting.length}`:''}</Type>
      {waiting.length?waiting.map(card):<Type muted>No server-confirmed captures waiting on this page.</Type>}
    </View>
    <View style={{gap:12}}>
      <Type variant="section">Needs attention {failed.length>0?`· ${failed.length}`:''}</Type>
      {failed.length?failed.map(card):<Type muted>No failed captures on this page.</Type>}
    </View>
    <View style={{gap:8}}>
      <Type variant="section">On this device</Type>
      <Notice>An offline outbox is not installed. An upload that never reached the server is not shown as Saved.
        If your connection failed before confirmation, reopen the original item and retry.</Notice>
    </View>
    {loading&&<ActivityIndicator accessibilityLabel="Loading captured items" color={p.accent}/>}
    {!!cursor&&!loading&&<Button label="Show older captures" variant="secondary"
      onPress={()=>void load(cursor)}/>}
    {!loading&&!cursor&&!pendingCount&&!error&&<Type muted>Nothing needs recovery right now.</Type>}
    <TextAction label="Troubleshoot sync or session" onPress={()=>router.push('/(account)/recovery')}/>
    <Button label="Refresh capture status" variant="secondary" disabled={loading}
      onPress={()=>void load()}/>
    <Type muted variant="caption">Completed memories appear in your Library. A finished link-only preview is also usable there.</Type>
  </Screen>;
}
