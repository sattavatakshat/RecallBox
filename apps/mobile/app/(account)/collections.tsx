import React, {useCallback, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import {router, useFocusEffect} from 'expo-router';
import {ApiError, Collection, collectionsApi} from '../../src/api';
import {useSession} from '../../src/session';
import {Button, Input, Notice, Screen, TextAction, Type, usePalette} from '../../src/ui';

export default function Collections() {
  const {authorized} = useSession();
  const auth = useRef(authorized);auth.current = authorized;
  const p = usePalette();
  const [items, setItems] = useState<Collection[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);setError('');
    try {
      const page=await auth.current(access => collectionsApi.list(access));
      setItems(page.items);setHasMore(page.has_more);
    } catch {
      setError('Could not load your collections. Check your connection and try again.');
    } finally {setLoading(false);}
  }, []);
  useFocusEffect(useCallback(() => {void refresh();}, [refresh]));

  async function create() {
    const value=name.trim();
    if (!value || busy) return;
    setBusy(true);setError('');setNotice('');
    try {
      const result=await auth.current(access=>collectionsApi.create(access,value));
      setName('');setCreating(false);
      setItems(previous=>[result,...previous.filter(item=>item.id!==result.id)]);
      router.push({pathname:'/(account)/collection/[id]',params:{id:result.id}});
    } catch (cause) {
      setError(cause instanceof ApiError && cause.code==='collection_name_exists'
        ? 'A collection with that name already exists. Choose another name.'
        : 'Collection save was not confirmed. Check the list before retrying.');
    } finally {setBusy(false);}
  }

  return <Screen compact>
    <Type variant="eyebrow" muted>YOUR PERSONAL SPACE</Type>
    <Type title>Collections.</Type>
    <Type muted>The things you've gathered for a reason. Make your own groups without filing every save.</Type>
    <Button label={creating ? 'Close new collection' : '+ New collection'}
      variant={creating ? 'secondary' : 'primary'}
      onPress={()=>{setCreating(current=>!current);setError('');}}/>
    {creating && <View style={{gap:12,padding:16,borderRadius:16,backgroundColor:p.surface}}>
      <Type variant="section">Name your collection</Type>
      <Input label="Collection name" value={name} onChangeText={setName} maxLength={80}
        autoFocus placeholder="Weekend places, Java notes…"/>
      <Button label="Create collection" busy={busy} disabled={!name.trim()}
        onPress={()=>void create()}/>
      <TextAction label="Cancel" disabled={busy} onPress={()=>{setCreating(false);setName('');}}/>
    </View>}
    {!!error && <Notice kind="error">{error}</Notice>}
    {!!notice && <Notice>{notice}</Notice>}
    <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
      <Type variant="section">Your collections</Type>
      <TextAction label="Refresh" disabled={loading||busy} onPress={()=>void refresh()}/>
    </View>
    {loading && <ActivityIndicator accessibilityLabel="Loading collections" color={p.ink}/>}
    {!loading && !error && items.length===0 && <View style={{gap:10,paddingVertical:32}}>
      <Type variant="section">Start a collection.</Type>
      <Type muted>Group saved places, recipes or articles whenever it helps you find them again.</Type>
      <TextAction label="Create your first collection" onPress={()=>setCreating(true)}/>
    </View>}
    {!!error && items.length>0 &&
      <Notice>Showing previously loaded collections. Refresh to check recent changes.</Notice>}
    {items.map(item=><Pressable key={item.id} accessibilityRole="button"
      accessibilityLabel={`Open collection ${item.name}`}
      onPress={()=>router.push({pathname:'/(account)/collection/[id]',params:{id:item.id}})}
      style={({pressed})=>({minHeight:83,flexDirection:'row',gap:12,alignItems:'center',
        paddingVertical:12,borderBottomWidth:1,borderBottomColor:p.line,
        opacity:pressed?0.65:1})}>
      <View importantForAccessibility="no-hide-descendants" style={{
        width:64,height:64,borderRadius:12,alignItems:'center',justifyContent:'center',
        backgroundColor:p.surfaceMuted}}>
        <Text style={{fontSize:26,color:p.accent}}>▤</Text>
      </View>
      <View style={{flex:1,gap:4}}>
        <Type variant="label" numberOfLines={2}>{item.name}</Type>
        <Type muted variant="caption">{item.item_count ?? 0} saved {item.item_count===1?'item':'items'}</Type>
      </View>
      <Type muted>›</Type>
    </Pressable>)}
    {hasMore && <Notice>Showing the newest 100 collections. Your older collections remain saved.</Notice>}
    <Type muted variant="caption">Collections are created by you. RecallBox's topic suggestions never create folders automatically.</Type>
  </Screen>;
}
