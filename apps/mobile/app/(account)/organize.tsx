import React, {useCallback, useRef, useState} from 'react';
import {Alert, Pressable, View} from 'react-native';
import {router, useFocusEffect, useLocalSearchParams, usePreventRemove} from 'expo-router';
import {ApiError, Collection, Memory, collectionsApi} from '../../src/api';
import {useSession} from '../../src/session';
import {useMemories} from '../../src/memories';
import {Button, FilterChip, Input, Notice, Screen, TextAction, Type, usePalette} from '../../src/ui';

const TOPICS=['Food','Travel','Learning','Shopping','Ideas','Other'];
const equal=(a:string[]|null,b:string[]|null|undefined)=>JSON.stringify(a)===JSON.stringify(b??null);

/** Optional, manually controlled organization. Extracted labels stay separate. */
export default function OrganizeMemory() {
  const {id}=useLocalSearchParams<{id:string}>();
  const store=useMemories();
  const {authorized}=useSession();
  const auth=useRef(authorized); auth.current=authorized;
  const p=usePalette();
  const [memory,setMemory]=useState<Memory|null>(null);
  const [topic,setTopic]=useState<string|null>(null);
  const [tags,setTags]=useState<string[]|null>(null);
  const [tagDraft,setTagDraft]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [leaving,setLeaving]=useState(false);
  const [allCollections,setAllCollections]=useState<Collection[]>([]);
  const [savedMembership,setSavedMembership]=useState<string[]>([]);
  const [selectedMembership,setSelectedMembership]=useState<string[]>([]);
  const [collectionError,setCollectionError]=useState('');
  const chosenTopic=topic==='Uncategorized'?null:(topic??memory?.suggested_topic??null);
  const detailsChanged=Boolean(memory && (topic!==(memory.topic_override??null)||
    !equal(tags,memory.tags_override)));
  const membershipChanged=JSON.stringify([...selectedMembership].sort()) !==
    JSON.stringify([...savedMembership].sort());
  const dirty=detailsChanged||membershipChanged;
  const release=usePreventRemove(dirty&&!leaving,({repeat})=>{
    Alert.alert('Discard changes?','Your organization changes have not been saved.',[
      {text:'Keep editing',style:'cancel'},
      {text:'Discard changes',style:'destructive',onPress:()=>{
        setLeaving(true);release();repeat();
      }},
    ]);
  });
  const load=useCallback(async()=>{
    if(!id)return;
    setBusy(true);setError('');
    try{
      const saved=await store.get(id);
      setMemory(saved);setTopic(saved.topic_override??null);
      setTags(saved.tags_override??null);
      setCollectionError('');
      try {
        const [page,current]=await Promise.all([
          auth.current(token=>collectionsApi.list(token)),
          auth.current(token=>collectionsApi.forMemory(token,id)),
        ]);
        setAllCollections(page.items);
        const existing=current.items.map(entry=>entry.id);
        setSavedMembership(existing);setSelectedMembership(existing);
      } catch {
        setCollectionError('Collections could not load. Your topic and tags are still editable.');
      }
    }catch{setError('Could not open this memory. Check your connection and retry.');}
    finally{setBusy(false);}
  },[id,store.get]);
  useFocusEffect(useCallback(()=>{if(!memory)void load();},[memory,load]));
  function addTag(){
    const value=tagDraft.trim(),current=tags??[];
    if(!value||value.length>40||Array.from(value).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)){
      setError('Use 1–40 characters without control characters.');return;
    }
    if(current.length>=12){setError('Maximum 12 personal tags.');return;}
    if(current.some(t=>t.toLowerCase()===value.toLowerCase())){
      setError('That tag is already included.');return;
    }
    setTags([...current,value]);setTagDraft('');setError('');
  }
  async function save(){
    if(!memory||busy||!dirty)return;
    setBusy(true);setError('');
    try{
      if(detailsChanged) {
        const updated=await store.edit(memory.id,{expected_version:memory.version,
          topic_override:topic,tags_override:tags});
        setMemory(updated);
      }
      const applied=new Set(savedMembership);
      for(const group of allCollections) {
        const was=applied.has(group.id),now=selectedMembership.includes(group.id);
        if(was===now)continue;
        if(now)await auth.current(token=>collectionsApi.add(token,group.id,memory.id));
        else await auth.current(token=>collectionsApi.removeItem(token,group.id,memory.id));
        if(now)applied.add(group.id); else applied.delete(group.id);
        setSavedMembership([...applied]); // Preserve successful changes if a later request fails.
      }
      setLeaving(true);release();router.back();
    }catch(cause){
      if(cause instanceof ApiError && cause.code==='version_conflict' && cause.current) {
        // Preserve the draft, but show exactly what will be saved against the
        // newly fetched version. A second Save is an explicit user decision.
        setMemory(cause.current);
        setError('This memory changed elsewhere. Your choices are still here. Review them and tap Save again.');
      } else {
        setError('Save was not confirmed. Your choices are still on this screen.');
      }
    }finally{setBusy(false);}
  }
  return <Screen compact>
    <TextAction label="Back to memory" onPress={()=>router.back()}/>
    <Type variant="eyebrow" muted>YOUR CHOICE</Type>
    <Type title>Organize this memory.</Type>
    <Type muted>Suggestions can be wrong. Your own topics and tags are never overwritten by processing.</Type>
    {!memory&&busy&&<Notice>Opening your memory…</Notice>}
    {!!error&&<Notice kind="error">{error}</Notice>}
    {!memory&&!busy&&<Button label="Try again" onPress={()=>void load()}/>}
    {memory&&<>
      <Type variant="section">{memory.title||'Saved memory'}</Type>
      <Type variant="label">Primary topic (optional)</Type>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        <FilterChip label="Not categorized" selected={chosenTopic===null}
          onPress={()=>setTopic(memory.suggested_topic?'Uncategorized':null)}/>
        {TOPICS.map(name=><FilterChip key={name} label={name} selected={chosenTopic===name}
          onPress={()=>setTopic(name)}/>)}
      </View>
      {memory.suggested_topic && <Notice>
        Suggested: {memory.suggested_topic}. {memory.suggested_topic_reason ||
          'Based on available source text.'} You can change it.
      </Notice>}
      {!memory.suggested_topic && <Type muted variant="caption">
        No reliable category suggestion was found. Pick one if you like.
      </Type>}
      {topic!==null && <TextAction label="Use source suggestion"
        onPress={()=>setTopic(null)}/>} 
      <Type variant="label">Personal tags</Type>
      {tags?.length?<View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        {tags.map(label=><Pressable key={label} accessibilityRole="button"
          accessibilityLabel={`Remove tag ${label}`}
          onPress={()=>setTags(current=>(current??[]).filter(x=>x!==label))}
          style={{minHeight:48,justifyContent:'center',paddingHorizontal:14,borderRadius:24,
            borderWidth:1,borderColor:p.line,backgroundColor:p.surface}}>
          <Type variant="caption">{label}  ×</Type>
        </Pressable>)}
      </View>:<Type muted variant="caption">No personal tags yet.</Type>}
      <Input label="New tag" value={tagDraft} onChangeText={setTagDraft}
        maxLength={40} placeholder="Something you'll remember"/>
      <Button label="Add tag" variant="secondary" disabled={busy||!tagDraft.trim()}
        onPress={addTag}/>
      {(topic!==null||tags!==null)&&<TextAction label="Reset personal topic and tags"
        disabled={busy} onPress={()=>{setTopic(null);setTags(null);setTagDraft('');}}/>}
      <View style={{backgroundColor:p.surfaceMuted,padding:16,borderRadius:16,gap:8}}>
        <Type variant="label">Source information</Type>
        <Type muted variant="caption">{memory.labels.length
          ? memory.labels.join(' · '):'No source labels available.'}</Type>
        <Type muted variant="caption">Source labels do not mean that inaccessible content was understood.</Type>
      </View>
      <Type variant="section">Collections</Type>
      <Type muted>Choose any of your own collections. Checking a box never deletes the memory.</Type>
      {!!collectionError&&<Notice kind="error">{collectionError}</Notice>}
      {allCollections.map(group=><Pressable key={group.id} accessibilityRole="checkbox"
        accessibilityLabel={group.name}
        accessibilityState={{checked:selectedMembership.includes(group.id),disabled:busy}}
        disabled={busy} onPress={()=>setSelectedMembership(current=>
          current.includes(group.id)?current.filter(x=>x!==group.id):[...current,group.id])}
        style={{minHeight:52,paddingHorizontal:14,borderRadius:12,
          borderWidth:1,borderColor:p.line,backgroundColor:p.surface,
          flexDirection:'row',alignItems:'center',gap:12}}>
        <Type style={{fontSize:20}}>{selectedMembership.includes(group.id)?'☑':'□'}</Type>
        <Type variant="label">{group.name}</Type>
      </Pressable>)}
      {!allCollections.length&&!collectionError&&<Type muted variant="caption">
        You haven't created any collections yet.
      </Type>}
      <TextAction label="Manage collections" disabled={busy||dirty}
        onPress={()=>router.push('/(account)/collections')}/>
      <Button label="Save organization" busy={busy} disabled={!dirty} onPress={()=>void save()}/>
    </>}
  </Screen>;
}
