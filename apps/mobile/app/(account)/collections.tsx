import {LoadingIndicator, Button, Input, Notice, Screen, TextAction, Type, usePalette} from '../../src/ui';
import {tokens} from '../../src/theme';
import {Icon} from '../../src/icons';
import {useCallback, useRef, useState} from 'react';
import {Pressable, View} from 'react-native';
import {router, useFocusEffect} from 'expo-router';
import {ApiError, Collection, collectionsApi} from '../../src/api';
import {useSession} from '../../src/session';

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
    <Type title>Collections.</Type>
    <Type muted>The things you have gathered for a reason.</Type>
    <Button label={creating ? 'Close new collection' : '＋ New collection'}
      variant={creating ? 'secondary' : 'primary'}
      onPress={()=>{setCreating(current=>!current);setError('');}}/>
    {creating && <View style={{gap: tokens.space.compact,padding: tokens.space.medium,borderRadius: tokens.radii.medium,backgroundColor:p.surface}}>
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
    {loading && <LoadingIndicator accessibilityLabel="Loading collections" color={p.ink}/>}
    {!loading && !error && items.length===0 && <View style={{gap: tokens.space.small,paddingVertical: tokens.space.sectionSmall}}>
      <Type variant="section">Start a collection.</Type>
      <Type muted>Group saved places, recipes or articles whenever it helps you find them again.</Type>
      <TextAction label="Create your first collection" onPress={()=>setCreating(true)}/>
    </View>}
    {!!error && items.length>0 &&
      <Notice>Showing previously loaded collections. Refresh to check recent changes.</Notice>}
    {items.map(item=><Pressable key={item.id} accessibilityRole="button"
      accessibilityLabel={`Open collection ${item.name}`}
      onPress={()=>router.push({pathname:'/(account)/collection/[id]',params:{id:item.id}})}
      style={({pressed})=>({minHeight:83,flexDirection:'row',gap: tokens.space.compact,alignItems:'center',
        paddingVertical: tokens.space.compact,borderBottomWidth:1,borderBottomColor:p.line,
        opacity:pressed?0.65:1})}>
      <View importantForAccessibility="no-hide-descendants" style={{
        width:64,height:64,borderRadius: tokens.radii.tile,alignItems:'center',justifyContent:'center',
        backgroundColor:p.surfaceMuted}}>
        <View style={{width:24,height:19,alignItems:'center',justifyContent:'center'}}>
          <View style={{position:'absolute',top:1,width:19,height:9,borderWidth:2,borderColor:p.accent,borderRadius: tokens.radii.tiny,transform:[{rotate:'-9deg'}]}}/>
          <View style={{position:'absolute',top:7,width:21,height:11,borderWidth:2,borderColor:p.accent,borderRadius: tokens.radii.tiny,backgroundColor:p.surfaceMuted}}/>
        </View>
      </View>
      <View style={{flex:1,gap: tokens.space.tiny}}>
        <Type variant="label" numberOfLines={2}>{item.name}</Type>
        <Type muted variant="caption">{item.item_count ?? 0} saved {item.item_count===1?'item':'items'}</Type>
      </View>
      <Icon name="chevron" color={p.mutedText}/>
    </Pressable>)}
    {hasMore && <Notice>Showing the newest 100 collections. Your older collections remain saved.</Notice>}
    <Type muted variant="caption">These are intentional, user-created collections. Topic filters in Library are not permanent folders.</Type>
  </Screen>;
}
