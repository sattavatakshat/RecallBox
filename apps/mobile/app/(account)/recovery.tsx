import {tokens} from '../../src/theme';
import {useCallback, useRef, useState} from 'react';
import {View} from 'react-native';
import {requireOptionalNativeModule} from 'expo';
import {router, useFocusEffect} from 'expo-router';
import {ApiError, MemorySummary, memoriesApi} from '../../src/api';
import {useSession} from '../../src/session';
import {Button, Notice, Screen, TextAction, Type, usePalette} from '../../src/ui';

type NativeShare = {
  activateShareAccount:(id:string)=>Promise<boolean>;
  peekShare:()=>Promise<string|null>;
};
const share = requireOptionalNativeModule<NativeShare>('RecallBoxCallback');
type PendingShare={key:string;url:string};
const waiting=(item:MemorySummary)=>item.processing_state==='queued'||item.processing_state==='processing';

/** RB-20: actual pending server captures and device-native shares only. */
export default function Recovery(){
  const {authorized, account, message}=useSession();
  const auth=useRef(authorized);auth.current=authorized;
  const p=usePalette();
  const [items,setItems]=useState<MemorySummary[]>([]);
  const [local,setLocal]=useState<PendingShare|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [needsLogin,setNeedsLogin]=useState(false);
  const [working,setWorking]=useState(false);
  const [notice,setNotice]=useState('');

  const load=useCallback(async()=>{
    if(!account)return;
    setLoading(true);setError('');
    try{
      const [page,native] = await Promise.all([
        auth.current(access=>memoriesApi.list(access,false)),
        (async()=>{
          if(!share||!(await share.activateShareAccount(account.id)))return null;
          const raw=await share.peekShare();
          if(!raw)return null;
          const data:unknown=JSON.parse(raw);
          if(!data||typeof data!=='object')return null;
          const value=data as Partial<PendingShare>;
          return typeof value.key==='string'&&typeof value.url==='string'
            &&/^https?:\/\//i.test(value.url) ? {key:value.key,url:value.url} : null;
        })().catch(()=>null),
      ]);
      setItems(page.items);
      setLocal(native);
      setNeedsLogin(false);
    }catch(cause){
      if(cause instanceof ApiError&&cause.status===401){
        setNeedsLogin(true);
        setError('Your session expired. Sign in again to recover account-specific captures.');
      }else{
        setError('Could not check recovery status. The saved source may still be on the server.');
      }
    }finally{setLoading(false);}
  },[account?.id]);

  useFocusEffect(useCallback(()=>{void load();},[load]));

  const queued=items.filter(waiting);
  const failed=items.filter(item=>item.processing_state==='failed');

  async function retryFailed(){
    const first=failed[0];
    if(!first||working)return;
    setWorking(true);setError('');setNotice('');
    try{
      await auth.current(access=>memoriesApi.retry(access,first.id));
      setNotice('Processing retry confirmed. Your original source is retained.');
      await load();
    }catch{setError('Retry could not be confirmed. Your saved record remains available.');}
    finally{setWorking(false);}
  }

  return <Screen compact>
    <TextAction icon="back" label="Library" onPress={()=>router.dismissTo('/(account)')}/>
    <Type title>Nothing gets lost.</Type>
    <Type muted>Recover server-confirmed captures and shared links when a connection or session is interrupted.</Type>
    {!!error&&<Notice kind="error">{error}</Notice>}
    {!!notice&&<Notice kind="success">{notice}</Notice>}
    {loading&&<Notice>Checking your saved captures…</Notice>}
    <View style={{backgroundColor:p.surfaceMuted,borderRadius: tokens.radii.medium,padding: tokens.space.medium,gap: tokens.space.small}}>
      <Type variant="label">{local?'A shared link is waiting on this device':
        'Recovery keeps server-confirmed content visible'}</Type>
      <Type muted>{local
        ? 'Your link is kept in the encrypted Android share inbox. It is not yet server-saved.'
        : 'RecallBox does not yet provide a general offline upload outbox. Unconfirmed files must be retried from their original source.'}</Type>
    </View>
    <Type variant="section">Waiting to sync</Type>
    {local&&<View style={{backgroundColor:p.surface,padding: tokens.space.medium,borderRadius: tokens.radii.medium,gap: tokens.space.small}}>
      <Type variant="label" numberOfLines={2}>{local.url}</Type>
      <Type muted variant="caption">On this device · Not yet confirmed by the server</Type>
      <Button label="Retry saving shared link" variant="secondary"
        onPress={()=>router.push('/(account)/incoming-share')}/>
    </View>}
    {queued.slice(0,3).map(item=><View key={item.id} style={{backgroundColor:p.surface,
      padding: tokens.space.medium,borderRadius: tokens.radii.medium,gap: tokens.space.tiny,borderWidth:1,borderColor:p.line}}>
      <Type variant="label" numberOfLines={2}>{item.title||item.source_url||'Saved capture'}</Type>
      <Type muted variant="caption">Already saved on the server · {item.processing_state==='queued'
        ? 'Awaiting processing':'Reading source'}</Type>
      <TextAction label="Open saved record" onPress={()=>router.push({
        pathname:'/(account)/memory/[id]',params:{id:item.id}})}/>
    </View>)}
    {!loading&&!local&&queued.length===0&&<Type muted>No server-confirmed captures waiting on this page.</Type>}
    {failed.length>0&&<View style={{backgroundColor:p.surface,
      padding: tokens.space.medium,borderRadius: tokens.radii.medium,gap: tokens.space.small}}>
      <Type variant="label">{failed.length} saved {failed.length===1?'capture needs':'captures need'} attention</Type>
      <Type muted>Processing failed, but the source record remains saved.</Type>
      <Button label="Retry failed capture" variant="secondary"
        disabled={working||loading} busy={working} onPress={()=>void retryFailed()}/>
    </View>}
    <Button label="Refresh recovery status" variant="secondary" disabled={working||loading}
      onPress={()=>void load()}/>
    <Type variant="section">Session needs attention</Type>
    <Type muted>Only sign in to the original account before recovering its saved sources.
      Shared links from a different signed-in account are never imported silently.</Type>
    {(needsLogin||!!message)&&<Notice kind="error">{message||'Sign-in required.'}</Notice>}
    <Button label="Sign in again" variant="secondary"
      onPress={()=>router.replace('/sign-in')}/>
    <Type variant="section">If edits conflict</Type>
    <Type muted>Unconfirmed local edits are not considered saved. Return to the original screen to resolve changes; no version is silently overwritten.</Type>
  </Screen>;
}
