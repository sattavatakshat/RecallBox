import React, {useRef,useState} from 'react';
import * as Crypto from 'expo-crypto';
import {useMemories} from '../../src/memories';
import {useManualDraft,useCaptureExit} from '../../src/manual-save-state';
import {manualSaveError,definitiveRejection} from '../../src/manual-save-model';
import {CaptureEditor,CaptureInput,CaptureButton,CaptureMessage} from '../../src/manual-save-ui';

export default function NewNote() {
  const store=useMemories();const state=useManualDraft('note');const working=useRef(false);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const locked=Boolean(state.draft.attempt);
  const exit=useCaptureExit(Boolean(state.draft.title||state.draft.content),locked,working);
  async function save() {
    if(working.current||!state.isCurrent()||!state.current.current.content.trim())return;
    working.current=true;setBusy(true);setError('');
    const request=state.current.current;
    const key=request.attempt?.key??Crypto.randomUUID();state.update({attempt:{key}});
    try {
      const saved=await store.create({title:request.title,content:request.content},key);
      if(!state.isCurrent())return;
      await store.finishCapture(saved);state.clear();exit.finish();
    } catch(cause) {
      setError(manualSaveError(cause));
      if(definitiveRejection(cause))state.update({attempt:null});
    } finally {working.current=false;setBusy(false);}
  }
  return <CaptureEditor title="Write a note." subtitle="Keep a thought or idea. A title is optional."
    onCancel={exit.cancel} busy={busy}>
    <CaptureInput label="Title (optional)" value={state.draft.title} onChangeText={title=>state.update({title})}
      maxLength={240} editable={!busy&&!locked} placeholder="Give it a name"/>
    <CaptureInput label="Your note" value={state.draft.content} onChangeText={content=>state.update({content})}
      autoFocus multiline maxLength={100000} textAlignVertical="top" style={{minHeight:240}}
      editable={!busy&&!locked} placeholder="Write anything…"/>
    {!!error&&<CaptureMessage error>{error}</CaptureMessage>}
    {locked&&!busy&&<CaptureMessage>Save not confirmed. Retry keeps your original note and request key.</CaptureMessage>}
    <CaptureButton label={locked?'Retry save':'Save note'} onPress={()=>void save()}
      busy={busy} disabled={!state.draft.content.trim()}/>
    <CaptureMessage>Drafts remain in this account while RecallBox stays open. A connection is required to save them.</CaptureMessage>
  </CaptureEditor>;
}
