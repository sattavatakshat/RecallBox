import {LoadingIndicator, Button, Notice, Screen, TextAction, Type, usePalette} from '../../src/ui';
import {tokens} from '../../src/theme';
import {useCallback, useRef, useState} from 'react';
import {View} from 'react-native';
import {router, useFocusEffect, useLocalSearchParams} from 'expo-router';
import {ApiError, Collection, MemorySummary, collectionsApi, memoriesApi} from '../../src/api';
import {useSession} from '../../src/session';

function ready(item: MemorySummary) {
  return item.kind === 'note' || item.processing_state === 'ready' ||
    item.processing_state === 'metadata_only';
}

export default function AddToCollection() {
  const {memoryId, collectionId} = useLocalSearchParams<{memoryId?: string;collectionId?: string}>();
  const {authorized} = useSession();
  const auth = useRef(authorized);auth.current=authorized;
  const p=usePalette();
  const [collections,setCollections]=useState<Collection[]>([]);
  const [candidateItems,setCandidateItems]=useState<MemorySummary[]>([]);
  const [memberIds,setMemberIds]=useState<string[]>([]);
  const [collectionName,setCollectionName]=useState('');
  const [nextCursor,setNextCursor]=useState<string | null>(null);
  const [loading,setLoading]=useState(true);
  const [working,setWorking]=useState<string | null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const refresh=useCallback(async()=>{
    setLoading(true);setError('');
    try {
      if (collectionId) {
        const [group,page]=await Promise.all([
          auth.current(token=>collectionsApi.get(token,collectionId)),
          auth.current(token=>memoriesApi.list(token,false)),
        ]);
        setCollectionName(group.name);
        setMemberIds(group.items.map(item=>item.id));
        setCandidateItems(page.items.filter(ready));
        setNextCursor(page.next_cursor);
      } else {
        const page=await auth.current(token=>collectionsApi.list(token));
        setCollections(page.items);
      }
    } catch {
      setError('Could not load saved items. Check your connection and retry.');
    } finally {setLoading(false);}
  },[collectionId]);
  useFocusEffect(useCallback(()=>{void refresh();},[refresh]));

  async function loadMore() {
    if (!collectionId || !nextCursor || loading) return;
    setLoading(true);setError('');
    try {
      const page=await auth.current(token=>memoriesApi.list(token,false,nextCursor));
      setCandidateItems(previous=>[...previous,...page.items.filter(item=>
        ready(item) && !previous.some(prev=>prev.id===item.id))]);
      setNextCursor(page.next_cursor);
    } catch {setError('Could not load more saved items. Try again.');}
    finally {setLoading(false);}
  }

  async function add(targetCollectionId: string, targetMemoryId: string, label: string) {
    if (working) return;
    setWorking(targetMemoryId);setError('');setNotice('');
    try {
      await auth.current(token=>collectionsApi.add(token,targetCollectionId,targetMemoryId));
      if(collectionId) setMemberIds(current=>[...current,targetMemoryId]);
      setNotice(`Added to “${label}”. The original memory is still in your Library.`);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.code==='memory_not_found'
        ? 'This memory is no longer available.'
        : 'Could not add the memory. Check the collection before retrying.');
    } finally {setWorking(null);}
  }

  const pickerMode=Boolean(collectionId);
  const options=candidateItems.filter(item=>!memberIds.includes(item.id));
  return <Screen compact>
    <TextAction label={pickerMode ? 'Back to collection' : 'Back to memory'}
      onPress={()=>router.back()}/>
    <Type variant="eyebrow" muted>ORGANIZE YOUR LIBRARY</Type>
    <Type title>{pickerMode ? 'Add saved things.' : 'Add to collection.'}</Type>
    <Type muted>{pickerMode
      ? `Choose memories to keep together in ${collectionName || 'this collection'}.`
      : 'A memory can belong to more than one collection. It stays saved either way.'}</Type>
    {!!notice && <Notice kind="success">{notice}</Notice>}
    {!!error && <Notice kind="error">{error}</Notice>}
    {loading && <LoadingIndicator accessibilityLabel="Loading saved items" color={p.ink}/>}
    {pickerMode ? <>
      {!loading && !error && options.length===0 && !nextCursor &&
        <Notice>All available memories are already in this collection, or no usable memories were found.</Notice>}
      {options.map(item=><View key={item.id} style={{paddingVertical: tokens.space.compact,borderBottomWidth:1,borderColor:p.line,gap: tokens.space.small}}>
        <Type variant="label" numberOfLines={2}>{item.title ||
          (item.kind==='note' ? 'Untitled note' : 'Saved source')}</Type>
        {!!item.preview && <Type muted variant="caption" numberOfLines={2}>{item.preview}</Type>}
        <Button label="Add to collection" variant="secondary" busy={working===item.id}
          disabled={Boolean(working)||loading||Boolean(error)}
          onPress={()=>void add(collectionId!,item.id,collectionName)}/>
      </View>)}
      {!!nextCursor && <Button variant="secondary" label="Load more memories" busy={loading}
        onPress={()=>void loadMore()}/>}
    </> : <>
      {!loading && !error && collections.length===0 &&
        <Notice>No collections yet. Create a collection first, then come back to this memory.</Notice>}
      {collections.map(item=><View key={item.id} style={{paddingVertical: tokens.space.tiny}}>
        <Button label={`Add to ${item.name}`} variant="secondary"
          busy={working===memoryId}
          disabled={!memoryId||Boolean(working)||loading||Boolean(error)}
          onPress={()=>void add(item.id,memoryId!,item.name)}/>
      </View>)}
      <TextAction label="Create or manage collections"
        onPress={()=>router.push('/(account)/collections')}/>
    </>}
    {!!error && <Button variant="secondary" label="Try again" onPress={()=>void refresh()}/>}
  </Screen>;
}
