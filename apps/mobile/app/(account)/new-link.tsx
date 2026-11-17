import React, {useRef,useState} from 'react';
import {router} from 'expo-router';
import * as Crypto from 'expo-crypto';
import {memoriesApi} from '../../src/api';
import {useSession} from '../../src/session';
import {useMemories} from '../../src/memories';
import {useManualDraft,useCaptureExit} from '../../src/manual-save-state';
import {validCaptureURL,manualSaveError,definitiveRejection} from '../../src/manual-save-model';
import {CaptureEditor,CaptureInput,CaptureButton,CaptureMessage} from '../../src/manual-save-ui';

export default function NewLink() {
  const {authorized}=useSession();const store=useMemories();const state=useManualDraft('link');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const working=useRef(false);
  const locked=Boolean(state.draft.attempt);
  const exit=useCaptureExit(Boolean(state.draft.url),locked,working);
  const valid=validCaptureURL(state.draft.url);
  async function save() {
    if(working.current||!state.isCurrent()||!validCaptureURL(state.current.current.url))return;
    working.current=true;setBusy(true);setError('');
    const request=state.current.current;
    const key=request.attempt?.key??Crypto.randomUUID();state.update({attempt:{key}});
    try {
      const saved=await authorized(access=>memoriesApi.capture(access,request.url.trim(),key));
      if(!state.isCurrent())return;
      await store.finishCapture(saved);state.clear();exit.finish();
    } catch(cause) {
      setError(manualSaveError(cause));
      if(definitiveRejection(cause))state.update({attempt:null});
    } finally {working.current=false;setBusy(false);}
  }
  return <CaptureEditor title="Save a link." subtitle="Paste a public web link. Its details can be processed after saving."
    onCancel={exit.cancel} busy={busy}>
    <CaptureInput label="Link" value={state.draft.url} onChangeText={url=>state.update({url})}
      autoFocus keyboardType="url" returnKeyType="done" autoCapitalize="none" autoCorrect={false}
      maxLength={4096} editable={!busy&&!locked} placeholder="https://…" onSubmitEditing={()=>void save()}/>
    {!!state.draft.url.trim()&&!valid&&<CaptureMessage error>Use a complete HTTP or HTTPS link without spaces, credentials or a custom port.</CaptureMessage>}
    {!!error&&<CaptureMessage error>{error}</CaptureMessage>}
    {locked&&!busy&&<CaptureMessage>Save not confirmed. Retry uses the same link and request key.</CaptureMessage>}
    <CaptureButton label={locked?'Retry save':'Save link'} onPress={()=>void save()} busy={busy} disabled={!valid}/>
    {locked&&!busy&&<CaptureButton quiet label="Check Library" onPress={()=>router.dismissTo('/(account)')}/>}
    <CaptureMessage>Some sites provide only a link or public preview. Saving a URL does not mean its content was extracted.</CaptureMessage>
  </CaptureEditor>;
}
