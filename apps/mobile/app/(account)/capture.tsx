import React, {useEffect,useRef,useState} from 'react';
import {Alert,Image,View} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import * as Crypto from 'expo-crypto';
import {memoriesApi} from '../../src/api';
import {useSession} from '../../src/session';
import {useMemories} from '../../src/memories';
import {useBrandTheme} from '../../src/brand';
import {useManualDraft,useCaptureExit} from '../../src/manual-save-state';
import {CaptureFile,manualSaveError,definitiveRejection} from '../../src/manual-save-model';
import {choosePhoto,chooseCamera,chooseDocument,inspectSelection,recoverPhoto,removeCachedSelection,selectionError} from '../../src/manual-file-picker';
import {CaptureEditor,CaptureButton,CaptureMessage} from '../../src/manual-save-ui';
import {CaptureIcon} from '../../src/manual-save-icons';

export default function Capture() {
  const {method,pick}=useLocalSearchParams<{method?:string;pick?:string}>();
  const mode=method==='image'?'image':method==='pdf'?'pdf':'capture';
  return <FileCapture key={mode} mode={mode} autoPick={pick==='1'}/>;
}
function FileCapture({mode,autoPick}: {mode:'image'|'pdf'|'capture';autoPick:boolean}) {
  const {authorized,account}=useSession();const store=useMemories();const p=useBrandTheme();
  const state=useManualDraft(mode);const working=useRef(false);const started=useRef(false);
  const [phase,setPhase]=useState<'idle'|'choosing'|'saving'>('idle');const [error,setError]=useState('');
  const [previewFailed,setPreviewFailed]=useState(false);
  const locked=Boolean(state.draft.attempt);
  const exit=useCaptureExit(Boolean(state.draft.file),locked,working);
  const current=useRef({select,exit,state});current.current={select,exit,state};
  useEffect(()=>{
    const task=setTimeout(()=>{
      if(started.current)return;started.current=true;
      void (async()=>{
        if(current.current.state.current.current.file)return;
        try {
          const recovered=mode!=='pdf'&&account?await recoverPhoto(account.id):null;
          if(recovered&&current.current.state.isCurrent()) {
            const file=await inspectSelection(recovered.uri,recovered.name,mode);
            current.current.state.update({file,attempt:null});return;
          }
        }catch{/* A missing old picker result must not prevent a fresh selection. */}
        if(autoPick&&current.current.state.isCurrent())void current.current.select(mode==='pdf'?'pdf':'photo');
      })();
    },100);
    return()=>clearTimeout(task);
  },[mode,autoPick,account?.id]);
  async function select(kind:'photo'|'camera'|'pdf'|'files') {
    if(working.current||!state.isCurrent()||!account)return;
    working.current=true;setPhase('choosing');setError('');
    try {
      const selected=await (kind==='photo'?choosePhoto(account.id):kind==='camera'?chooseCamera(account.id):chooseDocument(kind==='pdf'?'pdf':'image'));
      if(!state.isCurrent())return;
      if(!selected) {
        if(!state.current.current.file)exit.cancelEmpty();
        return;
      }
      const file=await inspectSelection(selected.uri,selected.name,mode);
      if(!state.isCurrent())return;
      const old=state.current.current.file;
      state.update({file,attempt:null});setPreviewFailed(false);
      if(old&&old.uri!==file.uri)removeCachedSelection(old);
    }catch(cause){if(state.isCurrent())setError(selectionError(cause));}
    finally{working.current=false;setPhase('idle');}
  }
  function change(kind:'photo'|'camera'|'pdf'|'files') {
    if(locked)Alert.alert('Set aside the unconfirmed attempt?',
      'It may already have reached the server. Check Library before uploading it again. Cancelling the picker will keep this attempt.',[
      {text:'Keep this attempt',style:'cancel'},{text:'Choose another',onPress:()=>void select(kind)},
    ]);else void select(kind);
  }
  async function save() {
    const file=state.current.current.file;
    if(working.current||!state.isCurrent()||!file||previewFailed)return;
    working.current=true;setPhase('saving');setError('');
    let verified=false;
    try {
      await inspectSelection(file.uri,file.name,mode);
      verified=true;
      const key=state.current.current.attempt?.key??Crypto.randomUUID();state.update({attempt:{key}});
      const saved=await authorized(access=>memoriesApi.upload(access,file.uri,file.mime,file.name,key));
      if(!state.isCurrent())return;
      await store.finishCapture(saved);state.clear();removeCachedSelection(file);exit.finish();
    }catch(cause){
      setError(verified?manualSaveError(cause):selectionError(cause));
      if(definitiveRejection(cause))state.update({attempt:null});
    }finally{working.current=false;setPhase('idle');}
  }
  const file=state.draft.file;
  const saving=phase==='saving';const choosing=phase==='choosing';
  const image=file?.mime.startsWith('image/');
  return <CaptureEditor title={mode==='pdf'?'Save a PDF.':mode==='image'?'Save a photo.':'Save a file.'}
    subtitle="Review your selection before saving. Files up to 8 MiB."
    onCancel={exit.cancel} busy={phase!=='idle'}>
    {file&&<View style={{gap:14,padding:16,borderRadius:20,backgroundColor:p.surface,borderWidth:1,borderColor:p.line}}>
      {image?<Image key={file.uri} source={{uri:file.uri}} resizeMode="contain" accessibilityLabel={`Preview of ${file.name}`}
        style={{width:'100%',height:220,borderRadius:12}} onError={()=>{setPreviewFailed(true);setError('This image preview could not load. Choose another image.');}}/>:
        <CaptureIcon kind="pdf" color={p.brand}/>}
      <CaptureMessage>{file.name}</CaptureMessage>
      <CaptureMessage>{(file.size/(1024*1024)).toFixed(2)} MiB · {file.mime}</CaptureMessage>
    </View>}
    {choosing&&<CaptureMessage>Opening or reading your selection…</CaptureMessage>}
    {!!error&&<CaptureMessage error>{error}</CaptureMessage>}
    {locked&&!saving&&<CaptureMessage>Save not confirmed. Retry retains the same original file and request key.</CaptureMessage>}
    {file&&<CaptureButton label={saving?'Uploading…':locked?'Retry save':image?'Save image':'Save PDF'}
      busy={saving} disabled={choosing||previewFailed} onPress={()=>void save()}/>}
    {mode!=='pdf'&&<>
      <CaptureButton quiet label={file?'Choose another image':'Choose image or screenshot'} disabled={phase!=='idle'} onPress={()=>change('photo')}/>
      <CaptureButton quiet label="Take a photo" disabled={phase!=='idle'} onPress={()=>change('camera')}/>
      <CaptureButton quiet label="Choose from Files" disabled={phase!=='idle'} onPress={()=>change('files')}/>
    </>}
    {mode!=='image'&&<CaptureButton quiet label={file?'Choose another PDF':'Choose PDF'} disabled={phase!=='idle'} onPress={()=>change('pdf')}/>}
    {mode==='capture'&&<CaptureButton quiet label="Paste a link instead" disabled={phase!=='idle'} onPress={()=>router.replace('/(account)/new-link')}/>}
    <CaptureMessage>{mode==='pdf'?'Only PDF documents are supported.':'Images must be JPG, PNG or WebP.'} A connection is required to save. Selected-file drafts are separate from the native share outbox and are retained only while RecallBox stays open.</CaptureMessage>
  </CaptureEditor>;
}
