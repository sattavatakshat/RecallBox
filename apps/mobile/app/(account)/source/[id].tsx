import {SavedText} from '../../../src/saved-text';
import {tokens} from '../../../src/theme';
import {Icon, sourceIcon} from '../../../src/icons';
import {useCallback, useEffect, useState} from 'react';
import {Image, Linking, View} from 'react-native';
import {router, useFocusEffect, useLocalSearchParams} from 'expo-router';
import {Memory, memoriesApi} from '../../../src/api';
import {apiURL} from '../../../src/config';
import {useMemories} from '../../../src/memories';
import {useSession} from '../../../src/session';
import {Button, Notice, Screen, TextAction, Type, usePalette} from '../../../src/ui';

export default function SourceCoverage() {
  const {id}=useLocalSearchParams<{id:string}>();
  const store=useMemories();
  const {authorized}=useSession();
  const p=usePalette();
  const [record,setRecord]=useState<Memory|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [imageSource,setImageSource]=useState<{uri:string;headers:{Authorization:string}}|null>(null);
  const [imageError,setImageError]=useState(false);

  const load=useCallback(async()=>{
    if(!id)return;
    setLoading(true);setError('');
    try{setRecord(await store.get(id));}
    catch{setError('This source could not be loaded. Check your connection and try again.');}
    finally{setLoading(false);}
  },[id,store.get]);
  useFocusEffect(useCallback(()=>{if(!record)void load();},[record,load]));
  useEffect(()=>{
    let active=true;
    setImageSource(null);setImageError(false);
    if(record?.kind==='image' && record.original_available !== false){
      void authorized(async token=>({
        uri:`${apiURL()}/v1/memories/${record.id}/asset`,
        headers:{Authorization:`Bearer ${token}`}, cache:'reload' as const,
      })).then(source=>{if(active)setImageSource(source);})
        .catch(()=>{if(active)setImageError(true);});
    }
    return ()=>{active=false;};
  },[record?.id,record?.kind,record?.original_available]);

  const coverage=record?.kind==='note'?'Your own note is preserved as written.'
    :record?.processing_state==='ready'?record.extracted_text.trim() ? 'Available source text was extracted.' : 'Processing completed without extracted text.'
    :record?.processing_state==='metadata_only'
      ?'Only the original file/link and available metadata were saved. The full contents were not extracted.'
    :record?.processing_state==='failed'?'Source details could not be extracted.'
    :'This source has not completed processing.';
  const text=record?.kind==='note'?record.content:record?.extracted_text??'';

  async function openLink(){
    if(!record?.source_url)return;
    try{await Linking.openURL(record.source_url);}
    catch{setError('Unable to open the original on this device.');}
  }
  return <Screen compact>
    <TextAction icon="back" label="Memory" onPress={()=>router.back()}/>
    <Type title>Source details</Type>
    <Type muted>Different sources provide different levels of evidence. RecallBox never fills gaps with invented details.</Type>
    {!!error&&<Notice kind="error">{error}</Notice>}
    {loading&&<Notice>Loading saved source details…</Notice>}
    {!record&&!loading&&<Button label="Try again" onPress={()=>void load()}/>}
    {record&&<>
      <View style={{height:148,borderRadius: tokens.radii.large,backgroundColor:p.surfaceMuted,
        justifyContent:'center',alignItems:'center'}}>
        <Icon name={sourceIcon(record?.kind ?? 'note')} size={tokens.geometry.iconHero} color={p.brand}/>
      </View>
      <Type variant="section" numberOfLines={3}>{record.title||'Saved source'}</Type>
      {record.kind==='image'&&imageSource&&!imageError&&
        <Image source={imageSource} resizeMode="contain"
          style={{width:'100%',height:280,borderRadius: tokens.radii.medium}}
          onError={()=>setImageError(true)}/>}
      {imageError&&<Notice kind="error">The private image preview is unavailable. The saved file may still be accessible from Memory Detail.</Notice>}
      <Type variant="eyebrow" muted>COVERAGE</Type>
      <View style={{backgroundColor:p.surfaceMuted,padding: tokens.space.medium,borderRadius: tokens.radii.medium,gap: tokens.space.small}}>
        <Type variant="label">{record.processing_state==='ready'?'Available text':
          record.processing_state==='metadata_only'?'Link or preview only':
          record.processing_state==='failed'?'Processing failed':'Source saved'}</Type>
        <Type muted>{coverage}</Type>
        {!!record.processing_error&&<Type muted variant="caption">{record.processing_error}</Type>}
      </View>
      {!!text.trim() && (record.kind === 'note' || record.processing_state === 'ready'
        ? <SavedText text={text} note={record.kind === 'note'}/>
        : <View style={{gap:tokens.space.small}}><Type variant="section">Saved metadata preview</Type><Type selectable>{text}</Type></View>)}
      <Type variant="eyebrow" muted>SOURCE DETAILS</Type>
      <View style={{backgroundColor:p.surface,padding: tokens.space.medium,borderRadius: tokens.radii.medium,borderWidth:1,
        borderColor:p.line,gap: tokens.space.small}}>
        <Type muted variant="caption">Type: {record.kind.toUpperCase()}</Type>
        <Type muted variant="caption">Saved: {new Date(record.created_at).toLocaleDateString()}</Type>
        {!!record.source_url&&<Type muted variant="caption" numberOfLines={3}>{record.source_url}</Type>}
        <Type muted variant="caption">Original: {record.original_available === false ? 'Unavailable' : ['image','pdf'].includes(record.kind) ? 'Saved on the server; retrieval requires a connection' : 'Saved note or source link'}</Type>
        <Type muted variant="caption">Processing: {record.processing_state.replace('_',' ')}</Type>
      </View>
      {!!record.source_url&&<Button label="Open original source" onPress={()=>void openLink()}/>}
      {['pdf','image'].includes(record.kind)&&<Button label="Open or share the saved file"
        variant="secondary" onPress={()=>router.canGoBack() ? router.back() : router.replace({
          pathname:'/(account)/memory/[id]',params:{id:record.id},
        })}/>}
      {record.processing_state === 'failed' && <Button label="Retry getting details" disabled={loading}
        onPress={() => {setLoading(true);setError('');void authorized(token => memoriesApi.retry(token,id))
          .then(setRecord).catch(() => setError('Could not retry processing. Check your connection and try again.'))
          .finally(() => setLoading(false));}}/>}
      {record.processing_state==='metadata_only' && ['url','link'].includes(record.kind) && <Notice>
        A restricted reel or social page may be a finished link-only save. That does not mean its video was analyzed.
      </Notice>}
    </>}
  </Screen>;
}
