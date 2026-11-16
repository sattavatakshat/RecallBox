import React, {useCallback, useRef, useState} from 'react';
import {router, useFocusEffect, useLocalSearchParams} from 'expo-router';
import {actionOptionsApi, ActionOption, shoppingApi} from '../../src/api';
import {useSession} from '../../src/session';
import {Button, Notice, Screen, TextAction, Type, usePalette} from '../../src/ui';
import {View} from 'react-native';

/** RB-14: only enabled, backed-by-source actions are actionable. */
export default function NextSteps() {
  const {memoryId} = useLocalSearchParams<{memoryId:string}>();
  const {authorized}=useSession();
  const auth=useRef(authorized);auth.current=authorized;
  const p=usePalette();
  const [options,setOptions]=useState<ActionOption[]>([]);
  const [busy,setBusy]=useState(false);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  const [loaded,setLoaded]=useState(false);

  const load=useCallback(async()=>{
    if(!memoryId)return;
    setBusy(true);setError('');
    try{
      const response=await auth.current(token=>actionOptionsApi.forMemory(token,memoryId));
      setOptions(response.items);
    }catch{setError('Could not check which actions your saved source supports.');}
    finally{setBusy(false);setLoaded(true);}
  },[memoryId]);

  useFocusEffect(useCallback(()=>{void load();},[load]));

  async function createShoppingList(){
    if(!memoryId||working)return;
    setWorking(true);setError('');
    try{
      const created=await auth.current(token=>shoppingApi.create(token,memoryId));
      router.push({pathname:'/(account)/shopping/[id]',params:{id:created.id}});
    }catch{setError('The shopping list could not be confirmed. Your original memory is still saved.');}
    finally{setWorking(false);}
  }

  const shopping=options.find(option=>option.kind==='shopping');
  const future=options.filter(option=>option.kind!=='shopping');
  return <Screen compact>
    <TextAction label="← Memory" onPress={()=>router.back()}/>
    <Type title>What could you do next?</Type>
    <Type muted>Only steps supported by the saved content are suggested. You're always in control.</Type>
    {busy&&<Notice>Checking your source…</Notice>}
    {!!error&&<Notice kind="error">{error}</Notice>}
    {!!shopping&&<View style={{padding:16,borderRadius:16,backgroundColor:p.surface,gap:10,
      borderWidth:1,borderColor:p.line}}>
      <Type variant="section">Shopping list from recipe</Type>
      <Type muted>{shopping.reason}</Type>
      <View style={{padding:14,borderRadius:14,backgroundColor:p.surfaceMuted,gap:5}}>
        <Type variant="label">What was found</Type>
        {shopping.evidence_lines.slice(0,5).map((line,i)=>
          <Type key={i} muted variant="caption">{line}</Type>)}
        <Type muted variant="caption">No quantities or ingredients are added beyond the source.</Type>
      </View>
      <Button label="Create shopping list" busy={working} onPress={()=>void createShoppingList()}/>
    </View>}
    {future.map(option=><View key={option.kind} style={{padding:14,borderRadius:14,
      backgroundColor:p.surfaceMuted,gap:6}}>
      <Type variant="label">{option.label}</Type>
      <Type muted variant="caption">{option.reason}</Type>
      <Type muted variant="caption">This workflow is not enabled yet. Your source stays available.</Type>
    </View>)}
    {loaded&&!shopping&&!error&&<Notice>
      No specialized action can be verified for this source yet. You can still organize it in a collection.
    </Notice>}
    {!!memoryId&&<Button label="Add to a collection" variant="secondary"
      onPress={()=>router.push({pathname:'/(account)/add-to-collection',params:{memoryId}})}/>}
    {error&&<Button label="Check again" variant="secondary" onPress={()=>void load()}/>}
  </Screen>;
}
