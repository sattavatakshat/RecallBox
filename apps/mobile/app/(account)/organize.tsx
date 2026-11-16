import React, {useCallback, useState} from 'react';
import {Alert, Pressable, View} from 'react-native';
import {router, useFocusEffect, useLocalSearchParams, usePreventRemove} from 'expo-router';
import {ApiError, Memory} from '../../src/api';
import {useMemories} from '../../src/memories';
import {Button, FilterChip, Input, Notice, Screen, TextAction, Type, usePalette} from '../../src/ui';

const TOPICS=['Food','Travel','Learning','Shopping','Ideas','Other'];
const equal=(a:string[]|null,b:string[]|null|undefined)=>JSON.stringify(a)===JSON.stringify(b??null);

/** Optional, manually controlled organization. Extracted labels stay separate. */
export default function OrganizeMemory() {
  const {id}=useLocalSearchParams<{id:string}>();
  const store=useMemories();
  const p=usePalette();
  const [memory,setMemory]=useState<Memory|null>(null);
  const [topic,setTopic]=useState<string|null>(null);
  const [tags,setTags]=useState<string[]|null>(null);
  const [tagDraft,setTagDraft]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [leaving,setLeaving]=useState(false);
  const chosenTopic=topic==='Uncategorized'?null:(topic??memory?.suggested_topic??null);
  const dirty=Boolean(memory && (topic!==(memory.topic_override??null)||
    !equal(tags,memory.tags_override)));
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
      await store.edit(memory.id,{expected_version:memory.version,
        topic_override:topic,tags_override:tags});
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
      <Type muted>Use your own collections to group memories. One memory can appear in several.</Type>
      <Button label="Add to a collection" variant="secondary" disabled={busy||dirty}
        onPress={()=>router.push({pathname:'/(account)/add-to-collection',
          params:{memoryId:memory.id}})}/>
      {dirty&&<Type muted variant="caption">Save changes before opening the collection picker.</Type>}
      <Button label="Save organization" busy={busy} disabled={!dirty} onPress={()=>void save()}/>
    </>}
  </Screen>;
}
