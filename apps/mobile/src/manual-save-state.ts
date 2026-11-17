import {useCallback, useEffect, useRef, useState} from 'react';
import {Alert} from 'react-native';
import {router, usePreventRemove} from 'expo-router';
import {useSession} from './session';
import {ManualDraft, newManualDraft} from './manual-save-model';

// Memory only, explicitly NOT a durable offline queue. Never seed another account's editor.
const drafts = new Map<string, ManualDraft>();
export function useManualDraft(kind: 'link' | 'note' | 'image' | 'pdf' | 'capture') {
  const {account} = useSession();
  const owner = useRef(account?.id);
  const storageKey = `${owner.current}:${kind}`;
  const [draft,setState] = useState<ManualDraft>(() => drafts.get(storageKey) ?? newManualDraft());
  const current = useRef(draft);
  const alive = useRef(true);
  const latestAccount = useRef(account?.id); latestAccount.current = account?.id;
  useEffect(() => {alive.current=true;return () => {alive.current=false;};},[]);
  const update = useCallback((patch: Partial<ManualDraft>) => {
    const next = {...current.current,...patch};current.current=next;drafts.set(storageKey,next);setState(next);
    return next;
  },[storageKey]);
  const clear = useCallback(() => {drafts.delete(storageKey);current.current=newManualDraft();setState(current.current);},[storageKey]);
  const isCurrent = useCallback(() => alive.current && Boolean(owner.current) && owner.current === latestAccount.current,[]);
  return {draft,current,update,clear,isCurrent};
}

export function useCaptureExit(dirty: boolean, locked: boolean, working: React.MutableRefObject<boolean>) {
  const [leaving,setLeaving] = useState(false);
  const release = usePreventRemove((dirty || working.current) && !leaving,({repeat}) => {
    if (working.current) {Alert.alert('Save in progress','Wait for this request to finish before leaving.');return;}
    Alert.alert('Leave this draft?',locked
      ? 'The save is not confirmed. Keep the draft to retry safely, or check your Library. It remains available for this account while RecallBox stays open.'
      : 'Your draft remains available for this account while RecallBox stays open.',[
      {text:'Keep editing',style:'cancel'},
      {text:'Leave and keep draft',onPress:() => {setLeaving(true);release();repeat();}},
    ]);
  });
  const finish = () => {setLeaving(true);release();router.dismissTo('/(account)');};
  const cancel = () => {if(router.canGoBack()) router.back();else router.replace('/(account)');};
  const cancelEmpty = () => {setLeaving(true);release();cancel();};
  return {finish,cancel,cancelEmpty};
}
