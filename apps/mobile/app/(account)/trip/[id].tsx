import {tokens} from '../../../src/theme';
import {useCallback, useRef, useState} from 'react';
import {Alert, Linking, View} from 'react-native';
import {router, useFocusEffect, useLocalSearchParams, usePreventRemove} from 'expo-router';
import * as Crypto from 'expo-crypto';
import {ApiError, TripItem, TripShortlist, tripApi} from '../../../src/api';
import {useSession} from '../../../src/session';
import {Button, Input, Notice, Screen, TextAction, Type, usePalette} from '../../../src/ui';

const validDate=(v:string)=>!v || (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v);
export default function TripShortlistScreen(){
  const {id}=useLocalSearchParams<{id:string}>();
  const {authorized}=useSession();
  const auth=useRef(authorized);auth.current=authorized;
  const p=usePalette();
  const [record,setRecord]=useState<TripShortlist|null>(null);
  const [name,setName]=useState('');
  const [start,setStart]=useState('');
  const [end,setEnd]=useState('');
  const [items,setItems]=useState<TripItem[]>([]);
  const [newPlace,setNewPlace]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [leaving,setLeaving]=useState(false);
  const dirty=Boolean(record&&(name!==record.name||start!==(record.start_date||'')||
    end!==(record.end_date||'')||JSON.stringify(items)!==JSON.stringify(record.items)));
  const release=usePreventRemove(dirty&&!leaving,({repeat})=>{
    Alert.alert('Discard unsaved trip changes?','The shortlist edits have not been saved.',[
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
      const item=await auth.current(token=>tripApi.get(token,id));
      setRecord(item);setName(item.name);setStart(item.start_date||'');
      setEnd(item.end_date||'');setItems(item.items);
    }catch{setError('Trip shortlist could not load. Check your connection and try again.');}
    finally{setBusy(false);}
  },[id]);
  useFocusEffect(useCallback(()=>{if(!record)void load();},[record,load]));
  function updateItem(itemId:string,patch:Partial<TripItem>){
    setItems(old=>old.map(item=>item.id===itemId?{...item,...patch}:item));
  }
  function addPlace(){
    const value=newPlace.trim();
    if(!value)return;
    if(items.length>=60){setError('Maximum 60 shortlist items.');return;}
    setItems(old=>[...old,{id:Crypto.randomUUID(),label:value,note:'',
      day:null,source_memory_id:null,origin:'user'}]);
    setNewPlace('');setError('');
  }
  async function save(){
    if(!record||busy||!dirty)return;
    if(!name.trim()||!validDate(start)||!validDate(end)||
      (start&&end&&end<start)){setError('Enter a name and valid dates in YYYY-MM-DD, or leave dates blank.');return;}
    setBusy(true);setError('');setNotice('');
    try{
      const updated=await auth.current(token=>tripApi.edit(token,record.id,{
        expected_version:record.version,name:name.trim(),start_date:start||null,
        end_date:end||null,items,
      }));
      setRecord(updated);setName(updated.name);setStart(updated.start_date||'');
      setEnd(updated.end_date||'');setItems(updated.items);
      setNotice('Trip shortlist saved.');
    }catch(cause){
      setError(cause instanceof ApiError&&cause.code==='trip_version_conflict'
        ? 'Trip changed elsewhere. Your edits remain here; review latest before retry.'
        : 'Save was not confirmed. Your entries remain here.');
    }finally{setBusy(false);}
  }
  async function openSource(){
    if(!record)return;
    if(!record.source_url){router.push({pathname:'/(account)/memory/[id]',
      params:{id:record.source_memory_id}});return;}
    try{await Linking.openURL(record.source_url);}
    catch{setError('Could not open the saved original.');}
  }
  return <Screen compact>
    <TextAction icon="back" label="Memory" onPress={()=>record?router.replace({
      pathname:'/(account)/memory/[id]',params:{id:record.source_memory_id}}):router.back()}/>
    <Type variant="eyebrow" muted>PLACES YOU SAVED</Type>
    <Type title>Trip shortlist.</Type>
    <Type muted>Start with actual saved inspiration. Dates and itinerary days are yours to choose.</Type>
    {!!error&&<Notice kind="error">{error}</Notice>}
    {!!notice&&<Notice kind="success">{notice}</Notice>}
    {!record&&!busy&&<Button label="Try again" onPress={()=>void load()}/>}
    {record&&<>
      <Input label="Trip name" value={name} onChangeText={setName} maxLength={160}/>
      <Input label="Start date (optional)" value={start} onChangeText={setStart}
        maxLength={10} placeholder="YYYY-MM-DD" autoCorrect={false}/>
      <Input label="End date (optional)" value={end} onChangeText={setEnd}
        maxLength={10} placeholder="YYYY-MM-DD" autoCorrect={false}/>
      <Type variant="section">Saved inspiration</Type>
      <View style={{backgroundColor:p.surface,padding: tokens.space.medium,borderRadius: tokens.radii.medium,gap: tokens.space.small}}>
        <Type variant="label">{record.source_title||'Saved travel source'}</Type>
        <Type muted variant="caption">The original guide is not proof of an address, opening hour or journey time.</Type>
        <TextAction label="Open saved source" onPress={()=>void openSource()}/>
      </View>
      <Notice>No invented destinations, business hours or transit times. Add places yourself and arrange days only after confirming details.</Notice>
      <Type variant="section">Your shortlist · {items.length}</Type>
      {items.map((item,index)=><View key={item.id} style={{backgroundColor:p.surface,
        padding: tokens.space.compact,borderRadius: tokens.radii.medium,gap: tokens.space.small,borderWidth:1,borderColor:p.line}}>
        <Input label={`Place or inspiration ${index+1}`} value={item.label}
          maxLength={160} onChangeText={value=>updateItem(item.id,{label:value})}/>
        <Input label="Your notes (optional)" value={item.note}
          maxLength={1000} onChangeText={value=>updateItem(item.id,{note:value})}
          multiline/>
        <Input label="Itinerary day (optional, 1–30)" value={item.day?.toString()||''}
          onChangeText={value=>updateItem(item.id,{
            day:value?Math.max(1,Math.min(30,Number.parseInt(value,10)||1)):null,
          })} keyboardType="number-pad" maxLength={2}/>
        <Type muted variant="caption">{item.origin==='source'
          ? 'Linked to your saved travel inspiration (not verified as a physical place)'
          : 'Entered by you'}</Type>
        <View style={{flexDirection:'row',gap: tokens.space.compact}}>
          <TextAction label="Move up" disabled={index===0} onPress={()=>setItems(old=>{
            const copy=[...old];
            if(index>0 && copy[index] && copy[index-1]) {
              const current=copy[index]!,previous=copy[index-1]!;
              copy[index-1]=current;copy[index]=previous;
            }
            return copy;})}/>
          <TextAction label="Remove" onPress={()=>setItems(old=>old.filter(p=>p.id!==item.id))}/>
        </View>
      </View>)}
      <Input label="Add a place or idea" value={newPlace} onChangeText={setNewPlace}
        maxLength={160} placeholder="Only enter a place you have confirmed"/>
      <Button label="+ Add to shortlist" variant="secondary" disabled={!newPlace.trim()||items.length>=60}
        onPress={addPlace}/>
      <Button label="Save trip shortlist" disabled={!dirty||!name.trim()||
        items.some(item=>!item.label.trim())} busy={busy} onPress={()=>void save()}/>
    </>}
  </Screen>;
}
