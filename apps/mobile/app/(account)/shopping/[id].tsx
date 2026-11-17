import {tokens} from '../../../src/theme';
import {Icon} from '../../../src/icons';
import {useCallback, useRef, useState} from 'react';
import {Alert, Linking, Pressable, View} from 'react-native';
import {router, useFocusEffect, useLocalSearchParams, usePreventRemove} from 'expo-router';
import * as Crypto from 'expo-crypto';
import {ApiError, ShoppingItem, ShoppingList, shoppingApi} from '../../../src/api';
import {useSession} from '../../../src/session';
import {Button, Input, Notice, Screen, TextAction, Type, usePalette} from '../../../src/ui';

export default function ShoppingChecklist() {
  const {id}=useLocalSearchParams<{id:string}>();
  const {authorized}=useSession();
  const auth=useRef(authorized);auth.current=authorized;
  const p=usePalette();
  const [saved,setSaved]=useState<ShoppingList|null>(null);
  const [title,setTitle]=useState('');
  const [items,setItems]=useState<ShoppingItem[]>([]);
  const [newItem,setNewItem]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [leaving,setLeaving]=useState(false);
  const dirty=Boolean(saved&&(title!==saved.title||JSON.stringify(items)!==JSON.stringify(saved.items)));
  const release=usePreventRemove(dirty&&!leaving,({repeat})=>{
    Alert.alert('Leave unsaved changes?','Your edited checklist has not been saved.',[
      {text:'Continue editing',style:'cancel'},
      {text:'Discard changes',style:'destructive',onPress:()=>{
        setLeaving(true);release();repeat();
      }},
    ]);
  });
  const load=useCallback(async()=>{
    if(!id)return;
    setBusy(true);setError('');
    try{
      const record=await auth.current(token=>shoppingApi.get(token,id));
      setSaved(record);setTitle(record.title);setItems(record.items);
    }catch{setError('This shopping list could not be loaded. Check your connection and retry.');}
    finally{setBusy(false);}
  },[id]);
  useFocusEffect(useCallback(()=>{if(!saved)void load();},[saved,load]));

  function changeItem(itemId:string,patch:Partial<ShoppingItem>){
    setItems(current=>current.map(item=>item.id===itemId?{...item,...patch}:item));
  }
  function add(){
    const text=newItem.trim();
    if(!text)return;
    if(items.length>=60){setError('A list can contain at most 60 items.');return;}
    setItems(current=>[...current,{id:Crypto.randomUUID(),text,checked:false,
      origin:'user',source_quote:null}]);
    setNewItem('');setError('');
  }
  async function save(){
    if(!saved||busy||!dirty||!title.trim())return;
    setBusy(true);setError('');setNotice('');
    try{
      const changed=await auth.current(token=>shoppingApi.edit(token,saved.id,{
        expected_version:saved.version,title:title.trim(),items,
      }));
      setSaved(changed);setTitle(changed.title);setItems(changed.items);
      setNotice('Shopping list saved. Your changes will be here when you return.');
    }catch(cause){
      setError(cause instanceof ApiError&&cause.code==='shopping_list_version_conflict'
        ? 'This list changed elsewhere. Your edits are still here. Review the latest list before retrying.'
        : 'Save could not be confirmed. Your changes are still on this screen.');
    }finally{setBusy(false);}
  }
  async function openOriginal(){
    if(!saved)return;
    if(!saved.source_url){
      router.push({pathname:'/(account)/memory/[id]',params:{id:saved.source_memory_id}});
      return;
    }
    try{await Linking.openURL(saved.source_url);}
    catch{setError('Could not open the original source.');}
  }
  return <Screen compact>
    <TextAction icon="back" label="Memory" onPress={()=> {
      if(saved?.source_memory_id)router.replace({
        pathname:'/(account)/memory/[id]',params:{id:saved.source_memory_id},
      });
      else router.back();
    }}/>
    <Type variant="eyebrow" muted>FROM A VERIFIED RECIPE</Type>
    <Type title>Shopping list.</Type>
    <Type muted>Ingredients from {saved?.source_title||'the saved recipe'}. Edit every line before shopping.</Type>
    <View style={{backgroundColor:p.surfaceMuted,padding: tokens.space.medium,borderRadius: tokens.radii.medium,gap: tokens.space.small}}>
      <Type variant="label">Original source is kept</Type>
      <Type muted>Amounts appear only when present in the source. Unknown quantities are not invented.</Type>
      {saved&&<TextAction label="Open original source" onPress={()=>void openOriginal()}/>}
    </View>
    {!!error&&<Notice kind="error">{error}</Notice>}
    {!!notice&&<Notice kind="success">{notice}</Notice>}
    {!saved&&!busy&&<Button label="Try loading again" onPress={()=>void load()}/>}
    {saved&&<>
      <Input label="List name" value={title} onChangeText={setTitle} maxLength={160}
        editable={!busy}/>
      <Type variant="section">Your ingredients · {items.length}</Type>
      {items.map((item,index)=><View key={item.id} style={{backgroundColor:p.surface,
        borderRadius: tokens.radii.tile,padding: tokens.space.compact,borderWidth:1,borderColor:p.line,gap: tokens.space.small}}>
        <View style={{flexDirection:'row',alignItems:'center',gap: tokens.space.small}}>
          <Pressable accessibilityRole="checkbox"
            accessibilityLabel={`Mark ${item.text} ${item.checked?'not purchased':'purchased'}`}
            accessibilityState={{checked:item.checked,disabled:busy}} disabled={busy}
            onPress={()=>changeItem(item.id,{checked:!item.checked})}
            style={{width:48,height:48,alignItems:'center',justifyContent:'center'}}>
            <Icon name={item.checked?'checked':'square'}/>
          </Pressable>
          <View style={{flex:1}}>
            <Input label={`Ingredient ${index+1}`} value={item.text}
              onChangeText={text=>changeItem(item.id,{text})} maxLength={200}
              editable={!busy}/>
          </View>
        </View>
        <Type muted variant="caption">{item.origin==='source'
          ? 'From saved source: '+item.source_quote
          : 'Added by you'}</Type>
        <TextAction label="Remove ingredient" disabled={busy}
          onPress={()=>setItems(current=>current.filter(row=>row.id!==item.id))}/>
      </View>)}
      <Input label="Add an ingredient" value={newItem} onChangeText={setNewItem}
        maxLength={200} placeholder="Write an ingredient you want to add"/>
      <Button label="+ Add ingredient" variant="secondary" disabled={busy||!newItem.trim()||items.length>=60}
        onPress={add}/>
      <Button label="Save shopping list" busy={busy} disabled={!dirty||!title.trim()||
        items.some(item=>!item.text.trim())} onPress={()=>void save()}/>
    </>}
  </Screen>;
}
